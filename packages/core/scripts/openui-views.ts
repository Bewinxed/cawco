/**
 * Writes what the hub parses CawCo's OpenUI programs with and what their
 * writers are told, from each library over `@openuidev/lang-core`: the
 * parser's JSON Schema (`library.toJSONSchema()`), the root component, and
 * the system prompt `generateSystemPrompt` makes of them.
 *
 * - `src/views-spec.json`, from the view library (`src/views-library.ts`,
 *   Projects spec §5.2), with the view tools as the prompt lists them.
 * - `src/decisions-spec.json`, from the decision library
 *   (`src/decisions-library.ts`, §5.8), and its prompt as the decision-page
 *   skill's `LIBRARY.md`, which a session reads before it writes a page.
 *
 *   bun scripts/openui-views.ts          write the files
 *   bun scripts/openui-views.ts --check  fail when any is stale
 *
 * Both also fail when any package of the repo lets `@openuidev/*` run its
 * install script (`trustedDependencies`): lang-core's postinstall sends
 * telemetry, and Bun runs none it is not told to trust.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SystemPromptSpec } from "@openuidev/lang-core";
import { z } from "zod";

// lang-core's runtime telemetry is opt-in and these turn it off outright,
// before the prompt is generated (shared.ts `isTelemetryDisabled`).
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";

const { generateSystemPrompt } = await import("@openuidev/lang-core");
const {
  viewLibrary,
  viewPromptOptions,
  viewToolSpecs,
  VIEW_COMPONENTS,
  VIEW_ROOT,
} = await import("../src/views-library");
const {
  decisionLibrary,
  decisionPromptOptions,
  DECISION_COMPONENTS,
  DECISION_ROOT,
} = await import("../src/decisions-library");

const ROOT = join(import.meta.dir, "../../..");
const OUT = join(import.meta.dir, "../src/views-spec.json");
const DECISIONS_OUT = join(import.meta.dir, "../src/decisions-spec.json");
const LIBRARY_OUT = join(ROOT, "packages/hub/skills/decision-page/LIBRARY.md");

/** Every package.json of the repo: the root's and each workspace's. */
const manifests = (): string[] => [
  join(ROOT, "package.json"),
  ...["apps", "packages"].flatMap((dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(ROOT, dir, entry.name, "package.json"))
      .filter((path) => {
        try {
          readFileSync(path);
          return true;
        } catch {
          return false;
        }
      })
  ),
];

const trusting = manifests().flatMap((path) => {
  const { trustedDependencies = [] } = z
    .object({ trustedDependencies: z.array(z.string()).optional() })
    .parse(JSON.parse(readFileSync(path, "utf8")));
  return trustedDependencies
    .filter((name) => name.startsWith("@openuidev/"))
    .map((name) => `${path.slice(ROOT.length + 1)} trusts ${name}`);
});
if (trusting.length > 0) {
  throw new Error(
    `openui:check: ${trusting.join("; ")}. Its postinstall sends telemetry: take it out of trustedDependencies.`
  );
}

/** lang-core's "## Important Rules" section, to the next heading. */
const IMPORTANT_RULES = /^## Important Rules\n[\s\S]*?(?=^## )/mu;
/** lang-core's streaming heading. */
const STREAMING_HEADING = /^## Hoisting & Streaming \(CRITICAL\)$/mu;
/** lang-core's closing line under the tools, which says to mock data. */
const TOOLS_CRITICAL = /\n\nCRITICAL: Use ONLY the tools listed above[^\n]*/u;

/**
 * `generateSystemPrompt` as these libraries need it. lang-core 1.0.2 always
 * appends an "## Important Rules" section naming tables, charts and forms,
 * which neither library has; heads the streaming section "(CRITICAL)"; ends
 * the tools section with a CRITICAL line telling the writer to use "realistic
 * mock data", against the view library's rule to use only real data; and
 * appends `additionalRules` under Final Verification with no heading of
 * their own. `PromptOptions` has no setting for any of these. This drops the
 * first and the third, renames the second, its body kept, and heads the rules
 * "## Rules". It fails once one is gone, so a lang-core release with a
 * setting replaces it.
 */
