/**
 * A session's title is derived from its first message in time linear in the
 * message (core title.ts `deriveTitleFromFirstMessage`), and cuts the same
 * attached tail it always has.
 *
 * 2026-11-04, the hub's loop tracer: the attached tail's pattern,
 * `/\s*Attached (?:…)[\s\S]*$/u`, backtracked quadratically over a long run
 * of whitespace with no match after it: 100k spaces held the hub 2.2 s as an
 * 8-bit string and 3.8 s as a 16-bit one, on a session's first message.
 *
 * No fleet:
 * (a) 100k spaces, as an 8-bit and as a 16-bit string, each with and
 *     without an attached line after them, derive in under {@link BOUND_MS} ms.
 * (b) Today's cases derive as before: typed words with a file's and a
 *     picture's lines after them, folded onto one line or not, an
 *     `Attached` that is not an attachment line, and command echoes,
 *     closed and not.
 * (c) {@link UNCLOSED} `<command-message>` tags none of which closes derive
 *     in under {@link BOUND_MS} ms: the command echo's pattern,
 *     `/<command-…>([\s\S]*?)<\/command-…>/u`, scanned to the end from
 *     each one.
 *
 * Main fails (a) and (c).
 *
 *   bun scripts/probe-kit/run.ts title-long-whitespace
 */
import { deriveTitleFromFirstMessage } from "../../../packages/core/src/title";
import type { Kit, Spec } from "../spec";

/** The longest a derivation of the 100k-space messages may take: a linear pass is well under a millisecond. */
const BOUND_MS = 50;
/** The run of whitespace the tracer timed. */
const RUN = " ".repeat(100_000);

/** How many unclosed command tags (c) times. */
const UNCLOSED = 20_000;

/** Each long message, by what it is, and the title it derives. */
const LONG: [string, string, string][] = [
  ["8-bit, no attachment", `words${RUN}`, "words"],
  ["16-bit, no attachment", `wörds€${RUN}`, "wörds€"],
  ["8-bit, then a file", `words${RUN}Attached file: /a.txt`, "words"],
  [
    "16-bit, then a picture",
    `wörds€${RUN}\nAttached picture: picture-0a.png`,
    "wörds€",
  ],
  [
    "16-bit, almost an attachment",
    `€${RUN}Attached file: x`,
    "€ Attached file: x",
  ],
];

/** Today's cases and the titles they derive on main. */
const SAME: [string, string][] = [
  ["Fix the tray", "Fix the tray"],
  ["Fix the tray\n\nAttached file: ~/a.png", "Fix the tray"],
  [
    "Fix the tray Attached file: /tmp/a.ts Attached picture: picture-3f.png",
    "Fix the tray",
  ],
  ["Look\nAttached picture: picture-ab12.png\nmore", "Look"],
  ["Attached file: /a", ""],
  ["Attached is the plan", "Attached is the plan"],
  ["see Attached file: rel/path", "see Attached file: rel/path"],
  ["<b>bold</b>\tand\n\nspaced", "bold and spaced"],
  [
    "<command-message>review</command-message>\n<command-name>/review</command-name>",
    "review",
  ],
  ["<command-name>/plan</command-name> then", "/plan"],
  ["<command-message>a</command-name><command-name>b</command-name>", "a"],
  ["<command-message>open only, never closed", "open only, never closed"],
  ["<command-message>  </command-message>rest", ""],
];

const spec: Spec = {
  group: "The hub and machines",
  name: "title-long-whitespace",
  // Nothing here waits: the derivation is the one synchronous call it times.
  run: (kit: Kit) => {
    const { check } = kit;
    const timed = LONG.map(([what, raw, want]) => {
      const from = performance.now();
      const got = deriveTitleFromFirstMessage(raw);
      return {
        what,
        ms: Math.round(performance.now() - from),
        ok: got === want,
        got,
      };
    });
    check(
      `a: 100k spaces, 8-bit and 16-bit, with and without an attached line after them, each derive in under ${BOUND_MS} ms and cut as before`,
      timed.every((one) => one.ok && one.ms < BOUND_MS),
      JSON.stringify(timed)
    );
    const wrong = SAME.map(([raw, want]) => ({
      raw,
      want,
      got: deriveTitleFromFirstMessage(raw),
    })).filter((one) => one.got !== one.want);
    check(
      `b: today's ${SAME.length} cases derive the titles they did`,
      wrong.length === 0,
      JSON.stringify(wrong)
    );
    const unclosed = "<command-message>x ".repeat(UNCLOSED);
    const from = performance.now();
    const got = deriveTitleFromFirstMessage(unclosed);
    const ms = Math.round(performance.now() - from);
    check(
      `c: ${UNCLOSED} unclosed <command-message> tags derive in under ${BOUND_MS} ms, their words as the title`,
      ms < BOUND_MS && got === "x ".repeat(40),
      `${ms} ms: ${JSON.stringify(got)}`
    );
    return Promise.resolve();
  },
};

export default spec;
