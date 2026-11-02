// house/follows-props: a component with a states file beside it
// (`<Name>.stories.ts`) follows its props while mounted. The design graph's
// stage sets a pressed state's args on the one live instance (Stage.svelte
// `reach`); a `$state(…)` seeded from a prop as the component opens
// (RoutineForm's draft, before 3b6eb7bec) reads that prop once, so a state
// set in place reaches nothing. Svelte's own primitive for a value that
// follows its prop and may be overridden while it is edited is a writable
// `$derived` ("you can temporarily override their values by reassigning
// them", svelte.dev/docs/svelte/$derived), or `$bindable` where the parent
// reads it back.
import fs from "node:fs";
import { patternNamesOf, walkNodes } from "./model.mjs";

const STATE = new Set(["$state", "$state.raw"]);
const SVELTE_FILE = /\.svelte$/u;

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
  if (
    model.kind !== "svelte" ||
    !fs.existsSync(model.file.replace(SVELTE_FILE, ".stories.ts"))
  ) {
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
        "This component has a states file: it follows its props while mounted, and a `$state` seeded from a prop reads it once. Make it a writable `$derived` of the prop (or `$bindable` where the parent reads it back), so a state set in place on the live instance is the state it shows.",
    }));
}
