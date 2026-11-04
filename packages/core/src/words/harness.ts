/**
 * What a harness's process says on its session's row when it does not start
 * or stops on its own: a mode it is not offered, an exit in its own words.
 * The agent and the hub say them from here, and the probe kit finds them by
 * these same words
 * (scripts/probe-words-check.ts refuses a copy). The app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
export const harnessWords = {
  /** A mode named that CawCo offers no harness ({@link PERMISSION_MODES}). */
  modeNotOffered: (mode: string, offered: readonly string[]) =>
    `CawCo offers no "${mode}" permission mode; it offers ${offered.join(", ")}.`,
  /** A Claude Code process that ended on its own and said nothing on stderr. */
  claudeCrashed:
    "Claude Code stopped on its own and said nothing about why. A message to it starts it again.",
  /** One that ended on its own with `code`, in the last of what it said on stderr. */
  claudeExited: (code: number, said: string) =>
    `Claude Code stopped on its own (exit ${code}) and said “${said}”. A message to it starts it again.`,
};

/**
 * Why a machine's harness CLI stands refused (core HarnessReport `refused`),
 * as every place that says it reads it: the machine's own surfaces
 * (dashboard harness-block.svelte.ts) and the hub's refusal of a start there
 * (hub server.ts `placeSpawn`), from one sentence (core harness-refusal.ts
 * `harnessRefusal`). Claude Code's version sentences the agent says itself
 * (agent claude-version.ts `versionRefusal`), and the report carries them.
 */
export const harnessRefusedWords = {
  /** The press that fixes it: its install, OpenCode's one version, or its update. */
  press: (
    kind: "not-installed" | "version",
    name: string,
    exactVersion: string | undefined
  ): string => {
    if (kind === "not-installed") {
      return `Install ${name}`;
    }
    return exactVersion ? `Install ${name} ${exactVersion}` : `Update ${name}`;
  },
  /** A harness not on the machine (`claude`: no account can sign in there either). */
  notInstalled: (name: string, machine: string, claude: boolean) =>
    `${name} isn't installed on ${machine}, so CawCo can't start ${name} sessions${claude ? " or sign an account in" : ""} there. Install ${name}, and CawCo runs it as soon as it's on.`,
  /** The fix {@link harnessRefusedWords.notRun} ends on for a CLI its press updates. */
  pressFix: (press: string) =>
    `${press} on this machine, and CawCo runs it again.`,
  /** One at a version CawCo doesn't run, when the machine gave no sentence of its own; `fix` ends it. */
  notRun: (
    name: string,
    version: string | undefined,
    machine: string,
    fix: string
  ) =>
    `${name}${version ? ` ${version}` : ""} on ${machine} isn't one CawCo runs. ${fix}`,
  /**
   * The machine's Claude Code still answering `claude --version` after the
   * wait (`seconds`): no start until it answers, and the agent reads Claude
   * again as it does (agent claude-version.ts `onVersionAnswered`), which
   * clears it by itself.
   */
  claudeVersionUnsaid: (seconds: number, floor: string) =>
    `Claude Code on this machine hasn't said its version yet (\`claude --version\` gave no answer in ${seconds} s), and CawCo runs only ${floor} or newer. CawCo is still waiting for its answer, and as it answers reads the sign-ins here and can start Claude sessions. Nothing was started or signed in.`,
};
