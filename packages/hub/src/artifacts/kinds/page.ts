import {
  type ChoiceEntry,
  choiceEntryProblem,
  noteText,
} from "@cawco/core/choices";
import {
  ACTIVITY_LIMIT,
  activityLines,
  activityOf,
  answerChanges,
  answeredLines,
  bindChanges,
  CHANGES_LIMIT,
  carryChanges,
  readPins,
  seenOf,
} from "@cawco/core/comments/model";
import { type DecisionCard, pickMade, pickOf } from "@cawco/core/decisions";
import {
  type ArtifactChanges,
  type ChangedItem,
  docMeta,
  getMeta,
  type MetaMap,
  setMeta,
} from "@cawco/core/doc-meta";
import type { InstanceRow } from "@cawco/core/protocol";
import { changeLink } from "@cawco/core/references";
import { pageHash } from "@cawco/preview/proxy";
import { ElysiaStatus, problem } from "elysia";
import { applyPatch } from "rfc6902";
import type { Doc } from "yjs";
import type { ArtifactRow } from "../../db/artifacts";
import {
  type BuiltProgram,
  keptImagePaths,
  readKept,
  type StatementChange,
} from "../../decision-program";

import { metaOf, stateOf } from "../facts";
import { testedKeys } from "../overwrite";
import {
  cardChanges,
  cssEscape,
  htmlChanges,
  pictureChanges,
} from "../page-changes";
import type {
  ArtifactInput,
  ArtifactRead,
  DecisionAnswer,
  Making,
  PageBroken,
  PageChange,
  PageFrom,
  PageWas,
  Revised,
} from "../shapes";
import type { KindContext } from "./context";
import type { createPreviewKind } from "./preview";

/** How the person answered one choice a page asks ({@link DecisionAnswer}), from its entry in the doc's state. */
const answerOf = (
  asked: { card?: DecisionCard; id: string },
  entry: ChoiceEntry | undefined,
  current: string | null
): DecisionAnswer => {
  const { card, id } = asked;
  const question = card ? { question: card.question } : {};
  if (!entry) {
    return { id, ...question, answer: "open" };
  }
  const said = {
    at: entry.at,
    ...(current && entry.pageHash !== current
      ? { earlierRevision: true as const }
      : {}),
    ...(noteText(entry.note) ? { note: noteText(entry.note) as string } : {}),
  };
  if (entry.options.length === 0) {
    // A note with no pick is still open; a pick taken back, cleared.
    return said.note
      ? { id, ...question, answer: "open", note: said.note }
      : { id, ...question, answer: "cleared", ...said };
  }
  // Picked by the one rule every count reads (core `pickMade`); else a pick on options a revision took out.
  if (!pickMade(card, entry)) {
    return {
      id,
      ...question,
      answer: "gone",
      options: entry.options,
      gone: card ? pickOf(card, entry).gone : [],
      ...said,
    };
  }
  return {
    id,
    ...question,
    answer: "picked",
    options: entry.options.map((option) => {
      const label = card?.options.find((one) => one.id === option)?.label;
      return label ? { id: option, label } : { id: option };
    }),
    ...said,
    ...(entry.settled ? { settled: entry.settled } : {}),
  };
};

/** The page hash the newest entry was made on: a preview's, which the hub never built. */
export const newestHash = (state: Record<string, ChoiceEntry>): string | null =>
  Object.values(state).sort((a, b) => b.at.localeCompare(a.at))[0]?.pageHash ??
  null;

/**
 * The entries a patched `state` (`after`) makes of `before`: each changed key
 * whole, the fields the agent left out filled in (no note, no value, the
 * page it was made on), stamped `at`; refused whole at the first one out of
 * the bridge's bounds.
 */
const patchedEntries = (
  before: Record<string, ChoiceEntry>,
  after: Record<string, unknown>,
  hash: string,
  at: string
) => {
  const next: Record<string, ChoiceEntry> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(value) === JSON.stringify(before[key])) {
      continue;
    }
    const given = (value ?? {}) as Partial<ChoiceEntry>;
    const entry: ChoiceEntry = {
      options: given.options ?? [],
      note: noteText(given.note),
      value: given.value ?? null,
      pageHash: given.pageHash ?? before[key]?.pageHash ?? hash,
      at,
    };
    const misfit = choiceEntryProblem(key, entry);
    if (misfit) {
      return problem(422, {
        code: "artifact-patch-entry-unfit",
        detail: `${misfit} Nothing was changed.`,
      });
    }
    next[key] = entry;
  }
  return next;
};

