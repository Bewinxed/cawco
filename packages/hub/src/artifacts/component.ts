/**
 * A design graph as the agent's tools speak of it (design graph
 * §4): what `artifact_create` and `artifact_update` take beyond its states
 * files (`edges`, `group`, `dials`), the canvas page's address on
 * the stage that carries them, and the bounded answers `artifact_create`,
 * `artifact_read` and `artifact_update` give, every one read from the render
 * report the canvas page posts (core `RenderReport`), never from the files
 * alone. Refusals name the valid shape and one example.
 */

import type { DrawnKept } from "@cawco/core/doc-meta";
import { nameSlug } from "@cawco/core/name-slug";
import {
  CANVAS_SPEC_LIMITS,
  type CanvasDial,
  type CanvasDirection,
  type CanvasEdge,
  type CanvasSpec,
  type DesignContent,
  type FrameRender,
  framesAlike,
  GRAPH_WIDTHS_SAID,
  type Interaction,
  namedKept,
  type RenderReport,
  type SectionRender,
  type SectionUndrawn,
  type SheetRead,
  type SheetWeight,
  type StageError,
  type StageErrorKind,
  type StageState,
  stageErrorReason,
  statesEntryOf,
  storyRefOf,
} from "@cawco/core/stage";
import { cutShort } from "@cawco/core/words/helpers";
import { stageRenderWords } from "@cawco/core/words/stage-render";

/** What a design graph's create or update names beyond its files. */
export interface CanvasInput {
  dials?: CanvasDial[] | undefined;
  /** The directions of one design, each one of its states files, as the agent names them (from its clone's root, as `file` does). */
  directions?: CanvasDirection[] | undefined;
  edges?: CanvasEdge[] | undefined;
  group?: Record<string, string> | undefined;
}

/** An example call, quoted by every refusal of a design graph's shape: the live story the person operates, a dial for what no press reaches. */
export const COMPONENT_EXAMPLE =
  'artifact_create({ kind: "component", name: "pairing", title: "Pairing a phone", does: "judge", ask: "Judge pairing a phone: scan the code, approve it, and pin what reads wrong", file: "src/lib/Pairing.stories.ts:Live", dials: [{ name: "answer", label: "What the phone answers", kind: "select", options: ["Approved", "Denied", "No answer"], target: { arg: "answer" } }] })';

/** What `artifact_create` takes, said whole when a body is malformed or names no `title`, `does` or `ask`. */
export const CREATE_SHAPE = `artifact_create takes kind, name (a slug, for tools and URLs), title (a few plain words that name it to the person), does (pick | judge | try | draw), ask (one line, what the person does here) and that kind's fields. A design graph: { kind: "component", name, title, does: "judge", ask, file, edges?, group?, dials?, directions? }; directions [{ file, name, line }], one per states file of one design, two or more (file may then be left out; a direction that differs only by a value is a dial); a design folder, for work with no project behind it, a stack with no stage or a throwaway idea: { kind: "component", name, title, does: "judge", ask, html (one page) or dir (a folder: index.html at its top and anything it loads, React, Svelte or TypeScript with a package.json for its npm imports), content? ("document" | "chart" | "deck", each shown at its own size; a screen where it names none), dials?, directions? }, each direction { html or dir, name, line }, its dials cssVar alone, artifact_update with html, dir or directions changing it in place; edges [{ from: "Waiting", to: "Approved", label? }]; dials [{ name, kind: "number" | "color" | "select" | "toggle" | "text" | "action", label?, group?, min?, max?, step?, unit?, options?, target: { cssVar: "--radius" } | { arg: "size" } }]. Example: ${COMPONENT_EXAMPLE}.`;

/** An example of the person's graph's named stories, quoted by their refusals. */
const NAMED_EXAMPLE =
  'file: ["src/lib/caw/CawSettings.stories.ts:Live", "src/lib/caw/RowQuiet.stories.ts:Before", "src/lib/caw/RowQuiet.stories.ts:After"]';

