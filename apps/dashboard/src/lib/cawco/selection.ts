/**
 * The two decisions behind the transcript's selection bar, kept pure so they can
 * be asserted without a DOM: what a selected passage becomes in the composer,
 * and where the bar sits over the selection that summoned it.
 */

/**
 * How much of a passage is a quote. Past this it is a paste — the agent can
 * read the file itself, and a composer holding a screenful of `>` is not a
 * question. The cut is said out loud with an ellipsis: a quote that silently
 * loses its second half is a quote the agent answers wrongly.
 */
const QUOTE_MAX = 2000;

/**
 * The passage as a markdown quote, on the end of whatever was already typed.
 *
 * Never a replacement: a half-written message is the reader's, so the quote
 * follows it after a blank line and leaves another blank line under itself,
 * which is where the reply gets written.
 */
export function quoteBlock(text: string, existingDraft: string): string {
  const quoted = capped(text.replace(/\r\n?/g, "\n").trim())
    .split("\n")
    // A bare `>` rather than `"> "`: an empty quoted line is trailing whitespace.
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  const head = existingDraft.trimEnd();
  return head ? `${head}\n\n${quoted}\n\n` : `${quoted}\n\n`;
}

/** The last whitespace in a run — greedy, so it finds the latest boundary. */
const LAST_WHITESPACE = /^[\s\S]*\s/;

/** Cut at the last word boundary that fits, and say that it was cut. */
function capped(text: string): string {
  if (text.length <= QUOTE_MAX) {
    return text;
  }
  const head = text.slice(0, QUOTE_MAX);
  // Greedy up to the last whitespace in the run; a single unbroken token that
  // long has no boundary to cut at and takes the hard cut.
  const boundary = LAST_WHITESPACE.exec(head);
  return `${(boundary ? boundary[0] : head).trimEnd()}…`;
}

/** What `getBoundingClientRect` gives, as much of it as placement needs. */
export interface Rect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface Size {
  height: number;
  width: number;
}

export interface Placement {
  side: "above" | "below";
  x: number;
  y: number;
}

/** Clear of the selection, and clear of the pane's own edges. */
const GAP = 8;
const GUTTER = 8;

/** A selection starting this close to the top of the window has the app header
 *  above it, so the bar goes under the passage instead. */
const TOP_SAFE = 48;

/**
 * Where the bar sits: centred on the selection, above it unless there is no
 * room up there, and never outside the pane it belongs to.
 */
export function barPlacement(
  selection: Rect,
  pane: Rect,
  bar: Size,
  prefer: "above" | "below" = "above"
): Placement {
  const side =
    prefer === "below" || selection.top < TOP_SAFE ? "below" : "above";
  const y =
    side === "below"
      ? selection.bottom + GAP
      : selection.top - bar.height - GAP;
  const x = selection.left + selection.width / 2 - bar.width / 2;
  return {
    x: clamp(x, pane.left + GUTTER, pane.right - GUTTER - bar.width),
    y: clamp(y, pane.top + GUTTER, pane.bottom - GUTTER - bar.height),
    side,
  };
}

/** The low bound wins where the pane is smaller than what it has to hold. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}
