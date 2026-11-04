/**
 * What CawCo says of a CLI it keeps current on a machine (core tools.ts
 * `ToolSpec.release`: Claude Code): an update that left the copy older than
 * the release it was after, updates its owner turned off, a pin its method
 * can't install, and how a refused harness and its row read when CawCo
 * updates it with no press. The agent says {@link toolWords.behind},
 * {@link toolWords.updatesOff}, {@link toolWords.cannotPin},
 * {@link toolWords.updatesItself} and {@link toolWords.updatingItself}
 * (agent tools.ts, claude-version.ts); the dashboard says the rest
 * (ToolMatrix.svelte, harness-block.svelte.ts). The app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
export const toolWords = {
  /**
   * An update that left the copy older than the release it was after: the
   * release, the updater's own words, what still runs, and what comes next.
   * The agent's `detail` on the tool's row (agent tools.ts `install`), read
   * under {@link toolWords.notUpdatedHead}.
   */
  behind: (method: string, version: string, newest: string, said: string) =>
    `The newest release is ${newest}. ${said ? `${method} said: ${said}` : `${method} said nothing about why`}. Sessions still start on ${version}. CawCo tries again when a newer release is out.`,
  /**
   * The machine's owner turned the tool's own updates off (core
   * `ToolSpec.updatesOff`): which switch, where it is set, and the version
   * CawCo leaves it on (none for a copy that says no version). A
   * placeholder until reviewed.
   */
  updatesOff: (
    name: string,
    variable: string,
    where: string,
    version: string | undefined
  ) =>
    `${name}'s own updates are turned off on this machine (${variable} in ${where}), so CawCo leaves it ${version ? `on ${version}` : "as it is"}.`,
  /** {@link toolWords.updatesOff}'s `where` for a switch set in the environment rather than a settings file. A placeholder until reviewed. */
  inEnvironment: "the environment CawCo starts it with",
  /**
   * A pinned version the copy's method can't install (a Homebrew cask
   * carries one version): nothing was run. A placeholder until reviewed.
   */
  cannotPin: (method: string, name: string, version: string) =>
    `${method} installs only the version it carries, so CawCo can't put ${name} ${version} on here, the version the fleet pins. Nothing was changed.`,
  /**
   * The fix a refused harness's sentence ends on when CawCo updates its CLI
   * with no press (Claude Code older than CawCo's floor).
   */
  updatesItself: (name: string) =>
    `CawCo updates ${name} and runs it once the update lands`,
  /** The tail of the tool probe's word on a copy older than CawCo's floor, for a CLI CawCo updates by itself. */
  updatingItself: "CawCo updates it.",
  /** Configure → CLI tools: the cell while CawCo updates a copy that is there. */
  updating: "Updating…",
  /** Configure → CLI tools: the mark beside a copy's version that its last update left older. */
  notUpdated: "Not updated",
  /** That mark's name for a screen reader, and its popover's head. */
  notUpdatedHead: (name: string, version: string, machine: string) =>
    `${name} ${version} on ${machine} didn't update`,
} as const;