/** What the person's graph loads, said by each refusal of its named stories. */
const NAMED_RULE = `The person's graph loads the stories you name, each as path:Story (${NAMED_EXAMPLE}): the live story, a variant, a Before and an After, each direction's live story, in the order they step through them. A move from a named story (from: "<it>" and a play) comes with it. Your checklist of states stays on a graph of your own with reading: true, which loads whole files.`;

/**
 * A design graph's states entries (core `STATES_ENTRY`) read: each states
 * file as the agent named it, once, and on the person's graph (not
 * `reading`) the stories each names, in the order named; or why they
 * can't be taken.
 */
export function namedAsked(
  entries: readonly string[],
  reading: boolean
): { files: string[]; named: Record<string, string[]> } | string {
  const files: string[] = [];
  const named: Record<string, string[]> = {};
  for (const entry of entries) {
    const { file, story } = statesEntryOf(entry);
    if (reading && story) {
      return `Your reading (reading: true) loads each states file whole: name ${file} without :${story}.`;
    }
    if (!(reading || story)) {
      return `${file} names no story. ${NAMED_RULE}`;
    }
    if (story) {
      const stories = named[file] ?? [];
      named[file] = stories.includes(story) ? stories : [...stories, story];
    }
    if (!files.includes(file)) {
      files.push(file);
    }
  }
  return { files, named };
}

/**
 * Why the person's graph's named stories (`named`, by their states file as
 * the stage names it) can't open, read against the stage's report: a story
 * its file doesn't export; null when each is one, or the stage reads no
 * `froms` (one from before them).
 */
export function namedProblem(
  report: RenderReport,
  named: Readonly<Record<string, readonly string[]>>
): string | null {
  const { froms } = report;
  if (!froms) {
    return null;
  }
  for (const [file, stories] of Object.entries(named)) {
    const missing = stories.find((story) => !(`${file}:${story}` in froms));
    if (missing) {
      return `${file} exports no story ${missing}. ${NAMED_RULE}`;
    }
  }
  return null;
}

/**
 * `report` as the person's graph loads it (core `namedKept`): of each
 * states file `named` names, its named stories and their moves alone; a
 * file it names none of, whole.
 */
export function namedReport(
  report: RenderReport,
  named: Readonly<Record<string, readonly string[]>> | undefined
): RenderReport {
  if (!named || Object.keys(named).length === 0) {
    return report;
  }
  const froms = report.froms ?? {};
  /** Each states file's stories it loads, by its file: those `named` names of it, with their moves; every one of a file it names none of. */
  const keptOf = new Map(
    Object.entries(named).map(([file, stories]) => {
      const all = Object.entries(froms).flatMap(([ref, from]) => {
        const one = storyRefOf(ref);
        return one.file === file ? [{ name: one.story, from }] : [];
      });
      // A stage from before `froms` reads none: the named stories alone.
      const read =
        all.length > 0 ? all : stories.map((name) => ({ name, from: null }));
      return [file, new Set(namedKept(read, stories).map((one) => one.name))];
    })
  );
  const kept = (ref: string): boolean => {
    const { file, story } = storyRefOf(ref);
    const keep = file === undefined ? undefined : keptOf.get(file);
    return keep === undefined || keep.has(story);
  };
  return {
    ...report,
    sections: report.sections.map((section) => {
      const keep = (story: string) => kept(`${section.file}:${story}`);
      return {
        ...section,
        frames: section.frames.filter((frame) => keep(frame.story)),
        moves: section.moves.filter((move) => keep(move.from) && keep(move.to)),
      };
    }),
    unnamed: report.unnamed.filter(kept),
    ...(report.widthOnly
      ? {
          widthOnly: report.widthOnly
            .map((group) => group.filter(kept))
            .filter((group) => group.length > 1),
        }
      : {}),
    ...(report.codeNamed
      ? { codeNamed: report.codeNamed.filter((one) => kept(one.story)) }
      : {}),
  };
}

