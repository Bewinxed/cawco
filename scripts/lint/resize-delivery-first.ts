/**
 * A page's client entry reads the dashboard's frame observer before any
 * other module: reading `#lib/platform/frame-observer.js` makes the window's
 * own ResizeObserver the shared observer's (`ForeignResizeObserver`), and a
 * module read before it that makes an observer as it loads, or keeps the
 * window's constructor, gets the browser's own. That observer's callback runs
 * after the shared one's sites have written, and Chromium reports
 * "ResizeObserver loop completed with undelivered notifications" again.
 * Imports are read in the order they are written, so the entry's first
 * module it reads is that side-effect import.
 *
 * Type-only imports read nothing and are passed over. golar.config.ts runs
 * it over the client entries (the app's hooks.client.ts and the address
 * flow's lib/cawco/address/flow/main.ts); scripts/lint/fixtures/resize-delivery-late.ts holds
 * what it must report.
 */
import { defineRule } from "golar/unstable";
import {
  isExportDeclaration,
  isImportDeclaration,
  isStringLiteral,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "golar/unstable-tsgo";

const FRAME_OBSERVER = "#lib/platform/frame-observer.js";
const MESSAGE = `A page's client entry reads \`import "${FRAME_OBSERVER}";\` first, before any module that could make a ResizeObserver.`;

/** The module a statement reads as the entry loads, or null when it reads none. */
const read = (statement: Node): Node | null => {
  if (isImportDeclaration(statement)) {
    return statement.importClause?.phaseModifier === SyntaxKind.TypeKeyword
      ? null
      : statement;
  }
  if (isExportDeclaration(statement) && statement.moduleSpecifier) {
    return statement.isTypeOnly ? null : statement;
  }
  return null;
};

const isFrameObserver = (statement: Node): boolean =>
  isImportDeclaration(statement) &&
  !statement.importClause &&
  isStringLiteral(statement.moduleSpecifier) &&
  statement.moduleSpecifier.text === FRAME_OBSERVER;

export const resizeDeliveryFirst = defineRule({
  name: "house/resize-delivery-first",
  setup(context) {
    const file: SourceFile = context.sourceFile;
    const first = file.statements.map(read).find((node) => node !== null);
    if (first && isFrameObserver(first)) {
      return;
    }
    context.report({
      message: MESSAGE,
      range: first
        ? { begin: first.getStart(file), end: first.end }
        : { begin: 0, end: 0 },
    });
  },
});
