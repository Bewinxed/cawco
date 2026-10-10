/**
 * `bun run apple-ops:check`: every `Operations.<Name>` the Apple app's Swift
 * names is an operation the generated API still has. The app's client is
 * generated on the Mac by swift-openapi-generator from
 * `apps/apple/Packages/CawCoKit/Sources/CawCoAPI/openapi.json`, so a hub
 * route removed or renamed on Linux would otherwise leave the iOS build
 * broken until someone compiles it there.
 *
 * swift-openapi-generator names an operation's namespace after its
 * operationId with the first letter uppercased (`getApiDelegateTypes` →
 * `Operations.GetApiDelegateTypes`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APPLE = join(ROOT, "apps/apple");
const SPEC = join(APPLE, "Packages/CawCoKit/Sources/CawCoAPI/openapi.json");
const SKIP_DIRS = new Set([".build", "build", "DerivedData", ".swiftpm"]);
const REFERENCE = /\bOperations\.([A-Za-z_][A-Za-z0-9_]*)/g;

const walk = (dir: string, out: string[]): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (name.endsWith(".swift")) {
      out.push(path);
    }
  }
};

interface OpenApi {
  paths: Record<string, Record<string, { operationId?: string }>>;
}

const spec = JSON.parse(readFileSync(SPEC, "utf8")) as OpenApi;
const known = new Set<string>();
for (const item of Object.values(spec.paths)) {
  for (const op of Object.values(item)) {
    const id = op?.operationId;
    if (typeof id === "string" && id.length > 0) {
      known.add(id.charAt(0).toUpperCase() + id.slice(1));
    }
  }
}

const files: string[] = [];
walk(APPLE, files);
const used = new Set<string>();
const missing: string[] = [];
for (const path of files) {
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const match of line.matchAll(REFERENCE)) {
        const name = match[1] ?? "";
        used.add(name);
        const hit = `  ${relative(ROOT, path)}:${index + 1}  Operations.${name}`;
        if (!(known.has(name) || missing.includes(hit))) {
          missing.push(hit);
        }
      }
    });
}

if (missing.length > 0) {
  console.error(
    `apple-ops:check: ${missing.length} reference(s) in the Apple app name an operation openapi.json no longer has. Update the Swift to the current operation (or restore the route):`
  );
  for (const line of missing) {
    console.error(line);
  }
  process.exit(1);
}
console.log(`apple-ops:check: ${used.size} operations, all present`);
