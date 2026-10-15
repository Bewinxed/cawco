/**
 * What a build's CLI step said when it failed, as one sentence: what the
 * update records when a step it runs from a build (`cawco binary-pins`,
 * `cawco binary-units`) exits non-zero.
 *
 * A step that fails the way it means to says one sentence on stderr, last,
 * after anything the installers it ran printed there: that last line. One
 * that dies of an uncaught error leaves Bun's report instead, whose last line
 * is Bun's footer (`Bun v1.4.2 (Linux x64)`), never the error. The report is
 * the source excerpt (`N | code` lines and a caret line), then the error's own
 * line (`error: <message>` for a thrown Error or value, `<Name>: <message>`
 * for a TypeError or a system error such as `ENOENT: no such file or
 * directory, lstat '…'`), then its properties and stack, then the footer:
 * the error's line is the one answered, without Bun's `error: ` label.
 * Nightly 2ebcc2a04 recorded a binary-pins crash as "Bun v1.4.2 (Linux x64)".
 */
const BUN_FOOTER = /^Bun v\d+\.\d+\.\d+\S* \(.+\)$/;
/** A line of Bun's source excerpt: `12 | code`, or the caret under it. */
const EXCERPT = /^\s*\d+ \| |^\s*\^\s*$/;
/** An error's own line when no excerpt came before it. */
const ERROR_LINE = /^error: |^[A-Za-z]*(Error|Exception)\b|^E[A-Z]+: /;
/** Bun's label on a thrown Error's or value's line. */
const BUN_LABEL = /^error: /;

/** The sentence a failed CLI step's stderr says; undefined when it said nothing. */
export const failureSentence = (stderr: string): string | undefined => {
  const lines = stderr
    .split("\n")
    .map((each) => each.trimEnd())
    .filter((each) => each.trim() !== "");
  const last = lines.at(-1)?.trim();
  if (last === undefined || !BUN_FOOTER.test(last)) {
    return last;
  }
  const report = lines.slice(0, -1);
  const excerptEnd = report.findLastIndex((each) => EXCERPT.test(each));
  const said =
    excerptEnd === -1
      ? (report.find((each) => ERROR_LINE.test(each.trim())) ?? report[0])
      : report[excerptEnd + 1];
  return said?.trim().replace(BUN_LABEL, "") ?? last;
};
