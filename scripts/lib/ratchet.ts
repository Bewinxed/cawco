/**
 * A ratchet on shapes a rule refuses: what stands today may fall or move,
 * never grow. A count is held per rule, per shape (what the rule counts, read
 * off the occurrence and nothing around it: a cast's target type, a
 * directive's rule) and per file; the file part is where it stands, so a rise
 * can be named, not what a rise is measured by.
 *
 * - **A rise** is a shape a file holds more of than it did, that no other file
 *   gave up: a new occurrence. It fails and names each place.
 * - **A move or a split** is a file holding more of a shape while others hold
 *   less of it by as much: nothing rose, and the counts follow the code.
 * - **A fall** is written down here, in the run that finds it: what a fix
 *   frees is never spent again, and nobody edits the baseline.
 *
 * The baseline is one sorted file, one line a held count
 * (`rule<TAB>shape<TAB>file<TAB>count`), merged by git's union driver
 * (.gitattributes): two branches never conflict over it, a line both changed
 * reads as its larger count until the next run writes the real one down.
 *
 *   bun <check>                  exits 1 on a rise; writes the baseline when counts fell or moved
 *   bun <check> --write-baseline starts a rule the baseline does not hold yet
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** One place a rule's shape stands. */
export interface Found {
  file: string;
  line: number;
  rule: string;
  /** What the rule counts here, one line, with no tab and no path in it. */
  shape: string;
}

interface Ratchet {
  /** The baseline's path, absolute. */
  baseline: string;
  /** What the check is called in what it prints. */
  name: string;
  /** Every rule, with what it refuses. */
  rules: Record<string, string>;
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const WHITESPACE = /\s+/gu;
const SHAPE_LENGTH = 72;

/** A shape as the baseline holds it: one line, no tab, bounded. */
const shapeOf = (text: string): string =>
  text.replace(WHITESPACE, " ").trim().slice(0, SHAPE_LENGTH);

const keyOf = (rule: string, shape: string, file: string): string =>
  `${rule}\t${shape}\t${file}`;

const parts = (key: string): [string, string, string] =>
  key.split("\t") as [string, string, string];

const tally = (found: Found[]): Map<string, number> => {
  const held = new Map<string, number>();
  for (const { rule, shape, file } of found) {
    const key = keyOf(rule, shapeOf(shape), file);
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  return held;
};

/** The baseline as counts: a key twice (a union merge's two sides) reads as its larger. */
const readHeld = (path: string): Map<string, number> => {
  const held = new Map<string, number>();
  if (!existsSync(path)) {
    return held;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line && !line.startsWith("#")) {
      const at = line.lastIndexOf("\t");
      const key = line.slice(0, at);
      held.set(key, Math.max(held.get(key) ?? 0, Number(line.slice(at + 1))));
    }
  }
  return held;
};

const asFile = (counts: Map<string, number>): string =>
  [
    "# Written by the check that reads it (lib/ratchet.ts); never edited by hand.",
    ...[...counts.entries()]
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key}\t${count}`)
      .sort((a, b) => a.localeCompare(b)),
    "",
  ].join("\n");

const totalsByFile = (counts: Map<string, number>): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const [key, count] of counts) {
    const [rule, , file] = parts(key);
    totals.set(
      `${rule}\t${file}`,
      (totals.get(`${rule}\t${file}`) ?? 0) + count
    );
  }
  return totals;
};

/** What each file gave up of a shape, by rule and shape: what other files may take on. */
const gaveUpOf = (
  now: Map<string, number>,
  held: Map<string, number>
): Map<string, number> => {
  const gaveUp = new Map<string, number>();
  for (const [key, was] of held) {
    const given = was - (now.get(key) ?? 0);
    if (given > 0) {
      const [rule, shape] = parts(key);
      gaveUp.set(
        `${rule}\t${shape}`,
        (gaveUp.get(`${rule}\t${shape}`) ?? 0) + given
      );
    }
  }
  return gaveUp;
};

/** One rise's lines: what grew, and each place of that shape in that file. */
const riseLines = (
  [rule, shape, file]: [string, string, string],
  was: number,
  is: number,
  found: Found[]
): string[] => [
  `  ${rule}: ${file}: ${was} → ${is}${shape ? ` (${shape})` : ""}`,
  ...found
    .filter(
      (one) =>
        one.rule === rule && one.file === file && shapeOf(one.shape) === shape
    )
    .map((one) => `    ${one.file}:${one.line}`),
];

/**
 * Each place of a shape a file holds more of than the baseline, past what
 * other files gave up of the same shape. A file whose count for the rule did
 * not rise holds nothing new: an edit that changed a shape in place stays in
 * its file. `measured` names the rules to measure.
 */
const risesOf = (
  now: Map<string, number>,
  held: Map<string, number>,
  found: Found[],
  measured: ReadonlySet<string>
): string[] => {
  const gaveUp = gaveUpOf(now, held);
  const nowTotals = totalsByFile(now);
  const heldTotals = totalsByFile(held);
  const rises: string[] = [];
  const entries = [...now.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, is] of entries) {
    const [rule, shape, file] = parts(key);
    const fileKey = `${rule}\t${file}`;
    const grew = is - (held.get(key) ?? 0);
    const fileRose =
      (nowTotals.get(fileKey) ?? 0) > (heldTotals.get(fileKey) ?? 0);
    if (measured.has(rule) && grew > 0 && fileRose) {
      const of = `${rule}\t${shape}`;
      const carried = Math.min(grew, gaveUp.get(of) ?? 0);
      gaveUp.set(of, (gaveUp.get(of) ?? 0) - carried);
      if (grew > carried) {
        rises.push(...riseLines([rule, shape, file], is - grew, is, found));
      }
    }
  }
  return rises;
};

const heldRulesOf = (
  held: Map<string, number>,
  rules: readonly string[]
): Set<string> => {
  const inFile = new Set([...held.keys()].map((key) => parts(key)[0]));
  return new Set(rules.filter((rule) => inFile.has(rule)));
};

const totalOf = (counts: Map<string, number>, rule: string): number =>
  [...counts.entries()].reduce(
    (sum, [key, count]) => (parts(key)[0] === rule ? sum + count : sum),
    0
  );

/**
 * Holds `found` to the baseline: fails naming each rise, and writes the
 * baseline when nothing rose but counts fell or moved. A rule the baseline
 * does not hold yet is started with `--write-baseline`.
 */
export const holdRatchet = (found: Found[], ratchet: Ratchet): void => {
  const rules = Object.keys(ratchet.rules);
  const now = tally(found);
  const held = readHeld(ratchet.baseline);
  const heldRules = heldRulesOf(held, rules);
  const summary = rules
    .map((rule) => `${totalOf(now, rule)} ${rule}`)
    .join(", ");
  const starting = process.argv.includes("--write-baseline");
  const rises = risesOf(
    now,
    held,
    found,
    starting ? heldRules : new Set(rules)
  );
  if (rises.length > 0) {
    say(
      [
        `${ratchet.name}: a count rose (${summary}):`,
        ...rises,
        "What each rule refuses:",
        ...rules.map((rule) => `  ${rule}: ${ratchet.rules[rule]}`),
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }
  const text = asFile(now);
  if (
    existsSync(ratchet.baseline) &&
    readFileSync(ratchet.baseline, "utf8") === text
  ) {
    say(`${ratchet.name}: as held (${summary})`);
    return;
  }
  writeFileSync(ratchet.baseline, text);
  say(`${ratchet.name}: nothing rose; the baseline now reads (${summary})`);
};
