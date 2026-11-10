/**
 * What the agent and the two programs a workspace's boundary runs say to
 * each other: the srt host (`boundary-host.ts`, a Linux boundary) and the
 * judge (`boundary-judge.ts`). Each is a program of its own, started with
 * positional arguments and an environment, and answering in lines, exit
 * statuses and files: every fact both sides read is here, once.
 *
 * It imports nothing. The host bundles it. The judge is a plain Bun script
 * the agent writes into the workspace's state dir, and imports this file by
 * the same relative path there as in this checkout ({@link
 * JUDGE_PROTOCOL_FILE}), where the agent writes it too, from this checkout or
 * as the binary embedded it (scripts/build-binary.ts).
 *
 * A host or judge an earlier build started runs on with that build's copy:
 * an argument's position and a line's words never change here, or a new
 * agent would misread one that is still running.
 */

/** The judge's arguments after its script, in the order it reads them. */
const JUDGE_ARGS = [
  "socket",
  "hook",
  "graceS",
  "exec",
  "prefix",
  "claudeTmp",
  "policyFile",
  "cat",
  "rm",
  "build",
] as const;

/** What the judge says when an argument is missing or empty, its arguments spelt by hand, in {@link JUDGE_ARGS}'s order. */
export const JUDGE_USAGE =
  "usage: boundary-judge.ts SOCKET HOOK GRACE_S EXEC PREFIX CLAUDE_TMP POLICY CAT RM BUILD";

/** The judge's arguments, by name. */
export type JudgeArgs = Readonly<Record<(typeof JUDGE_ARGS)[number], string>>;

/** `args` as the judge's argv, in {@link JUDGE_ARGS}'s order. */
export const judgeArgv = (args: JudgeArgs): string[] =>
  JUDGE_ARGS.map((name) => args[name]);

/** Whether `named` holds every one of `names`, none empty. */
const holdsEach = <Name extends string>(
  names: readonly Name[],
  named: Record<string, string>
): named is Record<Name, string> => names.every((name) => named[name] !== "");

/** The judge's arguments read from its argv; undefined when one is missing or empty. */
export const judgeArgsOf = (argv: readonly string[]): JudgeArgs | undefined => {
  const named = Object.fromEntries(
    JUDGE_ARGS.map((name, index) => [name, argv[index] ?? ""])
  );
  return holdsEach(JUDGE_ARGS, named) ? named : undefined;
};

/** The line the judge prints once it answers on its socket. */
export const JUDGE_READY = "cawco-judge-ready";

/**
 * The line the agent asks which build a judge runs, answered `0` and its
 * BUILD; a call's JSON is never this. A judge of a build before this
 * question refuses it, as it refuses any line it cannot read.
 */
export const JUDGE_BUILD_QUESTION = "cawco-judge-build";

/**
 * What ends every answer of the judge: a NUL, which no answer holds (JSON
 * escapes one, and no path or reason has one; any is taken out before it is
 * sent). The hook's perl reads up to it ({@link JUDGE_ANSWER_END_PERL}).
 */
export const JUDGE_ANSWER_END = "\0";

/**
 * {@link JUDGE_ANSWER_END}, as an escape in the hook's perl spells it: written
 * out, because perl reads `\N` as octal and only NUL spells the same in both.
 */
export const JUDGE_ANSWER_END_PERL = "\\0";

/** What the first line of every judge's answer begins with when the call may run. */
export const JUDGE_ALLOWS = "0";

/** What the first line of every judge's answer begins with when the call is refused. */
export const JUDGE_REFUSES = "2";

/** What the hook sends in place of its CLI's shell prefix for a CLI whose environment names none. */
export const JUDGE_NO_PREFIX = "-";

/** This file's path in a workspace's state dir, from the judge beside it, which imports it there. */
export const JUDGE_PROTOCOL_FILE = "boundary/protocol.ts";

/** The srt host's arguments after its script, in the order it reads them; the places it binds follow them. */
const HOST_ARGS = [
  "settingsFile",
  "runnerFile",
  "fifo",
  "clone",
  "readyLine",
  "deniesFile",
] as const;

/** What the srt host says when an argument is missing or empty, its arguments spelt by hand, in {@link HOST_ARGS}'s order, its places last. */
export const HOST_USAGE =
  "usage: boundary-host.ts SETTINGS RUNNER FIFO CLONE READY DENIES [PLACE...]";

/** The srt host's arguments, by name, and the places it binds. */
export type HostArgs = Readonly<
  Record<(typeof HOST_ARGS)[number], string> & { places: readonly string[] }
>;

/** `args` as the srt host's argv, in {@link HOST_ARGS}'s order, its places last. */
export const hostArgv = (args: HostArgs): string[] => [
  ...HOST_ARGS.map((name) => args[name]),
  ...args.places,
];

/** The srt host's arguments read from its argv; undefined when one is missing or empty. */
export const hostArgsOf = (argv: readonly string[]): HostArgs | undefined => {
  const named = Object.fromEntries(
    HOST_ARGS.map((name, index) => [name, argv[index] ?? ""])
  );
  return holdsEach(HOST_ARGS, named)
    ? { ...named, places: argv.slice(HOST_ARGS.length) }
    : undefined;
};

/** What the srt host exits with when the folder it holds is gone. */
export const HOST_GONE_STATUS = 66;

/**
 * The files the srt host writes in its working dir, a generation's dir:
 * `sandbox`, the running sandbox's pids (`OUTER INNER IDLE...`), which the
 * executor and the agent read; `guarded`, its protected binds, which the
 * executor checks before every command; `restarts.json`, each restart of
 * the sandbox for a guarded path changed on the host, which the agent
 * records.
 */
export const HOST_FILES = {
  guarded: "guarded",
  restarts: "restarts.json",
  sandbox: "sandbox",
} as const;

/**
 * The environment the agent starts the srt host with, besides srt's own:
 * `place`, the boundary holds a person's own folder, and nothing a command
 * starts outlives it (the runner reads it too); `folder`, it holds a
 * delegate's copy of a folder that is no repository; `sandboxCwd`, where a
 * place's srt starts, never in the place.
 */
export const HOST_ENV = {
  folder: "CAWCO_FOLDER",
  place: "CAWCO_PLACE",
  sandboxCwd: "CAWCO_SANDBOX_CWD",
} as const;
