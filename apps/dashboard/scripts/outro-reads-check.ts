/**
 * `bun run outro-reads:check` (part of `bun run check`): an outro reads no derived of its component.
 *
 * Svelte runs an `out:` (or `transition:`) function, and works out its
 * parameters, as the outro starts, once the block that held the element has
 * let it go: that block's effects, and every component under it, are inert
 * from then on (svelte `pause_effect` marks them inert before it calls each
 * transition's `out`). A `$derived` they own is frozen there: read while a
 * value it depends on has changed, Svelte hands back its last value and
 * warns `derived_inert` ("Reading a derived belonging to a now-destroyed
 * effect may result in stale values", svelte.dev/e/derived_inert). Closing
 * a thing usually changes what it was drawn from in that same flush (the
 * pin's card closing by Esc cleared the pill it stood beside), so the read
 * is stale whenever it matters.
 *
 * Which deriveds are frozen: a `{@const}` of the block it plays in, always;
 * the script's own, when the element stands in no block of the component
 * (its outro plays as the parent's block lets the whole component go) or
 * the transition is `|global`. So the function such an outro names, every
 * local function it reaches, its nested closures (a `css` or `tick` runs
 * each frame of the outro) and its parameters read none of them. An outro
 * reads what the component wrote down while it stood: a plain variable an
 * `$effect` keeps (PinFloat's `drawn`), or the element itself.
 *
 * Every failure prints `file:line  out:<name>  reads <derived>`.
 *
 *   bun apps/dashboard/scripts/outro-reads-check.ts [file…]   (no files: every .svelte under src/)
 */
import { parse } from "svelte/compiler";
import { runSvelteCheck } from "./svelte-sources";

const DERIVED = /^\$derived(?:\.by)?$/u;
const RUNES_MODULE = /\.svelte(?:\.[jt]s)?$/u;
/** The markup's blocks: each pauses and goes on its own, the component standing. */
const BLOCKS = new Set([
  "IfBlock",
  "EachBlock",
  "AwaitBlock",
  "KeyBlock",
  "SnippetBlock",
]);

interface Node {
  end?: number;
  start?: number;
  type?: string;
  [key: string]: unknown;
}

interface Hit {
  file: string;
  line: number;
  name: string;
  reads: string[];
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "type" in value;

/** Every node under `node`, itself included, depth first. */
function* nodesOf(node: unknown): Generator<Node> {
  if (Array.isArray(node)) {
    for (const one of node) {
      yield* nodesOf(one);
    }
    return;
  }
  // A type (`typeof place`) reads nothing at run time.
  if (!isNode(node) || node.type?.startsWith("TS")) {
    return;
  }
  yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "parent" && key !== "metadata" && typeof value === "object") {
      yield* nodesOf(value);
    }
  }
}

/** A callee's name: `f`, or `a.b` for a member. */
const calleeName = (callee: Node): string => {
  if (callee.type === "MemberExpression") {
    return `${(callee.object as Node).name as string}.${(callee.property as Node).name as string}`;
  }
  return (callee.name as string | undefined) ?? "";
};

/** Whether `init` is `$derived(…)` or `$derived.by(…)`. */
const derivedCall = (init: Node | null): boolean =>
  init?.type === "CallExpression" &&
  DERIVED.test(calleeName(init.callee as Node));

const isFunction = (init: Node | null): init is Node =>
  init?.type === "ArrowFunctionExpression" ||
  init?.type === "FunctionExpression";

/** The names a pattern binds (`const { a, b: [c] } = …`). */
const bound = (pattern: unknown): string[] =>
  [...nodesOf(pattern)]
    .filter((node) => node.type === "Identifier")
    .map((node) => node.name as string);

/** The names read in `node` (identifiers not in a property key or member's property). */
const readsIn = (node: unknown): Set<string> => {
  const names = new Set<string>();
  const skip = new Set<Node>();
  for (const one of nodesOf(node)) {
    if (one.type === "MemberExpression" && !one.computed) {
      skip.add(one.property as Node);
    }
    if (
      (one.type === "Property" || one.type === "MethodDefinition") &&
      !one.computed
    ) {
      skip.add(one.key as Node);
    }
    if (one.type === "Identifier" && !skip.has(one)) {
      names.add(one.name as string);
    }
  }
  return names;
};

