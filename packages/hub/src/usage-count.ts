import { existsSync, statSync } from "node:fs";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { listClaudeFiles } from "@cawco/core/paths/claude";
import type { NeutralMessage } from "@cawco/core/session-messages";
import type { CapabilityKind } from "@cawco/core/suggest";
import { DAY_MS } from "@cawco/core/time";
import type { DbShape } from "./db";
import type { CapabilityCallsIn } from "./db/capability-calls";

/**
 * Which skills, tools and MCP servers each session calls, counted per
 * session and day from the frames the hub relays: every harness's, in the
 * one neutral shape its adapter writes. The composer's suggestions rank
 * their candidates by it (see `suggest.ts`), and capability-calls.ts counts
 * it by role.
 *
 * - A `tool_use` counts one `tool` call of its name.
 * - An MCP server's tool also counts one `mcp` call of the server
 *   ({@link CALL_NAMING}): Claude Code and pi name it `mcp__<server>__<tool>`,
 *   OpenCode `<server>_<tool>`.
 * - A skill counts a `skill` call instead of a tool call: Claude Code's
 *   `Skill` tool (`input.skill`), OpenCode's `skill` tool (`input.name`),
 *   and pi's `read` of a skill's `SKILL.md`, which is how pi loads one ("the
 *   model reads `SKILL.md`", pi docs/skills.md).
 * - A user turn that loads a skill counts one call of it: Claude Code's
 *   `<command-name>/x</command-name>` when `x` is a skill the session
 *   listed, and pi's expanded `/skill:x`, `<skill name="x"`.
 */

interface CapabilityUse {
  kind: CapabilityKind;
  name: string;
}

/** A use's weight halves every this many days. Our own call, to be tuned. */
const USAGE_HALF_LIFE_DAYS = 14;
/** How far back the one-time backfill reads. */
const BACKFILL_DAYS = 30;
/**
 * Rows older than this weigh under 0.3% at a 14-day half-life, so they are
 * not read, and the hub drops them as it starts. A role's count reads
 * at most this far back too.
 */
export const SCORE_WINDOW_DAYS = 120;

/** CawCo's own MCP server, which every session has. */
const CAWCO_SERVER = "cawco";
/** How long the fleet's server names are read once for, ms. */
const SERVERS_FRESH_MS = 60_000;

const COMMAND_NAME = /<command-name>\/?([^<\s]+)<\/command-name>/u;
/** pi's expansion of `/skill:x` (pi-runtime.ts `loadSkills` writes the same). */
const PI_SKILL = /<skill name="([^"]+)"/u;
/** A skill's own file: the folder it is in is the skill. */
const SKILL_FILE = /([^/\\]+)[/\\]SKILL\.md$/u;
const MCP_TOOL = /^mcp__(.+?)__(.+)$/u;

/** Local calendar date, `YYYY-MM-DD`. */
const dayOf = (at: Date): string => at.toLocaleDateString("en-CA");

/**
 * The name a server's calls are kept under: its name as Claude Code's
 * `mcp__<server>__` prefix writes it, everything outside `[A-Za-z0-9_-]` as
 * `_` (`Exa.ai` → `Exa_ai`). OpenCode writes its tools' prefix the same.
 */
export const mcpUsageName = (server: string): string =>
  server.replace(/[^A-Za-z0-9_-]/gu, "_");

/** pi's form of a server's name in its tools': `-` too as `_` (pi docs/mcp.md). */
const piForm = (name: string): string => name.replace(/[^A-Za-z0-9_]/gu, "_");

/** A server's name as Claude Code's `mcp__<server>__` prefix (and pi's) writes it. */
const prefixedServer = (tool: string): string | undefined =>
  MCP_TOOL.exec(tool)?.[1];

/** A slash command's skill, when the session's `init` listed it. */
const commandSkill = (
  words: string,
  known: Set<string>
): string | undefined => {
  const command = COMMAND_NAME.exec(words)?.[1];
  return command && known.has(command) ? command : undefined;
};