/** An example of a design's directions, quoted by their refusals. */
const DIRECTIONS_EXAMPLE =
  'directions: [{ file: "src/lib/TrayFamily.stories.ts:Live", name: "Family tray", line: "One thing per tray, replaced in place" }, { file: "src/lib/TrayCard.stories.ts:Live", name: "Status card", line: "One card whose words change" }]';

/** Why a design's directions can't be taken, among the canvas's states files `files` (as the agent named them); null when they can. */
function directionsProblem(
  directions: readonly CanvasDirection[],
  files: readonly string[] | undefined
): string | null {
  if (directions.length === 1) {
    return `A design graph's directions are two or more of one design: one alone is the design, given as file. Example: ${DIRECTIONS_EXAMPLE}.`;
  }
  if (directions.length > CANVAS_SPEC_LIMITS.files) {
    return `A design graph takes at most ${CANVAS_SPEC_LIMITS.files} directions.`;
  }
  const names = new Set(directions.map((one) => one.name.trim()));
  const named = new Set(directions.map((one) => one.file));
  if (names.size < directions.length || named.size < directions.length) {
    return `Each direction has a name and a states file of its own. Example: ${DIRECTIONS_EXAMPLE}.`;
  }
  const outside = files
    ? directions.filter((one) => !files.includes(one.file))
    : [];
  if (outside.length > 0) {
    return `Each direction is one of file: ${outside.map((one) => one.file).join(", ")} ${outside.length === 1 ? "is" : "are"} not. Leave file out to take the directions' files.`;
  }
  return null;
}

/** Why a canvas's edges, groups, dials or directions can't be taken, one sentence with the shape; null when they can. `files`: the states files they stand among, as the agent named them. */
export function canvasProblem(
  input: CanvasInput,
  files?: readonly string[]
): string | null {
  if (input.directions?.length) {
    const misfit = directionsProblem(input.directions, files);
    if (misfit) {
      return misfit;
    }
  }
  if ((input.edges?.length ?? 0) > CANVAS_SPEC_LIMITS.edges) {
    return `A design graph takes at most ${CANVAS_SPEC_LIMITS.edges} edges: { from: "<Story>", to: "<Story>", label? }, a story named by its export, or "file:Story" across states files.`;
  }
  if ((input.dials?.length ?? 0) > CANVAS_SPEC_LIMITS.dials) {
    return `A design graph takes at most ${CANVAS_SPEC_LIMITS.dials} dials.`;
  }
  for (const dial of input.dials ?? []) {
    const { target } = dial;
    const css =
      "cssVar" in target &&
      typeof target.cssVar === "string" &&
      target.cssVar.startsWith("--");
    const arg =
      "arg" in target &&
      typeof target.arg === "string" &&
      target.arg.length > 0;
    if (css === arg) {
      return `Dial ${dial.name}'s target is one of { cssVar: "--radius" } (a CSS variable set on every frame) or { arg: "size" } (a story arg, re-rendered in place). Example: { name: "radius", kind: "number", min: 0, max: 24, unit: "px", target: { cssVar: "--radius" } }.`;
    }
    if (dial.kind === "select" && !dial.options?.length) {
      return `Dial ${dial.name} is a select: it takes options, like ["sm", "md", "lg"].`;
    }
  }
  return null;
}

/**
 * One direction of a design as a create names it: its states file (a live
 * story's design), or its page (a design folder's): `html`, or `dir`, a
 * folder on the session's machine holding index.html and what it loads.
 */
export interface DirectionInput {
  dir?: string | undefined;
  file?: string | undefined;
  html?: string | undefined;
  line: string;
  name: string;
}

/** Whether a design graph's create names a design folder (`html`, `dir`, or a direction's) instead of states files (core stage.ts `designOf`). */
export const pagesAsked = (input: {
  dir?: string | undefined;
  directions?: readonly DirectionInput[] | undefined;
  html?: string | undefined;
}): boolean =>
  input.html !== undefined ||
  input.dir !== undefined ||
  (input.directions ?? []).some(
    (one) => one.html !== undefined || one.dir !== undefined
  );

