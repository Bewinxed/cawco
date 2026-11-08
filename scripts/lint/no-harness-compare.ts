/**
 * A harness is a table and a facet, never a string compare: `=== "claude"`,
 * `!== "opencode"`, `case "pi"` are refused outside the places a harness's
 * name is its subject. What a harness is, the hub, core and the dashboard
 * read from core's traits table (packages/core/src/harness/traits.ts); what
 * it does, the agent asks its adapter (packages/agent/src/harness.ts). A new
 * harness is one row in the table and one adapter.
 *
 * {@link HARNESS_NAMED} files name a harness as their subject and {@link STAYS}
 * names each compare that must remain, with why: a test double, mock data, or
 * a display name that should be a words lookup.
 *
 * golar.config.ts runs it over every file bun run check lints but the probe
 * specs; scripts/lint/fixtures/harness-compare.ts holds what it must refuse.
 */
import { defineRule } from "golar/unstable";
import {
  isBinaryExpression,
  isCaseClause,
  isStringLiteral,
  type Node,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
} from "golar/unstable-tsgo";

const NAMES = new Set(["claude", "opencode", "pi"]);

/** A file's name up to the repository's own path. */
const TO_REPOSITORY = /^.*?(?=(?:apps|packages|scripts|site)\/)/u;

/** Files a harness's name is the subject of. */
const HARNESS_NAMED: { path: string; why: string }[] = [
  { path: "packages/agent/src/harnesses/", why: "a harness naming itself" },
  { path: "packages/core/src/harness/traits.ts", why: "the traits table" },
  {
    path: "packages/agent/src/proc-id.ts",
    why: "the keeper's process-id grammar, which names its kinds",
  },
];

/** Each compare that must stay, by file: what it compares to which harness, with why. */
const STAYS: Record<string, { compared: string; name: string; why: string }[]> =
  {
    "apps/dashboard/src/lib/cawco/decides/preview/setup-records.ts": [
      {
        compared: "offer.id",
        name: "opencode",
        why: "mock data names a harness",
      },
    ],
    "apps/dashboard/src/lib/cawco/usage/History.svelte": [
      {
        compared: "chart.harness",
        name: "claude",
        why: "the chart's series index of a two-harness view",
      },
    ],
    "apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte": [
      { compared: "harness", name: "claude", why: "a display name" },
    ],
    "packages/core/src/delegate-types.ts": [
      { compared: "harness", name: "opencode", why: "a display name" },
    ],
    "packages/core/src/hooks.ts": [
      { compared: "harness", name: "opencode", why: "a display name" },
    ],
    "scripts/binary/proof-harnesses.ts": [
      { compared: "kind", name: "claude", why: "a test double per kind" },
      { compared: "kind", name: "opencode", why: "a test double per kind" },
    ],
    "scripts/scratch-fleet.ts": [
      {
        compared: "one.harness",
        name: "claude",
        why: "a probe picks a harness",
      },
    ],
  };

const MESSAGE =
  "A harness name compared: read HARNESS_TRAITS through traitsOf (packages/core/src/harness/traits.ts) or ask the adapter's facet (packages/agent/src/harness.ts). A harness name stands only in its own harnesses/ folder, or as a compare named in this rule's STAYS list, with why.";

/** The literal a compare or a case names, when it names a harness. */
const harnessLiteral = (node: Node): StringLiteral | undefined =>
  isStringLiteral(node) && NAMES.has(node.text) ? node : undefined;

export const noHarnessCompare = defineRule({
  name: "house/no-harness-compare",
  setup(context) {
    const file: SourceFile = context.sourceFile;
    const path = file.fileName.replace(TO_REPOSITORY, "");
    if (HARNESS_NAMED.some(({ path: named }) => path.startsWith(named))) {
      return;
    }
    const stays = STAYS[path] ?? [];
    const report = (literal: StringLiteral, compared?: Node): void => {
      const stands = stays.some(
        (one) =>
          one.name === literal.text && one.compared === compared?.getText(file)
      );
      if (!stands) {
        context.report({
          message: MESSAGE,
          range: { begin: literal.getStart(file), end: literal.end },
        });
      }
    };
    const visit = (node: Node): void => {
      if (isBinaryExpression(node)) {
        const { kind } = node.operatorToken;
        const named = harnessLiteral(node.left) ?? harnessLiteral(node.right);
        if (
          named &&
          (kind === SyntaxKind.EqualsEqualsEqualsToken ||
            kind === SyntaxKind.ExclamationEqualsEqualsToken)
        ) {
          report(named, named === node.left ? node.right : node.left);
        }
      }
      const literal = isCaseClause(node)
        ? harnessLiteral(node.expression)
        : undefined;
      if (literal) {
        report(literal);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