/** How one harness's calls name the server that answered them and the skill they load. */
interface CallNaming {
  /**
   * The MCP server a tool's name says answered it, as {@link mcpUsageName}
   * keeps it; undefined for a tool of no server. `known` is the servers'
   * usage names.
   */
  server: (tool: string, known: readonly string[]) => string | undefined;
  /** A skill loaded by a call other than the `Skill` and `skill` tools. */
  skillCall?: (
    tool: string,
    input: Record<string, unknown>
  ) => string | undefined;
  /** The skill a user turn's words load. */
  turnSkill: (words: string, known: Set<string>) => string | undefined;
}

const CALL_NAMING: Record<HarnessKind, CallNaming> = {
  claude: { server: prefixedServer, turnSkill: commandSkill },
  // OpenCode's `<server>_<tool>`, read by the longest known server it starts with.
  opencode: {
    server: (tool, known) => {
      let found: string | undefined;
      for (const server of known) {
        if (
          tool.startsWith(`${server}_`) &&
          server.length > (found?.length ?? 0)
        ) {
          found = server;
        }
      }
      return found;
    },
    turnSkill: commandSkill,
  },
  // pi's prefix lost each `-`, so it is given back the name of the server it
  // stands for; a skill is loaded by reading its SKILL.md, and a turn names
  // one as an expanded `/skill:x`.
  pi: {
    server: (tool, known) => {
      const server = prefixedServer(tool);
      return server === undefined
        ? undefined
        : (known.find((name) => piForm(name) === server) ?? server);
    },
    skillCall: (tool, input) =>
      tool === "read" && typeof input.path === "string"
        ? SKILL_FILE.exec(input.path)?.[1]
        : undefined,
    turnSkill: (words) => PI_SKILL.exec(words)?.[1],
  },
};

/** The skill a call loads, if it is one: by each harness's way of loading one. */
const skillOf = (
  tool: string,
  input: Record<string, unknown>,
  harness: HarnessKind
): string | undefined => {
  if (tool === "Skill" && typeof input.skill === "string") {
    return input.skill;
  }
  if (tool === "skill" && typeof input.name === "string") {
    return input.name;
  }
  return CALL_NAMING[harness].skillCall?.(tool, input);
};

/** How a session's calls are read: its harness, and the servers it may name. */
interface Reading {
  harness: HarnessKind;
  servers: readonly string[];
}

/** The uses in one assistant message's content blocks. */
function usesInBlocks(blocks: unknown, reading: Reading): CapabilityUse[] {
  if (!Array.isArray(blocks)) {
    return [];
  }
  const uses: CapabilityUse[] = [];
  for (const block of blocks as {
    type?: string;
    name?: string;
    input?: Record<string, unknown>;
  }[]) {
    if (block.type !== "tool_use" || typeof block.name !== "string") {
      continue;
    }
    const skill = skillOf(block.name, block.input ?? {}, reading.harness);
    if (skill) {
      uses.push({ kind: "skill", name: skill });
      continue;
    }
    uses.push({ kind: "tool", name: block.name });
    const server = CALL_NAMING[reading.harness].server(
      block.name,
      reading.servers
    );
    if (server) {
      uses.push({ kind: "mcp", name: server });
    }
  }
  return uses;
}

/** A user turn's words, its text blocks joined. */
function wordsOf(content: unknown): string {
  return typeof content === "string"
    ? content
    : (Array.isArray(content) ? content : [])
        .map((block: { type?: string; text?: string }) =>
          block.type === "text" ? (block.text ?? "") : ""
        )
        .join("");
}

/**
 * The skill a user turn loads, when it loads one: a slash command naming a
 * skill in `known`, or pi's expanded `/skill:x`.
 */
function turnSkill(
  content: unknown,
  known: Set<string>,
  harness: HarnessKind
): string | undefined {
  return CALL_NAMING[harness].turnSkill(wordsOf(content), known);
}

