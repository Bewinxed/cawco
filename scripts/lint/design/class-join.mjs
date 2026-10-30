// house/no-class-join: a class the component was passed, joined into a class
// string by interpolation (`class="flex {className}"`, a template literal, a
// `+`) or a class array on a plain element (`class={["flex", className]}`, which
// Svelte joins with clsx) rather than merged through `cn`. Every class in a
// joined string is live and Tailwind's generated order decides between two that
// conflict, so a caller's `absolute` silently lost to a default `relative`
// (GlassGroup). `cn` (twMerge) keeps the last of a conflict, so the caller's wins.
//
// Inside `cn` the passed class stands last, so it wins; a `const` or `$derived`
// holding the class is followed to where it is read. A value handed to any other
// call is that call's to merge (a `tv` recipe's `class`), unless the call itself
// stands in a joined string or array (`class="flex {cn(a, className)}"`). This
// repo's components get an array as their `class` prop, to merge as they do
// (FieldArea's `cn`, and the rule holds their own `class` to the same).
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

const IN_THIS_REPO = /^[#$.]/u;
const PLAIN_ELEMENTS = new Set(["RegularElement", "SvelteElement"]);

/**
 * Whether Svelte's clsx, not a `cn`, joins an array in this attribute: a plain
 * element's `class`, or one handed to a component from outside this repo.
 */
function isJoinedArray(model, attribute) {
  const tag = parentOf(model, attribute);
  if (attribute.name !== "class") {
    return false;
  }
  if (PLAIN_ELEMENTS.has(tag?.type)) {
    return true;
  }
  const [first] = (tag?.name ?? "").split(".");
  const source = bindingAt(model, first, tag?.start ?? 0)?.source;
  return Boolean(source && !IN_THIS_REPO.test(source));
}

/** Each read of the name a declarator binds. */
function readsOf(model, id) {
  const binding = bindingAt(model, id.name, id.start);
  const reads = [];
  eachNode(model, (node, parent) => {
    if (
      node.type === "Identifier" &&
      node !== id &&
      node.name === id.name &&
      !(
        parent?.type === "Property" &&
        parent.key === node &&
        !parent.shorthand
      ) &&
      !(
        parent?.type === "MemberExpression" &&
        parent.property === node &&
        !parent.computed
      ) &&
      bindingAt(model, node.name, node.start) === binding
    ) {
      reads.push(node);
    }
  });
  return reads;
}

/** The helpers that join their classes without resolving a conflict. */
const JOINERS = new Set(["clsx", "cx", "classNames", "twJoin"]);

const MERGERS = new Set(["cn", "twMerge"]);

const isJoinedString = (node) =>
  node.type === "TemplateLiteral" ||
  (node.type === "BinaryExpression" && node.operator === "+") ||
  (node.type === "CallExpression" && JOINERS.has(calleeName(node)));

/** Whether a call merges `child` with a class after it, or lets it through. */
function crossCall(call, child, walk) {
  const isCn = MERGERS.has(calleeName(call));
  const misplaced =
    isCn && (walk.beforeAnother || call.arguments.at(-1) !== child);
  walk.opaque ||= !isCn;
  walk.inArray = false;
  walk.beforeAnother = false;
  return misplaced;
}

/** The join a `const` holding the class stands in, wherever it is read. */
function heldJoin(model, declarator, walk, seen) {
  seen.add(declarator);
  for (const read of readsOf(model, declarator.id)) {
    const join = joinOf(model, read, walk.inArray, seen);
    if (join) {
      return join;
    }
  }
  return null;
}

const holds = (node, child, walk, seen) =>
  node.type === "VariableDeclarator" &&
  node.init === child &&
  node.id.type === "Identifier" &&
  !walk.opaque &&
  !seen.has(node);

/**
 * The join `reference` stands in, or null: the string or array it is joined
 * into, a `cn` it stands in before another class, or either of those where a
 * `const` holding it is read.
 */
function joinOf(model, reference, inArray = false, seen = new Set()) {
  const walk = { inArray, beforeAnother: false, opaque: false };
  let child = reference;
  for (let n = parentOf(model, child); n; n = parentOf(model, n)) {
    if (isJoinedString(n)) {
      return n;
    }
    if (n.type === "Attribute") {
      return isJoinedAttribute(n) || (walk.inArray && isJoinedArray(model, n))
        ? n
        : null;
    }
    if (n.type === "CallExpression" && !isDerived(n)) {
      if (crossCall(n, child, walk)) {
        return n;
      }
    } else if (n.type === "ArrayExpression") {
      walk.inArray = true;
      walk.beforeAnother ||= n.elements.at(-1) !== child;
    } else if (holds(n, child, walk, seen)) {
      return heldJoin(model, n, walk, seen);
    }
    child = n;
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
