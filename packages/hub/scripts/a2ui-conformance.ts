/**
 * `bun run a2ui:check`: the A2UI spec's own fixtures (vendored,
 * src/a2ui-spec/v0_9_1/test/cases) through the hub's validator setup, as the
 * spec's runner (run_tests.py) runs them: each suite against the schema it
 * names with the basic catalog as `catalog.json`, then every line of the
 * contact form example. The Projects spec (§5.2) makes these fixtures
 * CawCo's conformance check. Also compiles the spec's schemas over CawCo's
 * own catalog, so a catalog the envelope cannot read fails here first.
 * Exits 1 on any mismatch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { basicA2uiSchemas, cawcoA2uiSchemas } from "../src/a2ui";

const CASES = resolve(import.meta.dir, "../src/a2ui-spec/v0_9_1/test/cases");

interface Suite {
  schema?: string;
  tests: { data: unknown; description?: string; valid?: boolean }[];
}

const schemas = basicA2uiSchemas();
cawcoA2uiSchemas();

let passed = 0;
const failed: string[] = [];

for (const file of readdirSync(CASES)
  .filter((name) => name.endsWith(".json"))
  .sort()) {
  const suite = JSON.parse(readFileSync(join(CASES, file), "utf8")) as Suite;
  const name = (suite.schema ??
    "server_to_client.json") as keyof typeof schemas;
  const validate = schemas[name];
  if (!validate) {
    failed.push(
      `${file}: names the schema ${name}, which the hub does not load`
    );
    continue;
  }
  suite.tests.forEach((test, index) => {
    const valid = validate(test.data);
    if (valid === (test.valid ?? true)) {
      passed += 1;
    } else {
      failed.push(
        `${file} › ${test.description ?? `test ${index + 1}`}: expected ${(test.valid ?? true) ? "valid" : "invalid"}, got ${valid ? "valid" : "invalid"}${valid ? "" : ` (${validate.errors?.[0]?.instancePath} ${validate.errors?.[0]?.message})`}`
      );
    }
  });
}

const example = readFileSync(join(CASES, "contact_form_example.jsonl"), "utf8");
example
  .split("\n")
  .filter((line) => line.trim())
  .forEach((line, index) => {
    const valid: boolean = schemas["server_to_client.json"](JSON.parse(line));
    if (valid) {
      passed += 1;
    } else {
      failed.push(`contact_form_example.jsonl › line ${index + 1}: invalid`);
    }
  });

console.log(`A2UI v0.9.1 fixtures: ${passed} passed, ${failed.length} failed`);
for (const line of failed) {
  console.error(`  ${line}`);
}
if (failed.length > 0) {
  process.exit(1);
}
