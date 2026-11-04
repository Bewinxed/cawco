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
   * `ToolSpec.updatesOff`): which switch, and where it is set.
   */
  updatesOff: (name: string, variable: string, where: string) =>
    `${variable} in ${where} turns ${name}'s updates off, and CawCo follows it. Unset it there and CawCo updates it.`,
  /** {@link toolWords.updatesOff}'s `where` for a switch set in the environment rather than a settings file. */
  inEnvironment: "the environment CawCo runs in",
  /** {@link toolWords.updatesOff}'s `where` for a switch set in a macOS configuration profile (core `ToolUpdateSwitches.places`). */
  inProfile: (domain: string) =>
    `the configuration profile that manages ${domain}`,
  /** {@link toolWords.updatesOff}'s `where` for a switch set in a Windows registry policy, HKLM's or HKCU's (core `ToolUpdateSwitches.places`). */
  inRegistry: (value: string, key: string) =>
    `the registry's ${value} value under ${key}`,
  /**
   * {@link toolWords.updatesOff}'s `where` for a switch set in the tool's
   * managed settings files: the system directory's `managed-settings.json`
   * and its folder of `.json` files (core `ToolUpdateSwitches.places`).
   */
  inManagedFiles: (file: string, folder: string) =>
    `${file} or a .json file in ${folder}`,
  /** {@link toolWords.updatesOff}'s `where` for a switch set in the server-managed settings, as Claude Code last fetched them. */
  inServerManaged:
    "the managed settings of your claude.ai organization (Organization settings → Claude Code → Managed settings)",
  /** {@link toolWords.updatesOff}'s `where` for a switch set in managed settings whose source the tool's engine names as none of the others. */
  inManaged:
    "the managed settings Claude Code reads on the machine (its /status names the source)",
  /**
   * A read of the tool's settings that gave none (agent tools.ts
   * `settingsAnswer`): CawCo can't tell whether its owner turned its updates
   * off, so it updates nothing; the read's last line when it said one. A
   * placeholder until reviewed.
   */
  settingsUnread: (name: string, said: string | undefined) =>
    `CawCo couldn't read ${name}'s settings to see whether its updates are off, so it left it as it is.${said ? ` The read said: ${said}` : ""} CawCo reads them again at the next update.`,
  /** A pinned version the copy's method can't install (a Homebrew cask carries one version): nothing was run. */
  cannotPin: (method: string, name: string, version: string) =>
    `${method} installs only the version it carries, not ${name} ${version}, the version the fleet pins. Pin the version ${method} carries, or install ${name} there without ${method}.`,
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

  /** A tool's sign-in read (agent tools.ts `toolSignin`) found no copy to ask. */
  signinNoCopy: (name: string) =>
    `${name} isn't on this machine, so whether it is signed in can't be read.`,
  /** The read ended saying neither signed in nor signed out: its exit and last lines. */
  signinUnread: (name: string, code: number, said: string) =>
    `${name} didn't say whether it is signed in (exit ${code})${said ? `: ${said}` : ""}`,
  /** The read did not end in time. */
  signinSilent: (name: string, seconds: number) =>
    `${name} didn't say whether it is signed in within ${seconds} s, or couldn't be started.`,
  /** A sign-in asked of a tool without one of its own. */
  signinNone: (name: string) => `${name} has no sign-in of its own.`,
  /** A sign-in asked of a tool not on the machine. */
  signinNotInstalled: (name: string) =>
    `${name} isn't installed on this machine. Install it in Configure › Command-line tools, then sign in.`,
  /** The tool's sign-in printed no link it may be signed in at, or ended first: what its screen said. */
  signinNoLink: (name: string, said: string) =>
    `${name}'s sign-in showed no sign-in link, so it was stopped. ${said ? `Its screen said: ${said}` : "Its screen said nothing."}`,
  /** A code sent with no sign-in waiting for it. */
  signinNotWaiting: (name: string) =>
    `No ${name} sign-in is waiting for a code on this machine: it ended or was never started. Start the sign-in again.`,
  /** A code that was empty. */
  signinNoCode: "Paste the code from the sign-in page.",
  /** The sign-in did not end in time after the code. */
  signinNotEnded: (name: string, seconds: number) =>
    `${name} didn't finish signing in within ${seconds} s of the code, so the sign-in was stopped. Start it again.`,
  /** The sign-in ended without signing in: its exit and what its screen said, the code never shown. */
  signinFailed: (name: string, code: number, said: string) =>
    `${name}'s sign-in ended without signing in (exit ${code}). Start it again for a new link.${said ? ` Its screen said: ${said}` : ""}`,
} as const;
