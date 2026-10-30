/**
 * `bun run outro-reads:check` (part of `bun run check`): an outro reads no
 * derived of its component, and no teardown calls back into a `{@const}`.
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
 * **Teardown callbacks.** The same holds after the outro, as the block is
 * destroyed: a component's teardown (an `$effect`'s cleanup, `onDestroy`)
 * runs then, and a `{@const}` it reaches is worse than stale. Svelte runs a
 * dirty derived again while it destroys (svelte `execute_derived`: the
 * `derived_inert` shortcut is skipped `while is_destroying_effect`), so it
 * reads the state that let the block go: the `{#if openPin}`'s
 * `{@const pin = openPin}` is null by then. So where a component's teardown
 * calls one of its props (`onhold(false)`, `untrack(() => onhold)?.(false)`,
 * or through a local function), no holder passes that prop a function that
 * reads a `{@const}` in scope. The goo card's `onhold` did: `held[pin.id]`
 * threw on every close and SvelteKit drew a 500. The callback reads what
 * the holder keeps in its own state, or the component says what it needs
 * while it stands.
 *
 * Every failure prints `file:line  out:<name>  reads <derived>`, or
 * `file:line  teardown callback <Component> <prop>  reads <const>`. Before
 * the run, the planted teardown callback (fixtures/teardown-callback) must
 * be caught, and nothing else there.
 *
 *   bun apps/dashboard/scripts/outro-reads-check.ts [file…]   (no files: every .svelte under src/)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
  /** An outro reading a frozen derived, or a teardown calling back into a `{@const}`. */
  kind: "outro" | "teardown";
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
        kind: "outro",
        line: lineAt(source, node.start as number),
        name: `${node.intro ? "transition" : "out"}:${name}`,
        reads: frozen,
      });
    }
  }
  return [
    ...hits,
    ...teardownCallbacks(
      file,
      source,
      ast.fragment,
      ast.instance?.content ?? null
    ),
  ];
}