/** An example of a design folder, quoted by its refusals. */
const DESIGN_EXAMPLE =
  'artifact_create({ kind: "component", name: "inbox-empty", title: "An empty inbox", does: "judge", ask: "Judge the empty inbox at each width and pin what reads wrong", dir: "/tmp/inbox", dials: [{ name: "radius", kind: "number", min: 0, max: 24, unit: "px", target: { cssVar: "--radius" } }] })';

/** A design folder's directions example, quoted by their refusals. */
const DESIGN_DIRECTIONS_EXAMPLE =
  'directions: [{ html: "<!doctype html>…", name: "Quiet list", line: "Every thread a row" }, { dir: "/tmp/mockups/cards", name: "Cards", line: "Each thread a card" }]';

/** One part of a design folder: what it is made from, its name and line as a direction's. */
export interface DesignPartAsked {
  from: { html: string } | { dir: string };
  line?: string;
  name?: string;
}

/** Why a design folder can't take `dials`: one sets an arg, which a page has none of; null when none does. */
export function designDialsProblem(
  dials: readonly CanvasDial[]
): string | null {
  const args = dials.filter((one) => "arg" in one.target);
  return args.length > 0
    ? `A design folder's pages have no props, so dial ${args.map((one) => one.name).join(", ")} has no arg to set. Dial a CSS variable the page reads ({ cssVar: "--radius" }), or show a live story of the component to dial its props.`
    : null;
}

/**
 * A design folder's parts as a create or update names them: its `html` or
 * `dir`, or each direction's; or why they can't be taken, one sentence with
 * the shape.
 */
export function designPartsOf(input: {
  dials?: readonly CanvasDial[] | undefined;
  dir?: string | undefined;
  directions?: readonly DirectionInput[] | undefined;
  file?: string | string[] | undefined;
  html?: string | undefined;
}): DesignPartAsked[] | string {
  if (input.file !== undefined) {
    return `A design graph shows live stories (file) or a design folder (html, dir, or each direction's), never both. Example: ${DESIGN_EXAMPLE}.`;
  }
  const dialed = designDialsProblem(input.dials ?? []);
  if (dialed) {
    return dialed;
  }
  const directions = input.directions ?? [];
  if (directions.length === 0) {
    if (input.html !== undefined && input.dir !== undefined) {
      return "A design folder takes one of html or dir.";
    }
    return [
      {
        from:
          input.html === undefined
            ? { dir: input.dir ?? "" }
            : { html: input.html },
      },
    ];
  }
  if (input.html !== undefined || input.dir !== undefined) {
    return `A design with directions takes each one's page on its direction: leave html and dir out. Example: ${DESIGN_DIRECTIONS_EXAMPLE}.`;
  }
  if (directions.length === 1) {
    return `A design's directions are two or more of one design: one alone is the design, given as html or dir. Example: ${DESIGN_DIRECTIONS_EXAMPLE}.`;
  }
  if (directions.length > CANVAS_SPEC_LIMITS.files) {
    return `A design graph takes at most ${CANVAS_SPEC_LIMITS.files} directions.`;
  }
  const names = new Set(directions.map((one) => one.name.trim()));
  const unpaged = directions.filter(
    (one) =>
      one.file !== undefined ||
      (one.html === undefined) === (one.dir === undefined)
  );
  if (names.size < directions.length || unpaged.length > 0) {
    return `Each direction of a design folder has a name of its own and its page: html, or dir holding index.html. Example: ${DESIGN_DIRECTIONS_EXAMPLE}.`;
  }
  return directions.map((one) => ({
    from: one.html === undefined ? { dir: one.dir ?? "" } : { html: one.html },
    name: one.name,
    line: one.line,
  }));
}

/**
 * Where each part of a design folder stands in it: one alone at its top,
 * each direction in a folder of its own named by its name as a slug, each
 * once. Each part's page is its folder's index.html.
 */
export const designPlaces = (parts: readonly DesignPartAsked[]): string[] => {
  if (parts.length === 1 && parts[0]?.name === undefined) {
    return [""];
  }
  const taken = new Set<string>();
  return parts.map((part, at) => {
    const base = nameSlug(part.name ?? "") || `direction-${at + 1}`;
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) {
      slug = `${base}-${n}`;
    }
    taken.add(slug);
    return slug;
  });
};

