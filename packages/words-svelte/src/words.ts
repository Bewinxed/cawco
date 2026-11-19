/**
 * The one module that imports @pierre/words: everything this package uses
 * of it, through its public entry (`@pierre/words/html`) alone. A Words
 * release that moves something is fixed here.
 */
import type { createDomRenderer } from "@pierre/words/html";

export {
  type AnimateOptions,
  type CodeOptions,
  type Components,
  createDomRenderer,
  createHtmlRenderer,
  defaultUrlTransform,
  escapeHtml,
  type HtmlOptions,
} from "@pierre/words/html";

/** The caret Words draws at a stream's end. */
export type Caret = Parameters<
  ReturnType<typeof createDomRenderer>["update"]
>[4];
