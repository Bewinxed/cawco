/**
 * A component canvas as the agent's tools speak of it (component canvas
 * §4): what `artifact_create` and `artifact_update` take beyond its states
 * files (`edges`, `group`, `dials`), the canvas page's address on
 * the stage that carries them, and the bounded answers `artifact_create`,
 * `artifact_read` and `artifact_update` give, every one read from the render
 * report the canvas page posts (core `RenderReport`), never from the files
 * alone. Refusals name the valid shape and one example.
 */

import type { DrawnKept } from "@cawco/core/doc-meta";
import {
  CANVAS_SPEC_LIMITS,
  type CanvasDial,
  type CanvasEdge,
  type CanvasSpec,
  type FrameRender,
  framesAlike,
  type Interaction,
  type RenderReport,
  type SectionRender,
  type SectionUndrawn,
  type SheetRead,
  type SheetWeight,
  type StageError,
  type StageErrorKind,
} from "@cawco/core/stage";
import { stageRenderWords } from "@cawco/core/words/stage-render";

/** What a component canvas's create or update names beyond its files. */
export interface CanvasInput {
  dials?: CanvasDial[] | undefined;
  edges?: CanvasEdge[] | undefined;
  group?: Record<string, string> | undefined;
}

/** An example call, quoted by every refusal of a component canvas's shape. */
export const COMPONENT_EXAMPLE =
  'artifact_create({ kind: "component", name: "pairing", title: "Pairing states", does: "judge", ask: "Judge the six pairing states: pin anything that reads wrong", file: "src/lib/Pairing.stories.ts" })';

/** What `artifact_create` takes, said whole when a body is malformed or names no `title`, `does` or `ask`. */
export const CREATE_SHAPE = `artifact_create takes kind, name (a slug, for tools and URLs), title (a few plain words that name it to the person), does (pick | judge | try | draw), ask (one line, what the person does here) and that kind's fields. A component canvas: { kind: "component", name, title, does: "judge", ask, file, edges?, group?, dials? }; edges [{ from: "Waiting", to: "Approved", label? }]; dials [{ name, kind: "number" | "color" | "select" | "toggle" | "text" | "action", label?, group?, min?, max?, step?, unit?, options?, target: { cssVar: "--radius" } | { arg: "size" } }]. Example: ${COMPONENT_EXAMPLE}.`;

/** Why a canvas's edges, groups or dials can't be taken, one sentence with the shape; null when they can. */
export function canvasProblem(input: CanvasInput): string | null {
  if ((input.edges?.length ?? 0) > CANVAS_SPEC_LIMITS.edges) {
    return `A canvas takes at most ${CANVAS_SPEC_LIMITS.edges} edges: { from: "<Story>", to: "<Story>", label? }, a story named by its export, or "file:Story" across states files.`;
  }
  if ((input.dials?.length ?? 0) > CANVAS_SPEC_LIMITS.dials) {
    return `A canvas takes at most ${CANVAS_SPEC_LIMITS.dials} dials.`;
  }
  for (const dial of input.dials ?? []) {
    const target = dial.target as { arg?: unknown; cssVar?: unknown };
    const css =
      typeof target.cssVar === "string" && target.cssVar.startsWith("--");
    const arg = typeof target.arg === "string" && target.arg.length > 0;
    if (css === arg) {
      return `Dial ${dial.name}'s target is one of { cssVar: "--radius" } (a CSS variable set on every frame) or { arg: "size" } (a story arg, re-rendered in place). Example: { name: "radius", kind: "number", min: 0, max: 24, unit: "px", target: { cssVar: "--radius" } }.`;
    }
    if (dial.kind === "select" && !dial.options?.length) {
      return `Dial ${dial.name} is a select: it takes options, like ["sm", "md", "lg"].`;
    }
  }
  return null;
}

/** The canvas's spec its page is given: its name, edges, groups and dials. */
export const specOf = (name: string, input: CanvasInput): CanvasSpec => ({
  name,
  ...(input.edges?.length ? { edges: input.edges } : {}),
  ...(input.group && Object.keys(input.group).length > 0
    ? { group: input.group }
    : {}),
  ...(input.dials?.length ? { dials: input.dials } : {}),
});

/** At most this many frames an answer lists; past it, the count and how to read one. Ours: a canvas's first screenful. */
const FRAMES_LISTED = 60;

/** One frame as an answer lists it: never its args, its delta or its chain. */
const frameLine = (frame: FrameRender) => ({
  story: frame.story,
  label: frame.label,
  form: frame.form,
  interaction: frame.interaction,
  ...(frame.scheme === "light" ? {} : { scheme: frame.scheme }),
  state: frame.state,
  box: { w: frame.box.w, h: frame.box.h },
  ...(frame.error ? { error: frame.error } : {}),
});

/**
 * The frames a read lists, at most {@link FRAMES_LISTED}: a state read's
 * from the asked state (`Story`, or `file:Story`) on, in the section that
 * holds it; any other read's every section's, in the canvas's order. With
 * the words for what was left out, when anything was.
 */