const systemPrompt = (promptSpec: SystemPromptSpec): string => {
  const prompt = generateSystemPrompt(promptSpec);
  const rules = (promptSpec.promptOptions?.additionalRules ?? [])
    .map((rule) => `- ${rule}`)
    .join("\n");
  const hasTools = prompt.includes("\n## Available Tools\n");
  if (!(
    IMPORTANT_RULES.test(prompt) &&
    STREAMING_HEADING.test(prompt) &&
    TOOLS_CRITICAL.test(prompt) === hasTools &&
    prompt.endsWith(`\n\n${rules}`)
  )) {
    throw new Error(
      "openui: lang-core's prompt changed shape (the Important Rules section, the CRITICAL streaming heading, the CRITICAL tools line or the closing rules): use its setting and update systemPrompt in scripts/openui-views.ts."
    );
  }
  const cleaned = prompt
    .replace(IMPORTANT_RULES, "")
    .replace(STREAMING_HEADING, "## Hoisting and streaming")
    .replace(TOOLS_CRITICAL, "");
  return `${cleaned.slice(0, -rules.length)}## Rules\n\n${rules}`;
};

const library = viewLibrary(
  Object.fromEntries(VIEW_COMPONENTS.map((name) => [name, null])) as Record<
    (typeof VIEW_COMPONENTS)[number],
    null
  >
);
const spec = {
  $comment:
    "Generated by packages/core/scripts/openui-views.ts from src/views-library.ts. Do not edit: change that file and run `bun run openui` in packages/core; `bun run openui:check` fails while this is stale.",
  root: VIEW_ROOT,
  components: [...VIEW_COMPONENTS],
  schema: library.toJSONSchema(),
  tools: viewToolSpecs(),
  prompt: systemPrompt({
    library: { ...library.toSpec(), schema: library.toJSONSchema() },
    promptOptions: viewPromptOptions(),
  }),
};
const decisions = decisionLibrary(
  Object.fromEntries(DECISION_COMPONENTS.map((name) => [name, null])) as Record<
    (typeof DECISION_COMPONENTS)[number],
    null
  >
);
const decisionPrompt = systemPrompt({
  library: { ...decisions.toSpec(), schema: decisions.toJSONSchema() },
  promptOptions: decisionPromptOptions(),
});
const decisionSpec = {
  $comment:
    "Generated by packages/core/scripts/openui-views.ts from src/decisions-library.ts. Do not edit: change that file and run `bun run openui` in packages/core; `bun run openui:check` fails while this is stale.",
  root: DECISION_ROOT,
  components: [...DECISION_COMPONENTS],
  schema: decisions.toJSONSchema(),
};

/** Each file this writes, with its text now. */
const files: [path: string, text: string][] = [
  [OUT, `${JSON.stringify(spec, null, 2)}\n`],
  [DECISIONS_OUT, `${JSON.stringify(decisionSpec, null, 2)}\n`],
  [
    LIBRARY_OUT,
    `<!-- Generated by packages/core/scripts/openui-views.ts from packages/core/src/decisions-library.ts: run \`bun run openui\` in packages/core. -->\n\n# The decision library\n\n${decisionPrompt.trim()}\n`,
  ],
];

if (process.argv.includes("--check")) {
  const stale = files.filter(([path, text]) => {
    try {
      return readFileSync(path, "utf8") !== text;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    throw new Error(
      `openui:check: ${stale.map(([path]) => path.slice(ROOT.length + 1)).join(", ")} ${stale.length > 1 ? "are" : "is"} stale against its library. Run \`bun run openui\` in packages/core.`
    );
  }
  console.log(
    "openui:check: views-spec.json, decisions-spec.json and LIBRARY.md match their libraries, and no package trusts @openuidev/*"
  );
} else {
  for (const [path, text] of files) {
    writeFileSync(path, text);
    console.log(`wrote ${path}`);
  }
}
