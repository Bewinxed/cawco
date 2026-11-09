/**
 * A refusal is passed up, never dropped. A hub helper refuses by returning
 * Elysia's status (packages/hub/src/refusal.ts `refusal`), and each caller
 * returns it on (`if (x instanceof ElysiaStatus) return x`) until the route
 * answers it. A call whose answer may be a refusal, made as a statement of
 * its own (`helper(x);`, `await helper(x);`), drops it: the route goes on as
 * if the helper had said yes. A thrown refusal stopped the route by itself;
 * a returned one stops it only where it is read, so this is a finding.
 *
 * golar.config.ts runs it over the hub's source.
 */
import { defineRule } from "golar/unstable";
import {
  isExpressionStatement,
  type Node,
  type SourceFile,
  type Type,
} from "golar/unstable-tsgo";

const MESSAGE =
  "A refusal dropped: this call may answer a refusal (Elysia's status), and a statement reads none of it. Pass it up: `const x = …; if (x instanceof ElysiaStatus) return x;`.";

/** Whether `type` is Elysia's status, or a union with one among its members. */
const refuses = (type: Type | undefined): boolean => {
  if (!type) {
    return false;
  }
  // A union's or an intersection's members.
  if (type.types) {
    return type.types.some(refuses);
  }
  return (type.target ?? type).symbol?.name === "ElysiaStatus";
};

export const refusalKept = defineRule({
  name: "house/refusal-kept",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      if (
        isExpressionStatement(node) &&
        refuses(program.getTypeAtLocation(node.expression))
      ) {
        context.report({
          message: MESSAGE,
          range: { begin: node.getStart(file), end: node.end },
        });
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
