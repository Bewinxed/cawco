/**
 * What a repeating task says, read from its runs: its answer now as one
 * word, one sentence of what its newest finished run found or delivered,
 * and whether that needs the person. It needs him when CawCo stopped it or
 * its newest finished run failed or couldn't check; nothing else carries a
 * mark. A run going now leaves the last answer standing until it lands.
 */
import type { CardAnswer } from "../tasks/card-answer";
import type {
  EndRule,
  FactAnswer,
  Repeat,
  Run,
  RunOutcome,
} from "./repeating-data";

export interface RepeatReading {
  /** Yes, No, Not yet, Not known; Done, Didn't deliver; Paused. */
  answer: string;
  /** The words a press of Fix with Caw puts in Caw's composer; null when nothing needs fixing. */
  fixPrompt: string | null;
  /** A run is going now. */
  live: boolean;
  needsYou: boolean;
  sentence: string;
}

const FACT_FROM_RUN: Partial<Record<RunOutcome, FactAnswer | "unknown">> = {
  "could-not-check": "unknown",
  failed: "unknown",
  met: "yes",
  "not-yet": "no",
};

const upper = (text: string) =>
  text ? `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}` : text;
const lower = (text: string) =>
  text ? `${text[0]?.toLowerCase() ?? ""}${text.slice(1)}` : text;

function factWord(repeat: Repeat, run: Run): string {
  const found = run.answer ?? FACT_FROM_RUN[run.outcome] ?? "unknown";
  switch (found) {
    case "yes":
      return "Yes";
    case "no":
      // A fact it repeats until true is not true yet; any other is simply not true.
      return repeat.end === "until-true" ? "Not yet" : "No";
    case "unknown":
      return "Not known";
  }
}

export const failedRun = (run: Run) =>
  run.outcome === "failed" || run.outcome === "could-not-check";

export function readRepeat(title: string, repeat: Repeat): RepeatReading {
  const live = repeat.runs[0]?.outcome === "running";
  const latest = repeat.runs.find((run) => run.outcome !== "running");
  if (!latest) {
    return {
      answer: repeat.kind === "fact" ? "Not known" : "Not yet",
      fixPrompt: null,
      live,
      needsYou: false,
      sentence: live ? "Its first run is going now." : "It hasn't run yet.",
    };
  }
  const failed = failedRun(latest);
  const needsYou = repeat.state === "stopped" || failed;
  if (repeat.state === "paused" && !needsYou) {
    return {
      answer: "Paused",
      fixPrompt: null,
      live,
      needsYou,
      sentence: `${repeat.stateReason ?? "Paused"}. Last time: ${lower(latest.oneLine)}.`,
    };
  }
  let answer = repeat.kind === "fact" ? factWord(repeat, latest) : "Done";
  if (repeat.kind === "delivery" && failed) {
    answer = "Didn't deliver";
  }
  return {
    answer,
    fixPrompt: needsYou
      ? `Fix the repeating task "${title}": ${lower(latest.oneLine)}.`
      : null,
    live,
    needsYou,
    sentence: `${upper(latest.oneLine)}.`,
  };
}

/** When it stops, in words. */
export const endWords = (end: EndRule): string =>
  end === "keeps" ? "Keeps running" : "Until it's true";

/** Where it stands now, in a sentence, or null while it simply runs. */
export function standingWords(repeat: Repeat): string | null {
  switch (repeat.state) {
    case "on":
      return null;
    case "paused":
      return `${repeat.stateReason ?? "Paused"}: it won't run until it's turned back on.`;
    case "stopped":
      return `${repeat.stateReason ?? "Stopped"}: it won't run again until it's fixed.`;
    case "finished":
      return "It came true, so it stopped repeating.";
  }
}

/** One row of the Runs list: one run, or quiet runs alike folded into one. */
export type RunRow =
  | { kind: "run"; run: Run }
  | { kind: "folded"; id: string; runs: Run[]; words: string };

/** What a run said, reduced to what folds: runs alike and quiet read the same. */
function quietKey(repeat: Repeat, run: Run): string | null {
  if (
    failedRun(run) ||
    run.outcome === "running" ||
    run.outcome === "met" ||
    run.outcome === "delivered"
  ) {
    return null;
  }
  if (run.outcome === "nothing-to-report") {
    return repeat.kind === "fact" && run.answer === "yes"
      ? "all fine"
      : "nothing to report";
  }
  if (repeat.kind === "fact") {
    const word = factWord(repeat, run);
    if (word === "Yes") {
      return "all fine";
    }
    if (word === "Not yet") {
      return "still not yet";
    }
  }
  return null;
}

/** Three or more quiet runs in a row, alike, fold into one row: "12 sweeps, all fine". */
const FOLD_AT = 3;

export function runRows(repeat: Repeat): RunRow[] {
  const rows: RunRow[] = [];
  let group: Run[] = [];
  let key: string | null = null;
  const close = () => {
    if (group.length >= FOLD_AT && key) {
      rows.push({
        id: group[0]?.id ?? "",
        kind: "folded",
        runs: group,
        words: `${group.length} ${repeat.noun}, ${key}`,
      });
    } else {
      rows.push(...group.map((run) => ({ kind: "run" as const, run })));
    }
    group = [];
    key = null;
  };
  for (const run of repeat.runs) {
    const next = quietKey(repeat, run);
    if (next !== null && next === key) {
      group.push(run);
      continue;
    }
    close();
    group = [run];
    key = next;
  }
  close();
  return rows;
}

/** A run's own word, as the Runs list and its glyph say it. */
export function runWord(repeat: Repeat, run: Run): string {
  switch (run.outcome) {
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "could-not-check":
      return "Couldn't check";
    case "met":
      return "Came true";
    case "nothing-to-report":
      return repeat.kind === "fact" && run.answer === "yes"
        ? "Yes"
        : "Nothing new";
    case "not-yet":
      return factWord(repeat, run);
    case "delivered":
      return repeat.kind === "fact" ? factWord(repeat, run) : "Delivered";
  }
}

/** What its card says where a one-off task says what its attempt does (TaskCard `answer`). */
export function cardAnswer(title: string, repeat: Repeat): CardAnswer {
  const reading = readRepeat(title, repeat);
  let live: string | null = null;
  if (reading.live) {
    live = repeat.kind === "fact" ? "checking now" : "running now";
  }
  return {
    live,
    needsYou: reading.needsYou,
    sentence: reading.sentence,
    word: reading.answer,
  };
}
