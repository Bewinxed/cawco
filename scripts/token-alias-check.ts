/**
 * `bun run token-alias:check` (part of `bun run check`): the token
 * source parses under Terrazzo (@terrazzo/parser), a standards-strict DTCG
 * 2025.10 reader, so every alias's `$type` matches the token it points at
 * (`Cannot alias to $type "gradient" from $type "color"` fails the build).
 *
 * Each modifier context of design/tokens/cawco.resolver.json is parsed over
 * the base set, since Terrazzo's own resolver read checks only the defaults.
 * Lint is skipped: its `core/valid-color` rejects a `"none"` component, which
 * DTCG 2025.10 allows.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, Logger, parse } from "@terrazzo/parser";

const DIR = join(import.meta.dir, "../design/tokens");

interface Ref {
  $ref: string;
}
interface Resolver {
  modifiers: Record<string, { contexts: Record<string, Ref[]> }>;
  sets: Record<string, { sources: Ref[] }>;
}

const resolver: Resolver = await Bun.file(
  join(DIR, "cawco.resolver.json")
).json();
const base = Object.values(resolver.sets).flatMap((set) => set.sources);
const layers: [string, Ref[]][] = [["default", []]];
for (const [modifier, { contexts }] of Object.entries(resolver.modifiers)) {
  for (const [context, sources] of Object.entries(contexts)) {
    if (sources.length > 0) {
      layers.push([`${modifier}=${context}`, sources]);
    }
  }
}

const config = defineConfig({}, { cwd: pathToFileURL(`${process.cwd()}/`) });
const failures: string[] = [];
for (const [name, extra] of layers) {
  const input = await Promise.all(
    [...base, ...extra].map(async ({ $ref }) => {
      const path = join(DIR, $ref);
      return {
        filename: pathToFileURL(path),
        src: await Bun.file(path).text(),
      };
    })
  );
  try {
    await parse(input, {
      config,
      logger: new Logger({ level: "silent" }),
      skipLint: true,
    });
  } catch (error) {
    failures.push(`${name}: ${String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`token aliases: ${failures.length} context(s) fail\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`token aliases: ${layers.length} contexts parse under Terrazzo`);
