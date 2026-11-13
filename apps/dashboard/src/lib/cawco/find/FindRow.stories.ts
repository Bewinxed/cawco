/**
 * The finder's row (Component Story Format 3, the live component) on a
 * phone, where its title wraps to three lines rather than clipping: a
 * session named by the command it was started with, a delegate's long
 * title with the moment that matched under it, and a short title for the
 * row's resting height. The meta line stands under the title's last line
 * however many it takes (find-row-wrap reads it).
 */
import {
  IconTerminal as Commit,
  IconPause as Idle,
  IconRenew as Working,
} from "#lib/icons.js";
import FindRow from "./FindRow.svelte";
import type { Row } from "./find-rows";

/** 6 November 2026, 14:20 UTC: the stories' clock. */
const NOW = Date.UTC(2026, 10, 6, 14, 20);

const row = (
  key: string,
  title: string,
  extra: Partial<Row> & Pick<Row, "glyph" | "meta" | "state">
): Row => ({
  at: NOW - 7 * 60_000,
  breathes: false,
  key,
  reason: null,
  secrets: [],
  spoken: title,
  title,
  titleParts: [{ matched: false, text: title }],
  ...extra,
});

export default {
  title: "Find/Row",
  component: FindRow,
  args: {
    id: "find-row",
    now: NOW,
    phone: true,
    peekable: true,
    onpick: () => undefined,
    row: row("conversation:9f997798", "bun run check", {
      glyph: Working,
      breathes: true,
      meta: ["obelisk", "cockpit"],
      state: { tone: "live", word: "Working" },
    }),
  },
  parameters: { viewport: 390 },
};

/** A session named by the command it was started with: three lines of title, the meta under them. */
export const LongCommand = {};

/** A delegate's long title, and the moment that matched it on a third line. */
export const LongTitleWithMoment = {
  args: {
    row: row(
      "conversation:b6292062",
      "Fix the Jump row's long title drawing over its meta line, and a seek landing on the row rather than the words",
      {
        glyph: Idle,
        meta: ["Delegate", "obelisk", "cockpit"],
        reason: {
          source: "agent",
          parts: [
            { matched: false, text: "the run ended with " },
            { matched: true, text: "flaky" },
            { matched: false, text: " on the third leg, so the probe reran" },
          ],
        },
        state: { tone: "quiet", word: "Idle" },
      }
    ),
  },
};

/** A short title: one line, the row at its resting height. */
export const ShortTitle = {
  args: {
    row: row("commit:4be1c0a", "Seek to the matched words", {
      glyph: Commit,
      meta: ["Commit", "cockpit"],
      state: { tone: "quiet", word: "Landed" },
    }),
  },
};
