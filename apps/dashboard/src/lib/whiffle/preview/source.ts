import type { PreviewSource } from "@whiffle/core";

/**
 * One string per thing a preview shows: the tool row that opened it carries
 * it (`data-preview-source`), so the pane can find that row again to close
 * into it.
 */
export const previewSourceKey = (source: PreviewSource): string =>
  "port" in source ? `port:${source.port}` : `dir:${source.dir}`;