/** Each outro in the markup, and whether it stands in a block of the component. */
function* outros(node: unknown, inBlock: boolean): Generator<[Node, boolean]> {
  if (Array.isArray(node)) {
    for (const one of node) {
      yield* outros(one, inBlock);
    }
    return;
  }
  if (!isNode(node) || node.type?.startsWith("TS")) {
    return;
  }
  if (node.type === "TransitionDirective" && node.outro) {
    yield [node, inBlock];
  }
  const under = inBlock || BLOCKS.has(node.type as string);
  for (const [key, value] of Object.entries(node)) {
    if (key !== "parent" && key !== "metadata" && typeof value === "object") {
      yield* outros(value, under);
    }
  }
}

const lineAt = (source: string, at: number): number =>
  source.slice(0, at).split("\n").length;

/** Classes from a runes module (`*.svelte.ts`): an instance made in a component holds deriveds it owns (FloatPlace's `plan`). */
const runeClasses = (script: Node | null): Set<string> => {
  const names = new Set<string>();
  for (const node of nodesOf(script)) {
    if (
      node.type === "ImportDeclaration" &&
      RUNES_MODULE.test((node.source as Node).value as string)
    ) {
      for (const one of node.specifiers as Node[]) {
        names.add((one.local as Node).name as string);
      }
    }
  }
  return names;
};

/** The script's deriveds (and the rune-class instances it makes), and its own functions by name: what an outro may call. */
function scriptOf(script: Node | null): {
  deriveds: Set<string>;
  functions: Map<string, Node>;
} {
  const classes = runeClasses(script);
  const deriveds = new Set<string>();
  const functions = new Map<string, Node>();
  for (const node of nodesOf(script)) {
    if (node.type === "FunctionDeclaration" && node.id) {
      functions.set((node.id as Node).name as string, node);
    }
    if (node.type !== "VariableDeclarator") {
      continue;
    }
    const init = node.init as Node | null;
    const made =
      init?.type === "NewExpression" &&
      classes.has((init.callee as Node).name as string);
    if (derivedCall(init) || made) {
      for (const name of bound(node.id)) {
        deriveds.add(name);
      }
    } else if (isFunction(init) && (node.id as Node).type === "Identifier") {
      functions.set((node.id as Node).name as string, init);
    }
  }
  return { deriveds, functions };
}

/** Each `{@const}` the markup declares. */
const constsOf = (fragment: Node): Set<string> =>
  new Set(
    [...nodesOf(fragment)]
      .filter((node) => node.type === "ConstTag")
      .flatMap((node) =>
        ((node.declaration as Node).declarations as Node[]).flatMap((one) =>
          bound(one.id)
        )
      )
  );

/** What `start` reads, with every local function it reaches and what each of those reads. */
function reachedFrom(
  functions: Map<string, Node>,
  start: Iterable<string>
): Set<string> {
  const seen = new Set<string>();
  const names = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const name = queue.pop() as string;
    names.add(name);
    const body = functions.get(name);
    if (body && !seen.has(name)) {
      seen.add(name);
      queue.push(...readsIn(body));
    }
  }
  return names;
}

export function check(file: string, source: string): Hit[] {
  const ast = parse(source, { modern: true }) as unknown as {
    fragment: Node;
    instance: { content: Node } | null;
  };
  const { deriveds, functions } = scriptOf(ast.instance?.content ?? null);
  const consts = constsOf(ast.fragment);
  if (deriveds.size === 0 && consts.size === 0) {
    return [];
  }
  const hits: Hit[] = [];
  for (const [node, inBlock] of outros(ast.fragment, false)) {
    const name = node.name as string;
    const reads = reachedFrom(functions, [
      name.split(".")[0] as string,
      ...readsIn(node.expression),
    ]);
    // The whole component goes with it: its script's deriveds are frozen too.
    const whole =
      !inBlock || (node.modifiers as string[] | undefined)?.includes("global");
    const frozen = [...reads]
      .filter((one) => consts.has(one) || (whole && deriveds.has(one)))
      .sort();
    if (frozen.length > 0) {
      hits.push({
        file,
        line: lineAt(source, node.start as number),
        name: `${node.intro ? "transition" : "out"}:${name}`,
        reads: frozen,
      });
    }
  }
  return hits;
}

if (import.meta.main) {
  runSvelteCheck({
    find: check,
    said: (one) => `${one.name}  reads ${one.reads.join(", ")}`,
    failed: (count) =>
      `outro-reads:check: ${count} outro(s) read a derived of their component, which Svelte has frozen by the time an outro runs (derived_inert, svelte.dev/e/derived_inert). Read what the component wrote down while it stood: a plain variable an $effect keeps, or the element (apps/dashboard/scripts/outro-reads-check.ts).`,
    passed: (files) =>
      `outro-reads:check: ${files} file(s), no outro reads a derived`,
  });
}
