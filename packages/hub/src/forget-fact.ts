/**
 * A fact the person forgets: their act alone, from a hub route the
 * dashboard calls (no agent tool forgets; a session's credential is refused
 * on these routes as on every route of the owner's, hub-auth.ts), a dry run
 * first and a report naming what was removed and what stays. The unit is
 * the fact, its words letter for letter, and everything derived from it
 * (OpenClaw's lineage forget, https://docs.openclaw.ai/concepts/memory-provenance:
 * "uses that lineage to remove tracked entries and related artifacts";
 * Memgraph's Context Graph: "Only you can forget sessions … The agents have
 * no tool for it", https://memgraph.com/docs/ai-ecosystem/ai-memory/privacy).
 *
 * Where it reaches, in order:
 * - **Each project folder** (project-folder.ts): its memory first
 *   (memory.ts `forgetFact`: every note holding the words, and every
 *   `knowledge/` line stating it or resting on those notes alone, gone in
 *   one commit), then its whole history, every file and message (a task's
 *   close reason is its commit's `CawCo-Reason` trailer, task-history.ts),
 *   rewritten by git filter-repo with the words `[redacted]`. A folder with
 *   work not committed, or a hub without filter-repo, keeps its history,
 *   said so.
 * - **Carries, by lineage**: a workspace whose work items held the words (a
 *   brief, a report) made its carry from that work; the carry is removed on
 *   its machine (core `CONTROL_REMOVE_FOLDER`, held there to the carries
 *   dir) and its row lets it go. Read before the rows are rewritten. The
 *   person lets any one carry go the same way
 *   (`POST /api/workspaces/:id/carry/let-go`).
 * - **Each machine's transcript index** (core
 *   `CONTROL_FORGET_TRANSCRIPT_TEXT`): the documents holding the words
 *   rewritten without them.
 * - **The hub's database** (db/fact-rows.ts): every text cell of every
 *   table holding them (a stored brief, `work_items.brief`, among them),
 *   then the file rewritten without the old bytes.
 * - **What the hub answers from now on** (secret-filter.ts): the fact kept
 *   as a salted hash of its words (db `forgotten_facts`), so a machine's
 *   index that was away, or reads its transcripts again, never answers an
 *   agent with it, and the person's Find hides it.
 *
 * What stays is named in every answer: each harness's own transcripts on
 * its machine, exports and backups, other machines' copies, a project's
 * code repositories, projects in the trash, and whatever a machine away or
 * a folder kept could not be reached for (MemIndex: "Deleting memory is not
 * a promise that all copies are gone", https://memindex.ai/docs/privacy).
 *
 * The dry run answers a confirm; the forget takes it back, for the same
 * words, within {@link CONFIRM_MS}. The words are never logged, and the
 * hub keeps only a hash of them and of each confirm's.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CONTROL_FORGET_TRANSCRIPT_TEXT,
  CONTROL_REMOVE_FOLDER,
  type ForgetTranscriptText,
  type RemoveFolder,
  type TranscriptTextForgotten,
} from "@cawco/core";
import { forgetFactWords as words } from "@cawco/core/words/forget-fact";
import { Elysia, t } from "elysia";
import type { DbShape, WorkspaceRow } from "./db";
import type { Memory } from "./memory";
import {
  type FolderMentions,
  folderMentions,
  forgetInFolderHistory,
  HistoryKept,
  hasProjectFolder,
  refused,
} from "./project-folder";
import { refusalAnswer, refuser, StatusRefusal } from "./refusal";
import {
  type ForgottenFact,
  factHash,
  factWords,
  readForgottenFrom,
} from "./secret-filter";

/** The fewest characters a fact is: fewer stand in too many other things. */
const LEAST = 4;
/** The most: a line, not a document. */
const MOST = 2000;
/** How long a dry run's confirm holds, ms. */
const CONFIRM_MS = 15 * 60_000;

/** One place a fact stands in, or stood in: what kind, where (a project or machine), and in words. */
export interface ForgetPlace {
  kind: "folder" | "memory" | "carry" | "index" | "rows" | "mask";
  says: string;
  where: string;
}

