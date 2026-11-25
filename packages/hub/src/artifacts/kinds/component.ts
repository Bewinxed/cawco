import { relative } from "node:path";
import { docMeta, getMeta, setMeta } from "@cawco/core/doc-meta";
import type { LayoutRead } from "@cawco/core/layout-guides";
import { machineLabel } from "@cawco/core/machine-names";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  type CanvasShapes,
  type CanvasSpec,
  canvasPath,
  type DesignOpened,
  designContentOf,
  designOf,
  GRAPH_WIDTHS_SAID,
  type RenderReport,
  readerOwed,
  type SectionUndrawn,
  type SheetRead,
  type SheetWritten,
  type StageOpened,
  type StageRendered,
  type StageState,
  type StageUnreached,
  type StoryOp,
  statesEntryOf,
  storyRefOf,
} from "@cawco/core/stage";
import type { MeasureRead } from "@cawco/core/stage-measure";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { measureWords } from "@cawco/core/words/stage-measure";
import { designTreeId } from "@cawco/core/workspace-id";
import { pageHash } from "@cawco/preview/proxy";
import { ElysiaStatus, problem } from "elysia";
import type { ArtifactRow } from "../../db/artifacts";
import { openProblem } from "../../preview-stops";
import type { AnyProblem } from "../../refusal";

import {
  COMPONENT_EXAMPLE,
  canvasProblem,
  type DesignPartAsked,
  designHint,
  designPageAt,
  designPartsOf,
  designPlaces,
  directionOf,
  directionsStaged,
  drawsHeld,
  errorsSaid,
  movesSaid,
  namedAsked,
  namedProblem,
  namedReport,
  READ_HINT,
  renderSaid,
  specOf,
  stageSaid,
  stateAmbiguity,
  stateSaid,
  storiesSaid,
  storyDirectionsOf,
  unseen,
  weightSaid,
} from "../component";
import {
  type DesignFile,
  designFilesProblem,
  designWhole,
} from "../design-folder";
import { stillThere } from "../facts";
import { sheetOf } from "../served";
import type {
  ArtifactInput,
  ArtifactRead,
  ComponentRead,
  ComponentReadAsk,
  ComponentWritten,
  Created,
  Making,
  SheetChange,
  StageAt,
} from "../shapes";
import { routeOf } from "../sync";
import type { KindContext } from "./context";

/** The story a story op leaves standing, by its export name: the one it added, the duplicate it made, the one it moved; none for a removal. */
const storyOfOp = (op: StoryOp): string | null => {
  if ("add" in op) {
    return storyRefOf(op.add).story;
  }
  if ("duplicate" in op) {
    return op.as;
  }
  return "move" in op ? storyRefOf(op.move).story : null;
};

/** What ComponentKind reads of the artifact service ({@link KindContext}). */
export type ComponentKindContext = Pick<
  KindContext,
  | "askedOf"
  | "db"
  | "deps"
  | "discard"
  | "docs"
  | "handOver"
  | "heldId"
  | "inPanel"
  | "marked"
  | "openedOf"
  | "openNextFirst"
  | "read"
  | "relistOf"
  | "stampMeta"
  | "store"
>;

/** A design folder's source: its pages' canvas on design tree `tree`'s stage, as it opened. */
const designSource = (
  tree: string,
  opened: DesignOpened,
  files: readonly string[],
  spec: CanvasSpec
): PreviewSource => ({
  port: opened.port,
  path: canvasPath([...files], spec),
  workspace: tree,
  stage: { dir: opened.dir, file: files[0] ?? "" },
});

/** A design's create or update as its refusals and the hub's lines name it: its name, its tree, and whether it was being made or changed. */
interface DesignAsk {
  made: boolean;
  name: string;
  tree: string;
}

/** A design folder's directions as its canvas names them: each part's page, its name and line. */
const designDirections = (
  parts: readonly DesignPartAsked[],
  files: readonly string[]
) =>
  parts.map((part, at) => ({
    file: files[at] ?? "",
    name: part.name ?? "",
    line: part.line ?? "",
  }));

/** His answer in his own words, or his dismissal, of a design's pick between its directions, as a read says it, from its `picked` entry; nothing while it is neither. */
const picklessOf = (
  picked: ArtifactRead["state"][string] | undefined
): Pick<ComponentRead, "dismissed" | "words"> => {
  if (picked?.ownWords && picked.note) {
    return { words: { at: picked.at, words: picked.note } };
  }
  return picked?.dismissed
    ? { dismissed: { at: picked.at, note: picked.note || null } }
    : {};
};