/** A design part's page at place `place` ({@link designPlaces}): its index.html. */
export const designPageAt = (place: string): string =>
  place ? `${place}/index.html` : "index.html";

/** A live story's design's directions as its canvas takes them, each naming its states file; or why one names none. */
export function storyDirectionsOf(
  directions: readonly DirectionInput[] | undefined
): CanvasDirection[] | undefined | string {
  if (directions === undefined) {
    return;
  }
  const taken: CanvasDirection[] = [];
  for (const one of directions) {
    if (one.file === undefined) {
      return `Each direction of a design is a states file: { file, name, line }. Example: ${DIRECTIONS_EXAMPLE}.`;
    }
    taken.push({ file: one.file, name: one.name, line: one.line });
  }
  return taken;
}

/** What a design folder's create answers beside its link: what the person can do there, and its next reads. */
export const designHint = (content: DesignContent | undefined): string =>
  `The design graph shows ${content ? `this ${content} at the panel's own width, in the person's scheme,` : `each page at ${GRAPH_WIDTHS_SAID} wide, light and dark,`} with its cssVar dials and the person's pins, served by Vite. artifact_update({ id, html | dir | directions }) changes it in place, and the open panel takes the change by hot reload, picks and pins kept; \`errors\` names each compile error, which the page shows too. artifact_read({ id }) answers their pins, dials and pick.`;

/** The canvas's spec its page is given: its name, edges, groups, dials and directions (each its states file as the stage names it). */
export const specOf = (name: string, input: CanvasInput): CanvasSpec => ({
  name,
  ...(input.edges?.length ? { edges: input.edges } : {}),
  ...(input.group && Object.keys(input.group).length > 0
    ? { group: input.group }
    : {}),
  ...(input.dials?.length ? { dials: input.dials } : {}),
  ...(input.directions?.length ? { directions: input.directions } : {}),
});

/**
 * The directions with each file as the stage names it (from the toolchain
 * root, `staged`), where the agent named it from its clone's root
 * (`asked`, in the same order): the file that ends the same.
 */
export const directionsStaged = (
  directions: readonly CanvasDirection[],
  asked: readonly string[],
  staged: readonly string[]
): CanvasDirection[] =>
  directions.map((one) => {
    const at = asked.indexOf(one.file);
    const same = staged[at];
    const file =
      same !== undefined && (one.file === same || one.file.endsWith(`/${same}`))
        ? same
        : (staged.find(
            (each) => one.file === each || one.file.endsWith(`/${each}`)
          ) ?? one.file);
    return { ...one, file };
  });

/** The direction `file` names in `spec` (a pin's states file, the person's pick); none where the canvas has no directions. */
export const directionOf = (
  spec: CanvasSpec | undefined,
  file: string | undefined
): CanvasDirection | undefined =>
  file === undefined
    ? undefined
    : spec?.directions?.find((one) => one.file === file);

/** A frame with the states file of the section that drew it. */
interface FrameHeld {
  file: string;
  frame: FrameRender;
}

/** What names the states file `file` in an answer: its direction's name where the canvas has directions, else the file. */
const directionNamed = (spec: CanvasSpec | undefined, file: string): string =>
  directionOf(spec, file)?.name ?? file;

/** At most this many frames an answer lists; past it, the count and how to read one. Ours: a canvas's first screenful. */
const FRAMES_LISTED = 60;

/** One frame as an answer lists it: never its args, its delta or its chain. */
/** How much of a frame's body a reading walked, when it was not all. */
const elementsSaid = (frame: FrameRender) =>
  frame.elements
    ? {
        elements: stageRenderWords.elementsRead(
          frame.elements.read,
          frame.elements.of
        ),
      }
    : {};

