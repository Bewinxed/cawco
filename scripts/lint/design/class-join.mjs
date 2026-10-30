// house/no-class-join: a class the component was passed, joined into a class
// string by interpolation (`class="flex {className}"`, a template literal, a
// `+`) rather than merged through `cn`. Every class in a joined string is live
// and Tailwind's generated order decides between two that conflict, so a
// caller's `absolute` silently lost to a default `relative` (GlassGroup). `cn`
// (twMerge) keeps the last of a conflict, so the caller's wins.
//
// A value handed to any call but the `$derived` runes is that call's to merge
// (`cn`, a `tv` recipe's `class`), unless the call itself stands in a joined
// class attribute (`class="flex {cn(a, className)}"`).
import { calleeName, keyOf, unwrap } from "./classes.mjs";
import { bindingAt, eachNode, parentOf } from "./model.mjs";

const CLASS_NAME = /class/iu;

const isProps = (declarator) =>
  calleeName(unwrap(declarator?.init) ?? {}) === "$props";

/** Whether `name`, here, is a `class`-named prop read out of `$props()`. */
function isClassProp(model, identifier) {
  const d = bindingAt(model, identifier.name, identifier.start)?.declarator;
  return (
    isProps(d) &&
    d.id.type === "ObjectPattern" &&
    d.id.properties.some((p) => {
      if (p.type === "RestElement") {
        return false;
      }
      const value =
        p.value?.type === "AssignmentPattern" ? p.value.left : p.value;
      return value?.name === identifier.name && CLASS_NAME.test(keyOf(p));
    })
  );
}

/** Whether a member reads a `class`-named prop off `$props()` or its rest. */
function isClassMember(model, member) {
  const object = unwrap(member.object);
  if (
    member.computed ||
    object?.type !== "Identifier" ||
    !CLASS_NAME.test(member.property.name)
  ) {
    return false;
  }
  const d = bindingAt(model, object.name, object.start)?.declarator;
  return (
    isProps(d) &&
    (d.id.type === "Identifier" ||
      d.id.properties.some(
        (p) => p.type === "RestElement" && p.argument.name === object.name
      ))
  );
}

/** Whether a call hands its result on as it is: `$derived(…)`, `$derived.by(…)`. */
function isDerived(call) {
  const { callee } = call;
  return (
    calleeName(call) === "$derived" ||
    (callee?.type === "MemberExpression" && callee.object.name === "$derived")
  );
}

/** Whether a class attribute's value is several parts: text and expressions. */
const isJoinedAttribute = (node) =>
  node.type === "Attribute" &&
  CLASS_NAME.test(node.name) &&
  Array.isArray(node.value) &&
  node.value.length > 1;

/** The string `reference` is joined into, or null. */
function joinOf(model, reference) {
  let merged = false;
  for (let n = parentOf(model, reference); n; n = parentOf(model, n)) {
    if (n.type === "CallExpression" && !isDerived(n)) {
      merged = true;
    } else if (
      !merged &&
      (n.type === "TemplateLiteral" ||
        (n.type === "BinaryExpression" && n.operator === "+"))
    ) {
      return n;
    } else if (n.type === "Attribute") {
      return isJoinedAttribute(n) ? n : null;
    }
  }
  return null;
}

/** Each class string a passed class is joined into. */
export function classJoins(model) {
  if (model.kind !== "svelte") {
    return [];
  }
  const joins = new Set();
  eachNode(model, (node) => {
    const passed =
      (node.type === "Identifier" && isClassProp(model, node)) ||
      (node.type === "MemberExpression" && isClassMember(model, node));
    const join = passed ? joinOf(model, node) : null;
    if (join) {
      joins.add(join);
    }
  });
  return [...joins].map((join) => ({
    start: join.start,
    end: join.end,
    message:
      'A passed class joined into a class string loses to any default Tailwind sorts after it. Merge a passed class through cn, last: class={cn("…", className)}.',
  }));
}