/** Folds one session's uses into its per-day rows, ready for `capabilityCalls.add`. */
const tally = (
  rows: Map<string, CapabilityCallsIn>,
  instanceId: string,
  uses: CapabilityUse[],
  at: Date
): void => {
  const day = dayOf(at);
  for (const use of uses) {
    const key = `${instanceId}\u0000${use.kind}\u0000${use.name}\u0000${day}`;
    const row = rows.get(key);
    if (row) {
      row.count += 1;
      if (at > row.lastAt) {
        row.lastAt = at;
      }
    } else {
      rows.set(key, { instanceId, ...use, day, count: 1, lastAt: at });
    }
  }
};

/** Every server a session's tool may name: the fleet's, and CawCo's own. */
const knownServers = (db: DbShape): string[] => [
  CAWCO_SERVER,
  ...db.capabilityCalls.serverNames().map(mcpUsageName),
];

/** Counts live frames. Called beside the rule engine on every relayed frame. */
export class UsageCounter {
  readonly #db: DbShape;
  /** Each session's skills, from its newest `init`, for slash-command matching. */
  readonly #skills = new Map<string, Set<string>>();
  /** Each session's harness, read once. */
  readonly #harnesses = new Map<string, HarnessKind>();
  #servers: { names: string[]; at: number } | null = null;

  constructor(db: DbShape) {
    this.#db = db;
  }

  forget(instanceId: string): void {
    this.#skills.delete(instanceId);
    this.#harnesses.delete(instanceId);
  }

  #reading(instanceId: string): Reading {
    let harness = this.#harnesses.get(instanceId);
    if (!harness) {
      harness =
        this.#db.getInstancesByIds([instanceId])[0]?.harness ?? "claude";
      this.#harnesses.set(instanceId, harness);
    }
    const now = Date.now();
    if (!this.#servers || now - this.#servers.at > SERVERS_FRESH_MS) {
      this.#servers = { names: knownServers(this.#db), at: now };
    }
    return { harness, servers: this.#servers.names };
  }

  observe(instanceId: string, message: NeutralMessage): void {
    const frame = message as {
      type: string;
      subtype?: string;
      skills?: string[];
      message?: { content?: unknown };
    };
    if (frame.type === "system" && frame.subtype === "init") {
      this.#skills.set(instanceId, new Set(frame.skills ?? []));
      return;
    }
    let uses: CapabilityUse[] = [];
    if (frame.type === "assistant") {
      uses = usesInBlocks(frame.message?.content, this.#reading(instanceId));
    } else if (frame.type === "user") {
      const skill = turnSkill(
        frame.message?.content,
        this.#skills.get(instanceId) ?? new Set(),
        this.#reading(instanceId).harness
      );
      uses = skill ? [{ kind: "skill", name: skill }] : [];
    }
    if (uses.length === 0) {
      return;
    }
    const rows = new Map<string, CapabilityCallsIn>();
    tally(rows, instanceId, uses, new Date());
    this.#db.capabilityCalls.add([...rows.values()]);
  }
}

/** One transcript line, as much of it as the backfill reads. */
interface TranscriptLine {
  message?: { content?: unknown };
  sessionId?: string;
  timestamp?: string;
  type?: string;
}

/** What the backfill has found so far, across every transcript. */
interface Found {
  /** Slash commands, matched once every file has been read. */
  commands: { instanceId: string; name: string; at: Date }[];
  /** Every skill the `Skill` tool was seen loading, and the fleet's. */
  known: Set<string>;
  rows: Map<string, CapabilityCallsIn>;
  servers: readonly string[];
  /** The hub's session by each harness session id it keeps. */
  sessions: Map<string, string>;
}

/** One transcript line's calls into `found`, under the session it names. */
function scanEntry(entry: TranscriptLine, at: Date, found: Found): void {
  const instanceId = found.sessions.get(entry.sessionId ?? "") ?? "";
  if (entry.type === "assistant") {
    const uses = usesInBlocks(entry.message?.content, {
      harness: "claude",
      servers: found.servers,
    });
    for (const use of uses.filter((u) => u.kind === "skill")) {
      found.known.add(use.name);
    }
    tally(found.rows, instanceId, uses, at);
  } else if (entry.type === "user") {
    const name = COMMAND_NAME.exec(wordsOf(entry.message?.content))?.[1];
    if (name) {
      found.commands.push({ instanceId, name, at });
    }
  }
}

/**
 * Tallies one Claude transcript's calls into `found.rows`, each under the
 * session its line names (`''` for none the hub keeps), notes every skill
 * the `Skill` tool loaded, and collects its slash commands.
 */
async function scanTranscript(
  path: string,
  since: number,
  found: Found
): Promise<void> {
  const text = await Bun.file(path).text();
  for (const line of text.split("\n")) {
    if (!(line.includes('"tool_use"') || line.includes("<command-name>"))) {
      continue;
    }
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(line);
    } catch {
      // The line being written as the file is read.
      continue;
    }
    const at = new Date(Date.parse(entry.timestamp ?? ""));
    if (at.getTime() >= since) {
      scanEntry(entry, at, found);
    }
  }
}

