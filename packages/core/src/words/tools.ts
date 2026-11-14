/**
 * What CawCo says of a CLI it keeps current on a machine (core tools.ts
 * `ToolSpec.release`: Claude Code): an update that left the copy older than
 * the release it was after, updates its owner turned off, a pin its method
 * can't install, and how a refused harness and its row read when CawCo
 * updates it with no press. The agent says {@link toolWords.behind},
 * {@link toolWords.updatesOff}, {@link toolWords.autoUpdatesOff},
 * and {@link toolWords.cannotPin} (agent tools.ts); the dashboard says the
 * rest (ToolMatrix.svelte, harness-block.svelte.ts). The app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
/** Where a tool sign-in's refusal turns to quoting the tool's own screen. */
const SIGNIN_SCREEN = "Its screen said:";

/**
 * A sign-in sentence's tail quoting the tool's screen: its lines, one per
 * line, its exit last where it ended with one. A reader shows the sentence
 * before {@link SIGNIN_SCREEN} on its own (ToolMatrix's cell) and the lines
 * as lines.
 */
const screenOf = (said: string, code?: number): string =>
  said
    ? ` ${SIGNIN_SCREEN}\n${said}${code === undefined ? "" : `\n(exit ${code})`}`
    : "";

/** Names in a sentence: "a", "a and b", "a, b and c". */
const listed = (names: string[]): string =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");

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
   * The machine's owner turned off every update of the tool, a press's too:
   * a switch of core `ToolUpdateSwitches.every` (DISABLE_UPDATES). Which
   * switch, where it is set, and `then`, how an unset there reaches CawCo's
   * next read of it: {@link toolWords.thenRetry},
   * {@link toolWords.thenFetched} or {@link toolWords.thenRestarted}, by
   * where it is set (agent tools.ts `switchedOffIn`).
   */
  updatesOff: (name: string, variable: string, where: string, then: string) =>
    `${variable} in ${where} turns ${name}'s updates off, and CawCo follows it. ${then}`,
  /**
   * The machine's owner turned off the tool's automatic updates, and so
   * CawCo's own: a switch of core `ToolUpdateSwitches.automatic`
   * (DISABLE_AUTOUPDATER, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC). A press,
   * Retry among them, still updates it, as the tool's own `claude update`
   * does. Which switch, where it is set, and `keep`, what an unset there
   * takes for CawCo to keep it current: {@link toolWords.keepUnset},
   * {@link toolWords.keepFetched} or {@link toolWords.keepRestarted}, by
   * where it is set (agent tools.ts `switchedOffIn`).
   */
  autoUpdatesOff: (
    name: string,
    variable: string,
    where: string,
    keep: string
  ) =>
    `${variable} in ${where} turns ${name}'s automatic updates off, and CawCo follows it. Retry updates it now. ${keep}`,
  /** {@link toolWords.autoUpdatesOff}'s `keep` where {@link toolWords.updatesOff} says {@link toolWords.thenRetry}. */
  keepUnset: "To have CawCo keep it current, unset it there.",
  /** {@link toolWords.autoUpdatesOff}'s `keep` where {@link toolWords.updatesOff} says {@link toolWords.thenFetched}. */
  keepFetched:
    "To have CawCo keep it current, unset it there and start a Claude Code session on this machine so it fetches them again.",
  /** {@link toolWords.autoUpdatesOff}'s `keep` where {@link toolWords.updatesOff} says {@link toolWords.thenRestarted}. */
  keepRestarted:
    "To have CawCo keep it current, unset it there and restart CawCo.",
  /**
   * {@link toolWords.updatesOff}'s `then` for a switch in a place CawCo's
   * next read of the settings reads as it stands: a settings file, a
   * configuration profile, the registry, the managed settings files.
   */
  thenRetry: "Unset it there, then Retry.",
  /**
   * {@link toolWords.updatesOff}'s `then` for a switch in the server-managed
   * settings: CawCo reads the copy Claude Code last fetched, which changes
   * only when Claude Code fetches them, at its start and then hourly in an
   * active session.
   */
  thenFetched:
    "Unset it there, start a Claude Code session on this machine so it fetches them again, then Retry.",
  /**
   * {@link toolWords.updatesOff}'s `then` for a switch in the environment
   * CawCo runs in: its daemon's own, which holds what it started with.
   */
  thenRestarted: "Unset it there and restart CawCo, then Retry.",
  /** {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s `where` for a switch set in the environment rather than a settings file. */
  inEnvironment: "the environment CawCo runs in",
  /** {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s `where` for a switch set in a macOS configuration profile (core `ToolUpdateSwitches.places`). */
  inProfile: (domain: string) =>
    `the configuration profile that manages ${domain}`,
  /** {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s `where` for a switch set in a Windows registry policy, HKLM's or HKCU's (core `ToolUpdateSwitches.places`). */
  inRegistry: (value: string, key: string) =>
    `the registry's ${value} value under ${key}`,
  /**
   * {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s
   * `where` for a switch set in the tool's managed settings files: the system
   * directory's `managed-settings.json` and its folder of `.json` files (core
   * `ToolUpdateSwitches.places`).
   */
  inManagedFiles: (file: string, folder: string) =>
    `${file} or a .json file in ${folder}`,
  /**
   * {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s
   * `where` for a switch set in the server-managed settings, as Claude Code
   * last fetched them: from the claude.ai console or from a Claude apps
   * gateway, both of which the engine names `remote`.
   */
  inServerManaged:
    "the managed settings Claude Code last fetched from the organization it signs in to (the claude.ai console's Organization settings → Claude Code → Managed settings, or its Claude apps gateway)",
  /** {@link toolWords.updatesOff}'s and {@link toolWords.autoUpdatesOff}'s `where` for a switch set in managed settings whose source the tool's engine names as none of the others. */
  inManaged:
    "the managed settings Claude Code reads on the machine (its /status names the source)",
  /**
   * A read of the tool's settings that gave none (agent tools.ts
   * `settingsAnswer`): CawCo can't tell whether its owner turned its updates
   * off, so it updates nothing; the read's last line when it said one.
   */
  /**
   * One of the tool's settings sources that is there and could not be read
   * (agent claude-settings.ts `unreadSources`), where it is and why: what
   * {@link toolWords.settingsUnread}'s `said` carries.
   */
  settingsSourceUnread: (where: string, why: string) =>
    `${where} is there but couldn't be read: ${why}`,
  /**
   * A Claude Code settings file CawCo meant to write and left, said on the
   * agent's log (agent claude-settings-file.ts): `unread` is
   * {@link toolWords.settingsSourceUnread}'s sentence.
   */
  settingsLeft: (unread: string) =>
    `${unread}. CawCo left it as it is and reads it again at its next start.`,
  /** {@link toolWords.settingsSourceUnread}'s `why` for a path that is a symlink to nothing (agent json-on-disk.ts). */
  fileLinksToNothing: (to: string) =>
    `it links to ${to || "a path it doesn't say"}, which isn't there`,
  /** {@link toolWords.settingsSourceUnread}'s `why` for a settings path that is a folder, a pipe or anything else not a file. */
  settingsNotAFile: "it isn't a file",
  /** {@link toolWords.settingsSourceUnread}'s `why` for a settings file larger than any CawCo reads. */
  settingsTooLarge: (bytes: number, limit: number) =>
    `it is ${bytes} bytes, and CawCo reads a settings file of up to ${limit}`,
  /** {@link toolWords.settingsSourceUnread}'s `why` for a settings file whose text is not one JSON object. */
  settingsNotAnObject: "it doesn't hold one JSON object",
  /** {@link toolWords.settingsSourceUnread}'s `why` for a settings file the tool's own engine left out of what it read. */
  settingsSkipped: "Claude Code's own settings engine left it out",
  /** {@link toolWords.settingsSourceUnread}'s `where` for the machine's managed policy, by the kinds of its sources that did not load. */
  settingsPolicy: (kinds: readonly string[]) =>
    `the machine's managed policy (${new Intl.ListFormat("en", { type: "conjunction" }).format(kinds)})`,
  /** {@link toolWords.settingsSourceUnread}'s `why` for a managed policy source Claude Code's engine says did not load. */
  settingsPolicyUnloaded:
    "Claude Code's own settings engine says it didn't load",
  settingsUnread: (name: string, said: string | undefined) =>
    `CawCo couldn't read ${name}'s settings${said ? ` (${said})` : ""}, so it can't tell whether its updates are off. Retry reads them again, and so does CawCo's next update.`,
  /** A pinned version the copy's method can't install (a Homebrew cask carries one version): nothing was run. */
  cannotPin: (method: string, name: string, version: string) =>
    `${method} installs only the version it carries, not ${name} ${version}, the version the fleet pins. Pin the version ${method} carries, or install ${name} there without ${method}.`,
  /** An install method's need (core `ToolInstallMethod.needs`) that is not on the machine's PATH. */
  needMissing: (need: string) => `${need} is not on this machine's PATH`,
  /**
   * An install method's need that is on the PATH and fails its probe (core
   * `needProbe`): where it is, and the last of what it said.
   */
  needBroken: (path: string, said: string) =>
    `${path} does not run here${said ? `: ${said}` : ""}`,
  /**
   * A pinned version no method here can install: the pin, the methods that
   * can't install a chosen version, and why each that could take the pin
   * doesn't run here, when one could. Nothing was run.
   */
  noPinInstaller: (
    name: string,
    version: string,
    unpinnable: string[],
    unmet: string[]
  ) =>
    `CawCo can't install ${name} ${version} here, the version the fleet pins: ${listed(unpinnable)} can't install a chosen version${unmet.length ? `, and ${unmet.join("; ")}` : ""}. Remove the pin, or install ${name} ${version} on the machine yourself.`,
  /** No install method runs here: why each method's need can't serve, in catalog order. */
  noInstaller: (why: string[]) => `no installer runs here: ${why.join("; ")}`,
  /**
   * A machine's harness block while CawCo itself puts the CLI on (core
   * `ToolStatus.startedBy` `cawco`: its update of its own copy, or adding a
   * machine): who does it, what, where and to what, and that nothing waits
   * on the person. A press's own progress is the block's other words.
   */
  cawcoPutting: (
    installs: boolean,
    name: string,
    machine: string,
    to: string | undefined
  ) =>
    `CawCo is ${installs ? "installing" : "updating"} ${name} on ${machine}${to ? ` to ${to}` : ""}.`,
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
  /** The read ended saying neither signed in nor signed out: its last lines, one per line, and its exit. */
  signinUnread: (name: string, code: number, said: string) =>
    `${name} didn't say whether it is signed in.${screenOf(said, code)}`,
  /** The read did not end in time. */
  signinSilent: (name: string, seconds: number) =>
    `${name} didn't say whether it is signed in within ${seconds} s, or couldn't be started.`,
  /** A sign-in asked of a tool without one of its own. */
  signinNone: (name: string) => `${name} has no sign-in of its own.`,
  /** A sign-in asked of a tool not on the machine. */
  signinNotInstalled: (name: string) =>
    `${name} isn't installed on this machine. Install it in Configure › Command-line tools, then sign in.`,
  /** Where a sign-in's refusal turns to the tool's own screen: the row shows the sentence before it, the popover the whole. */
  signinScreen: SIGNIN_SCREEN,
  /** The tool's sign-in printed no link it may be signed in at, or ended first: what its screen said. */
  signinNoLink: (name: string, said: string) =>
    `${name} showed no sign-in link, so CawCo stopped it.${said ? screenOf(said) : " Its screen said nothing."}`,
  /** A code sent with no sign-in waiting for it. */
  signinNotWaiting: (name: string) =>
    `No ${name} sign-in is waiting for a code on this machine. It ended or was never started.`,
  /** A code that was empty. */
  signinNoCode: "Paste the code from the sign-in page.",
  /** The sign-in did not end in time after the code. */
  signinNotEnded: (name: string, seconds: number) =>
    `${name} didn't finish signing in within ${seconds} s of the code, so CawCo stopped it.`,
  /** The sign-in ended without signing in: what its screen said, the code never shown, and its exit. */
  signinFailed: (name: string, code: number, said: string) =>
    `${name} stopped without signing in. That link is spent.${screenOf(said, code)}`,

  // ── A tool's own sign-in, on its ledger (ToolMatrix, tool-signin.svelte.ts) ─
  /** The column's head. */
  signinHead: "Sign-in",
  /** The ledger head's count, after "n/m installed", only above 0. */
  signedInCount: (count: number) => `${count} signed in`,
  /** The ledger head's count of copies at a version CawCo doesn't run (their rows' "can't run"), after "n/m installed", only above 0. */
  cantRunCount: (count: number) => `${count} can't run`,
  signedIn: "Signed in",
  signedOut: "Not signed in",
  signinUnknown: "Unknown",
  /** The Unknown trigger's name. */
  signinUnknownHead: (name: string, machine: string) =>
    `${name} on ${machine} didn't say whether it is signed in`,
  /** The tool's read left no words. */
  signinUnknownSilent: "Its screen said nothing.",
  signIn: "Sign in",
  /** A sign-in under way, its popover put away: one press opens it again as it was. */
  pasteCode: "Paste code",
  /** What the cell says while its sign-in waits, the popover put away. */
  signinWaiting: "Waiting for the pasted code",
  /** The cell's button's name: "Sign in Antigravity CLI on obelisk". */
  signInOn: (verb: string, name: string, machine: string) =>
    `${verb} ${name} on ${machine}`,
  /** The popover's head. */
  signinTitle: (name: string, machine: string) => `${name} on ${machine}`,
  /** The link lapsed before a code came: the machine stopped waiting. Its life is the machine's, so no length is said. */
  signinExpired: (name: string) =>
    `The sign-in link expired before a code was pasted, so ${name} stopped waiting.`,
  /** The machine took the code and the tool still reads signed out; that link is spent. */
  signinRefused: (name: string) =>
    `That code didn't sign ${name} in. That link is spent.`,
} as const;
