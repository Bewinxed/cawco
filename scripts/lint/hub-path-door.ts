/**
 * A hub request is built through core's door alone (packages/core/src/
 * hub-request.ts `hubRequest`), which holds what it sends to what its route
 * takes; so a hub path (`/api/…`, `/health`) written in a string or a
 * template anywhere else is refused, whether it is fetched there or handed
 * on. The door names a route as the hub declares it
 * (`"PUT /api/accounts/routing/:provider"`), which starts with its method
 * and is no path, and answers the path it built (`.path`) for a link, an
 * image or a beacon.
 *
 * A path that is only compared stands: an operand of `===` or `!==`, the
 * argument of `startsWith`, `endsWith`, `includes` or `indexOf`, or a `case`
 * label (a test that reads a URL the page asked, a stand-in hub that answers
 * by path). So does one in an import or a type, and one in {@link NOT_HUB}:
 * a path on something other than the hub (OpenCode's server, neko, a
 * GitHub Enterprise host). The files below are the door and what serves or
 * proxies the hub's paths rather than asking them.
 *
 * `hubRequestAsGiven` sends a body as given, never held to its route: only
 * the callers {@link AS_GIVEN} lists may, each with why.
 *
 * golar.config.ts runs it over the dashboard's source, every script, and
 * the agent's, the CLI's and core's source; scripts/lint/fixtures/
 * hub-path.ts holds what it must refuse and what it must let stand.
 */
import { defineRule } from "golar/unstable";
import {
  isBinaryExpression,
  isCallExpression,
  isCaseClause,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isNoSubstitutionTemplateLiteral,
  isPropertyAccessExpression,
  isStringLiteral,
  isTemplateExpression,
  isTemplateHead,
  isTemplateMiddle,
  isTemplateTail,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "golar/unstable-tsgo";
import { NOT_HUB } from "../../packages/hub/scripts/not-hub.ts";

/** Where a hub path starts: a piece's start, after an origin (`http://host`) or not. */
const HUB_PATH = /^(?:[a-z][a-z+.-]*:\/\/[^/\s]*)?\/(?:api|health)(?=[/?#]|$)/u;
/** An origin before a path (`http://host:port`). */
const ORIGIN = /^[a-z][a-z+.-]*:\/\/[^/\s]*/u;
/** A file's name up to the repository's own path (`apps/…`, `packages/…`, `scripts/…`). */
const TO_REPOSITORY = /^.*?(?=(?:apps|packages|scripts)\/)/u;
/** What a pattern's text escapes to stand for itself in a regex. */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

/** Files that write hub paths of necessity, each with why. */
const OWN: Record<string, string> = {
  "packages/core/src/hub-request.ts": "the door itself",
  "packages/core/src/hub-routes.gen.ts":
    "the route table's types, generated, keyed by each route's path",
  "apps/dashboard/src/routes/api/[...path]/+server.ts":
    "the dashboard's `/api` proxy, which forwards every hub path as it came",
  "packages/core/src/tool-presentation.ts":
    "its code is pinned to the native app's interpreter (tools:check fails it unless ToolDescriptor.swift changes with it), and the app builds no hub path: its favicon's `GET /api/favicon` stands as written",
  "scripts/shell-bodies-check.ts":
    "reads the hub paths the shell scripts send, against the route table",
  "scripts/tool-answer-check.ts":
    "names the tool door's path to find the code that calls it",
};

/** The files that may send a body as given (`hubRequestAsGiven`), each with why. */
const AS_GIVEN: Record<string, string> = {
  "packages/core/src/hub-request.fixtures.ts": "the door's own proof",
};

/** The calls that only read a string they are given. */
const READS = new Set(["startsWith", "endsWith", "includes", "indexOf"]);

/** Whether `pattern` (NOT_HUB's, `*` a piece and a trailing `/**` any rest) covers `text`. */
const covers = (pattern: string, text: string): boolean => {
  const rest = pattern.endsWith("/**");
  const head = (rest ? pattern.slice(0, -3) : pattern)
    .split("*")
    .map((part) => part.replace(REGEX_SPECIAL, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${head}${rest ? "(?:/.*)?" : ""}$`, "u").test(
    text.split("?")[0] ?? ""
  );
};

/** The literal (a string or a whole template) a piece stands in. */
const literalOf = (piece: Node): Node => {
  let at = piece;
  while (
    (isTemplateHead(at) || isTemplateMiddle(at) || isTemplateTail(at)) &&
    at.parent
  ) {
    at = at.parent;
    if (isTemplateExpression(at)) {
      return at;
    }
  }
  return at;
};

/** Whether the literal is only compared, imported or a type. */
const onlyRead = (literal: Node): boolean => {
  const { parent } = literal;
  if (!parent) {
    return false;
  }
  if (isBinaryExpression(parent)) {
    const { kind } = parent.operatorToken;
    return (
      kind === SyntaxKind.EqualsEqualsEqualsToken ||
      kind === SyntaxKind.ExclamationEqualsEqualsToken ||
      kind === SyntaxKind.EqualsEqualsToken ||
      kind === SyntaxKind.ExclamationEqualsToken
    );
  }
  if (isCaseClause(parent)) {
    return parent.expression === literal;
  }
  if (
    isCallExpression(parent) &&
    isPropertyAccessExpression(parent.expression)
  ) {
    return READS.has(parent.expression.name.text);
  }
  return (
    isImportDeclaration(parent) ||
    isExportDeclaration(parent) ||
    isLiteralTypeNode(parent) ||
    isImportTypeNode(parent)
  );
};

export const hubPathDoor = defineRule({
  name: "house/hub-path-door",
  setup(context) {
    const file: SourceFile = context.sourceFile;
    const path = file.fileName.replace(TO_REPOSITORY, "");
    if (path in OWN) {
      return;
    }
    const report = (node: Node, message: string) =>
      context.report({
        message,
        range: { begin: node.getStart(file), end: node.end },
      });
    const visit = (node: Node): void => {
      if (
        isCallExpression(node) &&
        isIdentifier(node.expression) &&
        node.expression.text === "hubRequestAsGiven" &&
        !(path in AS_GIVEN)
      ) {
        report(
          node.expression,
          "hubRequestAsGiven sends a body its route may not take: only for a body the hub's own check holds, listed in scripts/lint/hub-path-door.ts AS_GIVEN with why. Build the request with hubRequest, which holds it to its route."
        );
      }
      const text =
        isStringLiteral(node) ||
        isNoSubstitutionTemplateLiteral(node) ||
        isTemplateHead(node) ||
        isTemplateMiddle(node) ||
        isTemplateTail(node)
          ? node.text
          : null;
      if (
        text !== null &&
        HUB_PATH.test(text) &&
        !onlyRead(literalOf(node)) &&
        !NOT_HUB.some(
          (one) =>
            one.file === path && covers(one.pattern, text.replace(ORIGIN, ""))
        )
      ) {
        report(
          node,
          "A hub path built outside the door: build the request with core hubRequest(route, sent) (packages/core/src/hub-request.ts), which holds what it sends to what the route takes; its `.path` is the path for a link."
        );
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