/**
 * As the hub starts: drops the calls past {@link SCORE_WINDOW_DAYS}, and,
 * when nothing has been counted yet, backfills the last
 * {@link BACKFILL_DAYS} days of the Claude transcripts under the Claude
 * config dirs the agent reads (`claudeConfigDirs`), so the hub's own `HOME`
 * decides which ones. Each call is kept under the hub's session its
 * transcript line names. Slash-command skills are matched against the
 * fleet's skills plus every skill the `Skill` tool was seen loading.
 */
export async function backfillUsage(db: DbShape): Promise<void> {
  db.capabilityCalls.prune(
    dayOf(new Date(Date.now() - SCORE_WINDOW_DAYS * DAY_MS))
  );
  if (!db.capabilityCalls.empty()) {
    return;
  }
  const paths = (await listClaudeFiles()).map((file) => file.path);

  const since = Date.now() - BACKFILL_DAYS * DAY_MS;
  const found: Found = {
    commands: [],
    known: new Set(db.listSkills().map((skill) => skill.name)),
    rows: new Map(),
    servers: knownServers(db),
    sessions: db.capabilityCalls.sessionsById(),
  };
  const recent = paths.filter(
    (path) => existsSync(path) && statSync(path).mtimeMs >= since
  );
  for (const path of recent) {
    await scanTranscript(path, since, found);
  }
  for (const command of found.commands) {
    if (found.known.has(command.name)) {
      tally(
        found.rows,
        command.instanceId,
        [{ kind: "skill", name: command.name }],
        command.at
      );
    }
  }

  const all = [...found.rows.values()];
  db.capabilityCalls.add(all);
  const byKind = { skill: 0, tool: 0, mcp: 0 };
  for (const row of all) {
    byKind[row.kind] += row.count;
  }
  console.log(
    `[usage] backfill from ${recent.length} transcripts touched in ${BACKFILL_DAYS} days: ${byKind.skill} skill, ${byKind.tool} tool, ${byKind.mcp} mcp uses`
  );
}

/** Decayed usage per `${kind}:${name}`: Σ count × 0.5^(age_days / half-life). */
export function usageScores(
  db: DbShape,
  now = new Date()
): Map<string, number> {
  const today = Date.parse(dayOf(now));
  const scores = new Map<string, number>();
  for (const row of db.capabilityCalls.since(
    dayOf(new Date(now.getTime() - SCORE_WINDOW_DAYS * DAY_MS))
  )) {
    const age = (today - Date.parse(row.day)) / DAY_MS;
    const key = `${row.kind}:${row.name}`;
    scores.set(
      key,
      (scores.get(key) ?? 0) + row.count * 0.5 ** (age / USAGE_HALF_LIFE_DAYS)
    );
  }
  return scores;
}
