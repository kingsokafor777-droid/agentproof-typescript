import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  normalizeUtcTimestamp,
  sha256Hex,
  sha256String,
  TraceValidationError,
  unixNanoseconds,
} from "../src/index.js";

test("canonical JSON sorts keys by Unicode code point and uses Core-compatible compact form", () => {
  const value = { z: "last", "😀": "emoji", a: [true, null, "first"] };
  assert.equal(canonicalJson(value), '{"a":[true,null,"first"],"z":"last","😀":"emoji"}');
  assert.equal(
    sha256Hex({ source: "storefront", trace_id: "checkout-review" }),
    "3ff6360567b6dc4927a8807e04c49a898606f6343cbfeb2877f801288b397e19",
  );
  assert.equal(
    sha256String("trace:checkout-review"),
    "15a3a317b10359221b3e2400dc737635224e183a19a761220164b3462fcac624",
  );
});

test("identity canonicalization rejects JavaScript values that cannot be kept cross-language exact", () => {
  assert.equal(canonicalJson({ count: 1 }), '{"count":1}');
  assert.throws(() => canonicalJson({ fractional: 1.5 }), TraceValidationError);
  assert.throws(() => canonicalJson({ invalid: Number.NaN }), TraceValidationError);
  assert.throws(() => canonicalJson({ unsupported: BigInt(1) }), TraceValidationError);
  assert.throws(() => canonicalJson({ unpaired: "\ud800" }), TraceValidationError);
  assert.throws(
    () => canonicalJson({ date: new Date("2026-08-21T00:00:00Z") }),
    TraceValidationError,
  );
  assert.throws(() => canonicalJson({ callback: () => "not-json" }), TraceValidationError);
});

test("timestamp normalization retains UTC precision and rejects ambiguous timestamp inputs", () => {
  assert.equal(normalizeUtcTimestamp("2026-08-20T20:00:00-04:00"), "2026-08-21T00:00:00Z");
  assert.equal(normalizeUtcTimestamp("2026-08-21T05:30:00+05:30"), "2026-08-21T00:00:00Z");
  assert.equal(normalizeUtcTimestamp("2026-08-21T00:00:00.1Z"), "2026-08-21T00:00:00.100000Z");
  assert.equal(
    normalizeUtcTimestamp("2026-08-21T00:00:00.000001+00:00"),
    "2026-08-21T00:00:00.000001Z",
  );
  assert.equal(unixNanoseconds("1970-01-01T00:00:00.000001Z"), "1000");
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:00:00"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("0999-08-21T00:00:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-13-21T00:00:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-32T00:00:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T24:00:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:60:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:00:60Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-02-30T00:00:00Z"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:00:00+25:00"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:00:00+01:60"), TraceValidationError);
  assert.throws(() => normalizeUtcTimestamp("2026-08-21T00:00:00\udc00Z"), TraceValidationError);
});
