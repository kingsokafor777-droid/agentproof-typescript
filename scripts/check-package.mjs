import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const [artifactDirectory] = process.argv.slice(2);
if (artifactDirectory === undefined) {
  throw new Error("Usage: node scripts/check-package.mjs <artifact-directory>");
}
const packages = readdirSync(artifactDirectory).filter((entry) => entry.endsWith(".tgz"));
assert.equal(packages.length, 1, "Expected exactly one npm package tarball.");
const packagePath = join(artifactDirectory, packages[0]);
const entries = execFileSync("tar", ["-tzf", packagePath], { encoding: "utf8" }).split("\n");
for (const requiredEntry of [
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/cli.js",
  "package/README.md",
  "package/LICENSE",
  "package/SECURITY.md",
]) {
  assert.ok(entries.includes(requiredEntry), `Package is missing ${requiredEntry}.`);
}
assert.equal(
  entries.some((entry) => entry.startsWith("package/tests/")),
  false,
  "Package must not ship tests.",
);
assert.equal(
  entries.some((entry) => entry.startsWith("package/src/")),
  false,
  "Package must not ship source files.",
);
process.stdout.write(`VALID package=${packagePath}\n`);