/** A design graph: a states file's stories drawn live on its machine's stage, the draws and the sheet the hub keeps of them in the doc, and a read that waits for what a browser drew. */
export const createComponentKind = (ctx: ComponentKindContext) => {
  const {
    db,
    deps,
    discard,
    docs,
    handOver,
    inPanel,
    relistOf,
    stampMeta,
    store,
  } = ctx;

  /**
   * A component artifact's page hash: its canvas address's (core
   * `canvasPath`: its states files and its spec, dials and all), so the
   * person's values the panel writes into its doc (his dials, his tuned
   * timing) carry the page they were made on, as a decision page's picks
   * carry its program's, and a value made before the agent changed its
   * dials or files reads as an earlier revision's. None for any other kind.
   */
  const componentHash = (row: ArtifactRow): string | null => {
    if (!(
      row.kind === "component" &&
      "port" in row.source &&
      row.source.path
    )) {
      return null;
    }
    return pageHash(row.source.path);
  };
  /*
   * A sheet (live components, core stage.ts): a story file's stories,
   * mounted by its workspace's stage, shown through the workspace's port
   * preview of it. The stage's state is kept in the sheet's doc
   * (`meta.stage`), its compile errors those of the modules the sheet
   * imports, so the panel and the overlay read it as the person sees it;
   * the errors the session has not heard go with the person's marks
   * ({@link deliverMarks}), heard ones kept in `meta.errorsHeard`.
   */

  /** The stage's state as sheet `row` has it: only the errors in the modules it imports. */
  const sheetState = (row: ArtifactRow, state: StageState): StageState => {
    // A design folder's stage is its own: every error on it is the design's.
    if (designOf(row)) {
      return state;
    }
    const sheet = sheetOf(row);
    // Every section's states file, from the toolchain root as the host names them.
    const mine = new Set(
      sheet?.files.map((one) => relative(sheet.dir, one)) ?? []
    );
    return {
      ...state,
      errors: state.errors.filter((error) =>
        error.sheets.some((one) => mine.has(one))
      ),
    };
  };
  /**
   * Keeps the stage's state (and the sheet as it reads, when read) in the
   * artifact's doc, and the session's preview frame, when it shows the
   * artifact, published again with it at the same revision: a panel with no
   * doc of its own (the app's) hears each change there, as the dashboard's
   * pane hears it in the doc.
   */
  const writeStage = (
    row: ArtifactRow,
    state: StageState,
    sheet?: SheetRead
  ) => {
    stageWritten(row, state, sheet);
    if (inPanel(row)) {
      relistOf(row);
    }
  };
  const stageWritten = (
    row: ArtifactRow,
    state: StageState,
    sheet?: SheetRead
  ) =>
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      const mine = sheetState(row, state);
      meta.set("stage", mine);
      if (sheet) {
        meta.set("sheet", sheet);
      }
      // Compiles again: an error that comes back later is news again.
      if (mine.errors.length === 0) {
        meta.delete("errorsHeard");
      }
    });
  /**
   * Each story's rest frame as a browser drew it (the stage's render
   * report), kept in the canvas's doc (`meta.drawnShapes`, core
   * `CanvasShapes.drawn`) for a decision page's Preview of it: its
   * skeleton stands at that shape before any embed of it has said its own.
   * A story the report has no drawn rest frame of keeps the size it had.
   */
  const drawnWritten = (row: ArtifactRow, report: RenderReport) => {
    const doc = docs.doc(row.id);
    const had = getMeta(doc, "drawnShapes") ?? {};
    const now: CanvasShapes["drawn"] = { ...had };
    for (const frame of report.sections.flatMap((one) => one.frames)) {
      if (
        frame.interaction === "rest" &&
        frame.state === "drawn" &&
        frame.box.w > 0 &&
        frame.box.h > 0
      ) {
        now[frame.story] = { w: frame.box.w, h: frame.box.h };
      }
    }
    if (!Bun.deepEquals(now, had)) {
      docs.transact(row.id, "hub", (written) => {
        setMeta(written, "drawnShapes", now);
      });
    }
  };
  /**
   * The stage's report of design graph `row` with its last draws held
   * past the stage (component.ts `drawsHeld`): what a browser drew is kept
   * in the canvas's doc (`meta.drawn`), so a stage that slept, restarted or
   * was made again never reads as nothing drawn. Only a new draw changes
   * it; a Send, the person's or the hub's, never touches it. Every report
   * the hub takes from a stage comes through here.
   */
  const drawnHeld = (row: ArtifactRow, from: RenderReport): RenderReport => {
    const meta = docMeta(docs.doc(row.id));
    const had = meta.get("drawn") ?? {};
    const { kept, report } = drawsHeld(from, had);
    if (!Bun.deepEquals(kept, had)) {
      docs.transact(row.id, "hub", (written) => {
        setMeta(written, "drawn", kept);
      });
    }
    drawnWritten(row, report);
    // The person's graph loads the stories its agent named and their moves alone (core `namedKept`).
    return namedReport(report, sheetOf(row)?.spec.named);
  };
  /** The shapes a decision page's media carries of design graph `row` (core `CanvasShapes`). */
  const shapesOf = (row: ArtifactRow): CanvasShapes => {
    const meta = docMeta(docs.doc(row.id));
    return {
      said: meta.get("saidShapes") ?? {},
      drawn: meta.get("drawnShapes") ?? {},
    };
  };
  /**
   * An author's read that couldn't reach its workspace's stage (core
   * `StageUnreached`): the hop that failed, by the hub's refusal (a
   * workspace gone or on no machine, a machine not connected or not
   * answering, else the way to the stage), and its words. Said to the
   * author alone: the person's panel loads the same stage, and its own
   * load says what it meets.
   */
  const unreachedOf = (error: unknown): StageUnreached => {
    const status = error instanceof ElysiaStatus ? error.status : null;
    let down: StageUnreached["down"] = "reach";
    if (status === 409) {
      down = "workspace";
    } else if (status === 503 || status === 504) {
      down = "machine";
    }
    let why = String(error);
    if (error instanceof ElysiaStatus) {
      why = error.response.detail;
    } else if (error instanceof Error) {
      why = error.message;
    }
    return { down, why };
  };
  /** Machine `machineId` by its name, as the hub's lines say it. */
  const machineNamed = (machineId: string | undefined): string => {
    const machine =
      machineId === undefined
        ? undefined
        : deps.machines().find((one) => one.machineId === machineId);
    return machine
      ? machineLabel(machine.hostname)
      : "a machine the hub doesn't know";
  };
  /**
   * Design `ask`'s create or update refused at hop `hop`, which reached
   * `at`: one line in the hub's journal naming the design, the hop, the
   * address and the error, and the refusal answered to the agent in the
   * same words. The refusal is each hop's own, made for this call alone
   * (artifact-events.ts `onStage`, design-files.ts, preview-stops.ts
   * `openProblem`): its words are written over in place, so its status,
   * code and every other member it carries (an away machine's id) stand as
   * its hop made them. Every hop of a design's create and update fails
   * through here ({@link designWritten}, {@link createDesign}).
   */
  const designMissed = <Refusal extends AnyProblem>(
    ask: DesignAsk,
    hop: keyof typeof artifactToolWords.designHops,
    at: string,
    refusal: Refusal
  ): Refusal => {
    const said = artifactToolWords.designHops[hop];
    const why = refusal.response.detail;
    console.warn(
      artifactToolWords.designMissedLine(ask.name, ask.tree, said, at, why)
    );
    Object.assign(refusal.response, {
      detail: artifactToolWords.designMissed(ask.made, said, at, why),
    });
    return refusal;
  };
  /**
   * The hop of a design's stage that refused `refusal` (artifact-events.ts
   * `onStage`), and the address it reached: its folder gone from the hub's
   * machine (409), that machine's daemon away or silent (503, 504), else
   * the stage itself, whose own words name its hop within (its boundary,
   * install, start, or the look at its pages, with the port and the way it
   * asked on: agent stage.ts `askStage`).
   */
  const stageHop = (
    tree: string,
    refusal: AnyProblem
  ): { hop: keyof typeof artifactToolWords.designHops; at: string } => {
    const machine = machineNamed(deps.hubMachine());
    if (refusal.status === 409) {
      return { hop: "folder", at: `${store.designFolder(tree)} on ${machine}` };
    }
    if (refusal.status === 503 || refusal.status === 504) {
      return { hop: "daemon", at: machine };
    }
    return {
      hop: "stage",
      at: `design ${tree.slice(0, 8)}'s stage on ${machine}`,
    };
  };
  /** One write as the session reads of it: where, and what. */
  const saveSection = (change: SheetChange, edit: SheetWritten): string => {
    const at = `${edit.file}:${edit.lines.from}${edit.lines.to === edit.lines.from ? "" : `-${edit.lines.to}`}`;
    if ("args" in change) {
      const set = Object.entries(change.args.values).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`
      );
      const unset = (change.args.unset ?? []).map((key) => `${key} dropped`);
      return `## Saved at ${at}\n- ${change.args.story}'s args: ${[...set, ...unset].join(", ")}`;
    }
    const op = change.story;
    let did: string;
    if ("add" in op) {
      did = `story ${op.add} added`;
    } else if ("duplicate" in op) {
      did = `${op.duplicate} duplicated as ${op.as}`;
    } else if ("remove" in op) {
      did = `story ${op.remove} removed`;
    } else {
      did = `${op.move} moved ${op.before === null ? "to the end" : `before ${op.before}`}`;
    }
    return `## Saved at ${at}\n- ${did}`;
  };
  /**
   * A write to sheet `row`'s story file by the stage of the workspace it was
   * made in: one story's args, or a story added, duplicated, removed or
   * moved, the person's and the agent's alike. The person's panel shows
   * that stage live, so every write reaches it through Vite's HMR. The sheet's doc keeps the sheet
   * as it reads after; the person's write is owed to the sheet's owner on
   * the marks' channel, since it changed a file in that workspace. A write
   * is its owner's read when `ownersRead`.
   */
  const writeSheet = async (
    row: ArtifactRow,
    change: SheetChange,
    by: "agent" | "person",
    ownersRead = true
  ) => {
    const sheet = sheetOf(row);
    if (!sheet || designOf(row)) {
      return problem(409, {
        code: "artifact-sheet-not-sheet",
        detail: designOf(row)
          ? `${row.name} is a design folder: its pages have no stories or args. artifact_update with html, dir or directions changes it.`
          : `${row.name} is a ${row.kind}: args and story are for a sheet.`,
      });
    }
    // Made in the states file that holds the story it names, whichever direction it is (core `SheetWrite`).
    const { files } = sheet;
    const edit = await deps.stageWrite(
      { workspace: sheet.workspace },
      "args" in change
        ? { files, args: change.args }
        : { files, story: change.story }
    );
    if (edit instanceof ElysiaStatus) {
      return edit;
    }
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      // The doc keeps its first states file's sheet, as the stage's reads set it: a write to another direction's file leaves it.
      if (edit.file === files[0]) {
        meta.set("sheet", edit.sheet);
      }
      if (by === "person") {
        const owed = meta.get("saves") ?? [];
        meta.set("saves", [...owed, saveSection(change, edit)]);
      }
    });
    if (by === "person") {
      ctx.marked(row.id);
    }
    const read: ArtifactRead = {
      ...ctx.read(stillThere(db.get(row.id), row.id), undefined, ownersRead),
      sheet: edit.sheet,
      edit: { file: edit.file, lines: edit.lines, formatted: edit.formatted },
    };
    return read;
  };
  /**
   * The agent's write as `artifact_update` answers it (design graph
   * §4): the file, the lines written, the formatter that shaped them, the
   * story with its args after, and its frames as the daemon's reader drew
   * them once it read the write ({@link readerReport}); `unseen` where it
   * could not within its limit.
   */
  const componentWritten = async (
    row: ArtifactRow,
    change: SheetChange,
    written: ArtifactRead
  ) => {
    const name =
      "args" in change
        ? storyRefOf(change.args.story).story
        : storyOfOp(change.story);
    const story = written.sheet?.stories.find((one) => one.name === name);
    const sheet = sheetOf(row);
    let frames: ComponentWritten["render"] = "unseen";
    if (sheet && name && !("story" in change && "remove" in change.story)) {
      const at: StageAt = { workspace: sheet.workspace };
      const staged = await deps.stage(at, sheet.files[0], sheet.files);
      if (staged instanceof ElysiaStatus) {
        return staged;
      }
      const drawn = await readerReport(row, at, sheet.files, staged.opened);
      if (drawn instanceof ElysiaStatus) {
        return drawn;
      }
      const { report } = drawn;
      if (!unseen(report, name)) {
        frames = renderSaid(
          report,
          [],
          undefined,
          undefined,
          sheet.spec
        ).frames.filter((one) => one.story === name);
      }
    }
    const said: ComponentWritten = {
      file: written.edit?.file ?? "",
      lines: written.edit?.lines ?? { from: 0, to: 0 },
      formatted: written.edit?.formatted ?? null,
      story: story ? { name: story.name, args: story.args } : null,
      render: frames,
    };
    return said;
  };
  /**
   * Design graph `row`'s report as the daemon's reader drew it: its stage's
   * (`opened`), its last draws held ({@link drawnHeld}); where that holds
   * content no reader drew (core `readerOwed`: a file changed since the reader
   * last read it, or never read), the reader asked, which answers once it
   * has read the files as they stand, within its limit. The one rule every
   * read of a canvas's report goes by: a plain read, a create, an update.
   */
  const readerReport = async (
    row: ArtifactRow,
    at: StageAt,
    files: string[],
    opened: StageOpened
  ) => {
    const held = drawnHeld(row, opened.report);
    if (readerOwed(held).length === 0) {
      const read: Pick<StageRendered, "report" | "undrawn" | "plansUnread"> = {
        report: held,
        undrawn: [],
      };
      return read;
    }
    const read = await deps.stageRender(at, { files });
    if (read instanceof ElysiaStatus) {
      return read;
    }
    return {
      report: drawnHeld(row, read.report),
      undrawn: read.undrawn,
      ...(read.plansUnread ? { plansUnread: read.plansUnread } : {}),
    };
  };
  /** What a design graph's create names: its states files, and what the person does there; refused when it names no file or a canvas that does not hold. */
  const sheetAsked = (input: ArtifactInput) => {
    const directions = storyDirectionsOf(input.directions);
    if (typeof directions === "string") {
      return problem(400, {
        code: "artifact-sheet-unfit",
        detail: directions,
      });
    }
    // A design's directions name its states files: file may be left out.
    const asked =
      input.file === undefined
        ? (directions ?? []).map((one) => one.file)
        : [input.file].flat();
    if (asked.length === 0) {
      return problem(400, {
        code: "artifact-sheet-file-none",
        detail: `A design graph takes file: on the person's graph each story they judge, path:Story in the .stories.ts beside its component (a list, in the order they step through them); on your reading (reading: true), whole states files. Example: ${COMPONENT_EXAMPLE}.`,
      });
    }
    const misfit = canvasProblem({ ...input, directions }, asked);
    if (misfit) {
      return problem(400, { code: "artifact-sheet-unfit", detail: misfit });
    }
    // The person's graph names each story it loads, path:Story; a reading loads whole files.
    const entries = namedAsked(asked, input.reading === true);
    if (typeof entries === "string") {
      return problem(400, { code: "artifact-sheet-unfit", detail: entries });
    }
    if (designContentOf(input.content)) {
      return problem(400, {
        code: "artifact-sheet-unfit",
        detail: `A live story is a component or a screen, which the graph draws at its widths: content marks a design folder (html or dir) as a ${input.content}.`,
      });
    }
    const said = ctx.askedOf(input);
    return said instanceof ElysiaStatus
      ? said
      : {
          asked: entries.files,
          named: entries.named,
          directions: directions?.map((one) => ({
            ...one,
            file: statesEntryOf(one.file).file,
          })),
          said,
        };
  };
  /**
   * Why a design graph's states files, as the stage read them (`report`),
   * can't open: a story the person's graph names (`named`) that its file
   * doesn't export, or stories that differ only by their width among those
   * it loads.
   */
  const reportUnfit = (
    report: RenderReport,
    named: Readonly<Record<string, readonly string[]>>
  ) => {
    const missing = namedProblem(report, named);
    if (missing) {
      return problem(400, { code: "artifact-sheet-unfit", detail: missing });
    }
    // One state is one story: the graph draws it at each width (show skill).
    const widthOnly = namedReport(report, named).widthOnly ?? [];
    if (widthOnly.length === 0) {
      return null;
    }
    return problem(400, {
      code: "artifact-sheet-unfit",
      detail: widthOnly
        .map(
          (stories) =>
            `${stories.join(" and ")} differ only by their width: keep one story. The design graph draws it at each width (${GRAPH_WIDTHS_SAID}).`
        )
        .join(" "),
    });
  };
  /**
   * A design graph's row placed in its owner's panel on its workspace's
   * stage (`at`): the one of that name made again where it stands, or a
   * new one.
   */
  const placeSheet = (
    { owner, maker }: Making,
    name: string,
    said: Pick<ArtifactRow, "ask" | "does" | "pick" | "title">,
    at: { machineId: string | null; source: PreviewSource },
    /** A new one's id, where its folder was made before it (a design's). */
    id: string = crypto.randomUUID()
  ) => {
    const now = new Date();
    const before = db.byName(owner.id, "component", name);
    if (before) {
      db.resource(before.id, at);
    }
    const placed = before
      ? stillThere(
          db.update(before.id, {
            madeBy: maker.id,
            ...said,
            revision: before.revision + 1,
            updatedAt: now,
          }),
          before.id
        )
      : db.create({
          id,
          instanceId: owner.id,
          madeBy: maker.id,
          heldFor: null,
          projectId: owner.projectId ?? null,
          kind: "component",
          name,
          ...said,
          ...at,
          revision: 1,
          seq: 0,
          deliveredSeq: 0,
          readSeq: 0,
          openedRevision: null,
          createdAt: now,
          updatedAt: now,
          shownAt: null,
        });
    return { before, row: placed };
  };
  /** What a design graph's create answers of `row` itself, shown as `shown` says. */
  const createdOf = (
    row: ArtifactRow,
    shown: Parameters<typeof ctx.openedOf>[0]
  ) => {
    const named = ctx.heldId(row);
    return {
      ...named,
      kind: row.kind,
      name: row.name,
      title: row.title,
      route: routeOf(named.id),
      ...ctx.openedOf(shown),
    };
  };
  /**
   * Makes a design graph in `owner`'s panel (or opens the one of that
   * name) on the stage of its maker's workspace, shows it, and answers what
   * a browser drew of it: the panel's draw, else the daemon's.
   */
  const createSheet = async (making: Making, input: ArtifactInput) => {
    const { maker } = making;
    const sheetAsk = sheetAsked(input);
    if (sheetAsk instanceof ElysiaStatus) {
      return sheetAsk;
    }
    const { asked, directions, said } = sheetAsk;
    const at: StageAt = { session: maker };
    // A canvas opened on nothing is refused: "Write it, then call again."
    const staged = await deps.stage(at, asked[0], asked, true);
    if (staged instanceof ElysiaStatus) {
      return staged;
    }
    const { machineId, workspace } = staged;
    const files = staged.opened.report.sections.map((one) => one.file);
    // Each file's named stories by its file as the stage names it: the report's sections stand in the order the files were asked.
    const named = Object.fromEntries(
      asked.flatMap((file, place) => {
        const stories = sheetAsk.named[file];
        const as = files[place];
        return stories === undefined || as === undefined ? [] : [[as, stories]];
      })
    );
    const unfit = reportUnfit(staged.opened.report, named);
    if (unfit) {
      return unfit;
    }
    const opened: StageOpened = {
      ...staged.opened,
      report: namedReport(staged.opened.report, named),
    };
    // Each direction names its file as the stage does, from the toolchain root.
    const spec: CanvasSpec = {
      ...specOf(input.name, {
        ...input,
        directions: directions && directionsStaged(directions, asked, files),
      }),
      ...(Object.keys(named).length > 0 ? { named } : {}),
    };
    const source: PreviewSource = {
      port: opened.port,
      path: canvasPath(files, spec),
      workspace,
      stage: { dir: opened.dir, file: opened.file },
    };
    // An owner's own create of one its maker's next version is held for opens that first (versions.ts `openNextFirst`).
    const unopened = await ctx.openNextFirst(making, "component", input.name);
    if (unopened) {
      return unopened;
    }
    // Served from the workspace's own stage, live (served.ts `sheetOf`).
    const { before, row } = placeSheet(making, input.name, said, {
      machineId,
      source,
    });
    stampMeta(row, null);
    writeStage(row, opened.state, opened.sheet);
    const shown = await handOver(making, before, row);
    if (!(shown.started || before)) {
      discard(row);
      return openProblem(shown.stop, "artifact-sheet-unshown", shown.why);
    }
    const owned = sheetOf(row);
    const drawn = await readerReport(
      row,
      { workspace },
      owned?.files ?? asked,
      staged.opened
    );
    if (drawn instanceof ElysiaStatus) {
      return drawn;
    }
    const { report, undrawn, plansUnread } = drawn;
    const made: Created = {
      ...createdOf(row, shown),
      stage: stageSaid(sheetState(row, opened.state)),
      render: {
        ...renderSaid(report, undrawn, undefined, plansUnread, spec),
        weight: weightSaid(opened.weight),
      },
      moves: movesSaid(report),
      errors: errorsSaid(sheetState(row, opened.state).errors),
      hint: READ_HINT,
    };
    return made;
  };
  /**
   * The files of design parts `parts`, each at its place in the design's
   * folder ({@link designPlaces}): a part's `html` its index.html, its `dir`
   * read off its maker's machine as it is (`deps.folderFiles`); then made
   * whole, a package.json and Vite config where it gave none
   * (design-folder.ts). Refused in words when a part can't be read or the
   * design can't run.
   */
  const designGathered = async (
    ask: DesignAsk,
    maker: Making["maker"],
    parts: readonly DesignPartAsked[],
    places: readonly string[]
  ) => {
    const files: DesignFile[] = [];
    for (const [at, part] of parts.entries()) {
      const place = places[at] ?? "";
      const { from } = part;
      const own =
        "html" in from
          ? [
              {
                path: "index.html",
                bytes: new TextEncoder().encode(from.html),
              },
            ]
          : await deps.folderFiles({ instance: maker }, from.dir);
      if (own instanceof ElysiaStatus) {
        return designMissed(
          ask,
          "files",
          `${"dir" in from ? from.dir : "its html"} on ${machineNamed(maker.machineId)}`,
          own
        );
      }
      files.push(
        ...own.map((one) => ({
          ...one,
          path: place ? `${place}/${one.path}` : one.path,
        }))
      );
    }
    const pages = places.map(designPageAt);
    const misfit = designFilesProblem(files, pages);
    const whole = misfit ?? designWhole(files);
    if (typeof whole === "string") {
      return problem(400, { code: "artifact-design-unfit", detail: whole });
    }
    return whole;
  };
  /**
   * Design folder `ask.tree` written from `parts` (its files in place, so
   * its stage's HMR carries them to the open panel) and its stage opened on
   * them: the canvas's pages and its opened stage, or why not, a hop that
   * failed said by {@link designMissed}.
   */
  const designWritten = async (
    ask: DesignAsk,
    maker: Making["maker"],
    parts: readonly DesignPartAsked[]
  ) => {
    const { tree } = ask;
    const places = designPlaces(parts);
    const whole = await designGathered(ask, maker, parts, places);
    if (whole instanceof ElysiaStatus) {
      return whole;
    }
    const moved = store.writeDesign(tree, whole);
    const files = places.map(designPageAt);
    const opened = await deps.design(tree, files, moved);
    if (opened instanceof ElysiaStatus) {
      const { hop, at } = stageHop(tree, opened);
      return designMissed(ask, hop, at, opened);
    }
    return { files, ...opened };
  };
  /**
   * Where a design of `name` in `owner`'s panel keeps its files: made again
   * under its name, the folder its source names (`before`'s), else a new
   * artifact's own, its id made now.
   */
  const designHome = ({ owner }: Making, name: string) => {
    const before = db.byName(owner.id, "component", name);
    const id = before?.id ?? crypto.randomUUID();
    const tree = (before && designOf(before)?.tree) ?? designTreeId(id);
    return { before, id, tree };
  };
  /**
   * Makes a design folder in `owner`'s panel (or makes the one of that
   * name again in place, picks kept): its `html` or `dir`, or each
   * direction's, kept under the artifact's folder (core `DESIGN_FOLDER`)
   * and served by the hub machine's stage over it, live (core stage.ts
   * `designOf`, agent stage-design.ts). A design with directions is a
   * folder each, a page each.
   */
  const createDesign = async (making: Making, input: ArtifactInput) => {
    const parts = designPartsOf(input);
    if (typeof parts === "string") {
      return problem(400, { code: "artifact-sheet-unfit", detail: parts });
    }
    const said = ctx.askedOf(input);
    if (said instanceof ElysiaStatus) {
      return said;
    }
    const files = designPlaces(parts).map(designPageAt);
    const directions = input.directions && designDirections(parts, files);
    const misfit = canvasProblem({ ...input, directions }, files);
    if (misfit) {
      return problem(400, { code: "artifact-sheet-unfit", detail: misfit });
    }
    // An owner's own create of one its maker's next version is held for opens that first (versions.ts `openNextFirst`).
    const unopened = await ctx.openNextFirst(making, "component", input.name);
    if (unopened) {
      return unopened;
    }
    const { before, id, tree } = designHome(making, input.name);
    const ask: DesignAsk = { name: input.name, tree, made: true };
    const written = await designWritten(ask, making.maker, parts);
    if (written instanceof ElysiaStatus) {
      // A folder made for this create alone goes with its refusal.
      if (!before) {
        deps.dropDesign(tree);
        store.remove(id);
      }
      return written;
    }
    const spec = {
      ...specOf(input.name, { ...input, directions }),
      ...withoutUndefined({ content: designContentOf(input.content) }),
      title: said.title,
    };
    const source = designSource(tree, written.opened, files, spec);
    const { row } = placeSheet(
      making,
      input.name,
      said,
      { machineId: written.machineId, source },
      id
    );
    stampMeta(row, null);
    writeStage(row, written.opened.state);
    const shown = await handOver(making, before, row);
    if (!(shown.started || before)) {
      discard(row);
      return designMissed(
        ask,
        "show",
        `session ${making.owner.id.slice(0, 8)}'s panel`,
        openProblem(shown.stop, "artifact-sheet-unshown", shown.why)
      );
    }
    const made: Created = {
      ...createdOf(row, shown),
      stage: stageSaid(written.opened.state),
      errors: errorsSaid(written.opened.state.errors),
      hint: designHint(spec.content),
    };
    return made;
  };
  /**
   * Design folder `row` changed in place by its session (`artifact_update`
   * with html, dir or directions, and the canvas's own edges, groups or
   * dials beside them): its files written where its stage serves them, so
   * the person's open panel takes them by the stage's HMR, picks and pins
   * kept; its canvas's address moved only when its pages or spec did.
   * Answers its stage's state after its pages compiled.
   */
  const updateDesign = async (
    maker: Making["maker"],
    row: ArtifactRow,
    input: Pick<
      ArtifactInput,
      "content" | "dials" | "dir" | "directions" | "edges" | "group" | "html"
    >
  ) => {
    const design = designOf(row);
    if (!design) {
      return problem(409, {
        code: "artifact-design-not-design",
        detail: `${row.name} is a ${sheetOf(row) ? "live story's design graph" : row.kind}: html, dir and directions change a design folder.`,
      });
    }
    const parts = designPartsOf({ ...input, file: undefined });
    if (typeof parts === "string") {
      return problem(400, { code: "artifact-design-unfit", detail: parts });
    }
    const files = designPlaces(parts).map(designPageAt);
    const directions = input.directions && designDirections(parts, files);
    const spec = {
      ...specOf(row.name, {
        edges: input.edges ?? design.spec.edges,
        group: input.group ?? design.spec.group,
        dials: input.dials ?? design.spec.dials,
        directions,
      }),
      // A mark stands until one is sent again: "screen" takes it off.
      ...withoutUndefined({
        content:
          input.content === undefined
            ? design.spec.content
            : designContentOf(input.content),
      }),
      title: row.title,
    };
    const misfit = canvasProblem({ ...spec, directions }, files);
    if (misfit) {
      return problem(400, { code: "artifact-design-unfit", detail: misfit });
    }
    const written = await designWritten(
      { name: row.name, tree: design.tree, made: false },
      maker,
      parts
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const source = designSource(design.tree, written.opened, files, spec);
    writeStage(row, written.opened.state);
    return {
      moved: !Bun.deepEquals(source, row.source),
      source,
      machineId: written.machineId,
      spec,
      state: written.opened.state,
    };
  };
  /**
   * Sheet `row`'s stage opened on the workspace it was made in: the author's
   * working copy as it is now, the stage the person's panel shows; why it
   * can't be reached when it can't.
   */
  const stageRead = async (
    sheet: NonNullable<ReturnType<typeof sheetOf>>
  ): Promise<{ opened: StageOpened } | { unreached: StageUnreached }> => {
    try {
      const staged = await deps.stage(
        { workspace: sheet.workspace },
        sheet.files[0],
        sheet.files
      );
      return staged instanceof ElysiaStatus
        ? { unreached: unreachedOf(staged) }
        : { opened: staged.opened };
    } catch (error) {
      return { unreached: unreachedOf(error) };
    }
  };
  /**
   * Each states file of design graph `sheet` with its sheet as its stage
   * reads it, in the canvas's order, `file` from the toolchain root: every
   * direction and section, the first file's already read (`opened`).
   */
  const sheetsRead = async (
    sheet: NonNullable<ReturnType<typeof sheetOf>>,
    opened: StageOpened
  ) => {
    const read: { file: string; sheet: SheetRead }[] = [];
    for (const file of sheet.files) {
      if (file === sheet.files[0]) {
        read.push({ file: relative(sheet.dir, file), sheet: opened.sheet });
        continue;
      }
      // Its stories alone: the first read answered every file's report.
      const staged = await deps.stage({ workspace: sheet.workspace }, file);
      if (staged instanceof ElysiaStatus) {
        return staged;
      }
      read.push({
        file: relative(sheet.dir, file),
        sheet: staged.opened.sheet,
      });
    }
    return read;
  };
  /**
   * Story `name` (`Story`, or `file:Story`) of design graph `row` and the
   * sheet of the states file that exports it, whichever direction or
   * section it is. Refused where no file exports it, or where a bare name
   * is a story of several.
   */
  const storyHeld = (
    row: ArtifactRow,
    sheets: { file: string; sheet: SheetRead }[],
    name: string
  ) => {
    const { file: named, story } = storyRefOf(name);
    const holders = sheets.flatMap((one) => {
      const found = one.sheet.stories.find((each) => each.name === story);
      return found && (named === undefined || one.file === named)
        ? [{ ...one, story: found }]
        : [];
    });
    const [holder] = holders;
    if (holders.length > 1) {
      return problem(409, {
        code: "artifact-state-ambiguous",
        detail: `${story} is a story of ${holders.length} states files on ${row.name}: name the one to read as file:Story, one of ${holders.map((one) => `${one.file}:${story}`).join(", ")}.`,
      });
    }
    if (!holder) {
      return problem(404, {
        code: "artifact-sheet-story-unknown",
        detail: `${row.name} has no story ${name}; its stories are ${sheets.map((one) => `${one.sheet.stories.map((each) => each.name).join(", ") || "none"} (${one.file})`).join("; ") || "none"}.`,
      });
    }
    return { sheet: holder.sheet, story: holder.story };
  };
  /**
   * A design graph as the session reads it (design graph §4): its
   * picks and pins, its stage, what the daemon's reader drew (each frame's
   * state, read again where the files changed since: `readerReport`), its
   * moves, its stories with the interactions they reach, the person's dials
   * and tuned motion; on asking, one story's args and code, one frame's
   * computed-style delta, a picture. Read
   * afresh on the workspace it was made in, as its author works on it now: a
   * use that keeps the stage awake. Its stage, each section's problem and
   * its stories are that read's; a stage the read can't reach is said as
   * `unreached` (why), never a stale `live`. The person's panel is served
   * the same stage, live. Its owner's read when `ownersRead`.
   */
  const readSheet = async (
    row: ArtifactRow,
    since?: number,
    ownersRead = true,
    ask: ComponentReadAsk = {}
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a canvas's read joins its stage, its report, the person's picks and each optional ask in one answer
  ) => {
    if (designOf(row)) {
      if (ask.measure) {
        return problem(400, {
          code: "artifact-read-state-unfit",
          detail: measureWords.designFolder(row.name),
        });
      }
      return await readDesign(row, since, ownersRead);
    }
    const sheet = sheetOf(row);
    const reached = sheet ? await stageRead(sheet) : undefined;
    const opened = reached && "opened" in reached ? reached.opened : undefined;
    let report = opened?.report;
    let undrawn: SectionUndrawn[] = [];
    let plansUnread: true | undefined;
    let png: string | undefined;
    let layout: LayoutRead | undefined;
    let measured: MeasureRead | undefined;
    if (sheet) {
      const at: StageAt = { workspace: sheet.workspace };
      // A bare story name two states files export reads no one frame: refused, before any draw, with the `file:Story` names to send.
      const ambiguous =
        report && ask.state && stateAmbiguity(report, ask.state.story);
      if (ambiguous) {
        return problem(409, {
          code: "artifact-state-ambiguous",
          detail: ambiguous,
        });
      }
      // A draw asked of a stage that answered: refused in its own words when it can't be made.
      // A measurement starts from a story: refused without one, naming the live story (the person's states file's first) to send.
      if (ask.measure && !ask.state) {
        return problem(400, {
          code: "artifact-read-state-unfit",
          detail: measureWords.noStory(
            report?.sections.find((one) => one.file === sheet.files[0])
              ?.frames[0]?.story ?? null
          ),
        });
      }
      if (opened && (ask.render || ask.png || ask.layout || ask.measure)) {
        const rendered = await deps.stageRender(at, {
          files: sheet.files,
          ...(ask.state ? { state: ask.state } : {}),
          ...(ask.measure
            ? { measure: ask.measure }
            : {
                ...(ask.png || ask.layout ? { png: true } : {}),
                ...(ask.layout ? { layout: true } : {}),
              }),
        });
        if (rendered instanceof ElysiaStatus) {
          return rendered;
        }
        ({ png, undrawn, plansUnread, layout, measured } = rendered);
        report = drawnHeld(row, rendered.report);
      } else if (opened) {
        // A plain read: the report as the reader drew it, the reader asked where it owes one.
        const read = await readerReport(row, at, sheet.files, opened);
        if (read instanceof ElysiaStatus) {
          return read;
        }
        ({ report, undrawn, plansUnread } = read);
      }
    }
    const stage = opened ? sheetState(row, opened.state) : undefined;
    const unreached =
      reached && "unreached" in reached ? reached.unreached : undefined;
    const base = ctx.read(row, since, ownersRead);
    const { dials, tuned, picked, layout: _layout, ...picks } = base.state;
    const spec = sheet?.spec;
    // His pick among the design's directions, by its states file: the direction it names, or none taken back.
    const pickedDirection = Object.hasOwn(base.state, "picked")
      ? directionOf(
          spec,
          typeof picked.value === "string" ? picked.value : undefined
        )
      : undefined;
    const sheets = sheet && opened ? await sheetsRead(sheet, opened) : [];
    if (sheets instanceof ElysiaStatus) {
      return sheets;
    }
    const held = ask.story ? storyHeld(row, sheets, ask.story) : undefined;
    if (held instanceof ElysiaStatus) {
      return held;
    }
    const story = held?.story;
    const read: ComponentRead = {
      ...base,
      state: picks,
      ...(stage ? { stage: stageSaid(stage) } : {}),
      ...(unreached ? { unreached } : {}),
      errors: errorsSaid(stage?.errors ?? []),
      ...(report
        ? {
            render: renderSaid(
              report,
              undrawn,
              ask.state?.story,
              plansUnread,
              sheet?.spec
            ),
            moves: movesSaid(report),
            stories: sheets.flatMap((one) => storiesSaid(one.sheet, report)),
            ...(ask.state ? { frame: stateSaid(report, ask.state) } : {}),
          }
        : {}),
      ...(opened ? { weight: opened.weight } : {}),
      ...(Object.hasOwn(base.state, "dials") ? { dials: dials.value } : {}),
      ...(Object.hasOwn(base.state, "tuned") ? { tuned: tuned.value } : {}),
      ...(spec?.directions?.length
        ? {
            picked: pickedDirection
              ? { name: pickedDirection.name, file: pickedDirection.file }
              : null,
            ...picklessOf(picked),
          }
        : {}),
      ...(story && ask.detail === "story"
        ? {
            story: {
              name: story.name,
              args: story.args,
              code: story.code,
              meta: {
                args: held?.sheet.meta.args,
                code: held?.sheet.meta.code,
              },
            },
          }
        : {}),
      ...(ask.png || ask.layout ? { png: png ?? null } : {}),
      ...(layout ? { layout } : {}),
      ...(measured ? { measured } : {}),
      hint: READ_HINT,
    };
    return read;
  };
  /**
   * A design folder as the session reads it: the person's picks, pins,
   * dials and pick among its directions, and its stage as it stands after
   * its pages compiled on it (every compile error in `errors`); a stage it
   * can't reach said as `unreached`. A use that keeps the stage awake.
   */
  const readDesign = async (
    row: ArtifactRow,
    since: number | undefined,
    ownersRead: boolean
  ) => {
    const design = designOf(row);
    let state: StageState | undefined;
    let unreached: StageUnreached | undefined;
    if (design) {
      try {
        const opened = await deps.design(design.tree, design.files);
        if (opened instanceof ElysiaStatus) {
          unreached = unreachedOf(opened);
        } else {
          ({ state } = opened.opened);
          writeStage(row, state);
        }
      } catch (error) {
        unreached = unreachedOf(error);
      }
    }
    const base = ctx.read(row, since, ownersRead);
    const { dials, tuned, picked, layout: _layout, ...picks } = base.state;
    const pickedDirection = Object.hasOwn(base.state, "picked")
      ? directionOf(
          design?.spec,
          typeof picked.value === "string" ? picked.value : undefined
        )
      : undefined;
    const read: ComponentRead = {
      ...base,
      state: picks,
      ...(state ? { stage: stageSaid(state) } : {}),
      ...(unreached ? { unreached } : {}),
      errors: errorsSaid(state?.errors ?? []),
      ...(Object.hasOwn(base.state, "dials") ? { dials: dials.value } : {}),
      ...(Object.hasOwn(base.state, "tuned") ? { tuned: tuned.value } : {}),
      ...(design?.spec.directions?.length
        ? {
            picked: pickedDirection
              ? { name: pickedDirection.name, file: pickedDirection.file }
              : null,
            ...picklessOf(picked),
          }
        : {}),
      hint: designHint(design?.spec.content),
    };
    return read;
  };
  /** A design system round on design graph `row`, asked by `requester`: what the ask did. */
  const askVerify = (requester: InstanceRow, row: ArtifactRow) => {
    const sheet = designOf(row) ? null : sheetOf(row);
    if (!sheet) {
      return Promise.resolve(
        problem(409, {
          code: "artifact-verify-not-sheet",
          detail: `${row.name} is a ${row.kind}: verify is a design graph's.`,
        })
      );
    }
    return deps.verify(requester, {
      id: row.id,
      kind: row.kind,
      name: row.name,
      projectId: row.projectId,
      workspaceId: sheet.workspace,
      files: sheet.files,
    });
  };

  return {
    askVerify,
    componentHash,
    componentWritten,
    createDesign,
    createSheet,
    readSheet,
    shapesOf,
    updateDesign,
    writeSheet,
    writeStage,
  };
};
