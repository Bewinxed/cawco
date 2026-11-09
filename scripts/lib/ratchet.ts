/**
 * A per-file ratchet: for each rule, each file's count of a shape the rule
 * refuses may fall and never rise, and a file the baseline does not name
 * holds none. The baseline is the measured count, never a chosen one. A count
 * that fell fails too, until the baseline is written down to it, so what a
 * fix frees is never spent again.
 *
 *   bun <check> --write-baseline   writes the counts, refused while any rose
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { ROOT } from "./repo-files";

/** Each rule's counts, by file: rule → file → count. */
export type Counts = Record<string, Record<string, number>>;

interface Ratchet {
  /** The baseline's path, absolute. */
  baseline: string;
  /** What the check is called in what it prints. */
  name: string;
  /** Where each counted place is, by rule and file, for a rise's report. */
  places: (rule: string, file: string) => string[];
  /** Every rule, so a rule with nothing held still reads as zero. */
  rules: Record<string, string>;
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const sorted = (counts: Counts, rules: string[]): Counts =>
  Object.fromEntries(
    rules.map((rule) => [
      rule,
      Object.fromEntries(
        Object.entries(counts[rule] ?? {})
          .filter(([, n]) => n > 0)
          .sort(([a], [b]) => a.localeCompare(b))
      ),
    ])
  );

const total = (byFile: Record<string, number> | undefined): number =>
  Object.values(byFile ?? {}).reduce((a, b) => a + b, 0);

/** Each file whose count rose or fell against `held`, with the places of each rise. */
const changes = (
  now: Counts,
  held: Counts,
  ratchet: Ratchet
): { fell: string[]; rose: string[] } => {
  const rose: string[] = [];
  const fell: string[] = [];
  for (const rule of Object.keys(ratchet.rules)) {
    const before = held[rule] ?? {};
    const after = now[rule] ?? {};
    for (const file of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      const was = before[file] ?? 0;
      const is = after[file] ?? 0;
      const line = `  ${rule}: ${file}: ${was} → ${is}`;
      if (is > was) {
        rose.push(
          line,
          ...ratchet.places(rule, file).map((place) => `    ${place}`)
        );
      } else if (is < was) {
        fell.push(line);
      }
    }
  }
  return { rose, fell };
};

/**
 * Holds `counts` to the baseline, or writes it with `--write-baseline`; sets
 * the exit code. Prints each rise with its places, and each fall.
 */
export const holdRatchet = (counts: Counts, ratchet: Ratchet): void => {
  const rules = Object.keys(ratchet.rules);
  const now = sorted(counts, rules);
  const exists = existsSync(ratchet.baseline);
  const held: Counts = exists
    ? (JSON.parse(readFileSync(ratchet.baseline, "utf8")) as Counts)
    : {};
  const { rose, fell } = changes(now, held, ratchet);
  if (process.argv.includes("--write-baseline")) {
    if (rose.length > 0 && exists) {
      say(
        `${ratchet.name}: a count rose; the baseline is only written down:\n${rose.join("\n")}`
      );
      process.exitCode = 1;
      return;
    }
    writeFileSync(ratchet.baseline, `${JSON.stringify(now, null, 2)}\n`);
    say(`${ratchet.name}: baseline written`);
    return;
  }
  const summary = rules.map((rule) => `${total(now[rule])} ${rule}`).join(", ");
  if (rose.length > 0) {
    say(
      [
        `${ratchet.name}: a count rose (${summary}):`,
        ...rose,
        "What each rule refuses:",
        ...rules.map((rule) => `  ${rule}: ${ratchet.rules[rule]}`),
      ].join("\n")
    );
    process.exitCode = 1;
  }
  if (fell.length > 0) {
    say(
      [
        `${ratchet.name}: a count fell; write the baseline down to it (bun ${relative(ROOT, process.argv[1] ?? "")} --write-baseline):`,
        ...fell,
      ].join("\n")
    );
    process.exitCode = 1;
  }
  if (rose.length === 0 && fell.length === 0) {
    say(`${ratchet.name}: as held (${summary})`);
  }
};