function framesListed(
  report: RenderReport,
  state: string | undefined
): { cut?: string; listed: FrameRender[] } {
  const cut = state?.lastIndexOf(":") ?? -1;
  const [inFile, story] =
    state && cut > 0
      ? [state.slice(0, cut), state.slice(cut + 1)]
      : [undefined, state];
  const holder = story
    ? report.sections.find(
        (section) =>
          (inFile === undefined || section.file === inFile) &&
          section.frames.some((frame) => frame.story === story)
      )
    : undefined;
  if (holder) {
    const from = holder.frames.findIndex((frame) => frame.story === story);
    const listed = holder.frames.slice(from, from + FRAMES_LISTED);
    return listed.length < holder.frames.length
      ? {
          listed,
          cut: `${listed.length} of ${holder.frames.length} frames of ${holder.file} listed, from ${story} on: read another with state: { story, interaction }.`,
        }
      : { listed };
  }
  const frames = report.sections.flatMap((section) => section.frames);
  const listed = frames.slice(0, FRAMES_LISTED);
  return frames.length > listed.length
    ? {
        listed,
        cut: `${listed.length} of ${frames.length} frames listed: read one with state: { story, interaction }.`,
      }
    : { listed };
}

/**
 * The states files of `report` a browser is drawing now whose frames are
 * all `unseen`: no draw of them as they stand yet, one within moments. A
 * read waits on them a moment, and says those that outlast it.
 */
export const drawingUnseen = (report: RenderReport): string[] =>
  report.sections
    .filter(
      (section) =>
        report.drawing?.includes(section.file) &&
        section.frames.every((frame) => frame.state === "unseen")
    )
    .map((section) => section.file);

/** A render report as an answer says it: who drew, each section's frames (bounded; a state read's from that state, in its section), the unnamed stories, the stories that differ only by width, the labels that say code and the frames that look alike, what failed, the sections a browser is still drawing, and the sections the read's render did not draw. */
export function renderSaid(
  report: RenderReport,
  undrawn: readonly SectionUndrawn[] = [],
  state?: string
) {
  const { listed, cut } = framesListed(report, state);
  const drawing = drawingUnseen(report);
  const alike = framesAlike(report.sections);
  return {
    by: report.by,
    at: report.at,
    sections: report.sections.map((section) => ({
      file: section.file,
      title: section.title,
      frames: section.frames.length,
      ...(section.notForced.length > 0 ? { notForced: section.notForced } : {}),
    })),
    frames: listed.map(frameLine),
    ...(cut ? { cut } : {}),
    unnamed: report.unnamed,
    ...(report.widthOnly?.length ? { widthOnly: report.widthOnly } : {}),
    ...(report.codeNamed?.length ? { codeNamed: report.codeNamed } : {}),
    ...(alike.length > 0 ? { alike } : {}),
    ...(report.page.errors.length > 0
      ? { pageErrors: report.page.errors }
      : {}),
    ...(drawing.length > 0
      ? { drawing: stageRenderWords.drawing(drawing) }
      : {}),
    ...(undrawn.length > 0 ? { undrawn } : {}),
  };
}

/** The moves a report read: each flow move's animations, as the timeline lists them. */
export const movesSaid = (report: RenderReport) =>
  report.sections.flatMap((section) =>
    section.moves.map((move) => ({
      from: move.from,
      to: move.to,
      animations: move.animations.map((one) => ({
        target: one.target,
        property: one.property,
        duration: one.duration,
        delay: one.delay,
        easing: one.easing,
      })),
      ...(move.error ? { error: move.error } : {}),
    }))
  );

/** Each story with the interactions a browser drew it in and the args it sets of its own. */
export const storiesSaid = (
  sheet: SheetRead | undefined,
  report: RenderReport
) =>
  (sheet?.stories ?? []).map((story) => {
    const frames = report.sections
      .flatMap((section) => section.frames)
      .filter((frame) => frame.story === story.name);
    return {
      name: story.name,
      label: story.label,
      interactions: [...new Set(frames.map((frame) => frame.interaction))],
      argsChanged: [...Object.keys(story.args), ...Object.keys(story.code)],
      ...(story.from && story.play ? { from: story.from } : {}),
    };
  });

/** A frame a read asks for: its story, interaction and (optionally) scheme and width. */
export interface StateAsk {
  interaction?: Interaction;
  scheme?: "light" | "dark";
  story: string;
  width?: number;
}

