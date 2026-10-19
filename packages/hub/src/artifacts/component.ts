/**
 * A component canvas as the agent's tools speak of it (component canvas
 * §4): what `artifact_create` and `artifact_update` take beyond its states
 * files (`edges`, `group`, `dials`), the canvas page's address on
 * the stage that carries them, and the bounded answers `artifact_create`,
 * `artifact_read` and `artifact_update` give, every one read from the render
 * report the canvas page posts (core `RenderReport`), never from the files
 * alone. Refusals name the valid shape and one example.
 */
import {
  CANVAS_SPEC_LIMITS,
  type CanvasDial,
  type CanvasEdge,
  type CanvasSpec,
  type FrameRender,
  type Interaction,
  type RenderReport,
  type SheetRead,
  type SheetWeight,
  type StageError,
} from "@cawco/core/stage";

/** What a component canvas's create or update names beyond its files. */
export interface CanvasInput {
  dials?: CanvasDial[] | undefined;
  edges?: CanvasEdge[] | undefined;
  group?: Record<string, string> | undefined;
}

/** An example call, quoted by every refusal of a component canvas's shape. */
export const COMPONENT_EXAMPLE =
  'artifact_create({ kind: "component", name: "pairing", does: "judge", ask: "Judge the six pairing states: pin anything that reads wrong", file: "src/lib/Pairing.stories.ts" })';

/** What `artifact_create` takes, said whole when a body is malformed or names no `does` or `ask`. */
export const CREATE_SHAPE = `artifact_create takes kind, name, does (pick | judge | try | draw), ask (one line, what the person does here) and that kind's fields. A component canvas: { kind: "component", name, does: "judge", ask, file, edges?, group?, dials? }; edges [{ from: "Waiting", to: "Approved", label? }]; dials [{ name, kind: "number" | "color" | "select" | "toggle", min?, max?, step?, unit?, options?, target: { cssVar: "--radius" } | { arg: "size" } }]. Example: ${COMPONENT_EXAMPLE}.`;

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

/** A render report as an answer says it: who drew, each section's frames (bounded), the unnamed stories and what failed. */
export function renderSaid(report: RenderReport) {
  const frames = report.sections.flatMap((section) => section.frames);
  const listed = frames.slice(0, FRAMES_LISTED);
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
    ...(frames.length > listed.length
      ? {
          cut: `${listed.length} of ${frames.length} frames listed: read one with state: { story, interaction }.`,
        }
      : {}),
    unnamed: report.unnamed,
    ...(report.page.errors.length > 0
      ? { pageErrors: report.page.errors }
      : {}),
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

/** Compile errors as an answer says them: file, place, message. */
export const errorsSaid = (errors: StageError[]) =>
  errors.map((one) => ({
    file: one.file,
    line: one.line,
    column: one.column,
    message: one.message.split("\n")[0]?.slice(0, 300),
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
