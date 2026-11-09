import { join, relative } from "node:path";
import { docMeta, getMeta, setMeta } from "@cawco/core/doc-meta";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  type CanvasShapes,
  type CanvasSpec,
  canvasOf,
  canvasPath,
  type RenderReport,
  type SectionUndrawn,
  type SheetRead,
  type SheetWritten,
  type StageOpened,
  type StageRendered,
  type StageState,
  type StageUnreached,
  type StoryOp,
} from "@cawco/core/stage";
import { pageHash } from "@cawco/preview/proxy";
import type { ArtifactRow } from "../../db/artifacts";
import {
  COMPONENT_EXAMPLE,
  canvasProblem,
  drawingUnseen,
  drawsHeld,
  errorsSaid,
  movesSaid,
  READ_HINT,
  renderSaid,
  specOf,
  stateSaid,
  storiesSaid,
  unseen,
  weightSaid,
} from "../component";
import { ArtifactRefusal } from "../refusals";
import type {
  ArtifactInput,
  ArtifactRead,
  ComponentReadAsk,
  ComponentWritten,
  Created,
  Making,
  ReadEntry,
  SheetChange,
  StageAt,
} from "../shapes";
import { routeOf } from "../sync";
import type { KindContext } from "./context";

/** The story a story op names. */
const storyOfOp = (op: StoryOp): string | null => {
  if ("add" in op) {
    return op.add;
  }
  if ("duplicate" in op) {
    return op.as;
  }
  return "move" in op ? op.move : null;
};

/** How long a canvas just shown waits for the panel's page to draw it, and how often it looks. Ours: the page posts within a second of loading. */
const PANEL_DRAW_MS = 4000;

const PANEL_DRAW_POLL_MS = 500;

