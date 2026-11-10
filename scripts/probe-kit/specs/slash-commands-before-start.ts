/**
 * The New Session form's `/` menu and the started session's composer list
 * the same commands, from one source: the harness in the folder (core
 * `CONTROL_FOLDER_COMMANDS` before the session exists, its own
 * `supportedCommands` after). On a scratch fleet (real hub, agent and
 * sessiond; the real Claude Code CLI against the mock model), in a folder
 * holding a project skill and a project command. Nothing here cuts a
 * workspace, so it runs inside one too.
 *
 * - s1. Before any session, the machine lists the folder's commands (`GET
 *   /api/agents/:machineId/commands`): the project skill and command among
 *   them, and Claude Code's own.
 * - s2. A Claude session started there, after its first turn, answers
 *   `supportedCommands` with the same names; the only names it may add are
 *   an MCP server's prompts (`mcp__…`), which join as its servers connect.
 * - s3. Each name the two share carries the same description and argument
 *   hint in both.
 *
 *   bun scripts/probe-kit/run.ts slash-commands-before-start
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { projectClaudeDir } from "../../../packages/core/src/paths/claude";
import { CONTROL_SUPPORTED_COMMANDS } from "../../../packages/core/src/session/controls";
import type { SlashCommand } from "../../../packages/core/src/session-messages";
import { MACHINE, MODEL, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../spec";

const SKILL = "probe-folder-skill";
const COMMAND = "probe-folder-command";
const HELLO = "PROBE-SLASH-COMMANDS-HELLO";

/** The folder's own skill and command, as a project's `.claude/` holds them. */
const seedFolder = (folder: string): void => {
  mkdirSync(projectClaudeDir(folder, "skills", SKILL), { recursive: true });
  writeFileSync(
    projectClaudeDir(folder, "skills", SKILL, "SKILL.md"),
    `---\nname: ${SKILL}\ndescription: The folder's own skill.\n---\nSay ok.\n`
  );
  mkdirSync(projectClaudeDir(folder, "commands"), { recursive: true });
  writeFileSync(
    projectClaudeDir(folder, "commands", `${COMMAND}.md`),
    "---\ndescription: The folder's own command.\nargument-hint: <what>\n---\nSay ok.\n"
  );
};

const byName = (list: SlashCommand[]): Map<string, SlashCommand> =>
  new Map(list.map((command) => [command.name, command]));

const spec: Spec = {
  group: "The hub and machines",
  name: "slash-commands-before-start",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    seedFolder(fleet.workdir);

    const before = await fleet.api((hub) =>
      hub.api.agents({ machineId: MACHINE }).commands.get({
        query: {
          harness: "claude",
          cwd: fleet.workdir,
          // The model the session below starts on (scratch-fleet `spawn`).
          model: MODEL.claude,
        },
      })
    );
    const beforeNames = new Set(before.map((command) => command.name));
    check(
      "s1: before a session, the machine lists the folder's commands",
      beforeNames.has(SKILL) &&
        beforeNames.has(COMMAND) &&
        before.some((command) => command.builtin),
      `${before.length} listed; ${SKILL} ${beforeNames.has(SKILL) ? "in" : "missing"}, ${COMMAND} ${beforeNames.has(COMMAND) ? "in" : "missing"}`
    );

    const id = await fleet.spawn("claude", "Slash commands");
    await fleet.send(id, HELLO);
    await until(
      "its first turn answered",
      () => fleet.seen.some((one) => one.last.includes(HELLO)) || undefined,
      Boolean,
      120_000
    );
    const answer = await fleet.controlAnswer(
      CONTROL_SUPPORTED_COMMANDS,
      [],
      60_000,
      id
    );
    const after = (answer.ok ? answer.result : []) as SlashCommand[];
    const afterNames = new Set(after.map((command) => command.name));
    const lost = [...beforeNames].filter((name) => !afterNames.has(name));
    const added = [...afterNames].filter((name) => !beforeNames.has(name));
    check(
      "s2: the started session lists the same names",
      answer.ok &&
        lost.length === 0 &&
        added.every((name) => name.startsWith("mcp__")),
      answer.ok
        ? `${after.length} after, ${before.length} before; only before: ${lost.join(", ") || "none"}; only after: ${added.join(", ") || "none"}`
        : `supportedCommands failed: ${answer.error}`
    );

    const was = byName(before);
    const differ = after.filter((command) => {
      const held = was.get(command.name);
      return (
        held &&
        (held.description !== command.description ||
          held.argumentHint !== command.argumentHint)
      );
    });
    check(
      "s3: each shared name reads the same in both",
      answer.ok && differ.length === 0,
      differ.length
        ? `differ: ${differ.map((command) => command.name).join(", ")}`
        : `${after.length - added.length} shared names read the same`
    );
  },
};

export default spec;
