/**
 * A stored transcript's listing says when the person last sent a prompt in
 * it (core `NeutralSessionInfo.wroteAt`), read at its source by each
 * harness, never the file's or the session's last change: the dashboard's
 * Recent places a stored row by it, as a listed session by its `wroteAt`
 * ("Only what you do": an agent's reply never moves a row).
 *
 * Each harness lists a fixture conversation whose last prompt is followed
 * by replies, tool calls and their results (and, for Claude, a skill's
 * hidden text, the CLI's line for a stopped turn and a 300 KB tool result,
 * so the read steps back past several of its 64 KiB steps):
 *
 * - claude: the agent's Claude listing (claude.ts `listSessions`, unscoped
 *   and scoped to the folder, and `getSessionInfo`) answers the prompt's
 *   time; relisting the file unchanged reads none of it (its bytes made
 *   unreadable, the answer stands); a prompt appended moves it.
 * - opencode: the store read the listing makes (opencode-reads.ts
 *   `sessions`, one query) over a 2.0 database, mapped as the listing maps it
 *   (opencode.ts `sessionToInfo`), answers the last `user` message's time; a
 *   session with no user message has none.
 * - pi: pi's listing (pi-services.ts `listSessions`) over a session pi's
 *   own SessionManager wrote answers the last `user` message's time, where
 *   pi's own `modified` is its last message of either side.
 *
 *   bun scripts/probe-kit/run.ts stored-wrote-at
 */
import { Database } from "bun:sqlite";
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

/** When the fixtures' conversations start: a fixed moment, far before the files' own change time. */
const T0 = Date.UTC(2026, 10, 9, 9, 0, 0);
const at = (seconds: number): number => T0 + seconds * 1000;
const iso = (seconds: number): string => new Date(at(seconds)).toISOString();

const CLAUDE_ID = "5e55a0b0-0000-4000-8000-0000000c1a0d";

/** A Claude Code transcript as the CLI writes it: a chain of records, each under the one before. */
function claudeRecords(cwd: string): Record<string, unknown>[] {
  let parent: string | null = null;
  let n = 0;
  const record = (
    seconds: number,
    type: "user" | "assistant",
    message: unknown,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => {
    n += 1;
    const uuid = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const out = {
      parentUuid: parent,
      isSidechain: false,
      userType: "external",
      cwd,
      sessionId: CLAUDE_ID,
      version: "2.1.280",
      gitBranch: "main",
      type,
      message,
      uuid,
      timestamp: iso(seconds),
      ...extra,
    };
    parent = uuid;
    return out;
  };
  const prompt = (seconds: number, text: string) =>
    record(seconds, "user", { role: "user", content: text });
  const said = (seconds: number, text: string) =>
    record(seconds, "assistant", {
      id: `msg_${seconds}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  const call = (seconds: number, id: string, command: string) =>
    record(seconds, "assistant", {
      id: `msg_${seconds}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "tool_use", id, name: "Bash", input: { command } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  const result = (seconds: number, id: string, text: string) =>
    record(
      seconds,
      "user",
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: id, content: text }],
      },
      { toolUseResult: { stdout: text, stderr: "", interrupted: false } }
    );
  return [
    prompt(0, "The tray chip overflows at 390; find why"),
    call(5, "toolu_01", "rg -n chip src"),
    result(6, "toolu_01", "src/lib/Tray.svelte:12: <Chip"),
    said(10, "The chip has no min-width: 0 in its flex row."),
    // The person's last prompt: what the listing answers.
    prompt(60, "Fix it in the chip itself, then check it at 390"),
    record(
      61,
      "user",
      { role: "user", content: "Base directory for this skill: …" },
      { isMeta: true }
    ),
    call(70, "toolu_02", "bun run build"),
    result(80, "toolu_02", `build log ${"x".repeat(300 * 1024)}`),
    call(85, "toolu_03", "bun run check"),
    result(86, "toolu_03", "check: 0 errors"),
    record(90, "user", {
      role: "user",
      content: [{ type: "text", text: "[Request interrupted by user]" }],
    }),
    said(100, "The chip now holds its row at 390; the check passes."),
  ];
}

const jsonl = (records: Record<string, unknown>[]): string =>
  records.map((one) => `${JSON.stringify(one)}\n`).join("");

