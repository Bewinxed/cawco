/**
 * The files of agy's conversation stores: where each home keeps them, and a
 * conversation deleted from an account's home, every file agy keeps of it
 * and its rows in the store's shared files (the project's
 * `assets/b5b3ca96/REPORT.md` §5, §6).
 *
 * agy rebuilds a summary row from `jetbox_summaries_proto.pb` as it starts,
 * and an agy running on the same home may write that file back from what
 * it holds, so each deleted id is also kept in the home's own list
 * ({@link DELETED_LIST}), applied again before every agy launch on the
 * home and as each agy there ends ({@link applyAgyDeletes}).
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { accountsRoot } from "@cawco/core/paths/claude";
import {
  AGY_APP_DATA,
  AGY_OWN_APP_DATA,
  agyAccountHome,
  agyAccountRecord,
  agyOwnHome,
} from "@cawco/core/paths/harnesses";
import { writeStateFile } from "@cawco/core/state-file";
import { Option, Schema } from "effect";
import { agyCarryFile } from "./agy-carry";
import { removeAgyNote } from "./agy-notes";

/** One agy home's store of conversations. */
export interface AgyStore {
  /** The account whose home it is; none for agy's own default home. */
  readonly accountId: string | undefined;
  /** Its app-data dir, where its conversations are. */
  readonly dir: string;
  readonly home: string;
}

/** The store of account `accountId`'s home. */
export const accountStore = (accountId: string): AgyStore => {
  const home = agyAccountHome(accountId);
  return { accountId, home, dir: join(home, AGY_APP_DATA) };
};

/** The store of agy's own default home. */
const ownStore = (): AgyStore => {
  const home = agyOwnHome();
  return { accountId: undefined, home, dir: join(home, AGY_OWN_APP_DATA) };
};

/** The accounts with an Antigravity record on this machine. */
export const agyAccountIds = (): string[] => {
  try {
    return readdirSync(accountsRoot(), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && existsSync(agyAccountRecord(entry.name))
      )
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }
};

/** Every store on this machine: each account's, then agy's own when it has one. */
export const allStores = (): AgyStore[] => [
  ...agyAccountIds().map(accountStore),
  ...(existsSync(ownStore().dir) ? [ownStore()] : []),
];

/** The conversation ids `store` holds: each `brain/<id>/` dir. */
export const conversationIds = async (store: AgyStore): Promise<string[]> =>
  (await readdir(join(store.dir, "brain")).catch(unlessGone([]))).filter(
    (name) => !name.startsWith(".")
  );

/** The transcript of conversation `id` in agy's app-data dir `store`. */
export const agyTranscriptPath = (store: string, id: string): string =>
  join(
    store,
    "brain",
    id,
    ".system_generated",
    "logs",
    "transcript_full.jsonl"
  );

/** The summaries file of store `dir`, agy's index of its conversations. */
export const summariesFile = (dir: string): string =>
  join(dir, "conversation_summaries.db");

// ------------------------------------------------------------ delete

/** The ids deleted from a home, applied again at each launch there: in the home, beside the store, which agy reads nothing of. */
const DELETED_LIST = "cawco-deleted.json";

const DeletedSchema = Schema.Array(Schema.String);
const decodeDeleted = Schema.decodeUnknownOption(
  Schema.fromJsonString(DeletedSchema)
);

const deletedListOf = (home: string): string => join(home, DELETED_LIST);

/** The ids deleted from `home`. */
const readDeleted = async (home: string): Promise<string[]> => [
  ...Option.getOrElse(
    decodeDeleted(
      await readFile(deletedListOf(home), "utf8").catch(unlessGone(""))
    ),
    () => []
  ),
];

/** Reads one protobuf varint of `bytes` at `at`: its value and where the next field begins. */
const varint = (bytes: Uint8Array, at: number): [number, number] => {
  let value = 0;
  let shift = 0;
  let next = at;
  for (;;) {
    const byte = bytes[next];
    if (byte === undefined) {
      throw new Error("a varint runs past the end");
    }
    next += 1;
    value += (byte % 128) * 2 ** shift;
    shift += 7;
    if (byte < 128) {
      return [value, next];
    }
  }
};

/** Wire type 2: a length-delimited field. */
const LENGTH_DELIMITED = 2;

/**
 * agy's `jetbox_summaries_proto.pb` without the entries of `ids`: the file
 * is a repeated field 1, each a map entry whose own field 1 is the
 * conversation id (§5). Every other field is kept byte for byte. Undefined
 * when it holds none of them.
 */
