import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import type { NeutralMessage } from "@cawco/core";
import { transcriptIndexPath } from "@cawco/core/paths";
import type { DbShape } from "./db";

/**
 * Which skills, tools and MCP servers the operator's sessions actually use,
 * counted per day from the frames the hub already relays. The composer's
 * suggestions rank their candidates by it (see `suggest.ts`).
 *
 * - A `tool_use` counts one `tool` use of its name.
 * - An `mcp__<server>__<tool>` call also counts one `mcp` use of `<server>`.
 * - Claude's `Skill` tool (`input.skill`) and opencode's `skill` tool
 *   (`input.name`) count a `skill` use instead of a tool use. pi has no skill
 *   tool, so it contributes tools only.
 * - A user turn opening with `<command-name>/x</command-name>` counts a skill
 *   use of `x` when `x` is a known skill.
 */

export type CapabilityKind = "skill" | "tool" | "mcp";
export interface CapabilityUse {
  kind: CapabilityKind;
  name: string;
}

/** A use's weight halves every this many days. Our own call, to be tuned. */
export const USAGE_HALF_LIFE_DAYS = 14;
/** How far back the one-time backfill reads. */
const BACKFILL_DAYS = 30;
/** Rows older than this weigh under 0.3% at a 14-day half-life, so they are not read. */
const SCORE_WINDOW_DAYS = 120;
const DAY_MS = 86_400_000;

const COMMAND_NAME = /<command-name>\/?([^<\s]+)<\/command-name>/;

/** Local calendar date, `YYYY-MM-DD`. */
export const dayOf = (at: Date): string => at.toLocaleDateString("en-CA");

/** The uses in one assistant message's content blocks. */
export function usesInBlocks(blocks: unknown): CapabilityUse[] {
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
    const input = block.input ?? {};
    if (block.name === "Skill" && typeof input.skill === "string") {
      uses.push({ kind: "skill", name: input.skill });
    } else if (block.name === "skill" && typeof input.name === "string") {
      uses.push({ kind: "skill", name: input.name });
    } else {
      uses.push({ kind: "tool", name: block.name });
      if (block.name.startsWith("mcp__")) {
        uses.push({ kind: "mcp", name: block.name.split("__")[1] });
      }
    }
  }
  return uses;
}

/** The slash command a user turn opens with, if it is one. */
function commandName(content: unknown): string | undefined {
  const text =
    typeof content === "string"
      ? content
      : (Array.isArray(content) ? content : [])
          .map((block: { type?: string; text?: string }) =>
            block.type === "text" ? (block.text ?? "") : ""
          )
          .join("");
  return COMMAND_NAME.exec(text)?.[1];
}

/** A skill named by a slash command the operator typed, when it is one. */
function commandSkill(
  content: unknown,
  known: Set<string>
): string | undefined {
  const name = commandName(content);
  return name && known.has(name) ? name : undefined;
}

/** Folds uses into per-day rows ready for `addCapabilityUsage`. */
const tally = (
  rows: Map<
    string,
    { kind: CapabilityKind; name: string; day: string; count: number }
  >,
  uses: CapabilityUse[],
  day: string
): void => {
  for (const use of uses) {
    const key = `${use.kind}\u0000${use.name}\u0000${day}`;
    const row = rows.get(key);
    if (row) {
      row.count += 1;
    } else {
      rows.set(key, { ...use, day, count: 1 });
    }
  }
};

/** Counts live frames. Called beside the rule engine on every relayed frame. */
export class UsageCounter {
  readonly #db: DbShape;
  /** Each session's skills, from its newest `init`, for slash-command matching. */
  readonly #skills = new Map<string, Set<string>>();

  constructor(db: DbShape) {
    this.#db = db;
  }

  forget(instanceId: string): void {
    this.#skills.delete(instanceId);
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
      uses = usesInBlocks(frame.message?.content);
    } else if (frame.type === "user") {
      const skill = commandSkill(
        frame.message?.content,
        this.#skills.get(instanceId) ?? new Set()
      );
      uses = skill ? [{ kind: "skill", name: skill }] : [];
    }
    if (uses.length === 0) {
      return;
    }
    const rows = new Map();
    tally(rows, uses, dayOf(new Date()));
    this.#db.addCapabilityUsage([...rows.values()]);
  }
}

type UsageRows = Map<
  string,
  { kind: CapabilityKind; name: string; day: string; count: number }
>;

/** One transcript line, as much of it as the backfill reads. */
interface TranscriptLine {
  message?: { content?: unknown };
  timestamp?: string;
  type?: string;
}

/**
 * Tallies one transcript's tool uses into `rows`, notes every skill the
 * `Skill` tool loaded into `known`, and collects its slash commands for
 * matching once every file has been read.
 */
async function scanTranscript(
  path: string,
  since: number,
  found: {
    rows: UsageRows;
    known: Set<string>;
    commands: { name: string; day: string }[];
  }
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
    const at = Date.parse(entry.timestamp ?? "");
    if (!(at >= since)) {
      continue;
    }
    const day = dayOf(new Date(at));
    if (entry.type === "assistant") {
      const uses = usesInBlocks(entry.message?.content);
      for (const use of uses.filter((u) => u.kind === "skill")) {
        found.known.add(use.name);
      }
      tally(found.rows, uses, day);
    } else if (entry.type === "user") {
      const name = commandName(entry.message?.content);
      if (name) {
        found.commands.push({ name, day });
      }
    }
  }
}

/**
 * The one-time backfill: when nothing has been counted yet, read the last
 * {@link BACKFILL_DAYS} days of the Claude transcripts the agent's search
 * index already lists. The index only stores tool names, so the raw JSONL is
 * read for `Skill`'s `input.skill`. Slash-command skills are matched against
 * the fleet's skills plus every skill the `Skill` tool was seen loading.
 */
export async function backfillUsage(db: DbShape): Promise<void> {
  if (!db.capabilityUsageEmpty()) {
    return;
  }
  const indexPath = transcriptIndexPath();
  if (!existsSync(indexPath)) {
    console.log(
      `[usage] backfill skipped: no transcript index at ${indexPath}`
    );
    return;
  }
  const index = new Database(indexPath, { readonly: true });
  const paths = (
    index.query("SELECT path FROM files").all() as { path: string }[]
  ).map((row) => row.path);
  index.close();

  const since = Date.now() - BACKFILL_DAYS * DAY_MS;
  const found = {
    rows: new Map() as UsageRows,
    known: new Set(db.listSkills().map((skill) => skill.name)),
    commands: [] as { name: string; day: string }[],
  };
  const recent = paths.filter(
    (path) => existsSync(path) && statSync(path).mtimeMs >= since
  );
  for (const path of recent) {
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps memory flat on a month of transcripts
    await scanTranscript(path, since, found);
  }
  for (const command of found.commands) {
    if (found.known.has(command.name)) {
      tally(found.rows, [{ kind: "skill", name: command.name }], command.day);
    }
  }

  const all = [...found.rows.values()];
  db.addCapabilityUsage(all);
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
  for (const row of db.capabilityUsageSince(
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
