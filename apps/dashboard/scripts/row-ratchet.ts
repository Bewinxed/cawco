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

export const checkReads = [
  "apps/dashboard/src/",
  "apps/dashboard/scripts/row-ratchet.baseline.json",
];

const BASELINE = join(DASHBOARD, "scripts/row-ratchet.baseline.json");

interface Baseline {
  count: number;
  files: Record<string, number>;
}

const FLEX_TOKEN = /(?:^|[\s"'`[{,])flex(?=$|[\s"'`}\],])/u;
const ITEMS_CENTER = /(?:^|[\s"'`[{,])items-center(?=$|[\s"'`}\],])/u;
const HAS_ICON = /\bsize-icon-(?:sm|md|lg)\b/u;
const HAS_TYPE = /\btype-(?:meta|code|body|label|title|kpi)\b/u;

interface AstNode {
  attributes?: AstNode[];
  fragment?: { nodes?: AstNode[] };
  name?: string;
  nodes?: AstNode[];
  start?: number;
  end?: number;
  type?: string;
  value?: unknown;
  [key: string]: unknown;
}

function attrText(node: AstNode, attrName: string, source: string): string {
  for (const attr of node.attributes ?? []) {
    if (attr.type === "Attribute" && attr.name === attrName) {
      return source.slice(attr.start ?? 0, attr.end ?? 0);
    }
  }
  return "";
}

function isRowHost(node: AstNode, source: string): boolean {
  if (node.type !== "RegularElement") {
    return false;
  }
  if (node.name === "li") {
    return true;
  }
  const role = attrText(node, "role", source);
  return /role\s*=\s*["']option["']/u.test(role);
}

function countInSource(source: string): number {
  let ast: AstNode;
  try {
    ast = parse(source, { modern: true }) as unknown as AstNode;
  } catch {
    return 0;
  }
  let hits = 0;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    const n = node as AstNode;
    if (isRowHost(n, source)) {
      const cls = attrText(n, "class", source);
      if (FLEX_TOKEN.test(cls) && ITEMS_CENTER.test(cls)) {
        const snippet = source.slice(n.start ?? 0, n.end ?? 0);
        if (HAS_ICON.test(snippet) && HAS_TYPE.test(snippet)) {
          hits += 1;
        }
      }
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === "attributes" || key === "css" || key === "instance" || key === "module") {
        continue;
      }
      if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  walk(ast.fragment);
  return hits;
}

async function counted(): Promise<Record<string, number>> {
  const files: Record<string, number> = {};
  for (const { path, source } of await dashboardSources()) {
    if (!path.endsWith(".svelte") || path.startsWith("src/lib/components/ui/row/")) {
      continue;
    }
    const n = countInSource(source);
    if (n > 0) {
      files[path] = n;
    }
  }
  return files;
}

const files = await counted();
const count = Object.values(files).reduce((a, b) => a + b, 0);
const say = (s: string) => process.stdout.write(`${s}\n`);

if (process.argv.includes("--write-baseline")) {
  const baseline: Baseline = { count, files };
  await Bun.write(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  say(`row-ratchet: baseline written, ${count} hand-built flex rows`);
} else {
  const baseline = (await Bun.file(BASELINE).json()) as Baseline;
  if (count > baseline.count) {
    say(
      `row-ratchet: ${count} hand-built flex rows, up from ${baseline.count}. Use ui/row (rows-grid / row-cells subgrid) instead:`
    );
    for (const [path, n] of Object.entries(files)) {
      const before = baseline.files[path] ?? 0;
      if (n > before) {
        say(`  ${path}: ${before} → ${n}`);
      }
    }
    process.exitCode = 1;
  } else {
    say(`row-ratchet: ${count} hand-built flex rows (baseline ${baseline.count})`);
  }
}
