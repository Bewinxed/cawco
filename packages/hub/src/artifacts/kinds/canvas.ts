import {
  CANVAS_LIMITS,
  type CanvasEntry,
  canvasOutline,
  excalidrawFile,
} from "@cawco/core/canvas";
import type { MapChange } from "@cawco/core/doc-maps";
import { type ChangedItem, docMeta, setMeta } from "@cawco/core/doc-meta";
import type { InstanceRow } from "@cawco/core/protocol";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { artifactWords } from "@cawco/core/words/artifacts";
import { ElysiaStatus } from "elysia";
import type { ArtifactRow } from "../../db/artifacts";
import { refusal } from "../../refusal";
import {
  canvasEntries,
  clearDrawing,
  convertOnScreen,
  deleteElements,
  pictureOfWrite,
  pictureShowsWrite,
  screenJoined,
  stampWrote,
} from "../canvas";
import { stateOf } from "../facts";
import { sceneChanges } from "../page-changes";
import type {
  ArtifactInput,
  ArtifactRead,
  CanvasChange,
  Created,
  Making,
  Opened,
  SkeletonElement,
} from "../shapes";
import { routeOf } from "../sync";
import type { KindContext } from "./context";

/** What CanvasKind reads of the artifact service ({@link KindContext}). */
export type CanvasKindContext = Pick<
  KindContext,
  | "askedOf"
  | "db"
  | "deps"
  | "discard"
  | "docs"
  | "handOver"
  | "handing"
  | "heldId"
  | "holdNext"
  | "markRevision"
  | "markedLinks"
  | "openNextFirst"
  | "openedOf"
  | "personChangedAfter"
  | "pictureOf"
  | "readTo"
  | "stampMeta"
>;

