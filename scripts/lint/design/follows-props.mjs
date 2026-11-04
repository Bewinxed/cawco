// house/follows-props: a component a states file draws follows its props
// while mounted: one with a states file beside it (`<Name>.stories.ts`), or
// one a states file names as its `component` (a fixture: Roster.stories.ts
// draws preview/RosterFixture.svelte, which copied its routes and its open
// column once, so five of the roster's ten states drew the first). The design graph's
// stage sets a pressed state's args on the one live instance (Stage.svelte
// `reach`); a `$state(…)` seeded from a prop as the component opens
// (RoutineForm's draft, before 3b6eb7bec) reads that prop once, so a state
// set in place reaches nothing. Svelte's own primitive for a value that
// follows its prop and may be overridden while it is edited is a writable
// `$derived` ("you can temporarily override their values by reassigning
// them", svelte.dev/docs/svelte/$derived), or `$bindable` where the parent
// reads it back.
import fs from "node:fs";
import path from "node:path";
import { patternNamesOf, walkNodes } from "./model.mjs";

const STATE = new Set(["$state", "$state.raw"]);
const SVELTE_FILE = /\.svelte$/u;
const STATES_FILE = /\.stories\.ts$/u;
const SKIPPED = new Set(["node_modules", ".git", ".svelte-kit", "build"]);
/** `import Name from "./x.svelte"`, and `component: Name`. */
const SVELTE_IMPORT =
  /import\s+(\w+)\s+from\s+["'](\.{1,2}\/[^"']+\.svelte)["']/gu;
const COMPONENT = /\bcomponent:\s*(\w+)/gu;

/** Every svelte file a states file under `root` names as its `component`, by absolute path; read once. */
let drawn = null;
function drawnByStates(root) {
  if (drawn) {
    return drawn;
  }
  drawn = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) {
        continue;
      }
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(at);
      } else if (STATES_FILE.test(entry.name)) {
        const text = fs.readFileSync(at, "utf8");
        const named = new Set([...text.matchAll(COMPONENT)].map((m) => m[1]));
        for (const [, name, from] of text.matchAll(SVELTE_IMPORT)) {
          if (named.has(name)) {
            drawn.add(path.resolve(path.dirname(at), from));
          }
        }
      }
    }
  };
  for (const top of ["apps", "packages", "scripts"]) {
    const dir = path.join(root, top);
    if (fs.existsSync(dir)) {
      walk(dir);
    }
  }
  return drawn;
}

/** Whether a states file draws this component: beside it, or naming it. */
const drawnByAStatesFile = (file) =>
  fs.existsSync(file.replace(SVELTE_FILE, ".stories.ts")) ||
  drawnByStates(process.cwd()).has(path.resolve(file));

/** The rune a call names: `$state`, `$state.raw`, `$props`, or null. */
function runeOf(call) {
  const callee = call?.type === "CallExpression" ? call.callee : null;
  if (callee?.type === "Identifier") {
    return callee.name;
  }
  if (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier"
  ) {
    return `${callee.object.name}.${callee.property.name}`;
  }
  return null;
}

/** Whether `node` reads any of `names` (a reference, not a property's name). */
function reads(node, names) {
  let found = false;
  walkNodes(node, (child, parent, key) => {
    if (found || child.type !== "Identifier" || !names.has(child.name)) {
      return;
    }
    const named =
      (parent?.type === "MemberExpression" &&
        key === "property" &&
        !parent.computed) ||
      (parent?.type === "Property" &&
        key === "key" &&
        !parent.computed &&
        !parent.shorthand);
    found = !named;
  });
  return found;
}

export function followsProps(model) {
  if (model.kind !== "svelte" || !drawnByAStatesFile(model.file)) {
    return [];
  }
  const body = model.ast.instance?.content?.body ?? [];
  const declarators = body
    .filter((statement) => statement.type === "VariableDeclaration")
    .flatMap((statement) => statement.declarations);
  const props = new Set(
    declarators
      .filter((d) => runeOf(d.init) === "$props")
      .flatMap((d) => patternNamesOf(d.id).map((id) => id.name))
  );
  if (props.size === 0) {
    return [];
  }
  return declarators
    .filter((d) => STATE.has(runeOf(d.init)) && reads(d.init, props))
    .map((d) => ({
      start: d.init.start,
      end: d.init.end,
      message:
        "A states file draws this component: it follows its props while mounted, and a `$state` seeded from a prop reads it once. Make it a writable `$derived` of the prop (or `$bindable` where the parent reads it back), so a state set in place on the live instance is the state it shows.",
    }));
}