const frameLine = (
  { frame, file }: FrameHeld,
  spec: CanvasSpec | undefined
) => ({
  story: frame.story,
  direction: directionNamed(spec, file),
  label: frame.label,
  form: frame.form,
  interaction: frame.interaction,
  ...(frame.scheme === "light" ? {} : { scheme: frame.scheme }),
  state: frame.state,
  box: { w: frame.box.w, h: frame.box.h },
  ...elementsSaid(frame),
  ...(frame.error ? { error: frame.error } : {}),
});

/** The sections of `report` holding story `name` (`Story`, or `file:Story` naming one states file). */
const holdersIn = (report: RenderReport, name: string): SectionRender[] => {
  const { file, story } = storyRefOf(name);
  return report.sections.filter(
    (section) =>
      (file === undefined || section.file === file) &&
      section.frames.some((frame) => frame.story === story)
  );
};

/**
 * The frames a read lists, at most {@link FRAMES_LISTED}: a state read's
 * from the asked state (`Story`, or `file:Story`) on, in the section that
 * holds it; any other read's every section's, in the canvas's order. With
 * the words for what was left out, when anything was.
 */
function framesListed(
  report: RenderReport,
  state: string | undefined
): { cut?: string; listed: FrameHeld[] } {
  const story = state ? storyRefOf(state).story : undefined;
  const holder = state ? holdersIn(report, state)[0] : undefined;
  if (holder) {
    const from = holder.frames.findIndex((frame) => frame.story === story);
    const listed = holder.frames
      .slice(from, from + FRAMES_LISTED)
      .map((frame) => ({ file: holder.file, frame }));
    return listed.length < holder.frames.length
      ? {
          listed,
          cut: `${listed.length} of ${holder.frames.length} frames of ${holder.file} listed, from ${story} on: read another with state: { story, interaction }.`,
        }
      : { listed };
  }
  const frames = report.sections.flatMap((section) =>
    section.frames.map((frame) => ({ file: section.file, frame }))
  );
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
const drawingUnseen = (report: RenderReport): string[] =>
  report.sections
    .filter(
      (section) =>
        report.drawing?.includes(section.file) &&
        section.frames.every((frame) => frame.state === "unseen")
    )
    .map((section) => section.file);

/** The states files of `report` no browser drew as they stand and none is drawing: every frame `unseen`, no draw held. */
const unopenedOf = (report: RenderReport, drawing: readonly string[]) =>
  report.sections
    .filter(
      (section) =>
        !(section.drawn || drawing.includes(section.file)) &&
        section.frames.length > 0 &&
        section.frames.every((frame) => frame.state === "unseen")
    )
    .map((section) => section.file);

/** A render report as an answer says it: who drew, each section's frames (bounded; a state read's from that state, in its section), the unnamed stories, the stories that differ only by width, the labels that say code and the frames that look alike, what failed, the sections a browser is still drawing, and the sections the read's render did not draw. */
export function renderSaid(
  report: RenderReport,
  undrawn: readonly SectionUndrawn[] = [],
  state?: string,
  plansUnread?: true,
  spec?: CanvasSpec
) {
  const { listed, cut } = framesListed(report, state);
  const drawing = drawingUnseen(report);
  const unopened = unopenedOf(report, report.drawing ?? []);
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
    frames: listed.map((one) => frameLine(one, spec)),
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
    ...(unopened.length > 0
      ? { unopened: stageRenderWords.unopened(unopened) }
      : {}),
    ...(undrawn.length > 0 ? { undrawn } : {}),
    ...(plansUnread && undrawn.length > 0 ? { plansUnread } : {}),
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
      ...(move.stillRunning
        ? { unsettled: stageRenderWords.moveUnsettled(move.stillRunning) }
        : {}),
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

/**
 * Why `report` can't answer a state read of story `name`: a bare name two
 * or more of its states files export, in the words that name each
 * `file:Story` to send instead; null when it names one.
 */
export const stateAmbiguity = (
  report: RenderReport,
  name: string
): string | null => {
  const holders = holdersIn(report, name);
  return holders.length > 1
    ? stageRenderWords.storyInSeveral(
        storyRefOf(name).story,
        holders.map((section) => section.file)
      )
    : null;
};

/** One frame's computed-style delta from rest, the transitions it fires, where its elements are written, and its parts. */
export function stateSaid(report: RenderReport, ask: StateAsk) {
  const interaction = ask.interaction ?? "rest";
  const { story } = storyRefOf(ask.story);
  const held = holdersIn(report, ask.story).flatMap(
    (section) => section.frames
  );
  const frames = held.filter(
    (one) =>
      one.story === story &&
      one.interaction === interaction &&
      (!ask.scheme || one.scheme === ask.scheme) &&
      (!ask.width || one.width === ask.width)
  );
  const [frame] = frames;
  if (!frame) {
    const drawn = held
      .filter((one) => one.story === story)
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
    ...elementsSaid(frame),
    ...(frame.error ? { error: frame.error } : {}),
    ...(frame.interaction === "rest"
      ? {}
      : {
          delta: frame.delta?.changed ?? [],
          ...(frame.delta?.more
            ? {
                moreDeltas: stageRenderWords.andMore(
                  frame.delta.more,
                  "deltas"
                ),
              }
            : {}),
          animations: frame.delta?.animations ?? [],
          ...(frame.delta && frame.delta.changed.length === 0
            ? {
                finding: `The CSS has a ${frame.interaction} rule reaching ${frame.story} and nothing changes.`,
              }
            : {}),
        }),
  };
}

/** The weight as an answer says it: its totals. */
export const weightSaid = (weight: SheetWeight | null | undefined) =>
  weight
    ? {
        modules: weight.modules,
        bytes: weight.bytes,
      }
    : null;

/** One section's problem in an answer (`errorsSaid`). */
export interface ErrorSaid {
  column: number | null;
  file: string;
  frame?: string;
  kind?: StageErrorKind;
  line: number | null;
  message: string;
}

/** The most of a code frame an answer carries: a frame is a few lines around the place, and one of minified code is a line this long or longer. */
const FRAME_MAX = 1200;

/**
 * Each section's problem as an answer says it: its kind (optional on the
 * wire, as `StageError` has it), file, place, the line of its message that
 * names it whole (core `stageErrorReason`), and its code frame when it has
 * one, kept to {@link FRAME_MAX}.
 */
export const errorsSaid = (errors: StageError[]): ErrorSaid[] =>
  errors.map((one) => ({
    ...(one.kind ? { kind: one.kind } : {}),
    file: one.file,
    line: one.line,
    column: one.column,
    message: stageErrorReason(one.message),
    ...(one.frame ? { frame: cutShort(one.frame, FRAME_MAX) } : {}),
  }));

/** A stage as an answer says it: its compile errors are the answer's own `errors` ({@link errorsSaid}), said once. */
export type StageSaid = WithoutErrors<StageState>;

/** Each of union `T`'s members without its `errors`. */
type WithoutErrors<T> = T extends unknown ? Omit<T, "errors"> : never;

/** Stage `state` as an answer says it ({@link StageSaid}). */
export const stageSaid = ({
  errors: _errors,
  ...said
}: StageState): StageSaid => said;

/** What a design graph's answers point at next. */
export const READ_HINT =
  "artifact_read({ id, detail: 'story', story: 'Waiting' }) for its args; { state: { story, interaction: 'hover' } } for a state's delta; { render: true } draws it now; { png: true, state } a frame's picture; { layout: true, state } its alignment guides and their numbers.";

/** Whether every frame a report lists for `story` (or all) is unseen: the stage's own page has not drawn it since its file changed. */
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
 * same content, already drawn. A file changed since stays unseen until the
 * stage's own page reads it, and a stage's standing problem (`failed`)
 * stands. The report's time and page errors are its newest draw's. Answers the
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
    // A draw kept before the stage's own page read every report (a person's panel's, `by: "panel"`, its stories maybe the named ones alone) is not held: the reader reads that content again.
    const restored =
      last &&
      last.by === "stage" &&
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
      by: "stage",
      page: { errors: newest.errors },
      sections,
    },
  };
}
