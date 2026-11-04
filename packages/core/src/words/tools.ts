/**
 * What CawCo says of a CLI it keeps current on a machine (core tools.ts
 * `ToolSpec.release`: Claude Code): an update that left the copy older than
 * the release it was after, and how a refused harness and its row read when
 * CawCo updates it with no press. The agent says {@link toolWords.behind}
 * and {@link toolWords.updatesItself} (agent tools.ts, claude-version.ts);
 * the dashboard says the rest (ToolMatrix.svelte, harness-block.svelte.ts).
 * The app draws none of it, so it is not written into it
 * (scripts/words-swift.ts).
 *
 * Placeholders, 2026-11-04: written to DESIGN.md's Voice for the owner to
 * replace.
 */
export const toolWords = {
  /**
   * An update that left the copy older than the release it was after: what
   * happened, the updater's own words, what still runs, and what comes next.
   * The agent's `detail` on the tool's row (agent tools.ts `install`).
   */
  behind: (
    method: string,
    name: string,
    version: string,
    newest: string,
    said: string
  ) =>
    `${method} left ${name} at ${version}, older than ${newest}${said ? `. It said: ${said}` : ""}. Sessions still start on ${version}. CawCo tries again when a newer release is out; Retry tries now.`,
  /**
   * The fix a refused harness's sentence ends on when CawCo updates its CLI
   * with no press (Claude Code older than CawCo's floor).
   */
  updatesItself: (name: string) =>
    `CawCo updates ${name} on this machine to its newest release by itself, and runs it once that lands`,
  /** The tail of the tool probe's word on a copy older than CawCo's floor, for a CLI CawCo updates by itself. */
  updatingItself: "CawCo updates it to its newest release by itself.",
  /** Configure → CLI tools: the cell while CawCo updates a copy that is there. */
  updating: "Updating…",
  /** Configure → CLI tools: the mark beside a copy's version that its last update left older. */
  notUpdated: "Not updated",
  /** That mark's name for a screen reader, and its popover's head. */
  notUpdatedHead: (name: string, version: string, machine: string) =>
    `${name} ${version} on ${machine} didn't update`,
} as const;
