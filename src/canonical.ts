import { createHash } from "node:crypto";

import type { JsonObject, JsonValue } from "./types.js";

export class TraceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TraceValidationError";
  }
}

type ParsedTimestamp = {
  readonly utcMilliseconds: number;
  readonly residualMicroseconds: number;
};

const ISO_UTC_OFFSET_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function assertWellFormedString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) {
        throw new TraceValidationError(`${path} contains an unpaired high surrogate.`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TraceValidationError(`${path} contains an unpaired low surrogate.`);
    }
  }
}

function compareUnicodeCodePoints(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCodePoint = Number(left.codePointAt(leftIndex));
    const rightCodePoint = Number(right.codePointAt(rightIndex));
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1;
    }
    leftIndex += leftCodePoint > 0xffff ? 2 : 1;
    rightIndex += rightCodePoint > 0xffff ? 2 : 1;
  }
  return leftIndex === left.length && rightIndex === right.length
    ? 0
    : leftIndex === left.length
      ? -1
      : 1;
}

function parseTimestamp(value: string, path: string): ParsedTimestamp {
  const match = ISO_UTC_OFFSET_PATTERN.exec(value);
  if (match === null) {
    throw new TraceValidationError(
      `${path} must be an ISO-8601 timestamp with an explicit UTC offset.`,
    );
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const fractional = match[7] ?? "";
  const offset = String(match[8]);
  if (year < 1000) {
    throw new TraceValidationError(`${path} contains an unsupported timestamp component.`);
  }
  const localMilliseconds = Date.UTC(year, month - 1, day, hour, minute, second);
  const localDate = new Date(localMilliseconds);
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    throw new TraceValidationError(`${path} is not a valid UTC calendar timestamp.`);
  }
  let offsetMinutes = 0;
  if (offset !== "Z") {
    const sign = offset.startsWith("+") ? 1 : -1;
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutePart = Number(offset.slice(4, 6));
    if (offsetHours > 23 || offsetMinutePart > 59) {
      throw new TraceValidationError(`${path} contains an invalid UTC offset.`);
    }
    offsetMinutes = sign * (offsetHours * 60 + offsetMinutePart);
  }
  const microseconds = Number((fractional + "000000").slice(0, 6));
  const utcMilliseconds =
    localMilliseconds - offsetMinutes * 60_000 + Math.floor(microseconds / 1_000);
  const utcDate = new Date(utcMilliseconds);
  if (Number.isNaN(utcDate.getTime())) {
    throw new TraceValidationError(`${path} is outside the supported UTC range.`);
  }
  return { utcMilliseconds, residualMicroseconds: microseconds % 1_000 };
}

export function normalizeUtcTimestamp(value: string, path = "timestamp"): string {
  assertWellFormedString(value, path);
  const parsed = parseTimestamp(value, path);
  const date = new Date(parsed.utcMilliseconds);
  const base = date.toISOString().slice(0, 19);
  const fullMicroseconds = date.getUTCMilliseconds() * 1_000 + parsed.residualMicroseconds;
  return fullMicroseconds === 0
    ? `${base}Z`
    : `${base}.${String(fullMicroseconds).padStart(6, "0")}Z`;
}

export function unixNanoseconds(value: string): string {
  const normalized = normalizeUtcTimestamp(value);
  const parsed = parseTimestamp(normalized, "timestamp");
  const nanos =
    BigInt(parsed.utcMilliseconds) * 1_000_000n + BigInt(parsed.residualMicroseconds) * 1_000n;
  return nanos.toString();
}

export function cloneJsonValue(value: unknown, path: string, allowNumbers: boolean): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    assertWellFormedString(value, path);
    return value;
  }
  if (typeof value === "number") {
    if (!allowNumbers || !Number.isSafeInteger(value)) {
      throw new TraceValidationError(
        `${path} must be a safe integer in this identity-bearing boundary.`,
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      cloneJsonValue(entry, `${path}[${String(index)}]`, allowNumbers),
    );
  }
  if (isPlainObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      assertWellFormedString(key, `${path} key`);
      result[key] = cloneJsonValue(nestedValue, `${path}.${key}`, allowNumbers);
    }
    return result;
  }
  throw new TraceValidationError(`${path} must contain JSON-compatible values only.`);
}

export function cloneJsonObject(value: unknown, path: string, allowNumbers: boolean): JsonObject {
  const cloned = cloneJsonValue(value, path, allowNumbers);
  if (cloned === null || Array.isArray(cloned) || typeof cloned !== "object") {
    throw new TraceValidationError(`${path} must be a JSON object.`);
  }
  return cloned;
}

export function canonicalJson(value: unknown): string {
  const cloned = cloneJsonValue(value, "value", true);
  const encode = (candidate: JsonValue): string => {
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
    if (Array.isArray(candidate)) {
      return `[${candidate.map(encode).join(",")}]`;
    }
    const objectCandidate = candidate;
    return `{${Object.entries(objectCandidate)
      .sort(([leftKey], [rightKey]) => compareUnicodeCodePoints(leftKey, rightKey))
      .map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry)}`)
      .join(",")}}`;
  };
  return encode(cloned);
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function sha256String(value: string): string {
  assertWellFormedString(value, "hash input");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}