/** A sheet's place on its workspace's stage (core `PreviewSource`); null for any other artifact. */
export const sheetOf = (
  row: ArtifactRow
): {
  dir: string;
  file: string;
  /** Every states file of the canvas, from the clone's root: a section each. */
  files: string[];
  spec: CanvasSpec;
  workspace: string;
} | null => {
  if (!(
    row.kind === "component" &&
    "port" in row.source &&
    row.source.stage &&
    row.source.workspace
  )) {
    return null;
  }
  const { stage } = row.source;
  const { files, spec } = canvasOf(row.source.path ?? "");
  return {
    ...stage,
    files: (files.length > 0 ? files : [stage.file]).map((one) =>
      join(stage.dir, one)
    ),
    spec,
    workspace: row.source.workspace,
  };
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
  | "inPanel"
  | "marked"
  | "openedOf"
  | "read"
  | "relistOf"
  | "stampMeta"
>;

/** A component canvas: a states file's stories drawn live on its machine's stage, the draws and the sheet the hub keeps of them in the doc, and a read that waits for what a browser drew. */
export const createComponentKind = (ctx: ComponentKindContext) => {
  const { db, deps, discard, docs, handOver, inPanel, relistOf, stampMeta } =
    ctx;

  /**
   * A component artifact's page hash: its canvas address's (core
   * `canvasPath`: its states files and its spec, dials and all), so the
   * person's values the panel writes into its doc (his dials, his tuned
   * timing) carry the page they were made on, as a decision page's picks
   * carry its program's, and a value made before the agent changed its
   * dials or files reads as an earlier revision's. None for any other kind.
   */
  const componentHash = (row: ArtifactRow): string | null =>
    row.kind === "component" && "port" in row.source && row.source.path
      ? pageHash(row.source.path)
      : null;
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
      // The stage was reached: by a read, or by the daemon's word of it.
      meta.delete("unreached");
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
    if (JSON.stringify(now) !== JSON.stringify(had)) {
      docs.transact(row.id, "hub", (written) => {
        setMeta(written, "drawnShapes", now);
      });
    }
  };
  /**
   * The stage's report of component canvas `row` with its last draws held
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
    if (JSON.stringify(kept) !== JSON.stringify(had)) {
      docs.transact(row.id, "hub", (written) => {
        setMeta(written, "drawn", kept);
      });
    }
    drawnWritten(row, report);
    return report;
  };
  /** The shapes a decision page's media carries of component canvas `row` (core `CanvasShapes`). */
  const shapesOf = (row: ArtifactRow): CanvasShapes => {
    const meta = docMeta(docs.doc(row.id));
    return {
      said: meta.get("saidShapes") ?? {},
      drawn: meta.get("drawnShapes") ?? {},
    };
  };
  /**
   * A read that couldn't reach the canvas's stage, kept in its doc (core
   * `StageUnreached`) for the panel and the agent's read alike: the hop that
   * failed, by the hub's refusal (a workspace gone or on no machine, a
   * machine not connected or not answering, else the way to the stage), its
   * words, and since the first such read.
   */
  const unreachedWritten = (row: ArtifactRow, error: unknown) => {
    const status = error instanceof ArtifactRefusal ? error.status : null;
    let down: StageUnreached["down"] = "reach";
    if (status === 409) {
      down = "workspace";
    } else if (status === 503 || status === 504) {
      down = "machine";
    }
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      const had = meta.get("unreached");
      meta.set("unreached", {
        down,
        why: error instanceof Error ? error.message : String(error),
        since: had?.since ?? new Date().toISOString(),
      } satisfies StageUnreached);
    });
    if (inPanel(row)) {
      relistOf(row);
    }
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
   * moved. The sheet's doc keeps the sheet as it reads after; the person's
   * write is owed to the sheet's owner on the marks' channel, since it
   * changed a file in that workspace. A write is its owner's read when
   * `ownersRead`.
   */
  const writeSheet = async (
    row: ArtifactRow,
    change: SheetChange,
    by: "agent" | "person",
    ownersRead = true
  ): Promise<ArtifactRead> => {
    const sheet = sheetOf(row);
    if (!sheet) {
      throw new ArtifactRefusal(
        409,
        `${row.name} is a ${row.kind}: args and story are for a sheet.`
      );
    }
    const file = join(sheet.dir, sheet.file);
    const edit = await deps.stageWrite(
      { workspace: sheet.workspace },
      "args" in change
        ? { file, args: change.args }
        : { file, story: change.story }
    );
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      meta.set("sheet", edit.sheet);
      if (by === "person") {
        const owed = meta.get("saves") ?? [];
        meta.set("saves", [...owed, saveSection(change, edit)]);
      }
    });
    if (by === "person") {
      ctx.marked(row.id);
    }
    return {
      ...ctx.read(db.get(row.id) as ArtifactRow, undefined, ownersRead),
      sheet: edit.sheet,
      edit: { file: edit.file, lines: edit.lines, formatted: edit.formatted },
    };
  };
  /**
   * The agent's write as `artifact_update` answers it (component canvas
   * §4): the file, the lines written, the formatter that shaped them, the
   * story with its args after, and its frames once a browser drew them again
   * (a panel's page redraws within a second), else `unseen`.
   */
  const componentWritten = async (
    row: ArtifactRow,
    change: SheetChange,
    written: ArtifactRead
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the story the write named, then its frames as the panel redraws them, bounded by a short wait
  ): Promise<ComponentWritten> => {
    const name = "args" in change ? change.args.story : storyOfOp(change.story);
    const story = written.sheet?.stories.find((one) => one.name === name);
    const sheet = sheetOf(row);
    let frames: ComponentWritten["render"] = "unseen";
    if (sheet && name && !("story" in change && "remove" in change.story)) {
      const at: StageAt = { workspace: sheet.workspace };
      const deadline = Date.now() + PANEL_DRAW_MS;
      for (;;) {
        const report = drawnHeld(
          row,
          (await deps.stage(at, sheet.files[0] as string, sheet.files)).opened
            .report
        );
        if (!unseen(report, name)) {
          frames = renderSaid(report).frames.filter(
            (one) => one.story === name
          );
          break;
        }
        if (Date.now() > deadline) {
          break;
        }
        await Bun.sleep(PANEL_DRAW_POLL_MS);
      }
    }
    return {
      file: written.edit?.file ?? "",
      lines: written.edit?.lines ?? { from: 0, to: 0 },
      formatted: written.edit?.formatted ?? null,
      story: story ? { name: story.name, args: story.args } : null,
      render: frames,
    };
  };
  /**
   * The report of a canvas just shown or written: the panel's, once its page
   * has drawn (it posts within a second of loading), else the daemon's own
   * draw in the machine's Chromium. A canvas is never answered `unseen` when
   * a browser could have drawn it.
   */
  const drawnReport = async (
    at: StageAt,
    files: string[],
    spec: CanvasSpec,
    opened: StageOpened,
    shownNow: boolean,
    story?: string
  ): Promise<Pick<StageRendered, "report" | "undrawn">> => {
    let { report } = opened;
    const deadline = Date.now() + PANEL_DRAW_MS;
    while (
      shownNow &&
      (unseen(report, story) || drawingUnseen(report).length > 0) &&
      Date.now() < deadline
    ) {
      await Bun.sleep(PANEL_DRAW_POLL_MS);
      ({ report } = (await deps.stage(at, files[0] as string, files)).opened);
    }
    return unseen(report, story)
      ? await deps.stageRender(at, { files, spec })
      : { report, undrawn: [] };
  };
  /**
   * `report` once the browser drawing its unseen sections has posted them,
   * within {@link PANEL_DRAW_MS}: a read right after the person acts, while
   * his panel's report stands aside for his act, answers the whole draw, or
   * says what is still drawing (component.ts `renderSaid`).
   */
  const drawnOut = async (
    row: ArtifactRow,
    at: StageAt,
    files: string[],
    report: RenderReport
  ): Promise<RenderReport> => {
    let now = report;
    const deadline = Date.now() + PANEL_DRAW_MS;
    while (drawingUnseen(now).length > 0 && Date.now() < deadline) {
      await Bun.sleep(PANEL_DRAW_POLL_MS);
      now = drawnHeld(
        row,
        (await deps.stage(at, files[0] as string, files)).opened.report
      );
    }
    return now;
  };
  /**
   * Makes a component canvas in `owner`'s panel (or opens the one of that
   * name) on the stage of its maker's workspace, shows it, and answers what
   * a browser drew of it: the panel's draw, else the daemon's.
   */
  const createSheet = async (
    making: Making,
    input: ArtifactInput
  ): Promise<Created> => {
    const { owner, maker } = making;
    const asked = input.file === undefined ? [] : [input.file].flat();
    if (asked.length === 0) {
      throw new ArtifactRefusal(
        400,
        `A component canvas takes file: its states file, the .stories.ts beside the component (or a list, one section each). Example: ${COMPONENT_EXAMPLE}.`
      );
    }
    const problem = canvasProblem(input);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
    const at: StageAt = { session: maker };
    // A canvas opened on nothing is refused: "Write it, then call again."
    const { machineId, opened, workspace } = await deps.stage(
      at,
      asked[0] as string,
      asked,
      true
    );
    const spec = specOf(input.name, input);
    const files = opened.report.sections.map((one) => one.file);
    const source: PreviewSource = {
      port: opened.port,
      path: canvasPath(files, spec),
      workspace,
      stage: { dir: opened.dir, file: opened.file },
    };
    const now = new Date();
    const before = db.byName(owner.id, "component", input.name);
    if (before) {
      db.resource(before.id, { machineId, source });
    }
    const row = before
      ? (db.update(before.id, {
          madeBy: maker.id,
          ...ctx.askedOf(input),
          revision: before.revision + 1,
          updatedAt: now,
        }) as ArtifactRow)
      : db.create({
          id: crypto.randomUUID(),
          instanceId: owner.id,
          madeBy: maker.id,
          heldFor: null,
          projectId: owner.projectId ?? null,
          kind: "component",
          name: input.name,
          ...ctx.askedOf(input),
          machineId,
          source,
          revision: 1,
          seq: 0,
          deliveredSeq: 0,
          readSeq: 0,
          openedRevision: null,
          createdAt: now,
          updatedAt: now,
          shownAt: null,
        });
    stampMeta(row, null);
    writeStage(row, opened.state, opened.sheet);
    const shown = await handOver(making, before, row);
    if (!(shown.started || before)) {
      discard(row);
      throw new ArtifactRefusal(503, shown.why);
    }
    const owned = sheetOf(row);
    const drawn = await drawnReport(
      { workspace },
      owned?.files ?? asked,
      spec,
      opened,
      ctx.openedOf(shown).opened
    );
    const { undrawn } = drawn;
    const report = drawnHeld(row, drawn.report);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      route: routeOf(row.id),
      ...ctx.openedOf(shown),
      stage: { ...sheetState(row, opened.state), errors: [] },
      render: {
        ...renderSaid(report, undrawn),
        weight: weightSaid(opened.weight),
      },
      moves: movesSaid(report),
      errors: errorsSaid(sheetState(row, opened.state).errors),
      hint: READ_HINT,
    };
  };
  /**
   * A component canvas as the session reads it (component canvas §4): its
   * picks and pins, its stage, what a browser drew (each frame's state), its
   * moves, its stories with the interactions they reach, the person's dials
   * and tuned motion; on asking, one story's args and code, one frame's
   * computed-style delta, a fresh draw on the daemon, a picture. Read
   * afresh on the workspace it was made in: a use that keeps the stage
   * awake. Its stage and each section's problem are the doc's (`meta.stage`),
   * as the panel reads them; a stage the read can't reach is the doc's last
   * stage with `unreached` beside it (`meta.unreached`: why, since when),
   * never a stale `live` alone. Its owner's read when `ownersRead`.
   */
  const readSheet = async (
    row: ArtifactRow,
    since?: number,
    ownersRead = true,
    ask: ComponentReadAsk = {}
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a canvas's read joins its stage, its report, the person's picks and each optional ask in one answer
  ): Promise<ArtifactRead> => {
    const sheet = sheetOf(row);
    let opened: StageOpened | undefined;
    let report: RenderReport | undefined;
    let undrawn: SectionUndrawn[] = [];
    let png: string | undefined;
    if (sheet) {
      const at: StageAt = { workspace: sheet.workspace };
      try {
        ({ opened } = await deps.stage(
          at,
          sheet.files[0] as string,
          sheet.files
        ));
        writeStage(row, opened.state, opened.sheet);
        ({ report } = opened);
      } catch (error) {
        unreachedWritten(row, error);
      }
      // A draw asked of a stage that answered: refused in its own words when it can't be made.
      if (opened && (ask.render || ask.png)) {
        ({ report, png, undrawn } = await deps.stageRender(at, {
          files: sheet.files,
          spec: sheet.spec,
          ...(ask.state ? { state: ask.state } : {}),
          ...(ask.png ? { png: true } : {}),
        }));
      }
      if (report) {
        report = drawnHeld(row, report);
      }
      if (report && !(ask.render || ask.png)) {
        report = await drawnOut(row, at, sheet.files, report);
      }
    }
    const meta = docMeta(docs.doc(row.id));
    const stage = meta.get("stage");
    const unreached = meta.get("unreached");
    const sheetNow = meta.get("sheet");
    const base = ctx.read(row, since, ownersRead);
    const {
      dials,
      tuned,
      layout: _layout,
      ...picks
    }: Record<string, ReadEntry | undefined> = base.state;
    const story = ask.story
      ? sheetNow?.stories.find((one) => one.name === ask.story)
      : undefined;
    if (ask.story && !story) {
      throw new ArtifactRefusal(
        404,
        `${row.name} has no story ${ask.story}; its stories are ${sheetNow?.stories.map((one) => one.name).join(", ") || "none"}.`
      );
    }
    return {
      ...base,
      state: picks,
      ...(stage ? { stage: { ...stage, errors: [] } } : {}),
      ...(unreached ? { unreached } : {}),
      errors: errorsSaid(stage?.errors ?? []),
      ...(report
        ? {
            render: renderSaid(report, undrawn, ask.state?.story),
            moves: movesSaid(report),
            stories: storiesSaid(sheetNow, report),
            ...(ask.state ? { frame: stateSaid(report, ask.state) } : {}),
          }
        : {}),
      ...(opened ? { weight: opened.weight } : {}),
      ...(dials === undefined ? {} : { dials: dials.value }),
      ...(tuned === undefined ? {} : { tuned: tuned.value }),
      ...(story && ask.detail === "story"
        ? {
            story: {
              name: story.name,
              args: story.args,
              code: story.code,
              meta: { args: sheetNow?.meta.args, code: sheetNow?.meta.code },
            },
          }
        : {}),
      ...(ask.png ? { png: png ?? null } : {}),
      hint: READ_HINT,
    } as ArtifactRead;
  };
  /** A design system round on component canvas `row`, asked by `requester`: what the ask did. */
  const askVerify = (
    requester: InstanceRow,
    row: ArtifactRow
  ): Promise<string> => {
    const sheet = sheetOf(row);
    if (!sheet) {
      return Promise.reject(
        new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: verify is a component canvas's.`
        )
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
    createSheet,
    readSheet,
    shapesOf,
    writeSheet,
    writeStage,
  };
};
