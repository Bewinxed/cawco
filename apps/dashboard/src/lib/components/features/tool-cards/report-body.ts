/**
 * The delegate-report body's collapse decision and log detection, pure so a
 * test can exercise the threshold exactly (the 2026-08-16 "1500 lines fills the
 * transcript" report). A report collapses by default once it passes either a
 * line or a byte threshold, showing a few lines behind a "show all" expander.
 */

/** Lines shown before the expander; the rest collapses behind "show all". */
export const REPORT_PREVIEW_LINES = 15;

/** Byte threshold above which a report collapses even under `REPORT_PREVIEW_LINES`. */
export const REPORT_PREVIEW_BYTES = 1500;

// A raw log dump, not prose: `key=value` runs, timestamps and command echoes
// fold into an unreadable wall as markdown, so a log-shaped body goes to a
// mono `<pre>` instead. Majority-of-lines log shapes, and no markdown tokens.
const MARKDOWN_SIGNAL =
  /(^|\n)\s{0,3}#{1,6}\s|```|\*\*|__|\[[^\]]+\]\([^)]*\)|(^|\n)\s*[-*+]\s+/u;
const LOG_LINE =
  /^\S+=\S+(\s+\S+=\S+)*$|^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|^\d{2}:\d{2}:\d{2}|^[[(]\d{4}-\d{2}-\d{2}|^[$>→]\s|^\[?(INFO|WARN|WARNING|ERROR|DEBUG|FATAL)\]?\b/iu;

/** Whether a report body reads as raw log output rather than markdown prose. */
export function isLogReport(text: string): boolean {
  if (!text || MARKDOWN_SIGNAL.test(text)) {
    return false;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  const logLines = lines.filter((line) => LOG_LINE.test(line));
  return logLines.length >= lines.length * 0.6;
}

/** The number of lines a body carries, for the expander's "show all — N lines". */
export function reportLineCount(text: string): number {
  return text.split("\n").length;
}

/** Whether a body is long enough to collapse by default. */
export function reportCollapses(
  text: string,
  lines = REPORT_PREVIEW_LINES,
  bytes = REPORT_PREVIEW_BYTES
): boolean {
  return reportLineCount(text) > lines || text.length > bytes;
}

/** The collapsed preview: the first lines, byte-capped so one giant line stays short. */
export function reportPreview(
  text: string,
  lines = REPORT_PREVIEW_LINES,
  bytes = REPORT_PREVIEW_BYTES
): string {
  const head = text.split("\n").slice(0, lines).join("\n");
  return head.length > bytes ? `${head.slice(0, bytes)}…` : head;
}
