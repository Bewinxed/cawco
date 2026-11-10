import {
  type ArtifactPlace,
  artifactStopHref,
} from "@cawco/core/artifact-needs";
import { readPins } from "@cawco/core/comments/model";
import type { InstanceRow } from "@cawco/core/protocol";
import { sessionLink } from "@cawco/core/references";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { ElysiaStatus } from "elysia";
import type { ArtifactRow } from "../db/artifacts";
import { byHandle, type Handled, namesAny } from "../handles";
import { sessionLabel } from "../labels";
import { refusal } from "../refusal";
import { isSetupPage } from "../setup";
import type { ArtifactServiceDeps } from "./deps";

/** How a tool names an artifact: its id or handle, else its name. */
const ARTIFACT_KEYS: Handled<{
  id: string;
  kind: string;
  name: string;
}> = {
  id: (row) => row.id,
  names: (row) => [row.name],
  said: (row) => `${row.name} (${row.kind} ${row.id.slice(0, 8)})`,
};

/** The id of the one artifact among `rows` that `asked` names; thrown when it names none or several. */
const artifactByHandle = (
  asked: string,
  rows: readonly { id: string; kind: string; name: string }[]
): string => byHandle(asked, rows, ARTIFACT_KEYS, "artifact").id;

/**
 * The id of the one artifact among `rows` (read here) that `asked` names
 * ({@link artifactByHandle}); refused in its words when it names none or
 * several, or the read fails: a refusal of the call, never the hub's own
 * fault.
 */
export const artifactNamed = (
  asked: string,
  rows: () => readonly { id: string; kind: string; name: string }[]
) => {
  try {
    return artifactByHandle(asked, rows());
  } catch (error) {
    return refusal(
      404,
      "artifact-unnamed",
      error instanceof Error ? error.message : String(error)
    );
  }
};

/** A whole artifact id, which needs no resolving. */
const WHOLE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * The project whose page draws artifact `row`, or null: a project's setup
 * page (setup.ts `isSetupPage`) is never drawn in a session's panel, by any
 * show. While its project is not set up it is drawn as the board (decision
 * page `onboarding-first-minutes`, card `draft-where`), the one editor of
 * the draft; once it is, in the project's Decisions tab (core
 * `setupLanding`).
 */
export const boardOf = (row: ArtifactRow): string | null =>
  row.projectId !== null && isSetupPage(row) ? row.projectId : null;

export const named = (row: Pick<ArtifactRow, "kind" | "name">) =>
  `the ${row.kind} "${row.name}"`;

/** What createAccess reads of the artifact service: its deps, and the service's parts it calls, each read when called. */
export interface AccessContext {
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  docs: ArtifactServiceDeps["docs"];
}

/** Who may do what to an artifact: a session's relationship to it (holder, maker, its delegation tree above or beside, the project it leads, the one it left the artifact in) and each act's rule over those. */
/** Artifact `id` is not there for the session that asks: one it has not, or may not reach. */
const noArtifact = (id: string) =>
  refusal(404, "artifact-unknown", artifactToolWords.noArtifact(id));