const DASHBOARD_SRC = join(import.meta.dir, "..", "src");
const LIB_IMPORT = /^[#$]lib\//u;

/** An import's file: by the dashboard's `#lib` and `$lib`, or relative. */
function importedFile(from: string, spec: string): string | null {
  const lib = LIB_IMPORT.exec(spec);
  let path: string | null = null;
  if (lib) {
    path = join(DASHBOARD_SRC, "lib", spec.slice(lib[0].length));
  } else if (spec.startsWith(".")) {
    path = resolve(dirname(from), spec);
  }
  return path && existsSync(path) ? path : null;
}

/** `untrack(() => f)`: the `f` it hands back, else null. */
const untracked = (call: Node): string | null => {
  if (
    call.type !== "CallExpression" ||
    calleeName(call.callee as Node) !== "untrack"
  ) {
    return null;
  }
  const [wrapped = null] = (call.arguments as Node[] | undefined) ?? [];
  const body = isFunction(wrapped) ? (wrapped.body as Node) : null;
  return body?.type === "Identifier" ? (body.name as string) : null;
};

/** The names a call in `node` calls: `f(…)`, `f?.(…)`, and `untrack(() => f)(…)`. */
const calledIn = (node: unknown): Set<string> => {
  const names = new Set<string>();
  for (const one of nodesOf(node)) {
    if (one.type !== "CallExpression") {
      continue;
    }
    const callee = one.callee as Node;
    const name =
      callee.type === "Identifier"
        ? (callee.name as string)
        : untracked(callee);
    if (name) {
      names.add(name);
    }
  }
  return names;
};

/** An `$effect`'s cleanup: what its function returns, from its own body (not a function nested in it). */
const cleanupsOf = (run: Node): Node[] => {
  const body = run.body as Node;
  if (body.type !== "BlockStatement") {
    return isFunction(body) ? [body] : [];
  }
  return (body.body as Node[])
    .filter((one) => one.type === "ReturnStatement")
    .map((one) => one.argument as Node | null)
    .filter(isFunction);
};

/** The functions a teardown is: each `$effect`'s returned cleanup, and each `onDestroy`'s argument. */
function teardownsOf(script: Node | null): Node[] {
  const found: Node[] = [];
  for (const node of nodesOf(script)) {
    if (node.type !== "CallExpression") {
      continue;
    }
    const name = calleeName(node.callee as Node);
    const [run = null] = node.arguments as Node[];
    if (!isFunction(run)) {
      continue;
    }
    if (name === "onDestroy") {
      found.push(run);
    } else if (name === "$effect" || name === "$effect.pre") {
      found.push(...cleanupsOf(run));
    }
  }
  return found;
}

/** A component's props by the local name each is bound to (`let { onhold: hold } = $props()`). */
function propsOf(script: Node | null): Map<string, string> {
  const declared = new Map<string, string>();
  for (const node of nodesOf(script)) {
    const init = node.init as Node | null | undefined;
    const pattern = node.id as Node | undefined;
    if (
      node.type !== "VariableDeclarator" ||
      init?.type !== "CallExpression" ||
      calleeName(init.callee as Node) !== "$props" ||
      pattern?.type !== "ObjectPattern"
    ) {
      continue;
    }
    for (const one of pattern.properties as Node[]) {
      const key = one.key as Node | undefined;
      const value = one.value as Node | undefined;
      const local =
        value?.type === "AssignmentPattern" ? (value.left as Node) : value;
      if (key?.type === "Identifier" && local?.type === "Identifier") {
        declared.set(local.name as string, key.name as string);
      }
    }
  }
  return declared;
}

/** The props a component's teardowns call, through the local functions they reach, by its file. */
const teardownProps = new Map<string, Set<string>>();
function propsCalledInTeardown(path: string): Set<string> {
  const known = teardownProps.get(path);
  if (known) {
    return known;
  }
  const ast = parse(readFileSync(path, "utf8"), {
    modern: true,
  }) as unknown as { instance: { content: Node } | null };
  const script = ast.instance?.content ?? null;
  const declared = propsOf(script);
  const { functions } = scriptOf(script);
  const props = new Set<string>();
  for (const teardown of teardownsOf(script)) {
    const reached = reachedFrom(functions, readsIn(teardown));
    const bodies = [
      teardown,
      ...[...reached].flatMap((one) => functions.get(one) ?? []),
    ];
    for (const name of bodies.flatMap((one) => [...calledIn(one)])) {
      const prop = declared.get(name);
      if (prop) {
        props.add(prop);
      }
    }
  }
  teardownProps.set(path, props);
  return props;
}

/** The `.svelte` components a script imports by their default name, each its file. */
function componentsOf(file: string, script: Node | null): Map<string, string> {
  const imported = new Map<string, string>();
  for (const node of nodesOf(script)) {
    if (node.type !== "ImportDeclaration") {
      continue;
    }
    const spec = (node.source as Node).value as string;
    const path = spec.endsWith(".svelte") ? importedFile(file, spec) : null;
    const named = (node.specifiers as Node[]).find(
      (one) => one.type === "ImportDefaultSpecifier"
    );
    const local = (named?.local as Node | undefined)?.name as
      string | undefined;
    if (path && local) {
      imported.set(local, path);
    }
  }
  return imported;
}

/** The `{@const}` names a fragment declares among its own nodes. */
const fragmentConsts = (fragment: Node): string[] =>
  (fragment.nodes as Node[])
    .filter((one) => one.type === "ConstTag")
    .flatMap((one) =>
      ((one.declaration as Node).declarations as Node[]).flatMap((declarator) =>
        bound(declarator.id)
      )
    );

/** The callbacks one component is passed for a prop its teardown calls, each with the `{@const}` names in `scope` it reads. */
function callbacksReading(
  component: Node,
  called: Set<string>,
  scope: Set<string>
): { attribute: Node; reads: string[] }[] {
  return (component.attributes as Node[]).flatMap((attribute) => {
    const value = attribute.value as Node | undefined;
    const passed =
      value?.type === "ExpressionTag" ? (value.expression as Node) : null;
    if (
      attribute.type !== "Attribute" ||
      !called.has(attribute.name as string) ||
      !isFunction(passed)
    ) {
      return [];
    }
    const reads = [...readsIn(passed)].filter((one) => scope.has(one)).sort();
    return reads.length > 0 ? [{ attribute, reads }] : [];
  });
}

/**
 * Each component the markup holds whose teardown calls a prop it is passed a
 * function for, that function reading a `{@const}` in scope where it is
 * passed.
 */
function teardownCallbacks(
  file: string,
  source: string,
  fragment: Node,
  script: Node | null
): Hit[] {
  const imported = componentsOf(file, script);
  if (imported.size === 0) {
    return [];
  }
  const hits: Hit[] = [];
  const visit = (node: Node, scope: Set<string>): void => {
    const path =
      node.type === "Component" ? imported.get(node.name as string) : undefined;
    if (!path || scope.size === 0) {
      return;
    }
    for (const { attribute, reads } of callbacksReading(
      node,
      propsCalledInTeardown(path),
      scope
    )) {
      hits.push({
        file,
        kind: "teardown",
        line: lineAt(source, attribute.start as number),
        name: `<${node.name as string} ${attribute.name as string}>`,
        reads,
      });
    }
  };
  const walk = (node: unknown, consts: Set<string>): void => {
    if (Array.isArray(node)) {
      for (const one of node) {
        walk(one, consts);
      }
      return;
    }
    if (!isNode(node) || node.type?.startsWith("TS")) {
      return;
    }
    const scope =
      node.type === "Fragment"
        ? new Set([...consts, ...fragmentConsts(node)])
        : consts;
    visit(node, scope);
    for (const [key, value] of Object.entries(node)) {
      if (key !== "parent" && key !== "metadata" && typeof value === "object") {
        walk(value, scope);
      }
    }
  };
  walk(fragment, new Set());
  return hits;
}

/** The planted mistake: a holder passing a teardown-called prop a callback that reads its `{@const}`. */
const PLANTED = join(
  import.meta.dir,
  "fixtures",
  "teardown-callback",
  "Holder.svelte"
);
const PLANTED_HITS = ["teardown <Card onhold> reads pin"];

const said = (one: Hit): string =>
  `${one.kind === "teardown" ? "teardown callback " : ""}${one.name}  reads ${one.reads.join(", ")}`;

if (import.meta.main) {
  const planted = check(
    relative(process.cwd(), PLANTED),
    readFileSync(PLANTED, "utf8")
  ).map((one) => `${one.kind} ${one.name} reads ${one.reads.join(", ")}`);
  if (JSON.stringify(planted) !== JSON.stringify(PLANTED_HITS)) {
    console.error(
      `outro-reads:check: the planted teardown callback (${relative(process.cwd(), PLANTED)}) must be caught alone: expected ${JSON.stringify(PLANTED_HITS)}, found ${JSON.stringify(planted)}`
    );
    process.exit(1);
  }
  console.log(
    `outro-reads:check: the planted teardown callback is caught: ${planted.join("; ")}`
  );
  runSvelteCheck({
    find: check,
    said,
    failed: (count) =>
      `outro-reads:check: ${count} hit(s). An outro reads a derived of its component, which Svelte has frozen by the time an outro runs (derived_inert, svelte.dev/e/derived_inert): read what the component wrote down while it stood, a plain variable an $effect keeps, or the element. A teardown callback reads a {@const}, which Svelte runs again against the state that let its block go: the callback reads the holder's own state, or the component says what it needs while it stands (apps/dashboard/scripts/outro-reads-check.ts).`,
    passed: (files) =>
      `outro-reads:check: ${files} file(s), no outro reads a derived and no teardown callback reads a {@const}`,
  });
}
