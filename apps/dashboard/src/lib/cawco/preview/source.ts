import type { PreviewSource } from "@cawco/core";
import { pathLeaf } from "@cawco/core/tool-presentation";

/**
 * What a `show_preview` call asked for: a dev server, a folder, or a
 * decision page by name (published from `dir` when the call gave one).
 */
export type PreviewAsk =
  | { port: number }
  | { dir: string }
  | { page: string; dir?: string };

/** What opening a call's preview again asks the hub for: a decision page is shown, never published again. */
export const reopenAsk = (ask: PreviewAsk): PreviewAsk =>
  "page" in ask ? { page: ask.page } : ask;

/**
 * One string per thing a preview shows: the tool row that opened it carries
 * it (`data-preview-source`), so the pane can find that row again to close
 * into it.
 */
export const previewSourceKey = (
  source: PreviewSource | PreviewAsk
): string => {
  if ("page" in source) {
    return `page:${source.page}`;
  }
  return "port" in source ? `port:${source.port}` : `dir:${source.dir}`;
};

/** A short name for where a preview's page is, for its header and tool row. */
export const previewPlace = (source: PreviewSource | PreviewAsk): string => {
  if ("page" in source) {
    return `decisions/${source.page}`;
  }
  return "dir" in source ? pathLeaf(source.dir) : "";
};
