import type { ProgramRead } from "@cawco/core/decisions";
import { docMeta, getMeta } from "@cawco/core/doc-meta";
import type { InstanceRow } from "@cawco/core/protocol";
import { artifactLink } from "@cawco/core/references";
import type { SheetRead, StageState } from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { ElysiaStatus } from "elysia";
import type { ArtifactRow } from "../db/artifacts";
import { readKept } from "../decision-program";
import { boardOf } from "./access";
import type { ArtifactServiceDeps } from "./deps";
import { stateOf } from "./facts";
import { unheardKeys } from "./needs";
import { answersKept } from "./overwrite";
import type { createPageStore } from "./page-store";
import { servedOf } from "./served";
import type { Making } from "./shapes";

/** What createVersions reads of the artifact service: its deps, and the service's parts it calls, each read when called. */
export interface VersionsContext {
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  discard: (row: ArtifactRow) => void;
  docs: ArtifactServiceDeps["docs"];
  holder: (row: ArtifactRow) => InstanceRow | undefined;
  letGoHeadless: (id: string) => void;
  namedFor: (
    owner: InstanceRow,
    kind: ArtifactRow["kind"],
    name: string
  ) => ArtifactRow | undefined;
  programOf: (row: ArtifactRow) => string | undefined;
  show: (
    row: ArtifactRow,
    panel?: string | null,
    card?: string | null
  ) => Promise<
    | { opened: true; started: true }
    | { opened: false; started: boolean; why: string; href?: string }
  >;
  store: ReturnType<typeof createPageStore>;
  versionMoved: (row: ArtifactRow) => void;
  warmPreviews: (page: ArtifactRow, program: ProgramRead) => void;
  writeStage: (row: ArtifactRow, state: StageState, sheet?: SheetRead) => void;
}