/** A dry run's answer, or a forget's report. */
export interface ForgetAnswer {
  /** A dry run's: what the forget takes back. Null on a forget's report. */
  confirm: string | null;
  dryRun: boolean;
  /** Where it stands (a dry run) or what it was removed from (a forget). */
  places: ForgetPlace[];
  /** What it does not reach, in words. */
  stays: string[];
}

class ForgetRefusal extends StatusRefusal {}
const refuse = refuser(ForgetRefusal);

export interface FactForgetDeps {
  /** A machine's control call, as the hub makes every one. */
  call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  db: DbShape;
  machineName: (machineId: string) => string;
  memory: Pick<Memory, "forgetFact">;
  online: (machineId: string) => boolean;
}

/** What stays whatever is found: the boundary every answer names. */
const BOUNDARY = [
  words.harnessTranscripts,
  words.exports,
  words.otherCopies,
  words.codeRepos,
  words.trash,
];

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Whether a folder's history holds the words anywhere. */
const inHistory = (found: FolderMentions): boolean =>
  found.messages.length + found.commits.length + found.files.length > 0;

/** A folder's mentions as places. */
const folderPlaces = (where: string, found: FolderMentions): ForgetPlace[] => [
  ...found.messages.map((one): ForgetPlace => ({
    kind: "folder",
    where,
    says: words.trailer(one.sha, one.subject, one.trailers),
  })),
  ...found.commits.map((one): ForgetPlace => ({
    kind: "folder",
    where,
    says: words.committedFile(one.sha, one.subject, one.paths),
  })),
  ...found.files.map((path): ForgetPlace => ({
    kind: "folder",
    where,
    says: words.fileNow(path),
  })),
];

/** What an answer gathers as it goes. */
interface Answering {
  places: ForgetPlace[];
  stays: string[];
}

/** What memory's forget found in a project, as places. */
const memoryPlaces = (
  where: string,
  memory: { lines: number; notes: string[] }
): ForgetPlace[] => [
  ...memory.notes.map((id): ForgetPlace => ({
    kind: "memory",
    where,
    says: words.note(id),
  })),
  ...(memory.lines > 0
    ? [
        {
          kind: "memory" as const,
          where,
          says: words.knowledgeLines(memory.lines),
        },
      ]
    : []),
];

/** Why a folder's history would be kept, as a dry run reads it; undefined when it would be rewritten. */
const historyKeptBy = (found: FolderMentions): string | undefined => {
  if (!Bun.which("git-filter-repo", { PATH: process.env.PATH ?? "" })) {
    return words.filterRepoMissing;
  }
  return found.uncommitted.length > 0
    ? words.uncommitted(found.uncommitted)
    : undefined;
};

