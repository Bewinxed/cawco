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