export const createAccess = (ctx: AccessContext) => {
  const { db, deps, docs } = ctx;

  /** The session whose panel holds `row`; none for a project's page whose session is gone (schema.ts `artifacts.instanceId`). */
  const holder = (row: ArtifactRow): InstanceRow | undefined =>
    row.instanceId === null ? undefined : deps.instance(row.instanceId);
  /**
   * What a create of `kind` and `name` in `owner`'s panel lands on: in a
   * project, its page of that name whoever wrote it (a project's page is the
   * project's by its name, db/artifacts.ts `projectPage`); else the owner's
   * own of that kind and name.
   */
  const namedFor = (
    owner: InstanceRow,
    kind: ArtifactRow["kind"],
    name: string
  ): ArtifactRow | undefined =>
    (kind === "page" && owner.projectId
      ? db.projectPage(owner.projectId, name)
      : undefined) ?? db.byName(owner.id, kind, name);
  const sessionOf = (id: string) =>
    deps.instance(id) ??
    refusal(404, "artifact-session-unknown", "Session not found.");
  /**
   * Whether `row` is another session's of `instance`'s delegation tree in
   * the same project ({@link ArtifactServiceDeps.tree}): the tree reads it,
   * its owner alone changes it.
   */
  const inTree = (instance: InstanceRow, row: ArtifactRow): boolean => {
    const owner = holder(row);
    return (
      !!owner &&
      owner.id !== instance.id &&
      owner.projectId === instance.projectId &&
      deps.tree(instance).has(owner.id)
    );
  };
  /**
   * The other sessions of `instance`'s delegation tree that hold an
   * artifact, in the tree's order, each with its row and its artifacts,
   * newest first: one read of the artifacts and one of their holders'
   * rows, so a read costs what the tree holds, not the tree's size. Walked
   * one session at a time, with a turn's input check on each, an
   * orchestrator's 1,347 delegates held the hub's thread for 2.6 s on every
   * artifact_list (2026-10-24, nightly 5540 rolled back for it).
   */
  const holdersInTree = (
    instance: InstanceRow
  ): { artifacts: ArtifactRow[]; row: InstanceRow }[] => {
    const others = [...deps.tree(instance)].filter((id) => id !== instance.id);
    const held = Map.groupBy(
      db.ofInstances(others),
      (row) => row.instanceId as string
    );
    const rows = new Map(
      deps.instances([...held.keys()]).map((row) => [row.id, row])
    );
    return others.flatMap((id) => {
      const row = rows.get(id);
      const artifacts = held.get(id);
      return row && artifacts ? [{ row, artifacts }] : [];
    });
  };
  /** The artifacts of the other sessions of `instance`'s delegation tree in its project ({@link inTree}). */
  const ofTree = (
    instance: InstanceRow,
    holders = holdersInTree(instance)
  ): ArtifactRow[] =>
    holders.flatMap(({ row, artifacts }) =>
      row.projectId === instance.projectId ? artifacts : []
    );
  /**
   * The artifacts the session can name and read ({@link readable}), each
   * once, those it answers first: its own, its project's it answers, its
   * delegation tree's, its project's pages and those of the projects it
   * is the conversation of. What its project's cold writers left ({@link leftInProject})
   * comes after these, only for what none of them names ({@link whole},
   * service.ts `pinOf`).
   */
  const nameable = (instance: InstanceRow): ArtifactRow[] => {
    const seen = new Map<string, ArtifactRow>();
    const holders = holdersInTree(instance);
    const pagesOf = (projectId: string) =>
      db.ofProject(projectId).filter((one) => one.kind === "page");
    for (const row of [
      ...answerable(instance, holders),
      ...ofTree(instance, holders),
      ...(instance.projectId ? pagesOf(instance.projectId) : []),
      ...deps.ledProjects(instance).flatMap(pagesOf),
    ]) {
      if (!seen.has(row.id)) {
        seen.set(row.id, row);
      }
    }
    return [...seen.values()];
  };
  /**
   * The artifact `asked` names for `instance`: a whole id as given, else its
   * handle or its name among the artifacts the session can name
   * ({@link nameable}), else, when it names none of those, among what its
   * project's cold writers left ({@link leftInProject}), so a name of its
   * own never turns ambiguous by another's; refused when none or several
   * are (handles.ts).
   */
  const whole = (instance: InstanceRow, asked: string) => {
    if (WHOLE_ID.test(asked)) {
      return asked;
    }
    const near = nameable(instance);
    return artifactNamed(asked, () =>
      namesAny(asked, near, ARTIFACT_KEYS)
        ? near
        : [...near, ...leftInProject(instance)]
    );
  };
  /** The whole id of the artifact session `instanceId` names ({@link whole}). */
  const namedIn = (instanceId: string, asked: string) => {
    const session = sessionOf(instanceId);
    return session instanceof ElysiaStatus ? session : whole(session, asked);
  };
  /** The session's artifact `id`; refused when it is another session's or not there. */
  const own = (instance: InstanceRow, asked: string) => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const row = db.get(id);
    if (row && row.instanceId !== instance.id && inTree(instance, row)) {
      return refusal(
        403,
        "artifact-others",
        artifactToolWords.othersArtifact(
          `${named(row)[0]?.toUpperCase()}${named(row).slice(1)}`,
          row.instanceId?.slice(0, 8) ?? ""
        )
      );
    }
    if (!row || row.instanceId !== instance.id) {
      return noArtifact(id);
    }
    return row;
  };
  /**
   * Artifact `id` for the person's change from session `panelId`'s panel
   * (its thumbnail, a sheet's Save, Verify), with the session that holds
   * it, which the change is made as: one the panel {@link sees}, refused as
   * not there otherwise. The person acts there, as their Send does
   * (preview-routes.ts); a session's own tools keep to {@link own}, so no
   * agent changes another session's artifact.
   */
  const panelHeld = (panelId: string, id: string) => {
    const panel = sessionOf(panelId);
    if (panel instanceof ElysiaStatus) {
      return panel;
    }
    const row = db.get(id);
    const owner = row ? holder(row) : undefined;
    if (!(row && owner && sees(panel, row))) {
      return noArtifact(id);
    }
    return { owner, row };
  };
  /** The sessions above `writer`: its parent, that one's parent, up to the top. */
  const above = (writer: InstanceRow): Set<string> => {
    const up = new Set<string>();
    let at = writer.parentInstanceId;
    while (at && !up.has(at)) {
      up.add(at);
      at = deps.instance(at)?.parentInstanceId ?? null;
    }
    return up;
  };
  /**
   * Whether session `writer` can never act again, nor anyone for it: it is
   * stranded ({@link ArtifactServiceDeps.stranded}), or its work item ended
   * and no session up its delegation tree can still act (none there is
   * stranded or past its own item's end).
   */
  const goneForGood = (writer: InstanceRow): boolean =>
    deps.stranded(writer) ||
    (deps.itemEnded(writer) &&
      !deps
        .instances([...above(writer)])
        .some((up) => !(deps.stranded(up) || deps.itemEnded(up))));
  /**
   * Whether `row` is what its writers left in `instance`'s project: its
   * holder, and its maker when another session made it, each of that
   * project, neither the session itself, and each cold
   * ({@link ArtifactServiceDeps.cold}, handoff's test, so none takes work
   * without being asked) or gone for good ({@link goneForGood}). Any
   * session of the project then reads it, answers and resolves its pins,
   * revises it, and deletes it once its pins are resolved
   * ({@link deletable}), so the person's pins never wait on a session no one
   * can wake. A running or warm writer keeps its own, and a warm session up
   * a writer's delegation tree keeps its tree's ({@link lineKeeps}). `find`
   * reads a session's row; `judged` keeps each verdict across one walk.
   */
  const leftFor = (
    instance: InstanceRow,
    row: ArtifactRow,
    find: (id: string) => InstanceRow | undefined = deps.instance,
    judged = new Map<string, boolean>()
  ): boolean =>
    !!instance.projectId &&
    row.heldFor === null &&
    row.instanceId !== null &&
    row.projectId === instance.projectId &&
    [...new Set([row.instanceId, row.madeBy ?? row.instanceId])].every((id) =>
      writerLeft(instance, id, id === row.instanceId, find, judged)
    );
  /**
   * Whether writer `id` of an artifact has left it to `instance`'s project
   * ({@link leftFor}): of that project, not the session itself, and cold or
   * gone for good, judged once per walk in `judged`. A maker the hub no
   * longer holds acts no more; a holder it doesn't hold is no one's panel.
   */
  const writerLeft = (
    instance: InstanceRow,
    id: string,
    holds: boolean,
    find: (id: string) => InstanceRow | undefined,
    judged: Map<string, boolean>
  ): boolean => {
    if (id === instance.id) {
      return false;
    }
    const writer = find(id);
    if (!writer) {
      return !holds;
    }
    if (writer.projectId !== instance.projectId) {
      return false;
    }
    let left = judged.get(id);
    if (left === undefined) {
      left =
        (deps.cold(writer) || goneForGood(writer)) &&
        !lineKeeps(writer, judged);
      judged.set(id, left);
    }
    return left;
  };
  /**
   * Whether a session up `writer`'s delegation tree keeps what the writer
   * left: one warm ({@link ArtifactServiceDeps.cold} false) and not
   * stranded, so it can still act on its tree's artifacts, as the up-tree
   * delete lets it ({@link deletable}). Each one judged once in `judged`,
   * under its own key.
   */
  const lineKeeps = (
    writer: InstanceRow,
    judged: Map<string, boolean>
  ): boolean =>
    [...above(writer)].some((id) => {
      const key = `up:${id}`;
      let keeps = judged.get(key);
      if (keeps === undefined) {
        const up = deps.instance(id);
        keeps = !!up && !deps.stranded(up) && !deps.cold(up);
        judged.set(key, keeps);
      }
      return keeps;
    });
  /**
   * Every artifact of `instance`'s project its writers left there
   * ({@link leftFor}): one read of the project's artifacts and one of their
   * writers' rows, each writer judged once.
   */
  const leftInProject = (instance: InstanceRow): ArtifactRow[] => {
    if (!instance.projectId) {
      return [];
    }
    const rows = db
      .ofProject(instance.projectId)
      .filter(
        (row) => row.instanceId !== null && row.instanceId !== instance.id
      );
    const writers = new Map(
      deps
        .instances([
          ...new Set(
            rows.flatMap((row) => [
              row.instanceId as string,
              ...(row.madeBy ? [row.madeBy] : []),
            ])
          ),
        ])
        .map((writer) => [writer.id, writer])
    );
    const judged = new Map<string, boolean>();
    return rows.filter((row) =>
      leftFor(instance, row, (id) => writers.get(id), judged)
    );
  };
  /**
   * Artifact `asked` for a delete, named as every artifact tool names one
   * (its id, handle or name, {@link whole}): the session's own
   * ({@link own}), or another session's whose work item ended
   * ({@link ArtifactServiceDeps.itemEnded}) or whose asks are over for good
   * ({@link ArtifactServiceDeps.finished}: ended, its workspace archived or
   * moved on, its conversation gone, nothing to give it a turn again) when
   * this session is up the writer's delegation tree, at any depth, so
   * whoever is up the tree cleans up after a session that can no longer
   * act. Once its writers are cold or gone for good and no one up their
   * tree is warm ({@link leftFor}), any session of its project deletes it, after its pins are resolved: the
   * person's pins are answered before they go. Its content stays the
   * writer's while it is warm. Refused otherwise, naming who deletes it.
   */
  const deletable = (instance: InstanceRow, asked: string) => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const row = db.get(id);
    const writer = row && row.heldFor === null ? holder(row) : undefined;
    if (!(row && writer) || writer.id === instance.id) {
      return own(instance, id);
    }
    const up = above(writer).has(instance.id);
    if (up && (deps.itemEnded(writer) || deps.finished(writer))) {
      return row;
    }
    const whose = `${named(row)[0]?.toUpperCase()}${named(row).slice(1)} is ${sessionLink(writer.id, sessionLabel(writer).name)}'s`;
    if (leftFor(instance, row)) {
      const open = [...readPins(docs.doc(row.id)).values()].filter(
        (pin) => !pin.resolvedAt
      ).length;
      if (open === 0) {
        return row;
      }
      return refusal(
        409,
        "artifact-pins-open",
        artifactToolWords.pinsOpenFirst(whose, open)
      );
    }
    return up
      ? refusal(
          403,
          "artifact-maker-deletes",
          artifactToolWords.makerDeletes(whose)
        )
      : refusal(
          403,
          "artifact-not-in-tree",
          artifactToolWords.notInTree(whose)
        );
  };
  /**
   * Artifact `id` for a change: the session owns it or made it (a delegate
   * goes on updating and reading what it handed to its parent), or its
   * writers left it in the session's project ({@link leftFor}).
   */
  const revisable = (instance: InstanceRow, asked: string) => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const row = db.get(id);
    if (row?.madeBy === instance.id) {
      return row;
    }
    if (row && leftFor(instance, row)) {
      return row;
    }
    return own(instance, id);
  };
  /**
   * Artifact `id` for a look that changes nothing (a show, a view's word that
   * it has it, a canvas's map): the session's own, one it made, or another
   * session's of its delegation tree ({@link inTree}); refused as not there
   * otherwise. Every change keeps to {@link own}.
   */
  const viewable = (instance: InstanceRow, asked: string) => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const row = db.get(id);
    return row && sees(instance, row) ? row : noArtifact(id);
  };
  /**
   * Artifact `id` for the person's show from session `instance`'s view:
   * any a session of the fleet holds, or one `instance` sees ({@link sees})
   * that none holds; refused as not there otherwise. Where it opens is
   * the show's ({@link Artifacts.show}).
   */
  const showable = (instance: InstanceRow, asked: string) => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const row = db.get(id);
    return row && (row.instanceId !== null || sees(instance, row))
      ? row
      : noArtifact(asked);
  };
  /**
   * Where the person's show of `row` (`found`, or the version it is held
   * for) from session `instance`'s view goes instead of that panel: the
   * panel of the session holding it, at `at` (core `artifactStopHref`),
   * when `instance` does not see it ({@link sees}); null when it opens here,
   * or is a project's setup page, which lands where its show says
   * (service.ts `landingOf`).
   */
  const inItsSession = (
    instance: InstanceRow,
    found: ArtifactRow,
    row: ArtifactRow,
    at: ArtifactPlace
  ): { opened: false; why: string; href: string } | null =>
    row.instanceId === null || sees(instance, found) || boardOf(row)
      ? null
      : {
          opened: false,
          why: artifactToolWords.inItsSession(row.name),
          href: artifactStopHref(row.instanceId, row.id, at),
        };
  /**
   * Whether `instance` may show and read `row` without changing it: its
   * own, one it made, or another session's of its delegation tree
   * ({@link inTree}). The one rule for a look ({@link viewable}), and the
   * heart of what a decision page's Canvas and Preview pieces show
   * ({@link embeds}).
   */
  const sees = (instance: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId === instance.id ||
    row.madeBy === instance.id ||
    inTree(instance, row);
  /**
   * Page `id` of the session's own project, whoever wrote it: a later
   * session there, or its Caw, reads its program and revises it (a link is
   * an `after` on the dependent decision, Projects spec §5.8). Undefined for
   * a page of no project, another project's, or a held next version.
   */
  const projectPage = (
    instance: InstanceRow,
    id: string
  ): ArtifactRow | undefined => {
    const row = db.get(id);
    return row?.kind === "page" &&
      row.heldFor === null &&
      row.projectId !== null &&
      row.projectId === instance.projectId
      ? row
      : undefined;
  };
  /**
   * Whether the session's read of `row` counts as its owner's: the owner's
   * own, and a conversation's of his project's pages, always have. Its maker's, and
   * another session's of the project, leave the owner's unread.
   */
  const readsForOwner = (instance: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId === instance.id ||
    (row.madeBy !== instance.id &&
      (answerable(instance).some((one) => one.id === row.id) ||
        ledPage(instance, row.id) !== undefined));
  /**
   * The artifacts whose pins a session answers: its own, and, for a
   * project's conversation (Caw), those of every session of its project,
   * whose ended writer's marks come to him. No other session's.
   */
  const answerable = (
    instance: InstanceRow,
    holders = holdersInTree(instance)
  ): ArtifactRow[] => [
    ...db.ofInstance(instance.id),
    // Its delegates' that have ended: their marks come to it (server.ts
    // `deliverArtifactMarks`). Only a delegate holding an artifact is asked.
    ...holders.flatMap(({ row, artifacts }) =>
      row.parentInstanceId === instance.id && deps.ended(row) ? artifacts : []
    ),
    ...deps
      .ledProjects(instance)
      .flatMap((projectId) =>
        db
          .ofProject(projectId)
          .filter(
            (row) =>
              row.instanceId !== instance.id &&
              holder(row)?.projectId === projectId
          )
      ),
  ];
  /** Page `id`, when it belongs to a project `instance` is the conversation of. */
  const ledPage = (
    instance: InstanceRow,
    id: string
  ): ArtifactRow | undefined => {
    const row = db.get(id);
    return row?.kind === "page" &&
      row.projectId &&
      deps.ledProjects(instance).includes(row.projectId)
      ? row
      : undefined;
  };
  /**
   * Artifact `id`, when the session answers its pins ({@link answerable}),
   * or when it is a page of a project the session is the conversation of or works in
   * ({@link projectPage}), whatever became of its writer, or when another
   * session of its delegation tree holds it ({@link inTree}), or when its
   * writers left it in the session's project ({@link leftFor}); refused
   * when none. A held next version is read by
   * whoever reads its artifact: the parent reviews what its maker changed.
   */
  const readable = (
    instance: InstanceRow,
    asked: string
  ): ArtifactRow | NotReadable => {
    const id = whole(instance, asked);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const next = db.get(id);
    if (next?.heldFor) {
      const held = readable(instance, next.heldFor);
      return held instanceof ElysiaStatus ? held : next;
    }
    const row =
      answerable(instance).find((one) => one.id === id) ??
      ledPage(instance, id) ??
      projectPage(instance, id) ??
      (next && (inTree(instance, next) || leftFor(instance, next))
        ? next
        : undefined);
    return row ?? noArtifact(id);
  };
  /** Why {@link readable} reads no artifact: a name that names none, or an id it may not read. */
  type NotReadable =
    Exclude<ReturnType<typeof whole>, string> | ReturnType<typeof noArtifact>;
  /**
   * Whether the session is the one the artifact's marks go to
   * ({@link ArtifactServiceDeps.answersTo}, artifacts/taker.ts): its writer;
   * once the writer takes no input, the session that delegated it, else
   * its project's conversation. What it reads of them counts as heard.
   */
  const takes = (instance: InstanceRow, row: ArtifactRow): boolean => {
    if (row.instanceId === instance.id) {
      return true;
    }
    const to = deps.answersTo(holder(row), row);
    if (to === null) {
      return false;
    }
    return "session" in to
      ? to.session.id === instance.id
      : deps.ledProjects(instance).includes(to.caw.projectId);
  };
  /**
   * Whether a decision page held by `owner` may draw `row` in its Canvas
   * and Preview pieces: one the owner sees ({@link sees}: its own, one it
   * made, its delegation tree's) or a page of its project
   * ({@link projectPage}). Never another project's.
   */
  const embeds = (owner: InstanceRow, row: ArtifactRow): boolean =>
    sees(owner, row) || projectPage(owner, row.id) !== undefined;

  return {
    namedIn,
    above,
    answerable,
    deletable,
    embeds,
    holder,
    holdersInTree,
    inItsSession,
    leftInProject,
    nameable,
    namedFor,
    ofTree,
    own,
    panelHeld,
    projectPage,
    readable,
    readsForOwner,
    revisable,
    sees,
    sessionOf,
    showable,
    takes,
    viewable,
    whole,
  };
};
