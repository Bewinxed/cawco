/**
 * Every text column of a closed set the hub stores is held by
 * `storedEnum(<its set>)` (hub stored-json.ts), which checks the value on
 * every read and every write and records the set in stored/columns.json.
 * `text(...).$type<T>()` is a label only: a value outside T, written by
 * another build or by hand, reads back typed as T. So a `text(...)` column
 * whose `$type<T>` is a string literal, or a union of string literals, is a
 * finding. An open string (a branded id, a template literal, a provider's
 * word held as `string`) is no closed set: no finding.
 *
 * golar.config.ts runs it over the hub's schema; scripts/lint/fixtures/
 * closed-text-column.ts holds what it must refuse and what it must let stand.
 */
import { defineRule } from "golar/unstable";
import {
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  type Node,
  type SourceFile,
  type Type,
} from "golar/unstable-tsgo";

const MESSAGE =
  "A closed set held as `text(...).$type<T>()`, a label no read or write checks: hold it as `storedEnum(<its set>)(name)` (hub stored-json.ts), its set a const array's `z.enum(...)` or the type's generated stored shape.";

/** Whether `type` is one string literal, or a union whose every member is one. */
const closed = (type: Type | undefined): boolean => {
  if (!type) {
    return false;
  }
  if (typeof type.value === "string") {
    return true;
  }
  // An intersection (a branded string) also has members; its `string` member has no value.
  return (
    type.types !== undefined &&
    type.types.length > 0 &&
    type.types.every((member) => typeof member.value === "string")
  );
};

/** Whether the chain `$type` is called on starts at a call of `text(...)`. */
const fromText = (receiver: Node): boolean => {
  let at = receiver;
  for (;;) {
    if (isCallExpression(at)) {
      if (isIdentifier(at.expression)) {
        return at.expression.text === "text";
      }
      at = at.expression;
    } else if (isPropertyAccessExpression(at)) {
      at = at.expression;
    } else {
      return false;
    }
  }
};

export const closedTextColumn = defineRule({
  name: "house/closed-text-column",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      if (
        isCallExpression(node) &&
        isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "$type" &&
        fromText(node.expression.expression)
      ) {
        const [argument] = node.typeArguments ?? [];
        if (argument && closed(program.getTypeAtLocation(argument))) {
          context.report({
            message: MESSAGE,
            range: { begin: node.getStart(file), end: node.end },
          });
        }
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
