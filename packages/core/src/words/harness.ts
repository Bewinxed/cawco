import type { HarnessKind } from "../harness/kinds";
import { accountsWords } from "./accounts";
import { andList } from "./helpers";

/**
 * What a harness's process says on its session's row when it does not start
 * or stops on its own: a mode it is not offered, an exit in its own words.
 * The agent and the hub say them from here. The app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
export const harnessWords = {
  /** Keep-alive asked of a session whose harness is none of `kept`, those whose prompt cache the hub times. */
  keepAliveIsFor: (kept: readonly HarnessKind[]) =>
    `Keep-alive is for ${andList(kept.map((kind) => accountsWords.harnesses[kind]))} sessions`,
  /** Keep-alive asked of a `harness` session mid-turn, or waiting on a question. */
  keepAliveNotIdle: (harness: HarnessKind) =>
    `Keep-alive requires an idle ${accountsWords.harnesses[harness]} session.`,
  /** A mode named that CawCo offers no harness ({@link PERMISSION_MODES}). */
  modeNotOffered: (mode: string, offered: readonly string[]) =>
    `CawCo offers no "${mode}" permission mode; it offers ${offered.join(", ")}.`,
  /** The context a compacted session gets in place of its open items when they could not be listed in time (agent claude.ts `#openItemsAfterCompaction`). */
  openItemsUnlisted:
    "Your open items could not be listed after the compaction. Call open_items to list them.",
  /** A Claude Code process that ended on its own and said nothing on stderr. */
  claudeCrashed:
    "Claude Code stopped on its own and said nothing about why. A message to it starts it again.",
  /** One that ended on its own with `code`, in the last of what it said on stderr. */
  claudeExited: (code: number, said: string) =>
    `Claude Code stopped on its own (exit ${code}) and said “${said}”. A message to it starts it again.`,
  /**
   * A clean start asked of OpenCode (core `cleanStartRefusal`): its server,
   * which every session of an account shares, reads the global and the
   * project's `AGENTS.md` for each of them, and no session can opt out.
   */
  openCodeNotClean:
    "OpenCode can't start a session clean: the server every session of an account shares reads its global and project AGENTS.md into each of them. Start it on Claude Code or pi, or without clean. Nothing was started.",
  /** A clean start asked together with what would bring context back into it. */
  cleanWith: (what: string) =>
    `A clean start takes no ${what}: drop ${what}, or start without clean. Nothing was started.`,
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
   * A stored conversation its machine reads only through the harness's CLI
   * (core traits `readsThroughCli`: OpenCode's server), asked while the
   * machine refuses that CLI; the refusal's own sentence follows it (hub
   * history.ts `refusedRead`).
   */
  /**
   * A stored conversation its machine reads only through the harness's CLI,
   * asked while an install of that CLI runs there and no server of a
   * version CawCo runs could answer it (hub history.ts `refusedRead`): the
   * page reads it again by itself once the install lands.
   */
  updatingUnread: (name: string, machine: string, to: string | undefined) =>
    `CawCo is updating ${name} on ${machine}${to ? ` to ${to}` : ""}`,
  /**
   * A stored conversation its machine reads only through the harness's
   * CLI, asked while no copy of that CLI is on disk there (agent opencode.ts
   * `#transcript`: npm moves it aside while it installs): the read fails
   * with this, and the hub says the install under way when one is (hub
   * history.ts `refusedRead`).
   */
  /**
   * A stored conversation read through the harness's CLI whose read failed
   * while its machine, connected again, had not yet said which tools it has
   * (hub history.ts `refusedRead`): why isn't known until it does.
   */
  toolsUnsaid: (machine: string) =>
    `${machine} hasn't said which tools it has since it connected, so why this conversation can't be read isn't known yet. Try again in a moment.`,
  noBinaryUnread: (name: string) =>
    `${name} isn't on this machine right now, so this conversation can't be read. ${name} still keeps it, and it shows here once ${name} is back.`,
  unread: (name: string, machine: string) =>
    `This conversation is kept by ${name} on ${machine}, and CawCo reads it only through a copy of ${name} it runs, so it shows here once CawCo runs ${name} there.`,
  /**
   * The machine's Claude Code still answering `claude --version` after the
   * wait (`seconds`): no start until it answers, and the agent reads Claude
   * again as it does (agent claude-version.ts `onVersionAnswered`), which
   * clears it by itself.
   */
  claudeVersionUnsaid: (seconds: number, floor: string) =>
    `Claude Code on this machine hasn't said its version yet (\`claude --version\` gave no answer in ${seconds} s), and CawCo runs only ${floor} or newer. CawCo is still waiting for its answer, and as it answers reads the sign-ins here and can start Claude sessions. Nothing was started or signed in.`,
};
