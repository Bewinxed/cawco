/**
 * Antigravity's stored conversations on this machine, read from agy's own
 * files and CawCo's note on each (agy-notes.ts), never through a running
 * agy:
 *
 * - every Antigravity account's home (core paths/harnesses.ts
 *   `agyAccountHome`), its store the app-data dir CawCo names
 *   (`AGY_APP_DATA`): the conversations CawCo ran;
 * - agy's own default home (`agyOwnHome`), its store `antigravity-cli`:
 *   the conversations the person started in agy's terminal (tsk-340
 *   story 14), read and never written. Its SQLite files are opened
 *   `immutable`, which writes nothing beside them, not even a lock.
 *
 * A conversation is one `brain/<id>/` whose transcript agy wrote. Its folder
 * and agy's title are in the store's `conversation_summaries` table
 * (`workspace_uris`, `title`), and CawCo's note outranks both (the folder
 * its host opened it in, the person's own title). The layout is the
 * project's `assets/b5b3ca96/REPORT.md` §5, §7.
 *
 */
import { constants, Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unlessGone } from "@cawco/core/absent";
import type {
  NeutralSessionInfo,
  SessionMessage,
} from "@cawco/core/session-messages";
import { withoutSkillMarkers } from "@cawco/core/skill-words";
import { typeFilter } from "@cawco/jsonl-parser";
import { Effect, Option, Schema } from "effect";
import { runSync } from "../daemon-runtime";
import {
  agyEntries,
  agyRequestOf,
  agySteps,
  readAgySteps,
} from "./agy-history";
import { type AgyNote, allAgyNotes, readAgyNote } from "./agy-notes";
import {
  type AgyStore,
  agyTranscriptPath,
  allStores,
  conversationIds,
  summariesFile,
} from "./agy-store-files";
import { lastPromptAt } from "./last-prompt";

/** What a store's summaries table says of one conversation. */
interface Summary {
  readonly cwd: string | undefined;
  readonly title: string | undefined;
}

/** Opens a SQLite file in agy's own home: read-only and `immutable`, which writes nothing beside it. */
// Two flags of their own bits: their sum is both set.
const UNTOUCHED = constants.SQLITE_OPEN_READONLY + constants.SQLITE_OPEN_URI;

/** The first folder of a summary's `workspace_uris` (`["file:///…"]`). */
const WorkspacesSchema = Schema.Array(Schema.String);
const decodeWorkspaces = Schema.decodeUnknownOption(
  Schema.fromJsonString(WorkspacesSchema)
);

const folderOf = (uris: string | null): string | undefined => {
  const first = Option.getOrUndefined(decodeWorkspaces(uris ?? ""))?.[0];
  if (!first?.startsWith("file://")) {
    return;
  }
  try {
    return fileURLToPath(first);
  } catch {
    return undefined;
  }
};

/**
 * Store `store`'s summaries, by conversation id: read-only, and in agy's own
 * home `immutable` too, so the read leaves nothing there. None when the
 * store keeps no such file, or one CawCo can't read.
 */
const summariesOf = (store: AgyStore): Map<string, Summary> => {
  const file = summariesFile(store.dir);
  const read = new Map<string, Summary>();
  if (!existsSync(file)) {
    return read;
  }
  runSync(
    Effect.acquireUseRelease(
      Effect.try(() =>
        store.accountId
          ? new Database(file, { readonly: true })
          : new Database(`file:${encodeURI(file)}?immutable=1`, UNTOUCHED)
      ),
      (database) =>
        Effect.try(() => {
          const rows = database
            .query<
              {
                id: string;
                title: string | null;
                uris: string | null;
              },
              []
            >(
              "SELECT conversation_id AS id, title, workspace_uris AS uris FROM conversation_summaries"
            )
            .all();
          for (const row of rows) {
            read.set(row.id, {
              cwd: folderOf(row.uris),
              title: row.title?.trim() || undefined,
            });
          }
        }),
      (database) => Effect.sync(() => database.close())
    ).pipe(Effect.orElseSucceed(() => undefined))
  );
  return read;
};

/** The lines a prompt can be on, before any is parsed. */
const PROMPT_LINES = typeFilter("USER_INPUT");

/** When the step `record` was sent, if it is a prompt the person sent. */
const promptAt = (record: { [key: string]: unknown }): number | undefined => {
  if (record.type !== "USER_INPUT" || record.source !== "USER_EXPLICIT") {
    return;
  }
  const at =
    typeof record.created_at === "string"
      ? Date.parse(record.created_at)
      : Number.NaN;
  return Number.isNaN(at) ? undefined : at;
};

/** How much of a transcript's head is read for its first prompt: agy's first line holds it. */
const HEAD_BYTES = 64 * 1024;

