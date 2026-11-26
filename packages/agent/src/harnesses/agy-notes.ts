/**
 * CawCo's note per Antigravity conversation (core paths/harnesses.ts
 * `agySessionNotes`): what CawCo knows of it that agy's store does not say
 * where CawCo can read it, or that CawCo may not write there.
 *
 * Two files a conversation, each with one writer process, so neither
 * writer undoes the other's change:
 * - what its host saw (`<id>.json`, agy-runtime.ts): the account whose home
 *   holds it, absent for one in agy's own default home; the session dir it
 *   runs in on that account; the folder it ran in; when it began; the
 *   title agy gave it (`session_info_update`), its default name;
 * - what the person and the agent did (`<id>.person.json`): the person's
 *   title, which outranks agy's; its tag; the folder it moved to with its
 *   project; and each stop CawCo made of it for failing the same way again
 *   and again (`noteStopped`), which agy's own history cannot hold, so a
 *   transcript read back draws each where it happened (agy-history.ts).
 *
 * Within a process each file is read and written whole one change at a
 * time ({@link written}).
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { agySessionNotes } from "@cawco/core/paths/harnesses";
import { writeStateFile } from "@cawco/core/state-file";
import { Option, Schema, Semaphore } from "effect";
import { runPromise } from "../daemon-runtime";
import { fromPromise } from "../rejected";

const HostNoteSchema = Schema.Struct({
  accountId: Schema.optional(Schema.String),
  dir: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.Number),
  title: Schema.optional(Schema.String),
});

/** What a conversation's host saw of it. */
export type AgyHostNote = typeof HostNoteSchema.Type;

const StopSchema = Schema.Struct({ at: Schema.Number, words: Schema.String });

const PersonNoteSchema = Schema.Struct({
  customTitle: Schema.optional(Schema.String),
  tag: Schema.optional(Schema.String),
  movedTo: Schema.optional(Schema.String),
  stops: Schema.optional(Schema.Array(StopSchema)),
});

/** What the person and the agent did with a conversation. */
export type AgyPersonNote = typeof PersonNoteSchema.Type;

/** One conversation's note, both files read as one: its folder the one it moved to, if it moved. */
export interface AgyNote {
  readonly accountId?: string;
  readonly createdAt?: number;
  readonly customTitle?: string;
  readonly cwd?: string;
  /** The name of the session dir it runs in on its account (core paths/harnesses.ts `agySessionDir`). */
  readonly dir?: string;
  readonly stops?: readonly { at: number; words: string }[];
  readonly tag?: string;
  readonly title?: string;
}

const decodeHost = Schema.decodeUnknownOption(
  Schema.fromJsonString(HostNoteSchema)
);
const decodePerson = Schema.decodeUnknownOption(
  Schema.fromJsonString(PersonNoteSchema)
);

/** Conversation ids are agy's UUIDs; anything else names no note. */
const CONVERSATION_ID = /^[0-9a-f-]{8,64}$/u;

/** The two files' endings. */
const HOST = ".json";
const PERSON = ".person.json";

const noteFile = (conversationId: string, ending: string): string => {
  if (!CONVERSATION_ID.test(conversationId)) {
    throw new Error(`${conversationId} is not an Antigravity conversation id`);
  }
  return join(agySessionNotes(), `${conversationId}${ending}`);
};

const textOf = (file: string): Promise<string> =>
  readFile(file, "utf8").catch(unlessGone(""));

/** Conversation `conversationId`'s note; empty when CawCo keeps none, or one it can't read. */
export const readAgyNote = async (conversationId: string): Promise<AgyNote> => {
  const host = Option.getOrElse(
    decodeHost(await textOf(noteFile(conversationId, HOST))),
    (): AgyHostNote => ({})
  );
  const { movedTo, ...person } = Option.getOrElse(
    decodePerson(await textOf(noteFile(conversationId, PERSON))),
    (): AgyPersonNote => ({})
  );
  return { ...host, ...person, ...(movedTo ? { cwd: movedTo } : {}) };
};

/** One change of a note file at a time in this process: each reads the file afresh and writes it whole. */
const writing = Semaphore.makeUnsafe(1);

const written = <A>(
  file: string,
  decode: (text: string) => Option.Option<A>,
  change: (note: A) => A,
  none: A
): Promise<void> =>
  runPromise(
    writing.withPermit(
      fromPromise(async () => {
        const changed = change(
          Option.getOrElse(decode(await textOf(file)), () => none)
        );
        await writeStateFile(file, `${JSON.stringify(changed, null, 2)}\n`);
      })
    )
  );

/** What conversation `conversationId`'s host saw, changed by `change`: the host's own file. */
export const changeAgyHostNote = (
  conversationId: string,
  change: (note: AgyHostNote) => AgyHostNote
): Promise<void> =>
  written(noteFile(conversationId, HOST), decodeHost, change, {});

/** What the person and the agent did with conversation `conversationId`, changed by `change`: the agent's own file. */
export const changeAgyPersonNote = (
  conversationId: string,
  change: (note: AgyPersonNote) => AgyPersonNote
): Promise<void> =>
  written(noteFile(conversationId, PERSON), decodePerson, change, {});

/** Conversation `conversationId`'s note removed, with the conversation. */
export const removeAgyNote = async (conversationId: string): Promise<void> => {
  await rm(noteFile(conversationId, HOST), { force: true });
  await rm(noteFile(conversationId, PERSON), { force: true });
};

/** Every note CawCo keeps, by conversation id. */
export const allAgyNotes = async (): Promise<Map<string, AgyNote>> => {
  const names = await readdir(agySessionNotes()).catch(unlessGone([]));
  const ids = new Set(
    names.flatMap((name) => {
      const ending = [PERSON, HOST].find((one) => name.endsWith(one));
      const id = ending ? name.slice(0, -ending.length) : undefined;
      return id && CONVERSATION_ID.test(id) ? [id] : [];
    })
  );
  const notes = new Map<string, AgyNote>();
  for (const id of ids) {
    notes.set(id, await readAgyNote(id));
  }
  return notes;
};
