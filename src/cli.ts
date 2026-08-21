#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { fingerprintWorkflowTrace, validateWorkflowTrace } from "./trace.js";
import { toOtlpJson } from "./otel.js";

function usage(): never {
  throw new Error("Usage: agentproof-typescript <validate|otel-json> <trace.json>");
}

function main(argv: readonly string[]): void {
  const [command, fixturePath] = argv;
  if ((command !== "validate" && command !== "otel-json") || fixturePath === undefined) {
    usage();
  }
  const decoded: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
  const trace = validateWorkflowTrace(decoded);
  if (command === "validate") {
    process.stdout.write(
      `VALID trace_id=${trace.trace_id} fingerprint=${fingerprintWorkflowTrace(trace)}\n`,
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(toOtlpJson(trace))}\n`);
}

main(process.argv.slice(2));