/** A machine's refusal or failure, in words. */
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const factForget = (deps: FactForgetDeps) => {
  const { db } = deps;
  /** The forgotten facts as the secret filter reads them: read once, added to at each forget. */
  const held: ForgottenFact[] = db.find.forgottenFacts();
  readForgottenFrom(() => held);
  /** Each dry run's confirm, by its hash: the hash of the words it was for, and when. */
  const confirms = new Map<string, { at: number; words: string }>();

  /** The words as asked, refused when they cannot be forgotten. */
  const asked = (raw: string): string => {
    const text = raw.trim();
    if (!text) {
      refuse(400, words.noWords);
    }
    if (text.includes("\n")) {
      refuse(400, words.oneLine);
    }
    if (text.length < LEAST) {
      refuse(400, words.tooShort(LEAST));
    }
    if (text.length > MOST) {
      refuse(400, words.tooLong(MOST));
    }
    return text;
  };

  /** The carries made from work that held the words: by lineage, read before anything is rewritten. */
  const carriesOf = (text: string) =>
    db.factRows
      .workspacesHolding(text)
      .flatMap((id) => db.workspacesNamed(id).filter((row) => row.id === id))
      .filter((row) => row.carry !== null);

  /** Each project with a folder, with its name. */
  const folders = async () => {
    const out: { id: string; name: string }[] = [];
    for (const project of db.listProjects()) {
      if (await hasProjectFolder(project.id)) {
        out.push({ id: project.id, name: project.name });
      }
    }
    return out;
  };

  /** The index's word from each connected machine, and the boundary of those away. */
  const indexes = async (
    text: string,
    dry: boolean,
    into: Answering
  ): Promise<void> => {
    for (const machine of db.listAgents()) {
      const name = deps.machineName(machine.machineId);
      if (!deps.online(machine.machineId)) {
        into.stays.push(words.machineAway(name));
        continue;
      }
      try {
        const answer = (await deps.call(
          machine.machineId,
          CONTROL_FORGET_TRANSCRIPT_TEXT,
          [{ text, dry } satisfies ForgetTranscriptText]
        )) as TranscriptTextForgotten;
        into.places.push({
          kind: "index",
          where: name,
          says: words.index(name, answer.documents),
        });
      } catch (error) {
        into.stays.push(
          words.machineFailed(name, words.index(name, null), said(error))
        );
      }
    }
  };

  /**
   * A workspace's carry removed on its machine (agent remove-folder.ts holds
   * it to the carries dir there), and its row letting it go: a
   * retirement's carry is what its workspace is cut again with, so gone, it
   * is cut again nowhere.
   */
  const letGo = async (row: WorkspaceRow): Promise<string> => {
    const path = row.carry ?? refuse(404, words.noCarry(row.id));
    if (!deps.online(row.machineId)) {
      refuse(409, words.carryAway(path, deps.machineName(row.machineId)));
    }
    await deps.call(row.machineId, CONTROL_REMOVE_FOLDER, [
      { kind: "carry", path } satisfies RemoveFolder,
    ]);
    db.updateWorkspace(row.id, {
      carry: null,
      ...(row.head?.carry ? { head: null } : {}),
    });
    return path;
  };

  /** Each carry made from the words' work: let go (or, `dry`, named), those on a machine away kept. */
  const carries = async (
    rows: readonly WorkspaceRow[],
    dry: boolean,
    into: Answering
  ): Promise<void> => {
    for (const row of rows) {
      const name = deps.machineName(row.machineId);
      const path = row.carry as string;
      if (!deps.online(row.machineId)) {
        into.stays.push(words.carryAway(path, name));
        continue;
      }
      try {
        if (!dry) {
          await letGo(row);
        }
        into.places.push({
          kind: "carry",
          where: name,
          says: words.carry(path, name, row.id),
        });
      } catch (error) {
        into.stays.push(
          words.machineFailed(
            name,
            words.carry(path, name, row.id),
            said(error)
          )
        );
      }
    }
  };

  /** A project folder: its memory, then (not `dry`) its history rewritten; whether it was. */
  const folder = async (
    project: { id: string; name: string },
    text: string,
    dry: boolean,
    into: Answering
  ): Promise<boolean> => {
    into.places.push(
      ...memoryPlaces(
        project.name,
        await deps.memory.forgetFact(project.id, text, dry)
      )
    );
    const found = await folderMentions(project.id, text);
    if (!inHistory(found)) {
      return false;
    }
    if (dry) {
      into.places.push(...folderPlaces(project.name, found));
      const kept = historyKeptBy(found);
      if (kept) {
        into.stays.push(words.historyKept(project.name, kept));
      }
      return false;
    }
    try {
      const left = await forgetInFolderHistory(project.id, text);
      into.places.push(...folderPlaces(project.name, found));
      into.stays.push(
        ...folderPlaces(project.name, left).map((place) => place.says)
      );
      return true;
    } catch (error) {
      if (!(error instanceof HistoryKept)) {
        throw error;
      }
      into.stays.push(words.historyKept(project.name, error.message));
      return false;
    }
  };

  /** Where the words stand (`dry`), or what they were removed from. */
  const reach = async (text: string, dry: boolean): Promise<Answering> => {
    const into: Answering = { places: [], stays: [...BOUNDARY] };
    // By lineage: read before the rows that tell it are rewritten.
    const made = carriesOf(text);
    let rewritten = false;
    for (const project of await folders()) {
      rewritten = (await folder(project, text, dry, into)) || rewritten;
    }
    if (rewritten) {
      into.stays.push(words.newIds);
    }
    await carries(made, dry, into);
    await indexes(text, dry, into);
    for (const cells of dry
      ? db.factRows.cells(text)
      : db.factRows.forget(text)) {
      if (cells.key) {
        into.stays.push(words.keyColumn(cells.table, cells.column, cells.rows));
      } else {
        into.places.push({
          kind: "rows",
          where: cells.table,
          says: words.rows(cells.table, cells.column, cells.rows),
        });
      }
    }
    into.places.push({ kind: "mask", where: "", says: words.mask });
    return into;
  };

  /** A dry run's confirm, kept as its hash with the hash of its words; stale ones dropped. */
  const confirmFor = (text: string): string => {
    const confirm = randomUUID();
    const now = Date.now();
    for (const [key, kept] of confirms) {
      if (now - kept.at > CONFIRM_MS) {
        confirms.delete(key);
      }
    }
    confirms.set(digest(confirm), { at: now, words: digest(text) });
    return confirm;
  };

  /** The confirm a forget hands back, taken: refused when no dry run of these words answered it lately. */
  const takeConfirm = (text: string, confirm: string): void => {
    const key = digest(confirm);
    const kept = confirms.get(key) ?? refuse(409, words.dryRunFirst);
    if (kept.words !== digest(text) || Date.now() - kept.at > CONFIRM_MS) {
      refuse(409, words.confirmStale);
    }
    confirms.delete(key);
  };

  /** The fact kept as the secret filter matches it, never its words. */
  const mask = (text: string): void => {
    const salt = randomBytes(16).toString("hex");
    const spoken = factWords(text);
    const fact: ForgottenFact = {
      salt,
      hash: factHash(salt, spoken),
      words: spoken.length,
    };
    db.find.forgetFact(fact);
    held.push(fact);
  };

  return {
    /** The person lets workspace `id`'s carry go: removed on its machine, its row without it. */
    async letCarryGo(id: string): Promise<{ removed: string }> {
      const row =
        db.workspacesNamed(id).find((one) => one.id === id) ??
        refuse(404, words.noWorkspace(id));
      return { removed: await letGo(row) };
    },

    /** Where the words stand, nothing changed; its confirm is what {@link forget} takes. */
    async dryRun(raw: string): Promise<ForgetAnswer> {
      const text = asked(raw);
      const found = await reach(text, true);
      return { dryRun: true, confirm: confirmFor(text), ...found };
    },

    /** The words forgotten wherever the dry run found them; its report names what stays. */
    async forget(raw: string, confirm: string): Promise<ForgetAnswer> {
      const text = asked(raw);
      takeConfirm(text, confirm);
      const done = await reach(text, false);
      mask(text);
      console.log(
        `${words.line}: ${done.places.length} place${done.places.length === 1 ? "" : "s"} (${[
          ...new Set(done.places.map((place) => place.kind)),
        ].join(
          ", "
        )}), ${done.stays.length - BOUNDARY.length} kept beyond the boundary`
      );
      return { dryRun: false, confirm: null, ...done };
    },
  };
};

export type FactForget = ReturnType<typeof factForget>;

const answer = refusalAnswer(ForgetRefusal, refused);

/**
 * The person's forget: `dry-run` first, its `confirm` then handed to the
 * forget itself. The owner's routes alone (hub-auth.ts: every route not
 * listed for sessions refuses a session's credential).
 */
export const factForgetRoutes = (forget: FactForget) =>
  new Elysia()
    .post(
      "/api/facts/forget/dry-run",
      {
        body: t.Object({ text: t.String({ maxLength: MOST * 2 }) }),
        detail: { hide: true },
      },
      async ({ body }) => {
        try {
          return await forget.dryRun(body.text);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .post(
      "/api/facts/forget",
      {
        body: t.Object({
          text: t.String({ maxLength: MOST * 2 }),
          confirm: t.String({ maxLength: 100 }),
        }),
        detail: { hide: true },
      },
      async ({ body }) => {
        try {
          return await forget.forget(body.text, body.confirm);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .post(
      "/api/workspaces/:id/carry/let-go",
      { detail: { hide: true } },
      async ({ params }) => {
        try {
          return await forget.letCarryGo(params.id);
        } catch (error) {
          return answer(error);
        }
      }
    );
