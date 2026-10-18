/**
 * An OpenCode session reads OpenCode's own instructions, never Claude
 * Code's (agent opencode.ts `OPENCODE_MEMORY`, opencode-session.ts
 * `instructionEntries`). OpenCode "loads the global file followed by every
 * AGENTS.md from the current workspace directory toward the home directory"
 * and "does not use CLAUDE.md as a fallback" (opencode.ai/v2/docs/instructions).
 *
 *   bun scripts/probe-kit/run.ts opencode-instructions
 *
 * On a scratch fleet (real hub, agent and sessiond; OpenCode 2.0 against the
 * mock model), each file carrying a word of its own:
 *
 * (a) The fleet's memory, set on the hub (PUT /api/fleet/memory), lands as
 *     OpenCode's global `$XDG_CONFIG_HOME/opencode/AGENTS.md`, and the
 *     agent's fleet report names it applied.
 * (b) Then `~/.claude/CLAUDE.md` is written over with a word of its own, and
 *     the session's folder (a git checkout, the project root OpenCode's
 *     discovery stops at) holds an `AGENTS.md` and a `CLAUDE.md`, each with
 *     its own word. An OpenCode session's turn: the requests it sends the
 *     model carry the fleet memory's word and the folder's AGENTS.md word,
 *     and neither CLAUDE.md's.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const PROMPT = "Read your instructions.";

const spec: Spec = {
  name: "opencode-instructions",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["noted"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    const tag = crypto.randomUUID().slice(0, 8);
    const words = {
      fleet: `fleet-memory-${tag}`,
      agents: `project-agents-${tag}`,
      claudeGlobal: `claude-global-${tag}`,
      claudeProject: `claude-project-${tag}`,
    };

    // (a) The fleet's memory, as OpenCode's own global instructions.
    const put = await fetch(`${fleet.base}/api/fleet/memory`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `# Fleet\n\n${words.fleet}\n` }),
    });
    kit.check("(a) the hub takes the fleet's memory", put.ok, `${put.status}`);
    const global = join(fleet.home, ".config", "opencode", "AGENTS.md");
    const written = await until(
      "OpenCode's global AGENTS.md",
      () => readFile(global, "utf8").catch(() => ""),
      (text) => text.includes(words.fleet),
      120_000
    );
    kit.check(
      "(a) the fleet's memory is OpenCode's global AGENTS.md",
      written.includes(words.fleet),
      global
    );

    // (b) Claude Code's files, each with a word OpenCode must never see.
    await writeFile(
      join(fleet.home, ".claude", "CLAUDE.md"),
      `# Claude\n\n${words.claudeGlobal}\n`
    );
    await writeFile(
      join(fleet.repo, "CLAUDE.md"),
      `# Claude project\n\n${words.claudeProject}\n`
    );
    await writeFile(
      join(fleet.repo, "AGENTS.md"),
      `# Project\n\n${words.agents}\n`
    );
    const instanceId = await fleet.spawn(
      "opencode",
      "Instructions",
      fleet.repo
    );
    const uuid = await fleet.send(instanceId, PROMPT);
    await until(
      "the turn's send read",
      () => fleet.sendRow(uuid),
      (row) => row?.state === "read",
      180_000
    );
    const asked = await until(
      "the turn's request to the model",
      () => fleet.seen.filter((one) => one.last.includes(PROMPT)),
      (requests) => requests.length > 0,
      180_000
    );
    const bodies = asked.map((one) => one.body).join("\n");
    kit.check(
      "(b) the session sends the fleet memory's word",
      bodies.includes(words.fleet)
    );
    kit.check(
      "(b) the session sends its folder's AGENTS.md word",
      bodies.includes(words.agents)
    );
    kit.check(
      "(b) no ~/.claude/CLAUDE.md word reaches the model",
      !bodies.includes(words.claudeGlobal)
    );
    kit.check(
      "(b) no project CLAUDE.md word reaches the model",
      !bodies.includes(words.claudeProject)
    );
  },
};

export default spec;