/** What PageKind reads of the artifact service ({@link KindContext}). */
export type PageKindContext = Pick<
  KindContext,
  | "answersHad"
  | "brokenBy"
  | "cardLinks"
  | "choicesAsked"
  | "db"
  | "deps"
  | "docs"
  | "holder"
  | "holdsChange"
  | "mediaHeld"
  | "namedFor"
  | "read"
  | "routedOn"
  | "stampMeta"
  | "store"
  | "whole"
> &
  Pick<ReturnType<typeof createPreviewKind>, "warmPreviews">;

/** A page: HTML a session writes, or a decision page built from its program, each revision written to its folder, what it changed marked for the person until he has looked, and the pictures its Images show kept by the machine they were read on. */
export const createPageKind = (ctx: PageKindContext) => {
  const {
    db,
    deps,
    docs,
    holder,
    holdsChange,
    namedFor,
    store,
    warmPreviews,
    whole,
  } = ctx;

  /**
   * A page's files in its folder: its HTML, and a decision page's program
   * and the files its Images show (an earlier revision's go first); an HTML
   * page keeps no program.
   */
  const writePage = (id: string, html: string, program?: BuiltProgram) => {
    // The Canvases and Previews this revision drops stay the page's pictures (needs.ts).
    const page = db.get(id);
    const was = page ? store.program(id) : undefined;
    if (page && was !== undefined) {
      const kept = new Set(
        program ? readKept(program.program).artifacts.map((one) => one.id) : []
      );
      keptAsMedia(
        page,
        readKept(was)
          .artifacts.map((one) => one.id)
          .filter((one) => !kept.has(one))
      );
    }
    store.write(id, html, program);
    if (program && page) {
      warmPreviews(page, program.read);
    }
  };
  /**
   * Marks each of `ids`, an option's media on decision page `page` of its
   * own session, as that page's (doc meta `mediaOf`): the page went, or a
   * revision of it dropped them, and they ask nothing of their own still.
   */
  const keptAsMedia = (page: ArtifactRow, ids: readonly string[]): void => {
    for (const id of ids) {
      const media = db.get(id);
      if (
        media?.instanceId === page.instanceId &&
        !docMeta(docs.doc(id)).has("mediaOf")
      ) {
        docs.transact(id, "hub", (doc) => setMeta(doc, "mediaOf", page.id));
      }
    }
  };
  /**
   * What a page's revision changed (page-changes.ts): a decision page's
   * cards, else an HTML page's elements, told at the elements its pins
   * stand on where a change falls inside one.
   */
  const pageChanges = (
    id: string,
    was: PageWas,
    now: { html: string; program?: BuiltProgram | undefined }
  ): ChangedItem[] => {
    if (now.program && was.program !== undefined) {
      return [
        ...cardChanges(readKept(was.program).cards, now.program.read.cards),
        ...pictureChanges(was.files, now.program.files),
      ];
    }
    const anchors = [...readPins(docs.doc(id)).values()].flatMap((pin) =>
      "selector" in pin.anchor && !pin.anchor.frames?.length
        ? [pin.anchor.selector]
        : []
    );
    return htmlChanges(was.html, now.html, anchors);
  };
  /**
   * The agent answered pin `pin` at `at`, after the latest update: that
   * update's changes are its answer (core `answerChanges`), marked so on the
   * set and in the pin's lines.
   */
  const answeredHere = (doc: Doc, pin: string, at: string) => {
    const meta = docMeta(doc);
    const changes = meta.get("changes");
    if (!changes) {
      return;
    }
    const { items, bound } = answerChanges(
      changes,
      readPins(doc).values(),
      pin
    );
    if (bound.length === 0) {
      return;
    }
    meta.set("changes", { ...changes, items });
    const activity = activityOf(doc);
    activity.set(pin, answeredLines(activity.get(pin) ?? [], bound, at));
  };
  /**
   * What an agent's update changed (`items`, page-changes.ts), marked in the
   * doc's meta under `revision` (core `ArtifactChanges`) until the person
   * has looked: each tied to the comment it answers or stands under (core
   * `bindChanges`, a reply since the update before it being the answer),
   * and what the last set held that he hasn't looked at carried in (core
   * `carryChanges`), so the set is everything since he looked. Each pin's
   * thread gains a line per change made for it (the doc's `activity`, core
   * `activityLines`), kept after he has looked.
   */
  const markRevision = (
    row: ArtifactRow,
    items: ChangedItem[],
    revision: (meta: MetaMap) => number
  ): ChangedItem[] => {
    let bound: ChangedItem[] = [];
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      const was = meta.get("changes");
      const seen = new Set(
        was ? (seenOf(doc).get(String(was.revision)) ?? []) : []
      );
      const at = new Date().toISOString();
      const since = was?.at ?? row.createdAt.toISOString();
      const next = revision(meta);
      const fresh = bindChanges(items, readPins(doc).values(), since, next);
      bound = fresh;
      const changes: ArtifactChanges = {
        revision: next,
        at,
        since,
        items: carryChanges(was?.items ?? [], seen, fresh),
      };
      meta.set("changes", changes);
      const activity = activityOf(doc);
      for (const [pin, lines] of activityLines(fresh, at)) {
        activity.set(
          pin,
          [...(activity.get(pin) ?? []), ...lines].slice(-ACTIVITY_LIMIT)
        );
      }
    });
    return bound;
  };
  /**
   * What an update marked, each by its link (core `changeLink`): what the
   * agent names each to the person by, and what the turn's row draws as its
   * chips; a thing taken out has no place to open, and is left out.
   */
  const markedLinks = (
    id: string,
    items: readonly ChangedItem[]
  ): { marked?: string[] } => {
    const links = items
      .filter((item) => item.kind !== "removed")
      .map((item) =>
        changeLink(
          id,
          item.anchor,
          item.element && item.element !== item.label
            ? `${item.element} · ${item.label}`
            : item.label
        )
      );
    return links.length > 0 ? { marked: links } : {};
  };
  /** Page `row`'s revision changed `items`: marked under its revision ({@link markRevision}). */
  const markChanges = (row: ArtifactRow, items: ChangedItem[]): ChangedItem[] =>
    markRevision(row, items.slice(0, CHANGES_LIMIT), () => row.revision);
  /** A decision page's program as the hub keeps it; undefined for an HTML page or any other artifact. */
  const programOf = (row: ArtifactRow): string | undefined =>
    row.kind === "page" ? store.program(row.id) : undefined;
  /** A page's hash: its program's for a decision page, else its HTML's; none for anything else. */
  const pageHashOf = (
    html: string | null,
    program: BuiltProgram | undefined
  ): string | null => {
    if (program) {
      return pageHash(program.program);
    }
    return html === null ? null : pageHash(html);
  };
  /**
   * Where a decision page's Image files stand, kept in its doc's meta for
   * its revisions: the work folder it was last published from (`dir`, none
   * for one published inline or from the project's folder) and the machine
   * that folder is on (`machine`, its publishing session's), and the
   * machine each picture it shows was read on (`read`), a path naming a
   * file on that machine alone.
   */
  const keepPictureSources = (
    row: ArtifactRow,
    program: BuiltProgram,
    sources: {
      folder?: { dir: string | undefined; machine: string };
      read: (file: string) => string | undefined;
    }
  ) => {
    const read: Record<string, string> = {};
    for (const name of keptImagePaths(program.program).keys()) {
      const machine = sources.read(name);
      if (machine) {
        read[name] = machine;
      }
    }
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      meta.set("pictureMachines", read);
      const { folder } = sources;
      if (!folder) {
        return;
      }
      if (folder.dir === undefined) {
        meta.delete("programDir");
        meta.delete("programMachine");
      } else {
        meta.set("programDir", folder.dir);
        meta.set("programMachine", folder.machine);
      }
    });
  };
  /** A published decision page's picture sources ({@link keepPictureSources}): each read on its maker's machine, where its folder `dir` is too. */
  const keepPublishedSources = (
    row: ArtifactRow,
    program: BuiltProgram | undefined,
    dir: string | undefined,
    maker: InstanceRow
  ) => {
    if (program) {
      keepPictureSources(row, program, {
        folder: { dir, machine: maker.machineId },
        read: () => maker.machineId,
      });
    }
  };
  /**
   * The machine a revision of decision page `row` by session `reviser`
   * reads Image `file` on: the one a picture the page shows was read on;
   * for a name new to the page, the folder's machine (a relative name,
   * beside the program it was published from) or the reviser's (an
   * absolute one, which the reviser wrote). None for a picture the page
   * shows with no machine kept (a page published before machines were) or
   * a relative name with no folder's machine: the page keeps the one, the
   * other is refused.
   */
  const revisionReadsOn = (
    row: ArtifactRow,
    reviser: InstanceRow,
    shown: ReadonlyMap<string, Uint8Array>
  ): ((file: string) => string | undefined) => {
    const meta = docMeta(docs.doc(row.id));
    const read = meta.get("pictureMachines") ?? {};
    const folder = meta.get("programMachine");
    return (file) => {
      if (Object.hasOwn(read, file)) {
        return read[file];
      }
      if (shown.has(file)) {
        return;
      }
      if (file.startsWith("/")) {
        return reviser.machineId;
      }
      return typeof folder === "string" ? folder : undefined;
    };
  };
  /**
   * A page's next revision, for new HTML. A view joined to it morphs to the
   * new HTML in place, so the person has that revision on screen without a
   * new show.
   */
  const nextRevision = (row: ArtifactRow) => ({
    revision: row.revision + 1,
    updatedAt: new Date(),
    ...(docs.viewers(row.id) > 0 ? { openedRevision: row.revision + 1 } : {}),
  });
  /** A read's `decisions`: each choice the page asks, answered or not, on every read (one `since` a seq too); nothing for a page that asks none. */
  const decisionsOf = (
    row: ArtifactRow,
    state: Record<string, ChoiceEntry>,
    current: string | null
  ): Pick<ArtifactRead, "decisions"> => {
    const asked = ctx.choicesAsked(row);
    return asked.length > 0
      ? {
          decisions: asked.map((one) => answerOf(one, state[one.id], current)),
        }
      : {};
  };
  /**
   * A page built from what a create names: its HTML, and a decision page's
   * program, the artifacts its media show checked against `owner`'s panel.
   */
  const pageBuilt = async (
    instance: InstanceRow,
    input: Pick<ArtifactInput, "name" | "html" | "dir" | "program">,
    owner: InstanceRow,
    keep: boolean
  ) => {
    const given = [input.program, input.html, input.dir].filter(
      (one) => one !== undefined
    ).length;
    if (given > 1) {
      return problem(400, {
        code: "artifact-page-sources",
        detail: "A page takes one of program, html or dir.",
      });
    }
    if (given === 0 && !instance.projectId) {
      return problem(400, {
        code: "artifact-page-source-none",
        detail:
          "A page takes program (a decision page, decision-page skill), html, or dir with your work folder.",
      });
    }
    let from: PageFrom = { folder: true };
    if (input.program !== undefined) {
      from = { program: input.program };
    } else if (input.html !== undefined) {
      from = { html: input.html };
    } else if (input.dir !== undefined) {
      from = { dir: input.dir };
    }
    const page = await built(instance, input.name, from, keep);
    if (page instanceof ElysiaStatus) {
      return page;
    }
    const unheld = page.program && ctx.mediaHeld(owner, page.program);
    return unheld ?? page;
  };
  /** Refuses new HTML for what takes none: an artifact that is no page, or a decision page written as a program. */
  const takesHtml = (row: ArtifactRow) => {
    if (row.kind !== "page") {
      return problem(409, {
        code: "artifact-html-not-page",
        detail: `${row.name} is a ${row.kind}: only a page takes new HTML.`,
      });
    }
    if (programOf(row) !== undefined) {
      return problem(409, {
        code: "artifact-html-program",
        detail: `${row.name} is a decision page written as a program: revise it with statements.`,
      });
    }
  };
  /**
   * A create's page built, and what its program leaves broken on the picks
   * of the page it replaces and on the project's links between pages. A re-create held
   * for the parent is kept in its project's folder when they open it.
   */
  const createdPage = async (
    { maker, owner }: Making,
    input: ArtifactInput
  ) => {
    const was = namedFor(owner, "page", input.name);
    // Another session's page of the project's is the owner's once made again (placed).
    const page = await pageBuilt(
      maker,
      input,
      owner,
      !(was && holdsChange(maker, { ...was, instanceId: owner.id }))
    );
    if (page instanceof ElysiaStatus) {
      return page;
    }
    const broken = page.program
      ? await ctx.brokenBy(
          { id: was?.id, name: input.name, projectId: owner.projectId ?? null },
          page.program.read.cards
        )
      : undefined;
    if (broken instanceof ElysiaStatus) {
      return broken;
    }
    const made: {
      broken: PageBroken | undefined;
      html: string;
      program?: BuiltProgram;
    } = { ...page, broken };
    return made;
  };
  /**
   * `deps.page`'s build, or its refusal (a program's among them); kept in
   * the project's folder unless it is a held next version's (`keep` false),
   * which ../versions.ts `promote` keeps there.
   */
  const built = (
    instance: InstanceRow,
    name: string,
    from: PageFrom,
    keep = true
  ) => deps.page(instance, name, from, keep, (asked) => whole(instance, asked));
  /**
   * Page or preview `row` as `artifact_read` reads it: the person's picks,
   * notes and Sends on the version they have before them, the server and
   * stage its newest version's, `now` (../versions.ts `newestVersion`), `held` naming
   * that one when its panel hasn't opened it.
   */
  const pageNow = (
    row: ArtifactRow,
    now: ArtifactRow,
    since: number | undefined,
    ownersRead: boolean
  ): ArtifactRead => {
    const theirs = ctx.read(row, since, ownersRead);
    if (now === row) {
      return theirs;
    }
    const { stage: _stage, workspace: _workspace, ...done } = theirs;
    const { stage, workspace } = ctx.read(now, undefined, false);
    return {
      ...done,
      ...(stage === undefined ? {} : { stage }),
      ...(workspace === undefined ? {} : { workspace }),
      held: now.id,
    };
  };
  /** New HTML `given` for page `row` ({@link pageChanged}): built, written, what it changed marked; its read after, as `ownersRead` says. */
  const htmlChanged = async (
    instance: InstanceRow,
    row: ArtifactRow,
    given: string,
    ownersRead: boolean
  ) => {
    const untaken = takesHtml(row);
    if (untaken) {
      return untaken;
    }
    const page = await built(
      instance,
      row.name,
      { html: given },
      row.heldFor === null
    );
    if (page instanceof ElysiaStatus) {
      return page;
    }
    const { html } = page;
    const moved = db.update(row.id, nextRevision(row)) as ArtifactRow;
    const was = store.revision(moved.id);
    writePage(moved.id, html);
    // Every page open on it hears the new revision in the doc and morphs
    // in place (the overlay); nothing reloads.
    ctx.stampMeta(moved, pageHash(html));
    const fresh = markChanges(
      moved,
      was ? pageChanges(moved.id, was, { html }) : []
    );
    const read: ArtifactRead = {
      ...ctx.read(moved, undefined, ownersRead),
      ...markedLinks(moved.heldFor ?? moved.id, fresh),
    };
    return read;
  };
  /**
   * New HTML for page `row` (its revision moves and every open view morphs
   * to it, its state kept), or a JSON Patch (RFC 6902) over its `state`
   * applied as one transaction; its read after, as `ownersRead` says.
   */
  const pageChanged = async (
    instance: InstanceRow,
    row: ArtifactRow,
    change: Exclude<PageChange, { statements: string }>,
    ownersRead: boolean
  ) => {
    if ("html" in change) {
      return await htmlChanged(instance, row, change.html, ownersRead);
    }
    const doc = docs.doc(row.id);
    const before = stateOf(doc);
    const after = structuredClone(before) as Record<string, unknown>;
    const errors = applyPatch(after, change.patch);
    const program = programOf(row);
    const carded = program
      ? readKept(program)
          .cards.map((card) => card.id)
          .filter(
            (card) =>
              JSON.stringify(after[card]) !== JSON.stringify(before[card])
          )
      : [];
    if (carded.length > 0) {
      return problem(409, {
        code: "artifact-patch-cards",
        detail: `${carded.join(", ")} ${carded.length === 1 ? "is a decision card" : "are decision cards"}: a card's pick is the person's, or settle's by the project's Who decides. Nothing was changed.`,
      });
    }
    const failed = errors.findIndex((error) => error !== null);
    if (failed !== -1) {
      return problem(422, {
        code: "artifact-patch-failed",
        detail: `Operation ${failed} of the patch failed: ${errors[failed]?.message ?? "it does not apply"}. Nothing was changed.`,
      });
    }
    const replaced = ctx.answersHad(instance, row, {
      before,
      after,
      tested: testedKeys(change.patch, before),
    });
    if (replaced) {
      return replaced;
    }
    const next = patchedEntries(
      before,
      after,
      metaOf(doc).pageHash ?? newestHash(before) ?? "0".repeat(64),
      new Date().toISOString()
    );
    if (next instanceof ElysiaStatus) {
      return next;
    }
    const gone = Object.keys(before).filter((key) => !(key in after));
    docs.transact(row.id, "agent", (live) => {
      const state = live.getMap("state");
      for (const [key, entry] of Object.entries(next)) {
        state.set(key, entry);
      }
      for (const key of gone) {
        state.delete(key);
      }
    });
    return ctx.read(db.get(row.id) as ArtifactRow, undefined, ownersRead);
  };
  /** Decision page `row`'s program `existing` revised as `merged`, built on the folder and machines its pictures were read from, its media checked against its holder's panel. */
  const revisionBuilt = async (
    instance: InstanceRow,
    row: ArtifactRow,
    existing: string,
    merged: string
  ) => {
    const dir = getMeta(docs.doc(row.id), "programDir");
    const shown = store.shownPictures(row.id, existing);
    const readOn = revisionReadsOn(row, instance, shown);
    const page = await built(
      instance,
      row.name,
      {
        program: merged,
        dir: typeof dir === "string" ? dir : undefined,
        shown,
        readOn,
      },
      row.heldFor === null
    );
    if (page instanceof ElysiaStatus) {
      return page;
    }
    const { program } = page;
    if (!program) {
      return problem(400, {
        code: "artifact-program-unbuilt",
        detail: "A program is required.",
      });
    }
    const unheld = ctx.mediaHeld(holder(row) ?? instance, program);
    return unheld ?? { html: page.html, program, readOn };
  };
  /** Decision page `row`'s program `existing` revised as `merged`, built, checked and written; what changed. */
  const programRevised = async (
    instance: InstanceRow,
    row: ArtifactRow,
    existing: string,
    merged: { change: StatementChange; merged: string }
  ) => {
    // Said before anything is written: the merged program's cards against the person's picks and the project's pages.
    const broken = await ctx.brokenBy(row, readKept(merged.merged).cards);
    if (broken instanceof ElysiaStatus) {
      return broken;
    }
    const page = await revisionBuilt(instance, row, existing, merged.merged);
    if (page instanceof ElysiaStatus) {
      return page;
    }
    const { program, readOn } = page;
    const kept = readKept(existing).cards;
    const before = new Set(kept.map((card) => card.id));
    const after = program.read.cards.map((card) => card.id);
    const moved = db.update(row.id, nextRevision(row)) as ArtifactRow;
    const was = store.revision(moved.id);
    writePage(moved.id, page.html, program);
    keepPictureSources(moved, program, { read: readOn });
    const hash = pageHash(program.program);
    ctx.stampMeta(moved, hash);
    const changes = [
      ...cardChanges(kept, program.read.cards),
      ...pictureChanges(was?.files ?? new Map(), program.files),
    ];
    const fresh = markChanges(moved, changes);
    const touched = new Set(
      changes.filter((item) => item.kind === "card").map((item) => item.anchor)
    );
    const routes = await ctx.routedOn(
      instance,
      moved.heldFor ?? moved.id,
      program.read.cards.filter((card) =>
        touched.has(`#decision-${cssEscape(card.id)}`)
      ),
      program.read.cards
    );
    if (routes instanceof ElysiaStatus) {
      return routes;
    }
    const revised: Revised = {
      ...(Object.keys(routes).length > 0 ? { routes } : {}),
      id: moved.id,
      revision: moved.revision,
      pageHash: hash,
      statements: merged.change,
      decisions: after,
      // The cards it put in or rewrote, each by its link: what the agent names them by.
      cards: ctx.cardLinks(
        moved.heldFor ?? moved.id,
        program.read.cards.filter((card) =>
          touched.has(`#decision-${cssEscape(card.id)}`)
        )
      ),
      moved: {
        added: after.filter((card) => !before.has(card)),
        removed: [...before].filter((card) => !after.includes(card)),
      },
      ...markedLinks(moved.heldFor ?? moved.id, fresh),
      ...(program.dropped.length > 0 ? { dropped: program.dropped } : {}),
      ...(broken ? { broken } : {}),
    };
    return revised;
  };

  return {
    answeredHere,
    createdPage,
    decisionsOf,
    keepPublishedSources,
    keptAsMedia,
    markChanges,
    markRevision,
    markedLinks,
    pageChanged,
    pageChanges,
    pageHashOf,
    pageNow,
    programOf,
    programRevised,
    writePage,
  };
};