/** One frame's computed-style delta from rest, the transitions it fires, where its elements are written, and its parts. */
export function stateSaid(report: RenderReport, ask: StateAsk) {
  const interaction = ask.interaction ?? "rest";
  const frames = report.sections
    .flatMap((section) => section.frames)
    .filter(
      (one) =>
        one.story === ask.story &&
        one.interaction === interaction &&
        (!ask.scheme || one.scheme === ask.scheme) &&
        (!ask.width || one.width === ask.width)
    );
  const [frame] = frames;
  if (!frame) {
    const drawn = report.sections
      .flatMap((section) => section.frames)
      .filter((one) => one.story === ask.story)
      .map((one) => one.interaction);
    return {
      story: ask.story,
      interaction,
      state: "none" as const,
      why:
        drawn.length > 0
          ? `${ask.story} has no ${interaction} frame: its CSS reaches ${[...new Set(drawn)].join(", ")}.`
          : `No frame of ${ask.story} is drawn: read with render: true to draw it now.`,
    };
  }
  return {
    story: frame.story,
    interaction: frame.interaction,
    scheme: frame.scheme,
    width: frame.width,
    state: frame.state,
    box: frame.box,
    text: frame.text,
    parts: frame.parts,
    ...(frame.error ? { error: frame.error } : {}),
    ...(frame.interaction === "rest"
      ? {}
      : {
          delta: frame.delta?.changed ?? [],
          animations: frame.delta?.animations ?? [],
          ...(frame.delta && frame.delta.changed.length === 0
            ? {
                finding: `The CSS has a ${frame.interaction} rule reaching ${frame.story} and nothing changes.`,
              }
            : {}),
        }),
  };
}

/** The weight as an answer says it: its totals, whether a component's budget is past, and where to cut. */
export const weightSaid = (weight: SheetWeight | null | undefined) =>
  weight
    ? {
        modules: weight.modules,
        bytes: weight.bytes,
        over: weight.over,
        cut: weight.cut,
      }
    : null;

/** One section's problem in an answer (`errorsSaid`). */
export interface ErrorSaid {
  column: number | null;
  file: string;
  frame?: string;
  kind?: StageErrorKind;
  line: number | null;
  message: string | undefined;
}

/** Each section's problem as an answer says it: its kind (optional on the wire, as `StageError` has it), file, place, message, and its code frame when it has one. */
export const errorsSaid = (errors: StageError[]): ErrorSaid[] =>
  errors.map((one) => ({
    ...(one.kind ? { kind: one.kind } : {}),
    file: one.file,
    line: one.line,
    column: one.column,
    message: one.message.split("\n")[0]?.slice(0, 300),
    ...(one.frame ? { frame: one.frame } : {}),
  }));

/** What a component canvas's answers point at next. */
export const READ_HINT =
  "artifact_read({ id, detail: 'story', story: 'Waiting' }) for its args; { state: { story, interaction: 'hover' } } for a state's delta; { render: true } draws it now; { png: true, state } a frame's picture.";

/** Whether every frame a report lists for `story` (or all) is unseen: no browser drew it since its file changed. */
export const unseen = (report: RenderReport, story?: string): boolean => {
  const frames = report.sections
    .flatMap((section) => section.frames)
    .filter((frame) => !story || frame.story === story);
  return (
    frames.length === 0 || frames.every((frame) => frame.state === "unseen")
  );
};

/**
 * A stage's report with the canvas's last draws held past the stage: its
 * host keeps what a browser drew in memory alone, so a stage that slept,
 * restarted, or whose daemon or clone was made again answers every frame
 * `unseen`, 0×0, drawn at 1970. Each section the stage holds a draw of
 * (`drawn`) is kept in `had`'s place; each it holds none of, every frame
 * unseen, whose files hash as the kept draw's did, is that draw again: the
 * same content, already drawn. A file changed since stays unseen until a
 * browser draws it, and a stage's standing problem (`failed`) stands. The
 * report's time, drawer and page errors are its newest draw's. Answers the
 * report and the record to keep, one entry per states file the canvas has.
 */
export function drawsHeld(
  report: RenderReport,
  had: Readonly<Record<string, DrawnKept>>
): { kept: Record<string, DrawnKept>; report: RenderReport } {
  const kept: Record<string, DrawnKept> = {};
  let newest: Omit<DrawnKept, "section"> = {
    at: report.at,
    by: report.by,
    errors: report.page.errors,
  };
  const sections = report.sections.map((section): SectionRender => {
    const last = had[section.file];
    if (section.drawn) {
      const { drawn, ...rest } = section;
      kept[section.file] = {
        at: drawn.at,
        by: drawn.by,
        // The page's errors ride with the newest draw the stage answers.
        errors: drawn.at === report.at ? report.page.errors : [],
        section: rest,
      };
      return section;
    }
    if (last) {
      kept[section.file] = last;
    }
    const restored =
      last &&
      section.hash !== "" &&
      last.section.hash === section.hash &&
      section.frames.every((frame) => frame.state === "unseen");
    if (!restored) {
      return section;
    }
    if (last.at > newest.at) {
      newest = { at: last.at, by: last.by, errors: last.errors };
    }
    return { ...last.section, drawn: { at: last.at, by: last.by } };
  });
  return {
    kept,
    report: {
      ...report,
      at: newest.at,
      by: newest.by,
      page: { errors: newest.errors },
      sections,
    },
  };
}