const withoutEntries = (
  bytes: Uint8Array,
  ids: ReadonlySet<string>
): Uint8Array | undefined => {
  const kept: Uint8Array[] = [];
  let dropped = 0;
  let at = 0;
  while (at < bytes.length) {
    const start = at;
    const [key, afterKey] = varint(bytes, at);
    if (key % 8 !== LENGTH_DELIMITED) {
      throw new Error(
        "jetbox_summaries_proto.pb holds a field CawCo can't read"
      );
    }
    const [size, body] = varint(bytes, afterKey);
    at = body + size;
    const entry = bytes.subarray(body, at);
    let named: string | undefined;
    if (Math.floor(key / 8) === 1 && entry.length > 0) {
      const [inner, afterInner] = varint(entry, 0);
      if (Math.floor(inner / 8) === 1 && inner % 8 === LENGTH_DELIMITED) {
        const [length, text] = varint(entry, afterInner);
        named = new TextDecoder().decode(entry.subarray(text, text + length));
      }
    }
    if (named !== undefined && ids.has(named)) {
      dropped += 1;
    } else {
      kept.push(bytes.subarray(start, at));
    }
  }
  return dropped > 0 ? Buffer.concat(kept) : undefined;
};

/** The ids of `ids` that `dir`'s summaries hold rows of, removed there. */
const dropSummaryRows = (dir: string, ids: readonly string[]): void => {
  const file = summariesFile(dir);
  if (!existsSync(file) || ids.length === 0) {
    return;
  }
  const database = new Database(file);
  try {
    database.run("PRAGMA busy_timeout = 5000");
    const marks = ids.map(() => "?").join(", ");
    database.run(
      `DELETE FROM conversation_summaries WHERE conversation_id IN (${marks})`,
      [...ids]
    );
  } finally {
    database.close();
  }
};

/** The conversations `ids` kept out of store `dir`'s shared files: their summary rows and their jetbox entries removed. */
const dropFromShared = async (
  dir: string,
  ids: readonly string[]
): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  dropSummaryRows(dir, ids);
  const jetbox = join(dir, "jetbox_summaries_proto.pb");
  const bytes = await Bun.file(jetbox).bytes().catch(unlessGone(undefined));
  const without = bytes && withoutEntries(bytes, new Set(ids));
  if (without) {
    await writeStateFile(jetbox, without);
  }
};

/**
 * The conversations deleted from account store `store` kept out of agy's
 * shared files. Run before every agy launch on the home and as each agy
 * there ends.
 */
export const applyAgyDeletes = async (store: AgyStore): Promise<void> => {
  await dropFromShared(store.dir, await readDeleted(store.home));
};

/**
 * Conversation `id` kept out of account store `store` from now on: its id
 * added to the home's deleted list, which every agy launch on the home and
 * every agy's end there applies ({@link applyAgyDeletes}), and applied now.
 * The one way to keep a deleted conversation from coming back: call it for
 * one whose files are removed while an agy may still run on the home.
 */
const keepAgyDeleted = async (store: AgyStore, id: string): Promise<void> => {
  const deleted = await readDeleted(store.home);
  if (!deleted.includes(id)) {
    await writeStateFile(
      deletedListOf(store.home),
      `${JSON.stringify([...deleted, id])}\n`
    );
  }
  await dropFromShared(store.dir, [id]);
};

/**
 * Conversation `id` of account store `store` deleted: every file agy keeps
 * of it (its `brain/` dir, its conversation database, its title, CawCo's
 * carried record of it), its rows in the store's shared files, and CawCo's
 * note of it. A conversation the person had (`remember`) has its id kept in
 * the home's deleted list too, so no agy running there brings it back; one
 * CawCo made only to read the account's models, with no agy left running
 * on it, needs none.
 */
export const deleteAgyConversation = async (
  store: AgyStore,
  id: string,
  remember = true
): Promise<void> => {
  if (remember) {
    await keepAgyDeleted(store, id);
  }
  const database = join(store.dir, "conversations", `${id}.db`);
  for (const path of [
    join(store.dir, "brain", id),
    database,
    `${database}-wal`,
    `${database}-shm`,
    join(store.dir, "annotations", `${id}.pbtxt`),
    join(store.dir, "presence", `${id}.lock`),
    agyCarryFile(store.home, id),
  ]) {
    await rm(path, { recursive: true, force: true });
  }
  await dropFromShared(store.dir, [id]);
  await removeAgyNote(id);
};

/** Every transcript agy wrote on this machine, of every account's home and of agy's own: what search indexes. */
export const listAgyTranscripts = async (): Promise<string[]> => {
  const paths: string[] = [];
  for (const store of allStores()) {
    for (const id of await conversationIds(store)) {
      const path = agyTranscriptPath(store.dir, id);
      if (existsSync(path)) {
        paths.push(path);
      }
    }
  }
  return paths;
};
