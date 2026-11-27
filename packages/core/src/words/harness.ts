import { andList } from "@cawco/providers/names";
import type { HarnessKind } from "../harness/kinds";
import { harnessName } from "../harness/kinds";
import { firstCopy } from "../tool-updates";
import type { ToolStatus } from "../tools";

/**
 * What a harness's process says on its session's row when it does not start
 * or stops on its own: a mode it is not offered, an exit in its own words.
 * The agent and the hub say them from here. The app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
export const harnessWords = {
  /** Keep-alive asked of a session whose harness is none of `kept`, those whose prompt cache the hub times. */
  keepAliveIsFor: (kept: readonly HarnessKind[]) =>
    `Keep-alive is for ${andList(kept.map((kind) => harnessName(kind)))} sessions`,
  /** Keep-alive asked of a `harness` session mid-turn, or waiting on a question. */
  keepAliveNotIdle: (harness: HarnessKind) =>
    `Keep-alive requires an idle ${harnessName(harness)} session.`,
  /** A mode named that `harness` does not have (its descriptor's `permissionModes`). */
  modeNotOffered: (
    mode: string,
    harness: HarnessKind,
    offered: readonly string[]
  ) =>
    `${harnessName(harness)} has no "${mode}" permission mode; it has ${offered.join(", ") || "none"}.`,
  /** The context a compacted session gets in place of its open items when they could not be listed in time (agent claude.ts `#openItemsAfterCompaction`). */
  openItemsUnlisted:
    "Your open items could not be listed after the compaction. Call open_items to list them.",
  /** Claude Code options a spawn carried that are not options of the shape the SDK takes (core claude-options.ts), with what does not read. */
  claudeOptionsUnread: (issues: string) =>
    `The Claude Code options this session was started with don't read: ${issues}. Nothing was started.`,
  /** A send carrying a block of a kind Claude Code takes none of in a user turn (anything but words and pictures). */
  sendBlockUnsent: (type: string) =>
    `This message carries a ${type} block, which Claude Code doesn't take in a message; only words and pictures can be sent.`,
  /** A send whose id is not a UUID, which Claude Code keys each message it is sent by. */
  sendIdUnshaped: (id: string) =>
    `This message's id (${id}) is not a UUID, which Claude Code needs to say when it read it. Nothing was sent.`,
  /** A Claude Code process that ended on its own and said nothing on stderr. */
  claudeCrashed:
    "Claude Code stopped on its own and said nothing about why. A message to it starts it again.",
  /** One that ended on its own with `code`, in the last of what it said on stderr. */
  claudeExited: (code: number, said: string) =>
    `Claude Code stopped on its own (exit ${code}) and said “${said}”. A message to it starts it again.`,
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
/** A sentence that already ends: a quoted one takes no stop of ours. */
const SENTENCE_END = /[.!?]$/u;

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
   * page reads it again by itself once the install lands. Who started it
   * by the cell's `startedBy`, and installing or updating by `firstCopy`,
   * the choices the page's own line makes (words/tool-updates.ts
   * `putting`); a cell too old to say who is said with neither.
   */
  updatingUnread: (
    name: string,
    machine: string,
    cell: Pick<ToolStatus, "startedBy" | "state" | "to" | "version">
  ) => {
    const verb = firstCopy(cell) ? "installing" : "updating";
    const what = `${name} on ${machine}${cell.to ? ` to ${cell.to}` : ""}`;
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${what}`;
  },
  /**
   * A stored conversation read through the harness's CLI whose read failed
   * while its machine, connected again, had not yet said which tools it has
   * (hub history.ts `refusedRead`): why isn't known until it does.
   */
  toolsUnsaid: (machine: string) =>
    `${machine} hasn't said which tools it has since it connected, so why this conversation can't be read isn't known yet. Try again in a moment.`,
  /**
   * A stored conversation its machine reads only through the harness's
   * CLI, asked while no copy of that CLI is on disk there (agent opencode.ts
   * `#transcript`: npm moves it aside while it installs): the read fails
   * with this, and the hub says the install under way when one is (hub
   * history.ts `refusedRead`).
   */
  noBinaryUnread: (name: string) =>
    `${name} isn't on this machine right now, so this conversation can't be read. ${name} still keeps it, and it shows here once ${name} is back.`,
  /**
   * An act on a stored conversation that only the harness's CLI does
   * (agent opencode.ts `renameSession`, `deleteSession`), asked while no
   * copy of it is on disk: nothing was done. `undone` says what wasn't.
   */
  noBinaryUndone: (name: string, undone: string) =>
    `${name} isn't on this machine right now, so ${undone}. Try again once ${name} is back.`,
  /** The providers a harness's CLI signs in to, asked while no copy of it is on disk (agent opencode.ts `providerList`). */
  noBinaryUnlisted: (name: string) =>
    `${name} isn't on this machine right now, so the providers it signs in to can't be listed`,
  /**
   * An act on a stored conversation that the harness keeps nothing for
   * (pi: no tag CawCo can set, its capabilities say so): nothing was
   * done. `what` is what it keeps none of, `undone` what wasn't done.
   */
  keepsNo: (name: string, what: string, undone: string) =>
    `${name} keeps no ${what} CawCo can set, so ${undone}.`,
  /**
   * An effort level asked of a live session whose model has no such level
   * in its harness (agent pi-runtime.ts `CONTROL_SET_EFFORT`): `offered` are
   * the CawCo levels the model has, by the harness's own list. Its effort
   * stays as it was; no other level is put in its place.
   */
  effortNotOffered: (
    name: string,
    model: string,
    level: string,
    offered: readonly string[]
  ) =>
    `${name} has no ${level} effort for ${model}${offered.length > 0 ? `, only ${offered.join(", ")}` : ", which takes no effort level"}, so the effort wasn't changed.`,
  /**
   * An MCP server asked to reconnect, or to switch on or off, in a live
   * session that runs no MCP client (pi: a fenced session, agent
   * pi-runtime.ts): nothing was done. `undone` says what wasn't.
   */
  noMcp: (name: string, undone: string) =>
    `${name} runs no MCP servers in this session, so ${undone}.`,
  /**
   * An MCP server asked to switch on or off in a live pi session that is not
   * one CawCo's fleet registered for it (agent pi-runtime.ts `FleetMcp`): a
   * server from the person's own pi `mcp.json` is switched only in pi's
   * terminal manager, which writes the change to that file.
   */
  mcpNotOurs: (server: string) =>
    `pi switches ${server} on or off only in its own MCP manager, which saves the change to its mcp.json; CawCo switches only the fleet's servers in a session, so ${server} wasn't changed.`,
  /** Needs you's notice for a stored conversation's deletion that keeps failing (hub session-lifecycle.ts): its title. */
  notDeletedTitle: "A conversation wasn't deleted",
  /** Its body: where, how often, the machine's last words, and that CawCo goes on trying. */
  notDeleted: (name: string, machine: string, tries: number, said: string) =>
    `${name} on ${machine} didn't delete this conversation's stored transcript in ${tries} tries. The last said: ${said}${SENTENCE_END.test(said) ? "" : "."} It is retried every few minutes.`,
  unread: (name: string, machine: string) =>
    `This conversation is kept by ${name} on ${machine}, and CawCo reads it only through a copy of ${name} it runs, so it shows here once CawCo runs ${name} there.`,
  /**
   * The machine's Claude Code still answering `claude --version` after the
   * wait (`seconds`): no start until it answers, and the agent reads Claude
   * again as it does (agent claude-version.ts `onVersionAnswered`), which
   * clears it by itself.
   */
  claudeVersionUnsaid: (seconds: number, floor: string) =>
    `Claude Code on this machine didn't say its version: \`claude --version\` went quiet and was stopped after ${seconds} s. CawCo runs only ${floor} or newer, and asks again at the next start. Nothing was started or signed in.`,
};
