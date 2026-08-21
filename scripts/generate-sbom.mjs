import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(typeof manifest.name, "string", "package name must be a string");
assert.equal(typeof manifest.version, "string", "package version must be a string");
assert.deepEqual(
  manifest.dependencies ?? {},
  {},
  "The runtime SBOM generator currently supports this zero-production-dependency package only.",
);

const purl = `pkg:npm/${encodeURIComponent(manifest.name)}@${encodeURIComponent(manifest.version)}`;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "library",
      "bom-ref": purl,
      name: manifest.name,
      version: manifest.version,
      licenses: [{ license: { id: "Apache-2.0" } }],
      purl,
      properties: [{ name: "agentproof.sbom.scope", value: "production-runtime-only" }],
    },
  },
  components: [],
  dependencies: [{ ref: purl, dependsOn: [] }],
};

mkdirSync(new URL("../sbom", import.meta.url), { recursive: true });
const destination = new URL("../sbom/agentproof-typescript.cdx.json", import.meta.url);
writeFileSync(destination, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
process.stdout.write(`VALID sbom=${destination.pathname} runtime_components=0\n`);
