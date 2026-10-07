import type { PreviewSource } from "@cawco/core";

/**
 * One string per thing a preview shows: the tool row that opened it carries
 * it (`data-preview-source`), so the pane can find that row again to close
 * into it.
 */
export const previewSourceKey = (source: PreviewSource): string => {
  if ("port" in source) {
    return `port:${source.port}`;
  }
  return "dir" in source ? `dir:${source.dir}` : `page:${source.page}`;
};

/** What a pane's header names when the page names nothing better: a folder's last part, or the decision page. */
export const previewSourceLabel = (source: PreviewSource): string => {
  if ("port" in source) {
    return "";
  }
  return "dir" in source
    ? (source.dir.split("/").filter(Boolean).at(-1) ?? "")
    : source.page;
};
