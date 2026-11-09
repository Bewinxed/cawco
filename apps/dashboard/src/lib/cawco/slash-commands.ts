/**
 * A harness's `/` menu as the composer draws it, from the one answer every
 * harness gives for it (core `SupportedCommands`): a started session's
 * (`supportedCommands`, client.svelte.ts `refreshCommands`) and a folder's
 * before any session runs there (`folderCommands`, the New Session form). The
 * two are one reading of the same harness in the same folder, so both menus
 * are built here and list the same commands.
 */

import { type AvailableCommand, classifyCommand } from "@cawco/core/fleet";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import type {
  SlashCommand,
  SupportedCommands,
} from "@cawco/core/session-messages";
import { hubCall } from "#lib/platform/hub-read.js";

/**
 * What one session answers behind `/` (NEW.md §11), from its two sources: every
 * `system.init` lists the names and says which of them are skills, and
 * `supportedCommands` — asked once, when somebody first opens the menu — adds
 * the prose. Per instance, because two machines rarely have the same skills
 * installed and a session only ever offers its own.
 */
export interface CommandState {
  /** When the session last answered — the refresh throttle reads this. */
  at: number;
  /** Descriptions and argument hints, `null` until something has asked. */
  detailed: Map<string, SlashCommand> | null;
  /** Names as the session lists them, without the leading slash. */
  names: string[];
  /** The subset of `names` that are skills — {@link classifyCommand}'s evidence. */
  skills: string[];
}

/**
 * A `SlashCommand[]` answer as the lookup the menu reads its prose from: one
 * row per name, the one typing `/name` runs. A session lists a name more than
 * once when it holds two commands by it (a skill in two places, a skill that
 * shares a built-in's name). Claude Code marks its own rows, and "when a
 * marked row carries it, /name runs that one" (SDK `SlashCommand.builtin`);
 * between unmarked rows it says nothing more, so the first listed stands.
 */
export const detailsOf = (
  commands: SlashCommand[]
): Map<string, SlashCommand> => {
  const byName = new Map<string, SlashCommand>();
  for (const command of commands) {
    const held = byName.get(command.name);
    if (!held || (command.builtin && !held.builtin)) {
      byName.set(command.name, command);
    }
  }
  return byName;
};

/** What the palette groups by: what this machine was given, then the harness's own. */
const COMMAND_ORDER: Record<AvailableCommand["type"], number> = {
  skill: 0,
  custom: 1,
  builtin: 2,
  mcp: 3,
};

/**
 * Where a command came from, when its own name says: a plugin component wears
 * its plugin (`plugin:command`), an MCP prompt its server (`mcp__server__prompt`).
 */
function sourceOf(name: string): string | undefined {
  if (name.startsWith("mcp__")) {
    return name.split("__")[1] || undefined;
  }
  const namespace = name.indexOf(":");
  return namespace > 0 ? name.slice(0, namespace) : undefined;
}

/**
 * One session's `/` menu: every name it listed, once, wearing whatever
 * `supportedCommands` has since said about it ({@link detailsOf} keeps the
 * row `/name` runs). The init frame leads because it arrives on every turn and
 * is free — the descriptions are one lazy call behind it, and are all there is
 * before the first init. A name listed twice inserts the same `/name` and runs
 * one command, so it is one row: the menu keys its rows by it.
 */
export function availableCommands({
  names,
  skills,
  detailed,
}: CommandState): AvailableCommand[] {
  const listed = new Set(
    names.length > 0 ? names : [...(detailed?.keys() ?? [])]
  );
  return [...listed]
    .map((name) => {
      const known = detailed?.get(name);
      return {
        name,
        // Both are required strings to the SDK, which sends '' for "none".
        description: known?.description || undefined,
        argumentHint: known?.argumentHint || undefined,
        type: classifyCommand(known ?? { name }, skills),
        source: sourceOf(name),
      };
    })
    .sort(
      (a, b) =>
        COMMAND_ORDER[a.type] - COMMAND_ORDER[b.type] ||
        a.name.localeCompare(b.name)
    );
}

/**
 * What one `supportedCommands` answer says of a menu: its names, its prose,
 * and its skills when the harness tags them (OpenCode does; Claude Code
 * names its skills in `system.init` alone, which the caller keeps).
 */
export const answeredCommands = (
  answer: SupportedCommands
): Pick<CommandState, "detailed" | "names"> & { skills?: string[] } => ({
  names: answer.map((command) => command.name),
  detailed: detailsOf(answer),
  ...(answer.some((command) => command.kind)
    ? {
        skills: answer
          .filter((command) => command.kind === "skill")
          .map((command) => command.name),
      }
    : {}),
});

/**
 * The `/` menu a session of `harness` would open with in `cwd` on
 * `machineId`, before it exists: the machine's harness asked as that session
 * would be (hub `GET /api/agents/:machineId/commands`), drawn as the
 * session's composer draws its own answer. `account`: the Claude account the
 * session runs on, when one is picked; the hub's for the machine otherwise.
 * `model`: the one it starts on, "" for the harness's default.
 */
export const folderCommands = async (ask: {
  account?: string | null;
  cwd: string;
  harness: HarnessKind;
  machineId: string;
  model: string;
}): Promise<AvailableCommand[]> => {
  const answer = await hubCall<SupportedCommands>(
    hubRequest("GET /api/agents/:machineId/commands", {
      path: { machineId: ask.machineId },
      query: {
        harness: ask.harness,
        cwd: ask.cwd,
        ...(ask.account ? { account: ask.account } : {}),
        ...(ask.model ? { model: ask.model } : {}),
      },
    }),
    `list the commands of ${ask.cwd}`
  );
  return availableCommands({ at: 0, skills: [], ...answeredCommands(answer) });
};