/** The Claude listing over a transcript in the scratch HOME's config dir. */
async function claude(kit: Kit, home: string): Promise<void> {
  const { check } = kit;
  const cwd = join(home, "work", "storefront");
  mkdirSync(cwd, { recursive: true });
  const { claudeHarness } =
    await import("../../../packages/agent/src/harnesses/claude");
  const { claudePromptAt, CLAUDE_PROMPT_TYPES } =
    await import("../../../packages/agent/src/harnesses/claude-transcript");
  const { lastPromptAt } =
    await import("../../../packages/agent/src/harnesses/last-prompt");
  const { claudeHome, projectSlug } =
    await import("../../../packages/core/src/paths");
  const folder = join(claudeHome(), "projects", projectSlug(cwd));
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${CLAUDE_ID}.jsonl`);
  writeFileSync(file, jsonl(claudeRecords(cwd)));

  const listed = (await claudeHarness.listSessions()).find(
    (one) => one.sessionId === CLAUDE_ID
  );
  check(
    `claude: the listing answers the last prompt's time (${listed?.wroteAt ? new Date(listed.wroteAt).toISOString() : "none"}), not the file's change (${listed ? new Date(listed.lastModified).toISOString() : "unlisted"})`,
    listed?.wroteAt === at(60) && listed.lastModified > at(100),
    JSON.stringify(listed)
  );
  const scoped = (await claudeHarness.listSessions(cwd)).find(
    (one) => one.sessionId === CLAUDE_ID
  );
  check(
    "claude: the listing scoped to the folder (the SDK's own) answers the same",
    scoped?.wroteAt === at(60),
    JSON.stringify(scoped)
  );
  const info = await claudeHarness.getSessionInfo(CLAUDE_ID, cwd);
  check(
    "claude: one session's info answers the same",
    info?.wroteAt === at(60),
    JSON.stringify(info)
  );

  // Its bytes unreadable, its size and change time as they were: an answer
  // still given is one kept, the file read for none of it.
  chmodSync(file, 0o000);
  const kept = await lastPromptAt(file, CLAUDE_PROMPT_TYPES, claudePromptAt);
  chmodSync(file, 0o644);
  check(
    "claude: relisting the unchanged file reads none of it (its bytes unreadable, the kept answer stands)",
    kept === at(60),
    String(kept)
  );

  appendFileSync(
    file,
    jsonl([
      {
        parentUuid: null,
        isSidechain: false,
        type: "user",
        message: { role: "user", content: "Now the same at 1440" },
        uuid: "00000000-0000-4000-8000-0000000000ff",
        timestamp: iso(200),
        sessionId: CLAUDE_ID,
        cwd,
      },
    ])
  );
  const moved = (await claudeHarness.listSessions()).find(
    (one) => one.sessionId === CLAUDE_ID
  );
  check(
    "claude: a prompt appended moves it to that prompt",
    moved?.wroteAt === at(200),
    JSON.stringify(moved?.wroteAt)
  );
}

/** OpenCode 2.0's tables as far as the listing reads them, and the index it reads the last user message by. */
const OPENCODE_SCHEMA = `
  CREATE TABLE session_v2 (
    id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT NOT NULL,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
  );
  CREATE TABLE session_message (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
  );
  CREATE INDEX session_message_session_time_created_id_idx
    ON session_message (session_id, time_created, id);
`;

/** The OpenCode listing's store read over a 2.0 database in the scratch data home. */
async function opencode(kit: Kit, home: string): Promise<void> {
  const { check } = kit;
  const dir = join(home, ".local", "share", "opencode");
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "opencode.db"));
  db.exec(OPENCODE_SCHEMA);
  const cwd = join(home, "work", "socials");
  const session = db.query(
    "INSERT INTO session_v2 (id, parent_id, title, directory, time_created, time_updated) VALUES (?, NULL, ?, ?, ?, ?)"
  );
  session.run("ses_written", "Weekly post drafts", cwd, at(0), at(500));
  session.run("ses_unwritten", "Started, never asked", cwd, at(0), at(5));
  const message = db.query(
    "INSERT INTO session_message (id, session_id, type, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const rows: [string, string, "user" | "assistant", number][] = [
    ["msg_01", "ses_written", "user", 0],
    ["msg_02", "ses_written", "assistant", 20],
    // The person's last message: what the listing answers.
    ["msg_03", "ses_written", "user", 60],
    // The reply: its text, a tool call and the tool's answer in its content.
    ["msg_04", "ses_written", "assistant", 70],
    ["msg_05", "ses_written", "assistant", 500],
    ["msg_06", "ses_unwritten", "assistant", 5],
  ];
  for (const [id, sessionId, type, seconds] of rows) {
    message.run(
      id,
      sessionId,
      type,
      at(seconds),
      at(seconds),
      JSON.stringify(
        type === "user"
          ? { text: "Draft this week's posts", time: { created: at(seconds) } }
          : {
              content: [
                { type: "text", text: "Drafting." },
                {
                  type: "tool",
                  name: "read",
                  state: {
                    status: "completed",
                    content: [{ type: "text", text: "brief.md" }],
                  },
                },
              ],
              time: { created: at(seconds), completed: at(seconds) + 1 },
            }
      )
    );
  }
  db.close();

  const { opencodeReads } =
    await import("../../../packages/agent/src/stores/opencode-reads");
  const { sessionToInfo } =
    await import("../../../packages/agent/src/harnesses/opencode");
  const listed = (await opencodeReads.sessions({})).map((one) =>
    sessionToInfo(one)
  );
  const written = listed.find((one) => one.sessionId === "ses_written");
  check(
    `opencode: the listing answers the last user message's time (${written?.wroteAt ? new Date(written.wroteAt).toISOString() : "none"}), not the session's last update (${written ? new Date(written.lastModified).toISOString() : "unlisted"})`,
    written?.wroteAt === at(60) && written.lastModified === at(500),
    JSON.stringify(written)
  );
  const unwritten = listed.find((one) => one.sessionId === "ses_unwritten");
  check(
    "opencode: a session with no user message has no time",
    unwritten !== undefined && unwritten.wroteAt === undefined,
    JSON.stringify(unwritten)
  );
}

/** pi's listing over a session pi's own SessionManager wrote. */
async function pi(kit: Kit, home: string): Promise<void> {
  const { check } = kit;
  const cwd = join(home, "work", "paperwork");
  mkdirSync(cwd, { recursive: true });
  const { SessionManager } = await import("@earendil-works/pi-coding-agent");
  const manager = SessionManager.create(cwd);
  const usage = {
    input: 10,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 30,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const assistant = (seconds: number, content: unknown[], stop = "stop") =>
    manager.appendMessage({
      role: "assistant",
      content,
      api: "openai-completions",
      provider: "probe",
      model: "probe-1",
      usage,
      stopReason: stop,
      timestamp: at(seconds),
    } as never);
  const prompt = (seconds: number, text: string) =>
    manager.appendMessage({
      role: "user",
      content: text,
      timestamp: at(seconds),
    } as never);
  const result = (seconds: number, callId: string, text: string) =>
    manager.appendMessage({
      role: "toolResult",
      toolCallId: callId,
      toolName: "bash",
      content: [{ type: "text", text }],
      isError: false,
      timestamp: at(seconds),
    } as never);
  prompt(0, "Sort the 2026 tax receipts by month");
  assistant(10, [{ type: "text", text: "Reading the folder." }]);
  // The person's last prompt: what the listing answers.
  prompt(60, "Now total each month");
  assistant(
    70,
    [
      {
        type: "toolCall",
        id: "call_1",
        name: "bash",
        arguments: { command: "ls" },
      },
    ],
    "toolUse"
  );
  result(75, "call_1", "jan.pdf feb.pdf mar.pdf");
  manager.appendCustomMessageEntry(
    "cawco-notice",
    "A background shell ended",
    true
  );
  assistant(90, [
    { type: "text", text: "January 412, February 380, March 455." },
  ]);
  const id = manager.getSessionId();

  const { PiProfile } =
    await import("../../../packages/agent/src/harnesses/pi-services");
  const listed = (await new PiProfile().listSessions(cwd)).find(
    (one) => one.sessionId === id
  );
  check(
    `pi: the listing answers the last user message's time (${listed?.wroteAt ? new Date(listed.wroteAt).toISOString() : "none"}), where pi's own last message is the reply (${listed ? new Date(listed.lastModified).toISOString() : "unlisted"})`,
    listed?.wroteAt === at(60) && listed.lastModified === at(90),
    JSON.stringify(listed)
  );
}

export default {
  group: "The hub and machines",
  name: "stored-wrote-at",
  ownHome:
    "it writes Claude Code's, OpenCode's and pi's stored conversations where each harness keeps them, under a HOME of its own, before any module that reads those places loads",
  run: async (kit: Kit) => {
    const home = homedir();
    const { claudeHome } = await import("../../../packages/core/src/paths");
    process.env.CLAUDE_CONFIG_DIR = claudeHome();
    process.env.XDG_DATA_HOME = join(home, ".local", "share");
    process.env.PI_CODING_AGENT_DIR = join(home, ".pi", "agent");
    await claude(kit, home);
    await opencode(kit, home);
    await pi(kit, home);
  },
} satisfies Spec;