/** The first step of the transcript at `path`: its first prompt and when it began. */
const firstStepOf = async (
  path: string
): Promise<{ at?: number; prompt?: string }> => {
  const head = await Bun.file(path)
    .slice(0, HEAD_BYTES)
    .text()
    .catch(unlessGone(""));
  const [first] = agySteps(head.split("\n")[0] ?? "");
  if (!first) {
    return {};
  }
  const at = first.created_at ? Date.parse(first.created_at) : Number.NaN;
  return {
    ...(Number.isNaN(at) ? {} : { at }),
    ...(first.type === "USER_INPUT" && first.content
      ? { prompt: agyRequestOf(first.content) }
      : {}),
  };
};

/** Conversation `id` of `store` as the catalog lists it; none when agy wrote no transcript for it. */
const infoOf = async (
  store: AgyStore,
  id: string,
  summary: Summary | undefined,
  note: AgyNote
): Promise<NeutralSessionInfo | undefined> => {
  const path = agyTranscriptPath(store.dir, id);
  const file = await stat(path).catch(unlessGone(undefined));
  if (!file) {
    return;
  }
  const first = await firstStepOf(path);
  const wroteAt = await lastPromptAt(path, PROMPT_LINES, promptAt);
  const cwd = note.cwd ?? summary?.cwd;
  const title = note.customTitle ?? note.title ?? summary?.title;
  const createdAt = note.createdAt ?? first.at;
  return {
    sessionId: id,
    harness: "agy",
    lastModified: file.mtimeMs,
    fileSize: file.size,
    // The person's own, from agy's terminal; CawCo's, which a program ran.
    startedBy: store.accountId ? "program" : "person",
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(wroteAt === undefined ? {} : { wroteAt }),
    ...(cwd ? { cwd } : {}),
    ...(first.prompt ? { firstPrompt: withoutSkillMarkers(first.prompt) } : {}),
    ...(title ? { customTitle: title } : {}),
    ...(note.tag ? { tag: note.tag } : {}),
  };
};

/**
 * Every stored conversation on this machine, those run in `dir` alone when
 * it names one. A conversation of an account's home that CawCo's note
 * places on another account is that account's, and listed once.
 */
export const listAgyConversations = async (
  dir?: string
): Promise<NeutralSessionInfo[]> => {
  const notes = await allAgyNotes();
  const listed = new Map<string, NeutralSessionInfo>();
  for (const store of allStores()) {
    const summaries = summariesOf(store);
    for (const id of await conversationIds(store)) {
      if (listed.has(id)) {
        continue;
      }
      const info = await infoOf(
        store,
        id,
        summaries.get(id),
        notes.get(id) ?? {}
      );
      if (info && (!dir || info.cwd === dir)) {
        listed.set(id, info);
      }
    }
  }
  return [...listed.values()];
};

/** Where conversation `id` is stored: the store whose `brain/` holds it, the account CawCo's note names first. */
export const findAgyConversation = async (
  id: string
): Promise<AgyStore | undefined> => {
  const note = await readAgyNote(id);
  const stores = allStores();
  const ordered = note.accountId
    ? [
        ...stores.filter((one) => one.accountId === note.accountId),
        ...stores.filter((one) => one.accountId !== note.accountId),
      ]
    : stores;
  return ordered.find((store) => existsSync(join(store.dir, "brain", id)));
};

/** Conversation `id` as the catalog lists it; null when no store holds it. */
export const agyConversationInfo = async (
  id: string
): Promise<NeutralSessionInfo | null> => {
  const store = await findAgyConversation(id);
  if (!store) {
    return null;
  }
  return (
    (await infoOf(
      store,
      id,
      summariesOf(store).get(id),
      await readAgyNote(id)
    )) ?? null
  );
};

/**
 * Conversation `id`'s transcript entries, every compaction where it
 * happened and CawCo's stops of it where they were made; none when no
 * store holds it.
 */
export const agyConversationEntries = async (
  id: string
): Promise<SessionMessage[]> => {
  const store = await findAgyConversation(id);
  if (!store) {
    return [];
  }
  const steps = await readAgySteps(agyTranscriptPath(store.dir, id));
  const note = await readAgyNote(id);
  return agyEntries(steps, {
    sessionId: id,
    ...(note.stops ? { stops: note.stops } : {}),
  });
};

/** A model as agy's transcript names it, its thinking level after it. */
const LEVELLED = /^(.+)-(low|medium|high)$/u;

/** The model and thinking level agy last answered conversation `id` on (`gemini-3.8-flash-low`), from its transcript. */
export const agyLastModel = async (
  id: string
): Promise<{ effort?: string; model: string } | undefined> => {
  const store = await findAgyConversation(id);
  if (!store) {
    return;
  }
  const steps = await readAgySteps(agyTranscriptPath(store.dir, id));
  const named = steps.findLast((step) => step.model)?.model;
  if (!named) {
    return;
  }
  const level = LEVELLED.exec(named);
  return level?.[1] && level[2]
    ? { model: level[1], effort: level[2] }
    : { model: named };
};
