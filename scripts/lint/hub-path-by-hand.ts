/**
 * A hub path is the clients' to write: every TypeScript caller of the hub
 * reaches it through Eden's typed client (the dashboard's `platform/hub.ts`,
 * everything else's `packages/agent/src/hub-client.ts`, or their `~path` for
 * a link), so a hub path (`/api/…`, `/health`) built by hand in a string or
 * a template anywhere else is refused, whether it is fetched there or handed
 * on. The client's own transport hands it on as a whole URL, which this rule
 * reads from no literal.
 *
 * A path that is only compared stands: an operand of `===` or `!==`, the
 * argument of `startsWith`, `endsWith`, `includes` or `indexOf`, or a `case`
 * label (a test that reads a URL the page asked, a stand-in hub that answers
 * by path). So does one in an import or a type, and one in {@link NOT_HUB}:
 * a path on something other than the hub (OpenCode's server, neko, a
 * GitHub Enterprise host). The files below are the clients' seams and what
 * serves or proxies the hub's paths rather than asking them.
 *
 * The dashboard's `hubPath` (a route's address from Eden's path, for a send
 * Eden's client cannot make) only in the files {@link HUB_PATH_USERS} lists,
 * each with why.
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
  "packages/core/src/attachments.ts":
    "a shown file's `ref` is the stored form the hub writes (routes/files.ts) and a message keeps: data, sent by nothing here",
  "apps/dashboard/src/routes/api/[...path]/+server.ts":
    "the dashboard's `/api` proxy, which forwards every hub path as it came",
  "packages/core/src/tool-presentation.ts":
    "its code is pinned to the native app's interpreter (tools:check fails it unless ToolDescriptor.swift changes with it), and the app builds no hub path: its favicon's `GET /api/favicon` stands as written",
  "scripts/shell-bodies-check.ts":
    "reads the hub paths the shell scripts send, against the route table",
  "scripts/tool-answer-check.ts":
    "names the tool door's path to find the code that calls it",
};

/**
 * The dashboard's files that take a route's address from Eden's path
 * (platform/hub.ts `hubPath`) for what Eden's client cannot send or the
 * browser reads itself, each with why. Every other request goes through
 * Eden, read by hub-read's readers (house/eden-answers-read).
 */
const HUB_PATH_USERS: Record<string, string> = {
  "apps/dashboard/src/lib/cawco/transcript/file-upload.ts":
    "an upload that says how far it has gone: only an XHR does",
  "apps/dashboard/src/lib/cawco/views-api.ts":
    "a view's own Query arguments, which no type holds and Eden types per tool",
  "apps/dashboard/src/lib/cawco/artifact-api.ts":
    "an artifact's thumbnail, an element's src",
  "apps/dashboard/src/lib/platform/hub-file.ts":
    "a file route's address, an element's src or a link, made beside the route's own read",
  "apps/dashboard/src/routes/dev/artifact-panel/+page.svelte":
    "the stand-in recognises the requests it answers by their path",
  "apps/dashboard/src/lib/cawco/views/routines-fixture.ts":
    "the stand-in recognises the requests it answers by their path",
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

export const hubPathByHand = defineRule({
  name: "house/hub-path-by-hand",
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
        node.expression.text === "hubPath" &&
        !(path in HUB_PATH_USERS)
      ) {
        report(
          node.expression,
          "hubPath is for what Eden's client cannot send or the browser reads itself, listed in scripts/lint/hub-path-by-hand.ts HUB_PATH_USERS with why. Ask the hub through Eden (platform/hub.ts `hub`), read by hub-read's readers."
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
          "A hub path built by hand: reach the hub through its Eden client (packages/agent/src/hub-client.ts, the dashboard's platform/hub.ts), which holds what it sends to what the route takes; its `~path` is the path for a link."
        );
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