/** A canvas: the drawing a session makes and changes with the person on one live scene, drawn by a screen the hub opens when no view holds it (headless), its picture what a read with png answers. */
export const createCanvasKind = (ctx: CanvasKindContext) => {
  const {
    db,
    deps,
    discard,
    docs,
    handOver,
    handing,
    heldId,
    holdNext,
    markRevision,
    markedLinks,
    openNextFirst,
  } = ctx;

  /**
   * What the agent's write to canvas `row` changed (page-changes.ts
   * `sceneChanges`, from the scene `before` it, its stamps moving alone no
   * change); one that changed it owes a new picture ({@link stampWrote}),
   * and one that changed nothing owes none.
   */
  const sceneWritten = (
    row: ArtifactRow,
    before: CanvasEntry[]
  ): ChangedItem[] => {
    const items = sceneChanges(before, canvasEntries(docs, row.id));
    if (items.length > 0) {
      stampWrote(docs, row.id);
    }
    return items;
  };
  /**
   * What an agent's update to canvas `row` changed (page-changes.ts
   * `sceneChanges`, from the scene `before` it and as it stands now), marked
   * under the canvas's next scene version (`meta.sceneVersion`). A canvas's
   * looks are kept by its scene version, not its revision: an update draws
   * into the live scene every screen holds, and moving the revision would
   * load the panel's frame again under the person for every batch the agent
   * draws.
   */
  const markSceneChanges = (
    row: ArtifactRow,
    before: CanvasEntry[]
  ): ChangedItem[] => {
    const items = sceneWritten(row, before);
    if (items.length === 0) {
      return [];
    }
    return markRevision(row, items, (meta) => {
      const version = (Number(meta.get("sceneVersion")) || 0) + 1;
      meta.set("sceneVersion", version);
      return version;
    });
  };
  /** A canvas's `.excalidraw` file and its outline, as the doc holds them now. */
  const canvasFile = (id: string) => {
    const elements = canvasEntries(docs, id).map((entry) => entry.el);
    return {
      file: excalidrawFile(
        elements,
        docs.doc(id).getMap("files").toJSON() as Record<string, unknown>
      ),
      outline: canvasOutline(elements),
    };
  };
  /**
   * A canvas as the session reads it, which counts as its read when
   * `ownersRead`: its owner's. It returns the canvas's elements, never its
   * state, so it counts as read only up to an answer of the person's in its
   * state the session hadn't had (needs.ts `readThrough`): a canvas whose
   * state kept his picks or notes would otherwise settle them unread.
   */
  const readCanvas = (
    row: ArtifactRow,
    since?: number,
    png = false,
    ownersRead = true
  ): ArtifactRead => {
    const entries = canvasEntries(docs, row.id);
    const present = new Set(entries.map((entry) => entry.el.id));
    const doc = docs.doc(row.id);
    const meta = docMeta(doc);
    if (ownersRead) {
      const through = ctx.readTo(row, stateOf(doc), () => false);
      db.update(row.id, { deliveredSeq: through, readSeq: through });
    }
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      revision: row.revision,
      pageHash: null,
      sentAt: null,
      seq: row.seq,
      state: {},
      outline: canvasOutline(entries.map((entry) => entry.el)),
      changed: ctx.personChangedAfter(row, since ?? row.deliveredSeq, present),
      pictureAt: meta.get("pictureAt") ?? null,
      draft: meta.get("draft") === true,
      ...(png ? { png: ctx.pictureOf(row.id) } : {}),
      // Asked for after the wait for it (canvasNow): one still behind is said so.
      ...(png && !pictureShowsWrite(docs, row.id)
        ? { pictureBehind: true as const }
        : {}),
    };
  };
  /**
   * The hub machine's screen on each canvas no other screen shows (a
   * delegate's handed up, a held next version, one whose panel no dashboard
   * has open), by artifact: opened by the first write that finds no screen
   * joined, kept while any write on it runs (`writing`), and
   * let go once a picture has followed the last of them (the page posts one
   * after a quiet 2 s), or `screenHoldMs` after it. `joined` answers once its
   * page has joined the canvas's doc; `settle` stops a let-go that waits.
   */
  const headless = new Map<
    string,
    {
      joined: ReturnType<typeof joinedScreen>;
      settle?: () => void;
      writing: number;
    }
  >();
  /** The hub machine's screen opened on canvas `row`, once its page joined the doc; the refusal of its open, or of a page that didn't join in time. */
  const joinedScreen = async (row: ArtifactRow) => {
    const one = await deps.screen(row, routeOf(row.id));
    if (one instanceof ElysiaStatus) {
      return one;
    }
    if (await screenJoined(docs, row.id, CANVAS_LIMITS.convertMs)) {
      return one;
    }
    one.release();
    return refusal(
      504,
      "artifact-canvas-screen-unjoined",
      `The canvas ${row.name} wasn't drawn: the hub's machine opened it, but its page didn't join the canvas within ${Math.round(CANVAS_LIMITS.convertMs / 1000)} s.`
    );
  };
  /**
   * The canvas's headless screen, opened when it has none and held on when
   * it has: a write on it counted, any let-go that waited called off.
   */
  const headlessScreen = (row: ArtifactRow) => {
    let screen = headless.get(row.id);
    if (screen) {
      screen.joined.then(
        (one) => {
          if (!(one instanceof ElysiaStatus)) {
            one.hold();
          }
        },
        () => undefined
      );
    } else {
      const joined = joinedScreen(row);
      const opened = { joined, writing: 0 };
      headless.set(row.id, opened);
      // One that refused or failed is let go: the next write opens another.
      const forget = () => {
        if (headless.get(row.id) === opened) {
          headless.delete(row.id);
        }
      };
      joined.then((one) => {
        if (one instanceof ElysiaStatus) {
          forget();
        }
      }, forget);
      screen = opened;
    }
    screen.settle?.();
    screen.writing += 1;
    return screen;
  };
  /** The canvas's headless screen let go now, if it has one. */
  const letGoHeadless = (id: string) => {
    const screen = headless.get(id);
    if (!screen) {
      return;
    }
    screen.settle?.();
    headless.delete(id);
    screen.joined.then(
      (one) => {
        if (!(one instanceof ElysiaStatus)) {
          one.release();
        }
      },
      () => undefined
    );
  };
  /** A write on the headless screen done: the last one lets it go once a picture follows it, or `screenHoldMs` on. */
  const wroteHeadless = (id: string) => {
    const screen = headless.get(id);
    if (!screen) {
      return;
    }
    screen.writing -= 1;
    if (screen.writing > 0) {
      return;
    }
    const meta = docMeta(docs.doc(id));
    const pictured = (event: MapChange) => {
      if (event.keysChanged.has("pictureAt")) {
        letGoHeadless(id);
      }
    };
    const timer = setTimeout(
      () => letGoHeadless(id),
      CANVAS_LIMITS.screenHoldMs
    );
    meta.observe(pictured);
    screen.settle = () => {
      clearTimeout(timer);
      meta.unobserve(pictured);
      screen.settle = undefined;
    };
  };
  /**
   * What a canvas's create or update draws: skeleton elements or Mermaid,
   * converted on a screen; the ids written. A create's (`replace`) replaces
   * the drawing in the same write (core `keptOnRemake`); an update's adds,
   * or replaces by id. On a screen showing it when one has joined;
   * otherwise on the hub machine's headless screen ({@link headlessScreen}),
   * so a canvas no one has open is drawn and read back all the same.
   */
  const draw = async (
    row: ArtifactRow,
    change: { elements: SkeletonElement[] } | { mermaid: string },
    replace = false
  ) => {
    if ("elements" in change) {
      if (change.elements.length > CANVAS_LIMITS.elementsPerCall) {
        return refusal(
          413,
          "artifact-canvas-elements-many",
          `One call writes at most ${CANVAS_LIMITS.elementsPerCall} elements; send the rest in another.`
        );
      }
    } else if (change.mermaid.length > CANVAS_LIMITS.mermaid) {
      return refusal(
        413,
        "artifact-canvas-mermaid-long",
        `Mermaid is at most ${CANVAS_LIMITS.mermaid} characters; split the diagram.`
      );
    }
    const replacing = replace ? { replace: true as const } : {};
    const convert = () =>
      "elements" in change
        ? convertOnScreen(docs, row.id, "elements", {
            elements: change.elements,
            ...replacing,
          })
        : convertOnScreen(docs, row.id, "mermaid", {
            mermaid: change.mermaid,
            ...replacing,
          });
    if (docs.screens(row.id) > 0 && !headless.has(row.id)) {
      return await convert();
    }
    try {
      const joined = await headlessScreen(row).joined;
      return joined instanceof ElysiaStatus ? joined : await convert();
    } finally {
      wroteHeadless(row.id);
    }
  };
  /**
   * The person's own canvas, opened in the composer: always a new artifact,
   * named `name`, or `name-2`, `name-3`… when the session has that one,
   * marked `draft` until its first send, and not shown in the panel.
   */
  const createDraft = (instance: InstanceRow, input: ArtifactInput) => {
    if (input.elements !== undefined || input.mermaid !== undefined) {
      return refusal(
        400,
        "artifact-draft-drawn",
        "A draft canvas starts empty: it takes no elements or mermaid."
      );
    }
    const { name } = input;
    let free = name;
    let title = artifactWords.draftTitle;
    for (let n = 2; db.byName(instance.id, "canvas", free, true); n += 1) {
      free = `${name.slice(0, 63 - String(n).length - 1)}-${n}`;
      title = `${artifactWords.draftTitle} ${n}`;
    }
    const now = new Date();
    const row = db.create({
      id: crypto.randomUUID(),
      instanceId: instance.id,
      madeBy: instance.id,
      heldFor: null,
      projectId: instance.projectId ?? null,
      kind: "canvas",
      name: free,
      composer: true,
      // The person's own canvas: nothing is asked of them on it.
      does: "draw",
      ask: "",
      title,
      machineId: null,
      source: { page: free },
      revision: 1,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    ctx.stampMeta(row, null);
    docs.transact(row.id, "hub", (doc) => setMeta(doc, "draft", true));
    const address = deps.previewAddress(instance.id);
    if (address instanceof ElysiaStatus) {
      return address;
    }
    const made: Created = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      route: routeOf(row.id),
      opened: false,
      why: "It stands in the composer until it is docked.",
      ...address,
    };
    return made;
  };
  /**
   * The owner's canvas of that name, its maker now `maker` and its ask the
   * input's, or a new one; and what was there. A maker's re-create of one
   * its parent opened goes to its next version (`holding`, {@link holdNext}).
   */
  const canvasPlaced = ({ owner, maker }: Making, input: ArtifactInput) => {
    const asked = ctx.askedOf(input);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const now = new Date();
    const before = db.byName(owner.id, "canvas", input.name);
    const holding = before ? holdNext(maker, before) : null;
    const target = holding?.next ?? before;
    const row =
      (target &&
        db.update(target.id, { madeBy: maker.id, ...asked, updatedAt: now })) ??
      db.create({
        id: crypto.randomUUID(),
        instanceId: owner.id,
        madeBy: maker.id,
        heldFor: null,
        projectId: owner.projectId ?? null,
        kind: "canvas",
        name: input.name,
        ...asked,
        machineId: null,
        // The hub serves it, as it serves a page.
        source: { page: input.name },
        revision: 1,
        seq: 0,
        deliveredSeq: 0,
        readSeq: 0,
        openedRevision: null,
        createdAt: now,
        updatedAt: now,
        shownAt: null,
      });
    const placed: {
      before: ArtifactRow | undefined;
      holding: ReturnType<typeof holdNext>;
      row: ArtifactRow;
    } = { before, holding, row };
    return placed;
  };
  /** What a canvas's create draws: its elements, its Mermaid, or nothing. */
  const drawingOf = ({
    elements,
    mermaid,
  }: ArtifactInput):
    { elements: SkeletonElement[] } | { mermaid: string } | null => {
    if (elements !== undefined) {
      return { elements };
    }
    return mermaid === undefined ? null : { mermaid };
  };
  /**
   * A handed canvas that couldn't be readied, refused: one the parent
   * never had is not kept, so nothing of it reaches them.
   */
  const unhanded = (
    before: ArtifactRow | undefined,
    row: ArtifactRow,
    { status, response }: Unhanded
  ) => {
    if (!before) {
      discard(row);
    }
    return refusal(
      status,
      response.code,
      `${response.detail} ${before ? "Your parent wasn't told." : "Nothing was handed to your parent."}`
    );
  };
  /** Why a canvas's drawing refused: its draw's refusal ({@link draw}). */
  type Unhanded = Extract<
    Awaited<ReturnType<typeof draw>>,
    { response: unknown }
  >;
  /**
   * Makes a canvas in `owner`'s panel, or makes the one of that name
   * again: its drawing replaced by this one's elements or Mermaid
   * ({@link draw}), or by nothing ({@link clearDrawing}), the person's
   * ink, images and pins kept, as a page made again keeps them. Shows it, or
   * hands it to its parent unopened ({@link handOver}), drawn before the
   * parent hears of it. `maker` is whose call it was.
   */
  const createCanvas = async (making: Making, input: ArtifactInput) => {
    if (input.elements !== undefined && input.mermaid !== undefined) {
      return refusal(
        400,
        "artifact-canvas-sources",
        "A canvas takes elements or mermaid, not both."
      );
    }
    const unopened = await openNextFirst(making, "canvas", input.name);
    if (unopened) {
      return unopened;
    }
    const placed = canvasPlaced(making, input);
    if (placed instanceof ElysiaStatus) {
      return placed;
    }
    const { before, holding, row } = placed;
    ctx.stampMeta(row, null);
    const change = drawingOf(input);
    const was = canvasEntries(docs, row.id);
    let wrote: string[] | undefined;
    const handed = await handOver(
      making,
      before,
      row,
      async () => {
        if (!change) {
          clearDrawing(docs, row.id);
          return;
        }
        const drawn = await draw(row, change, true);
        if (drawn instanceof ElysiaStatus) {
          return drawn;
        }
        wrote = drawn;
      },
      holding
    );
    if (handed instanceof ElysiaStatus) {
      return handing(making) ? unhanded(before, row, handed) : handed;
    }
    const shown: Opened = ctx.openedOf(handed);
    // Its outline as it stands, read as the owner's read only when the owner made it.
    const { outline } = readCanvas(
      db.get(row.id) as ArtifactRow,
      undefined,
      false,
      making.owner.id === making.maker.id
    );
    const said = heldId(row);
    // Made again, what it changed is marked, as a page made again marks it;
    // made new, nothing is marked, and its drawing owes its first picture.
    const changed = before ? markSceneChanges(row, was) : [];
    if (!before) {
      sceneWritten(row, was);
    }
    const made = {
      ...said,
      kind: row.kind,
      name: row.name,
      title: row.title,
      route: routeOf(said.id),
      ...shown,
      outline,
      ...markedLinks(said.id, changed),
    };
    if (wrote) {
      return { ...made, wrote };
    }
    return outline
      ? made
      : {
          ...made,
          note: artifactToolWords.canvasEmpty,
        };
  };
  /** A canvas's change: elements added or replaced by id, ids deleted, or Mermaid appended; read after as `ownersRead` says. */
  const updateCanvas = async (
    row: ArtifactRow,
    change: CanvasChange,
    ownersRead: boolean
  ) => {
    if ("delete" in change) {
      if (change.delete.length > CANVAS_LIMITS.deletePerCall) {
        return refusal(
          413,
          "artifact-canvas-deletes-many",
          `One call deletes at most ${CANVAS_LIMITS.deletePerCall} elements.`
        );
      }
      const before = canvasEntries(docs, row.id);
      const { deleted, missing } = deleteElements(docs, row.id, change.delete);
      const fresh = markSceneChanges(row, before);
      return {
        ...readCanvas(
          db.get(row.id) as ArtifactRow,
          undefined,
          false,
          ownersRead
        ),
        ...markedLinks(row.id, fresh),
        deleted,
        ...(missing.length > 0 ? { missing } : {}),
      };
    }
    // Replacing what the person changed since the session last read it.
    const before = canvasEntries(docs, row.id);
    const present = new Set(before.map((entry) => entry.el.id));
    const underYou =
      "elements" in change
        ? ctx
            .personChangedAfter(row, row.deliveredSeq, present)
            .filter((id) =>
              change.elements.some((element) => element.id === id)
            )
        : [];
    const wrote = await draw(row, change);
    if (wrote instanceof ElysiaStatus) {
      return wrote;
    }
    const fresh = markSceneChanges(row, before);
    const read: ArtifactRead = {
      ...readCanvas(
        db.get(row.id) as ArtifactRow,
        undefined,
        false,
        ownersRead
      ),
      ...markedLinks(row.id, fresh),
      wrote,
      ...(underYou.length > 0
        ? { changedUnderYou: underYou.map((id) => `${id} changed under you`) }
        : {}),
    };
    return read;
  };
  /**
   * Canvas `row` as `artifact_read` reads it: the person's strokes on the
   * version they have before them, its outline and picture its newest
   * version's, `now` (../versions.ts `newestVersion`), `held` naming that one when
   * its panel hasn't opened it. A picture asked for (`drawn`) waits for the one
   * owed after the last write ({@link pictureOfWrite}).
   */
  const canvasNow = async (
    row: ArtifactRow,
    now: ArtifactRow,
    since: number | undefined,
    drawn: boolean,
    ownersRead: boolean
  ): Promise<ArtifactRead> => {
    if (drawn) {
      // The picture owed after the last write, so it shows that write.
      await pictureOfWrite(docs, now.id);
    }
    const theirs = readCanvas(row, since, drawn && now === row, ownersRead);
    if (now === row) {
      return theirs;
    }
    const { outline, pictureAt, pictureBehind, png } = readCanvas(
      now,
      undefined,
      drawn,
      false
    );
    return {
      ...theirs,
      outline,
      pictureAt,
      ...(pictureBehind ? { pictureBehind } : {}),
      ...(png === undefined ? {} : { png }),
      held: now.id,
    };
  };

  return {
    canvasFile,
    canvasNow,
    createCanvas,
    createDraft,
    letGoHeadless,
    updateCanvas,
  };
};
