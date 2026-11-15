/**
 * A problem is passed up, never dropped. A hub helper that turns a request
 * down returns Elysia's `problem(status, { code, detail })`, and each caller
 * returns it on (`if (x instanceof ElysiaStatus) return x`) until the route
 * answers it. A call whose answer may be such a status, made as a statement
 * of its own (`helper(x);`, `await helper(x);`), drops it: the route goes on
 * as if the helper had said yes. A thrown error stopped the route by itself;
 * a returned status stops it only where it is read, so this is a finding.
 * An assignment (`this.problem = answer;`) keeps what it assigns: no finding.
 *
 * golar.config.ts runs it over the hub's source.
 */
import { defineRule } from "golar/unstable";
import {
  isBinaryExpression,
  isEqualsToken,
  isExpressionStatement,
  type Node,
  type SourceFile,
  type Type,
} from "golar/unstable-tsgo";

const MESSAGE =
  "A problem dropped: this call may answer Elysia's status (a `problem()`), and a statement reads none of it. Pass it up: `const x = …; if (x instanceof ElysiaStatus) return x;`.";

/** Whether `type` is Elysia's status, or a union with one among its members. */
const isStatus = (type: Type | undefined): boolean => {
  if (!type) {
    return false;
  }
  // A union's or an intersection's members.
  if (type.types) {
    return type.types.some(isStatus);
  }
  const name = (type.target ?? type).symbol?.name;
  return name === "ElysiaStatus" || name === "AnyProblem";
};

export const problemKept = defineRule({
  name: "house/problem-kept",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      if (
        isExpressionStatement(node) &&
        !(
          isBinaryExpression(node.expression) &&
          isEqualsToken(node.expression.operatorToken)
        ) &&
        isStatus(program.getTypeAtLocation(node.expression))
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
