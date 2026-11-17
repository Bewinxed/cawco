/**
 * Codex's stored threads, read through its own app-server (`thread/list`,
 * `thread/turns/list`, `thread/name/set`, `thread/delete`, thread
 * attachments: Codex audit 2026-11-17, C-i), never by parsing its rollout
 * files, whose format Codex calls no stable interface. Every account's home
 * shares one thread store (codex-home.ts), so a read runs in a home of its
 * own that holds no sign-in: reading needs none.
 */
import { lstat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { makeFolder } from "@cawco/core/folders";
import { codexStoreDir } from "@cawco/core/paths/harnesses";
import { hostEnvironment } from "@cawco/core/session-env";
import type {
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  SessionMessage,
} from "@cawco/core/session-messages";
import { writeStateFile } from "@cawco/core/state-file";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
import { toolPath } from "../tools";
import { codexToStart } from "./codex-home";
import { toolResultOf, toolUseOf } from "./codex-items";
import type * as V2 from "./codex-protocol/v2.gen";
import { type CodexPeer, withAppServer } from "./codex-rpc";

/** The home a read runs in: the shared store, no sign-in. */
const readerHome = (): string => join(codexStoreDir(), "reader");

/** `work` against a one-off app-server over the shared store. */
export const inStore = async <T>(
  work: (peer: CodexPeer) => Promise<T>
): Promise<T> => {
  const bin = await codexToStart();
  const home = readerHome();
  const store = codexStoreDir();
  await makeFolder(join(store, "db"));
  await makeFolder(join(store, "sessions"));
  await makeFolder(home);
  const link = join(home, "sessions");
  if (!(await lstat(link).catch(() => undefined))) {
    await symlink(join(store, "sessions"), link);
  }
  await writeStateFile(
    join(home, "config.toml"),
    Bun.TOML.stringify({
      check_for_update_on_startup: false,
      sqlite_home: join(store, "db"),
      analytics: { enabled: false },
    }),
    { mode: 0o600 }
  );
  const env = hostEnvironment();
  for (const name of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"]) {
    delete env[name];
  }
  return await withAppServer(
    bin,
    { ...env, PATH: toolPath(), CODEX_HOME: home },
    work
  );
};

/** A thread as CawCo's catalog lists a stored session. */
const sessionInfoOf = (thread: V2.Thread): NeutralSessionInfo => ({
  harness: "codex",
  sessionId: thread.id,
  cwd: thread.cwd,
  createdAt: thread.createdAt * 1000,
  lastModified: thread.updatedAt * 1000,
  ...(thread.preview ? { firstPrompt: thread.preview } : {}),
  ...(thread.name ? { customTitle: thread.name } : {}),
  ...(thread.gitInfo?.branch ? { gitBranch: thread.gitInfo.branch } : {}),
});

/** The threads stored for `dir` (every folder's when none), newest first, each page followed. */
export const listCodexThreads = (dir?: string): Promise<NeutralSessionInfo[]> =>
  inStore(async (peer) => {
    const threads: NeutralSessionInfo[] = [];
    let cursor: string | null = null;
    do {
      const page: V2.ThreadListResponse = await peer.request("thread/list", {
        ...(dir ? { cwd: dir } : {}),
        limit: 100,
        cursor,
        // Every provider's: a listing names only its home's own provider's
        // otherwise, and the reading home names none.
        modelProviders: [],
      });
      threads.push(
        ...page.data
          .filter((thread) => !thread.parentThreadId)
          .map(sessionInfoOf)
      );
      cursor = page.nextCursor;
    } while (cursor);
    return threads;
  });

/** One stored thread; null when the store holds none under `threadId`. */
export const readCodexThread = (
  threadId: string
): Promise<NeutralSessionInfo | null> =>
  inStore(async (peer) => {
    try {
      const read = await peer.request("thread/read", { threadId });
      return sessionInfoOf(read.thread);
    } catch {
      return null;
    }
  });

/** Every turn of a stored thread, oldest first, with its items whole. */
const turnsOf = async (
  peer: CodexPeer,
  threadId: string
): Promise<V2.Turn[]> => {
  const turns: V2.Turn[] = [];
  let cursor: string | null = null;
  do {
    const page: V2.ThreadTurnsListResponse = await peer.request(
      "thread/turns/list",
      {
        threadId,
        cursor,
        limit: 50,
        sortDirection: "asc",
        itemsView: "full",
      }
    );
    turns.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return turns;
};

const entry = (
  threadId: string,
  type: SessionMessage["type"],
  uuid: string,
  message: unknown,
  at: number | null | undefined,
  extra: Partial<SessionMessage> = {}
): SessionMessage => ({
  type,
  uuid,
  session_id: threadId,
  message,
  parent_tool_use_id: null,
  parent_agent_id: null,
  ...(typeof at === "number" ? { timestamp: new Date(at).toISOString() } : {}),
  ...extra,
});

const userText = (content: V2.UserInput[]): string =>
  content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

/** A tool item's call and result, as the live stream says them (codex-session.ts). */
const toolEntries = (
  threadId: string,
  item: V2.ThreadItem,
  call: { input: unknown; name: string },
  result: { content: unknown; isError: boolean } | undefined
): SessionMessage[] => {
  const use: NeutralAssistantBlock = {
    type: "tool_use",
    id: item.id,
    name: call.name,
    input: call.input,
  };
  const entries = [
    entry(
      threadId,
      "assistant",
      `${item.id}:call`,
      { role: "assistant", content: [use] },
      item.startedAtMs
    ),
  ];
  if (result) {
    const block: NeutralContentBlock = {
      type: "tool_result",
      tool_use_id: item.id,
      content: result.content,
      is_error: result.isError,
    };
    entries.push(
      entry(
        threadId,
        "user",
        `${item.id}:result`,
        { role: "user", content: [block] },
        item.completedAtMs
      )
    );
  }
  return entries;
};

/** One item of a thread as its stored entries; `turnEnd` on the turn's last answer. */
const itemEntries = (
  threadId: string,
  item: V2.ThreadItem,
  turnEnd: boolean
): SessionMessage[] => {
  if (item.type === "userMessage") {
    return [
      entry(
        threadId,
        "user",
        item.id,
        { role: "user", content: userText(item.content) },
        item.startedAtMs,
        item.clientId ? { sourceUuid: item.clientId } : {}
      ),
    ];
  }
  if (item.type === "agentMessage") {
    return [
      entry(
        threadId,
        "assistant",
        item.id,
        { role: "assistant", content: [{ type: "text", text: item.text }] },
        item.completedAtMs,
        turnEnd ? { turnEnd: true } : {}
      ),
    ];
  }
  if (item.type === "reasoning") {
    const thinking = [...item.summary, ...item.content].join("\n\n");
    return thinking
      ? [
          entry(
            threadId,
            "assistant",
            item.id,
            { role: "assistant", content: [{ type: "thinking", thinking }] },
            item.completedAtMs
          ),
        ]
      : [];
  }
  if (item.type === "contextCompaction") {
    return [
      entry(
        threadId,
        "system",
        item.id,
        {
          type: "system",
          subtype: "compact_boundary",
          uuid: item.id,
          compact_metadata: { trigger: "manual" },
        },
        item.completedAtMs
      ),
    ];
  }
  const call = toolUseOf(item);
  return call ? toolEntries(threadId, item, call, toolResultOf(item)) : [];
};

/** A turn's items as stored entries, its last answer marked as the turn's end. */
const turnEntries = (threadId: string, turn: V2.Turn): SessionMessage[] => {
  const lastAnswer =
    turn.status === "completed"
      ? turn.items.findLast((item) => item.type === "agentMessage")?.id
      : undefined;
  const entries = turn.items.flatMap((item) =>
    itemEntries(threadId, item, item.id === lastAnswer)
  );
  if (turn.status === "failed" && turn.error) {
    entries.push(
      entry(
        threadId,
        "assistant",
        `${turn.id}:error`,
        {
          role: "assistant",
          content: [{ type: "text", text: turn.error.message }],
        },
        turn.completedAt === null ? undefined : turn.completedAt * 1000,
        { error: turn.error.message }
      )
    );
  }
  return entries;
};

/** Every entry of a stored thread, oldest first. */
export const codexEntries = (threadId: string): Promise<SessionMessage[]> =>
  inStore(async (peer) =>
    (await turnsOf(peer, threadId)).flatMap((turn) =>
      turnEntries(threadId, turn)
    )
  );

/** Whether `entry` starts a turn: a window starts at one. */
const startsTurn = (one: SessionMessage | undefined): boolean =>
  one?.type === "user" && one.sourceUuid !== undefined
    ? true
    : one?.type === "user" &&
      typeof one.message === "object" &&
      one.message !== null &&
      "content" in one.message &&
      typeof one.message.content === "string";

/**
 * The window `ask` names of `entries`: about `limit` of them, widened back
 * to the start of a turn. The whole thread is read for it: Codex pages a
 * thread by turn, and an entry is CawCo's own cut of a turn's items.
 */
export const windowOf = (
  all: SessionMessage[],
  ask: WindowAsk
): TranscriptWindow => {
  let entries = all;
  if ("through" in ask) {
    const cut = all.findIndex((one) => one.uuid === ask.through);
    entries = cut >= 0 ? all.slice(0, cut + 1) : all;
  }
  const at = (id: string): number =>
    entries.findIndex((one) => one.uuid === id);
  let from: number;
  let to: number;
  if ("start" in ask) {
    from = ask.start === null ? 0 : Math.max(0, at(ask.start));
    to = Math.min(entries.length, from + ask.limit);
    while (to < entries.length && !startsTurn(entries[to])) {
      to += 1;
    }
  } else {
    to = "before" in ask ? Math.max(0, at(ask.before)) : entries.length;
    from = Math.max(0, to - ask.limit);
  }
  while (from > 0 && !startsTurn(entries[from])) {
    from -= 1;
  }
  return {
    entries: entries.slice(from, to),
    older: from > 0 ? (entries[from]?.uuid ?? null) : null,
    newer:
      "start" in ask && to < entries.length
        ? (entries[to]?.uuid ?? null)
        : null,
  };
};

/** A stored thread renamed in Codex's own store (`thread/name/set`). */
export const renameCodexThread = (
  threadId: string,
  name: string
): Promise<void> =>
  inStore(async (peer) => {
    await peer.request("thread/name/set", { threadId, name });
  });

/** A stored thread deleted, with the subagents it spawned (`thread/delete`). */
export const deleteCodexThread = (threadId: string): Promise<void> =>
  inStore(async (peer) => {
    await peer.request("thread/delete", { threadId });
  });

/** A tag kept on a stored thread, as a thread attachment of CawCo's (C-i). */
export const tagCodexThread = (
  threadId: string,
  tag: string | null
): Promise<void> =>
  inStore(async (peer) => {
    await peer.request("thread/attachment/add", {
      threadId,
      attachmentType: "cawco_tag",
      identityKey: "tag",
      payload: { tag },
    });
  });

/** What a stored thread last ran with, by Codex's own record of it. */
export const codexThreadRan = (
  threadId: string
): Promise<{ effort: string | null; model: string | null; provider: string }> =>
  inStore(async (peer) => {
    const { thread } = await peer.request("thread/read", { threadId });
    return {
      model: thread.model,
      effort: thread.reasoningEffort,
      provider: thread.modelProvider,
    };
  });
