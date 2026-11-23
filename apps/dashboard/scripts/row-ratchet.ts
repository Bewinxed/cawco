/**
 * Holds the count of hand-built flex rows in the dashboard's `.svelte` markup
 * from rising. A hand-built row is an `<li>` or `[role="option"]` outside
 * `src/lib/components/ui/row/` whose own `class` carries both `flex` and
 * `items-center` while its subtree holds an icon (`size-icon-*`) and text
 * (`type-*`): such rows align each item independently instead of sharing
 * columns through `ui/row` (`rows-grid` / `row-cells` subgrid).
 *
 * The count may fall as lists migrate onto `ui/row`, never rise.
 *
 *   bun apps/dashboard/scripts/row-ratchet.ts                   exits 1 when the count rose
 *   bun apps/dashboard/scripts/row-ratchet.ts --write-baseline  after a cleanup
 */
import { join } from "node:path";
import { parse } from "svelte/compiler";
import { DASHBOARD, dashboardSources } from "./class-strings";
import { runRatchet } from "./lib/ratchet";

export const checkReads = [
  "apps/dashboard/src/",
  "apps/dashboard/scripts/row-ratchet.baseline.json",
];

const BASELINE = join(DASHBOARD, "scripts/row-ratchet.baseline.json");
const FLEX_TOKEN = /(?:^|[\s"'`[{,])flex(?=$|[\s"'`}\],])/u;
const ITEMS_CENTER = /(?:^|[\s"'`[{,])items-center(?=$|[\s"'`}\],])/u;
const ROLE_OPTION = /role\s*=\s*["']option["']/u;
const HAS_ICON = /\bsize-icon-(?:sm|md|lg)\b/u;
const HAS_TYPE = /\btype-(?:meta|code|body|label|title|kpi)\b/u;
const SKIP_KEYS = new Set(["attributes", "css", "instance", "module"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function spanOf(node: Record<string, unknown>, source: string): string {
  const start = typeof node.start === "number" ? node.start : 0;
  const end = typeof node.end === "number" ? node.end : 0;
  return source.slice(start, end);
}

function attrText(
  node: Record<string, unknown>,
  attrName: string,
  source: string
): string {
  if (!Array.isArray(node.attributes)) {
    return "";
  }
  for (const attr of node.attributes) {
    if (isRecord(attr) && attr.type === "Attribute" && attr.name === attrName) {
      return spanOf(attr, source);
    }
  }
  return "";
}

function isHandBuiltRow(
  node: Record<string, unknown>,
  source: string
): boolean {
  if (node.type !== "RegularElement") {
    return false;
  }
  const isHost =
    node.name === "li" || ROLE_OPTION.test(attrText(node, "role", source));
  if (!isHost) {
    return false;
  }
  const cls = attrText(node, "class", source);
  if (!(FLEX_TOKEN.test(cls) && ITEMS_CENTER.test(cls))) {
    return false;
  }
  const snippet = spanOf(node, source);
  return HAS_ICON.test(snippet) && HAS_TYPE.test(snippet);
}

function walkNode(node: unknown, source: string): number {
  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + walkNode(item, source), 0);
  }
  if (!isRecord(node)) {
    return 0;
  }
  let hits = isHandBuiltRow(node, source) ? 1 : 0;
  for (const [key, value] of Object.entries(node)) {
    if (!SKIP_KEYS.has(key) && typeof value === "object" && value !== null) {
      hits += walkNode(value, source);
    }
  }
  return hits;
}

function countInSource(source: string): number {
  const ast = parse(source, { modern: true });
  return walkNode(ast.fragment, source);
}

async function counted(): Promise<Record<string, number>> {
  const files: Record<string, number> = {};
  for (const { path, source } of await dashboardSources()) {
    if (
      !path.endsWith(".svelte") ||
      path.startsWith("src/lib/components/ui/row/")
    ) {
      continue;
    }
    const n = countInSource(source);
    if (n > 0) {
      files[path] = n;
    }
  }
  return files;
}

await runRatchet({
  name: "row-ratchet",
  noun: "hand-built flex rows",
  baselinePath: BASELINE,
  files: await counted(),
  advice: "Use ui/row (rows-grid / row-cells subgrid) instead:",
});