/** An artifact's versions: the one the person sees and a maker's next held behind it while he is answering, handed to a parent and opened by the parent's show, taken over the one he sees once he has seen it (promote), with his answers kept across. */
export const createVersions = (ctx: VersionsContext) => {
  const { db, deps, docs, holder, namedFor, store } = ctx;

  /**
   * Artifact `row`'s newest version: the next one its maker's change waits
   * as ({@link holdNext}), else itself. The one rule for what stands for an
   * artifact by its id: a decision page's Canvas and Preview pieces
   * (service.ts `mediaSeen`), `artifact_browse`, and what `artifact_read` says
   * it is (service.ts `readOf`). Only the owner's panel keeps the version it
   * opened, until artifact_show opens the next ({@link show}).
   */
  const newestVersion = (row: ArtifactRow): ArtifactRow =>
    db.heldOf(row.id) ?? row;
  /**
   * The session's newest artifact the panel can show: a draft canvas still
   * in the composer is not one, nor one a delegate handed up that the
   * session hasn't shown ({@link isHanded}): that is its parent's to put in
   * front of the person, never the panel's by itself; nor a project's setup
   * page, which its board draws ({@link boardOf}).
   */
  const nextNewest = (instance: InstanceRow): ArtifactRow | undefined =>
    db.ofInstance(instance.id).find((other) => {
      const meta = docMeta(docs.doc(other.id));
      return (
        meta.get("draft") !== true &&
        meta.get("handed") !== true &&
        boardOf(other) === null
      );
    });
  /**
   * Whether a create hands the artifact to its owner: a delegate's
   * `to: "parent"`, readied but never shown by the create, so the parent
   * reviews each revision its delegate makes before the person sees it.
   */
  const handing = ({ owner, maker }: Making): boolean => owner.id !== maker.id;
  /** Whether an artifact waits on its parent unopened ({@link handOver}). */
  const isHanded = (row: ArtifactRow): boolean =>
    getMeta(docs.doc(row.id), "handed") === true;
  /**
   * Whether a maker's change to its parent's artifact `row` is held as its
   * next version ({@link holdNext}): once the parent (or the person) has
   * opened it, so it is no longer waiting on the parent as handed, every
   * change its maker makes waits for the parent's artifact_show, whether the
   * panel shows it now or the person can open it from the panel's list. Not
   * the owner's own change, nor a sheet's (its stage serves the workspace's
   * files live).
   */
  const holdsChange = (maker: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId !== maker.id &&
    row.kind !== "component" &&
    (db.heldOf(row.id) !== undefined || !isHanded(row));
  /**
   * Where a maker's change to its parent's artifact `row` goes when it
   * {@link holdsChange}: its next version, a hidden row of its own (`heldFor`)
   * made from it whole (its doc forked, its files copied), which no list
   * holds and nothing shows, so what the panel shows stays. One already held
   * takes every change after. `fresh` when this call made it; null when the
   * change is not held.
   */
  const holdNext = (
    maker: InstanceRow,
    row: ArtifactRow
  ): { fresh: boolean; next: ArtifactRow } | null => {
    if (!holdsChange(maker, row)) {
      return null;
    }
    const holding = db.heldOf(row.id);
    if (holding) {
      return { fresh: false, next: holding };
    }
    const now = new Date();
    const next = db.create({
      ...row,
      id: crypto.randomUUID(),
      heldFor: row.id,
      madeBy: maker.id,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    store.copy(row.id, next.id);
    docs.fork(row.id, next.id);
    // Nothing shows it: a canvas's writes are drawn on the headless screen (draw).
    docs.transact(next.id, "hub", (doc) => {
      const meta = docMeta(doc);
      meta.set("handed", true);
      meta.set("forkedAt", row.seq);
    });
    return { fresh: true, next };
  };
  /**
   * An owner's own create of an artifact its maker's next version is held
   * for opens that version first, as its artifact_show would ({@link
   * promote}): the create shows it, and lands on it, so neither the maker's
   * change nor the owner's is written over the other. So does a create that
   * takes a tree's preview its holder left (`lands`, service.ts `makingFor`).
   */
  const openNextFirst = async (
    { lands, owner, maker }: Making,
    kind: ArtifactRow["kind"],
    name: string
  ) => {
    const found =
      lands ??
      (owner.id === maker.id ? namedFor(owner, kind, name) : undefined);
    const next = found ? db.heldOf(found.id) : undefined;
    if (found && next) {
      const promoted = await promote(found, next);
      return promoted instanceof ElysiaStatus ? promoted : undefined;
    }
  };
  /**
   * `ready` run, its refusal answered; `undo`, what undoes what began it,
   * run first when it refuses or throws, the throw thrown on.
   */
  const readied = async <Unready>(
    ready: (() => Promise<Unready | undefined>) | undefined,
    undo: () => void
  ) => {
    try {
      const unready = await ready?.();
      if (unready !== undefined) {
        undo();
      }
      return unready;
    } catch (error) {
      undo();
      throw error;
    }
  };
  /**
   * A change held as `held.next`, made by `ready`: the parent hears of it
   * once, when this change began the hold; a fresh one whose change
   * refused or threw is let go, so nothing of it reaches them.
   */
  const heldOver = async <Unready>(
    { maker, owner }: Making,
    row: ArtifactRow,
    holding: { fresh: boolean; next: ArtifactRow },
    ready: (() => Promise<Unready | undefined>) | undefined
  ) => {
    const unready = await readied(ready, () => {
      if (holding.fresh) {
        ctx.discard(holding.next);
      }
    });
    if (unready !== undefined) {
      return unready;
    }
    if (holding.fresh) {
      ctx.versionMoved(row);
      await deps.handedUp(owner, maker, row, holding.next);
    }
  };
  /**
   * An update of artifact `row` (access.ts `revisable`; `change`, given where it
   * goes): its maker's, while the parent's panel shows it, goes to its next
   * version ({@link holdNext}); anyone else's (its owner's, or a session of
   * the project its writers left it in) to its newest version
   * ({@link newestVersion}), so a change beside a held one joins it there
   * and artifact_show opens both, never one over the other.
   */
  const changedBy = async <T>(
    instance: InstanceRow,
    row: ArtifactRow,
    change: (target: ArtifactRow) => Promise<T>
  ): Promise<T> => {
    const holding = row.madeBy === instance.id ? holdNext(instance, row) : null;
    const owner = holder(row);
    if (!(holding && owner)) {
      return await change(newestVersion(row));
    }
    // A fresh one whose change refuses or throws is let go ({@link heldOver}).
    const unchanged = () => {
      if (holding.fresh) {
        ctx.discard(holding.next);
      }
    };
    const changeHeld = async () => {
      try {
        return await change(holding.next);
      } catch (error) {
        unchanged();
        throw error;
      }
    };
    const changed = await changeHeld();
    if (changed instanceof ElysiaStatus) {
      unchanged();
      return changed;
    }
    if (holding.fresh) {
      ctx.versionMoved(row);
      await deps.handedUp(owner, instance, row, holding.next);
    }
    return changed;
  };
  /** What an answer names of `row`: its artifact's id, and for a held next version its own as `held`. */
  const heldId = (row: ArtifactRow): { held?: string; id: string } =>
    row.heldFor === null ? { id: row.id } : { id: row.heldFor, held: row.id };
  /**
   * A create's show, and what readies the artifact after it (`ready`, a
   * canvas's drawing). The session's own artifact is shown in its panel,
   * then readied there. One handed to its parent ({@link handing}) is
   * marked `meta.handed` and not shown, until the parent's own show opens
   * it; it is readied unopened, and only then is the parent told, once per
   * hand-off: when it wasn't waiting on them already, or came from another
   * delegate than the one it was waiting from. A `ready` that throws tells
   * the parent nothing and leaves its mark as it was. A re-create of one the
   * parent's panel shows is held (`held`, {@link heldOver}).
   */
  const handOver = async <Unready = never>(
    making: Making,
    before: ArtifactRow | undefined,
    row: ArtifactRow,
    ready?: () => Promise<Unready | undefined>,
    holding?: { fresh: boolean; next: ArtifactRow } | null
  ): Promise<Awaited<ReturnType<typeof ctx.show>> | Unready> => {
    if (!handing(making)) {
      const shown = await ctx.show(row);
      const unready = await ready?.();
      return unready === undefined ? shown : unready;
    }
    if (holding && before) {
      const unready = await heldOver(making, before, holding, ready);
      return unready === undefined
        ? { opened: false, started: true, why: artifactToolWords.heldAsNext }
        : unready;
    }
    const was = isHanded(row);
    const waiting = was && before?.madeBy === making.maker.id;
    const meta = docMeta(docs.doc(row.id));
    docs.transact(row.id, "hub", () => meta.set("handed", true));
    const unready = await readied(ready, () => {
      if (!was) {
        docs.transact(row.id, "hub", () => meta.delete("handed"));
      }
    });
    if (unready !== undefined) {
      return unready;
    }
    if (!waiting) {
      await deps.handedUp(making.owner, making.maker, row);
    }
    return {
      opened: false,
      started: true,
      why: artifactToolWords.handedToParent,
    };
  };
  /**
   * Held next version `next` merged into artifact `row`'s doc, the
   * person's answers since its fork kept as he wrote them: a doc merge
   * keeps whichever of two sets of one entry its client id ranks last,
   * never the newer, so a maker's patch of an entry he answered after the
   * fork would otherwise stand over his answer, unheard (overwrite.ts
   * `answersKept`). The fork's own mark leaves with the merge.
   */
  const mergeKeepingAnswers = (row: ArtifactRow, next: ArtifactRow): void => {
    const forkedAt = getMeta(docs.doc(next.id), "forkedAt");
    const since = unheardKeys(
      typeof forkedAt === "number" ? forkedAt : 0,
      db.changes(row.id, { by: "person" })
    );
    const his = stateOf(docs.doc(row.id));
    docs.merge(next.id, row.id, "agent");
    const kept = answersKept(his, stateOf(docs.doc(row.id)), since);
    docs.transact(row.id, "hub", (doc) => {
      docMeta(doc).delete("forkedAt");
      const state = doc.getMap("state");
      for (const [key, entry] of Object.entries(kept)) {
        state.set(key, entry);
      }
    });
    const keys = Object.keys(kept);
    if (keys.length > 0) {
      console.log(artifactToolWords.answersKeptAtMerge(row.id, keys));
    }
  };
  /**
   * The parent opens what its maker changed: artifact `row`'s held next
   * version merged in (its doc's changes beside the person's since, its
   * files, its source and revision), then let go. The views on `row` hear
   * it as they hear any change.
   */
  const promote = async (row: ArtifactRow, next: ArtifactRow) => {
    const maker = next.madeBy ? deps.instance(next.madeBy) : undefined;
    if (row.kind === "page" && maker && store.hasHtml(next.id)) {
      // Its project's folder takes it now, as a build that isn't held does; one it refuses opens nothing.
      const html = store.html(next.id);
      const program = store.program(next.id);
      const refused = await deps.keepPage(maker, row.name, {
        html,
        ...(program === undefined ? {} : { program }),
      });
      if (refused) {
        return refused;
      }
    }
    ctx.letGoHeadless(next.id);
    store.takeVersion(next.id, row.id);
    // The state of the server its source names, as that server's frames
    // left it in the version's doc ({@link staged}): the row's doc holds its
    // own source's, set beside it since the fork, and the merge keeps
    // whichever of two such sets its client id ranks last, never the newer.
    const stage = servedOf(next)
      ? getMeta(docs.doc(next.id), "stage")
      : undefined;
    mergeKeepingAnswers(row, next);
    // What serves it is the version's: its one write, which the preview
    // that serves its origin follows, and which lets the server it moved
    // off go once nothing shows it (server.ts `onSourceMoved`).
    db.resource(row.id, { machineId: next.machineId, source: next.source });
    // What the maker named it with the version: its title, what the person
    // does there and the head's ask, as a create in place would write them.
    db.update(row.id, {
      madeBy: next.madeBy,
      revision: next.revision,
      title: next.title,
      does: next.does,
      ask: next.ask,
      updatedAt: new Date(),
    });
    // Its preview origin, where its address was handed out, is the
    // artifact's now; the artifact's own goes with the version's row.
    db.handOrigin(next.id, row.id);
    const promoted = db.get(row.id) as ArtifactRow;
    ctx.discard(next);
    ctx.versionMoved(promoted);
    // Its server's state written after the merge, so it stands over both
    // docs' sets.
    if (stage) {
      ctx.writeStage(promoted, stage);
    }
    // The program it opens on goes out to the person now: its Previews' stages warmed for it.
    const program = ctx.programOf(promoted);
    if (program !== undefined) {
      ctx.warmPreviews(promoted, readKept(program));
    }
    return promoted;
  };
  /**
   * An answer about a held next version, said as its artifact's: that one's
   * id, and the next version's as `held`; with the artifact's link
   * (`[title](cawco:artifact/<id>)`), which the agent names it by.
   */
  const heldAnswer = <T extends { held?: string; id: string }>(
    answer: T
  ): T & { link?: string } => {
    const row = db.get(answer.id);
    const said = row?.heldFor ? { ...answer, ...heldId(row) } : answer;
    return row ? { ...said, link: artifactLink(said.id, row.title) } : said;
  };

  return {
    changedBy,
    handOver,
    handing,
    heldAnswer,
    heldId,
    holdNext,
    holdsChange,
    newestVersion,
    nextNewest,
    openNextFirst,
    promote,
  };
};
