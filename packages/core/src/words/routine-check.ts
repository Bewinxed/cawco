/**
 * A routine's check (hub routine-check.ts): a shell command the hub runs on
 * each machine its task file's `check_on:` names, before any model. Its
 * output wakes the routine's target; no output, or a last line of
 * `{"wakeAgent": false}`, keeps it quiet. These are the words its failures,
 * its approval card, its notices and its block in a routine's detail say.
 */

import type { CheckOutcome } from "../routine-kinds";

/** How the check last went on one machine, in a routine's detail. */
export const checkOutcomeWords: Record<CheckOutcome, string> = {
  quiet: "nothing new",
  woke: "woke the routine",
  failed: "failed",
  paused: "paused",
};

/**
 * A shell command as a markdown code block, so a thread draws it as code:
 * its fence one backtick longer than any run of backticks inside it.
 */
const shellBlock = (command: string): string => {
  const longest = Math.max(
    2,
    ...Array.from(command.matchAll(/`+/gu), (run) => run[0].length)
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}sh\n${command}\n${fence}`;
};

export const checkWords = {
  /** The block's head in a routine's detail. */
  head: "Check",
  /** Under the command: what it does, in one line. */
  hint: "Runs on each machine before any model. Output wakes the routine; no output keeps it quiet.",
  /** A machine the check has not run on yet. */
  notYet: "not checked yet",
  /** When it last ran on a machine: "checked 2 h ago". */
  checked: (ago: string) => `checked ${ago}`,
  /** When its output there last woke the routine: "last woke it 3 d ago". */
  woke: (ago: string) => `last woke it ${ago}`,
  /** Its command is not the one approved: it runs nothing until approved again. */
  unapprovedLine:
    "Its command changed since you approved it, so it runs nothing. Turn the routine off and on again to approve the command its file holds.",

  /** A routine whose file's command is not the one approved: its run is skipped, saying so. */
  unapproved:
    "its check's command changed since it was approved, so it runs nothing until it is approved again: the owner turns the routine back on to approve the command its file holds",
  /** Every machine it names is paused: the run is skipped, as a delegate run is. */
  paused: (why: string) => `The check did not run: ${why}`,

  /** A name in `check_on` that is no machine the hub knows. */
  unknownMachine: (name: string) =>
    `${name} is no machine this hub knows, so the check did not run there.`,
  /** A non-zero exit, with the command's last line of stderr (else stdout). */
  exited: (code: number, said: string | null) =>
    `The command exited ${code}${said ? `: ${said}` : "."}`,
  /** Went a quiet spell with no output and no work: its machine's runner stopped it (exit 124). */
  timedOut: (seconds: number) =>
    `The command wrote nothing and did no work for ${seconds} s, so it was stopped.`,
  /** Exited 124 itself, well inside its limit: a timeout of its own (`timeout 5 curl …`). */
  timedOutItself: (said: string | null) =>
    `The command timed out (exit 124)${said ? `: ${said}` : "."}`,
  /** Exit 126: found, but not runnable. */
  notRunnable: (said: string | null) =>
    `A program the command needs was found but can't be run (exit 126)${said ? `: ${said}` : "."}`,
  /** Exit 127: not found. */
  notFound: (said: string | null) =>
    `A program the command needs was not found (exit 127)${said ? `: ${said}` : "."}`,
  /** Exit 128 + n: ended by signal n. */
  signalled: (signal: number) =>
    `The command crashed or was killed (signal ${signal}, exit ${128 + signal}).`,
  /** The hub or its machine stopped it before it finished. */
  stopped: "CawCo stopped the command before it finished.",
  /** Its machine could not run it at all, away or refusing: the machine's words. */
  unrun: (why: string) => `The command could not be run: ${why}`,
  /** One machine's failure, as a failed run's reason joins them. */
  failedOn: (machine: string, why: string) => `${machine}: ${why}`,

  /** The conversation's line when the check failed on some machine. */
  failedNote: (slot: string, machines: string) =>
    `Run · ${slot} · its check failed on ${machines}`,

  /** A session made a routine with a check: under the notice's line, the command it runs, whole. */
  madeCommand: (command: string, machines: string) =>
    `Its check runs this command on ${machines} before each run, as the CawCo agent's user, outside any sandbox. Only output wakes the routine.\n\n${shellBlock(command)}`,
  /** A session changed the command a check runs: the line on the routine's thread, and its push's body. */
  changedNote: "A session changed the command its check runs",
  /** Under it: the command it runs now, whole. */
  changedBody: (command: string) =>
    `It runs this command now:\n\n${shellBlock(command)}`,
  /** The approval card's line for a routine with a check a session asks to make. */
  askMake: (name: string) => `Set up a routine gated by a command: ${name}`,
  /** The approval card's line for a change to the command a check runs. */
  askChange: (name: string) =>
    `Change the command a routine's check runs: ${name}`,
  /** Under either card's line: this one approval stands for every run, and where each run happens. */
  askCovers: (machines: string | null) =>
    `One approval covers every run. The command runs ${machines ? `on ${machines} ` : ""}as the CawCo agent's user, outside any sandbox, before each run of the routine.`,
} as const;
