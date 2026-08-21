import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cliPath = new URL("../src/cli.js", import.meta.url);
const fixturePath = new URL("../fixtures/safe-typescript.trace.json", import.meta.url);

test("CLI validates sealed fixtures and produces local OTLP JSON", () => {
  const validated = execFileSync(
    process.execPath,
    [cliPath.pathname, "validate", fixturePath.pathname],
    {
      encoding: "utf8",
    },
  );
  assert.match(validated, /^VALID trace_id=checkout-review fingerprint=[a-f0-9]{64}\n$/);
  const otlp = execFileSync(
    process.execPath,
    [cliPath.pathname, "otel-json", fixturePath.pathname],
    {
      encoding: "utf8",
    },
  );
  assert.equal(JSON.parse(otlp).resourceSpans[0].scopeSpans[0].scope.name, "agentproof.typescript");
});

test("CLI fails closed for malformed local evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "agentproof-typescript-"));
  const invalidFixture = join(directory, "invalid.json");
  writeFileSync(invalidFixture, '{"trace_id":"missing-required-fields"}', "utf8");
  try {
    assert.throws(
      () => execFileSync(process.execPath, [cliPath.pathname, "validate", invalidFixture]),
      /trace\.events must be a non-empty array/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI rejects incomplete command arguments", () => {
  assert.throws(
    () => execFileSync(process.execPath, [cliPath.pathname], { encoding: "utf8" }),
    /Usage: agentproof-typescript/,
  );
});
