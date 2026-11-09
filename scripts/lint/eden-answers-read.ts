/**
 * Every request the dashboard sends through Eden's client (`hub.api…`,
 * `hubThrough(fetch).api…`, a seam's `client.api…`, ending in its verb:
 * `.get()`, `.post(…)`) is read where it is made, by one of hub-read.ts's
 * readers: `hubData`, `hubDone`, `hubAsk`, `hubRead` or `hubReached`, as
 * their first argument (through a `?:` or parentheses). So no caller holds
 * Eden's answer itself: none returns a refusal as data, reads a body that
 * was never held to be JSON, or hands a refusal with no answer beside it to
 * a reader that needs one.
 *
 * golar.config.ts runs it over the dashboard's source; scripts/lint/
 * fixtures/eden-answers.ts holds what it must refuse and what it must let
 * stand.
 */
import { defineRule } from "golar/unstable";
import {
  isCallExpression,
  isConditionalExpression,
  isElementAccessExpression,
  isIdentifier,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  type Node,
  type SourceFile,
} from "golar/unstable-tsgo";

/** Eden's verbs: the call that sends a request. */
const VERBS = new Set(["get", "post", "put", "patch", "delete", "head"]);

/** hub-read.ts's readers of an Eden call. */
const READERS = new Set([
  "hubData",
  "hubDone",
  "hubAsk",
  "hubRead",
  "hubReached",
]);

const MESSAGE =
  "An Eden request read outside hub-read's readers: hand the call itself to hubData, hubDone, hubAsk, hubRead or hubReached (apps/dashboard/src/lib/platform/hub-read.ts), so its refusal and its body are read by one rule.";

/** Whether `call` sends a request through Eden: its verb on a chain that passes through `.api`. */
const sendsThroughEden = (call: Node): boolean => {
  if (!(
    isCallExpression(call) &&
    isPropertyAccessExpression(call.expression) &&
    VERBS.has(call.expression.name.text)
  )) {
    return false;
  }
  let at: Node = call.expression.expression;
  for (;;) {
    if (isPropertyAccessExpression(at)) {
      if (at.name.text === "api") {
        return true;
      }
      at = at.expression;
    } else if (isCallExpression(at) || isElementAccessExpression(at)) {
      at = at.expression;
    } else {
      return false;
    }
  }
};

/** Whether `call` is a reader's first argument, through `?:` and parentheses. */
const read = (call: Node): boolean => {
  let at = call;
  const passes = (around: Node): boolean =>
    isParenthesizedExpression(around) ||
    (isConditionalExpression(around) && around.condition !== at);
  while (passes(at.parent)) {
    at = at.parent;
  }
  const { parent } = at;
  return (
    isCallExpression(parent) &&
    isIdentifier(parent.expression) &&
    READERS.has(parent.expression.text) &&
    parent.arguments[0] === at
  );
};

export const edenAnswersRead = defineRule({
  name: "house/eden-answers-read",
  setup(context) {
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      if (sendsThroughEden(node) && !read(node)) {
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
