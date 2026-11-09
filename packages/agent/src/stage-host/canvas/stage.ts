/**
 * The stage (the design graph's, Projects spec §5.10): what a person's
 * panel frames for a component artifact (`by=panel`) and what the stage's
 * own render draws (`by=stage`). The page holds the project's component
 * and its one live instance, standing in the state the panel keeps, at
 * 1:1: laid out at the width he picked, else its own (a story's viewport,
 * the width its frames in the report are read at), else the desk's up to
 * the page's room; never narrowed to the room: a form asked at 1440 laid
 * out at a 1412px room drew its 1440 content cut at its right edge. A
 * drawing wider than the page scrolls sideways. It stands on the page it
 * lives on, the page's gutter round it where the window has room for it,
 * and none where it hasn't: a 1440 drawing in a 1440 window stands as that
 * window, edge to edge. It shows its own width where it stands narrower
 * than the width it was laid out at, so no paper stands beside a form held
 * to its measure.
 *
 * The panel draws the design graph round the frame that holds this page
 * and says what to stand at by messages alone (core stage-graph.ts):
 * `cawco:stage-reach` brings the live instance to a state, which the page
 * answers `cawco:stage-reached` once it has settled; `cawco:stage-laid`
 * tells the panel the width the drawing needs, which its split gives the
 * stage; `cawco:stage-fault` says the component threw as it mounted, the
 * error formula drawn in the drawing's place with its own Try again.
 *
 * Compare is read here too, where both drawings stand: `cawco:stage-compare`
 * names a state to compare the kept one with, which the page draws hidden
 * under the drawing at the drawing's width, reads what differs between the
 * two (diff.ts) as either lays out, rings each difference in a layer of its
 * own and answers `cawco:stage-differences`; where its room holds both
 * side by side it stands them so, each named, and the flip (`show:
 * "compared"`) shows the compared one in the kept one's place.
 * `cawco:stage-reveal` brings a difference's ring into view.
 *
 * The instance mounts once for as long as the panel stays with it (again
 * only for another states file, a reach from nothing, Try again after a
 * fault, or an edit of its states file), and a reach sets the next state's
 * args on it in place, its own motion running and read as it runs. Once
 * the person has pressed or typed in the drawing, the next reach mounts its
 * state afresh instead: the component's own handlers may have taken it
 * where no args say (a press outside an open column closed it).
 *
 * A reach to a state its states file plays a move into (`play`, from the
 * story's `from`) plays that move on the drawing from its from state; the
 * reach answers every animation it set off as a clip, and the drawing rests
 * on the state reached. The panel's Animation face plays, scrubs and
 * tunes that move by messages (`cawco:stage-play`, `-pause`, `-seek`,
 * `-let-go`, `-retime`), each on the page's own replays (replays.ts), the
 * page its clock (`cawco:stage-time`); a row rested on rings its thing
 * (`cawco:stage-ring`). The agent's dials are the panel's too: the page
 * says each one's value as written off the drawing once it first mounts
 * (`cawco:stage-dials-written`) and sets every value the panel turns
 * (`cawco:stage-dials`) on it.
 *
 * Every story the canvas page draws, it draws here, as a drawing (a body
 * of its own in a frame its width, marked with its story): the stage's one
 * live instance, and each story a decision page's Preview (`by=embed`) or
 * a map's card (`by=map`) names, one under another in a column at its own
 * width ({@link bootColumn}). A Preview tells the page holding it its
 * column's shape (embed.ts).
 *
 * Every states file's report is read in the rig, a section at a time: each
 * story mounted off screen as the person's drawing would be, read, then
 * taken down, a few at a time; then its probes and its moves. The page
 * posts it as each section is read, so the hub answers an open canvas from
 * the panel's own draw.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  type AnimationRead,
  type CanvasDial,
  type CanvasGraph,
  FORMS,
  type FramePictureRead,
  type FrameRender,
  holdersOf,
  type Interaction,
  type PageError,
  type Story,
  type SweepStep,
  storyRefOf,
} from "@cawco/core/stage";
import {
  type ClipRead,
  clipEnd,
  clipKindOf,
  cutRecords,
  type DialSet,
  type DifferenceRead,
  type DrawingBox,
  STAGE_COMPARE,
  STAGE_DIALS,
  STAGE_DIALS_WRITTEN,
  STAGE_DIFFERENCES,
  STAGE_FAULT,
  STAGE_LAID,
  STAGE_REACH,
  STAGE_REACHED,
  STAGE_REVEAL,
  STAGE_ROOM,
  STAGE_SCROLLED,
  STAGE_TIME,
  type StageCompare,
  type StageDialsWritten,
  type StageDifferences,
  type StageFault,
  type StageLaid,
  type StageReach,
  type StageReached,
  type StageReveal,
  type StageScrolled,
  type StageTime,
  type StateRef,
  shownName,
  stageCompareOf,
  stageDialsOf,
  stageReachOf,
  stageRevealOf,
  stageRoomOf,
  storyOf,
} from "@cawco/core/stage-graph";
import { queriesIn, userEventIn } from "@cawco/core/stage-play";
import { graphWords as words } from "@cawco/core/words/graph";
import { stageRenderWords } from "@cawco/core/words/stage-render";
import { differences } from "./diff";
import { tellHolder } from "./embed";
import { drew, firstWords, lookOf, partsOf, readAnimation } from "./measure";
import { nameOf, thingOf } from "./names";
import { allClass } from "./pseudo";
import {
  answerMoves,
  frameCurveOf,
  framedOf,
  type Held,
  interpolated,
  legsOf,
  Replays,
  valuesOf,
} from "./replays";
import {
  type Column,
  detailsOf,
  FAILED_LINE,
  FORCED,
  frameTick,
  type Mode,
  type Mounted,
  type Page,
  type Probe,
  type Section,
  type SectionFailure,
} from "./runtime";
import {
  frameAsViewport,
  windowHeight,
  windowRoom,
  windowWidth,
} from "./viewport";

/** The most of a story's error a Preview's failure carries (`CANVAS_EMBED_FAILED`): its Preview says it on one line. Our call. */
const EMBED_WHY_MAX = 200;
/** How long a reach's play may run, then its motion (component-canvas moves.md). */
const PLAY_MS = 6000;
const MOTION_MS = 3000;
/** The quiet that ends a move: no new animation and none running for this long. */
const QUIET_MS = 250;
/** The rest a drawing comes to as it mounts: its own arrivals (a read-back the hub answered) have played. */
const REST_MS = 600;
/** The quiet after the last edit or view change before the report's sections are read again. Ours. */
const READ_AGAIN_MS = 300;
/** The gap between two stories' boxes in a section's read, px: their places in the report, one under another. */
const ROW_GAP = 24;
/** The page's gutter round the drawing (the panel's stage head's inset). */
const GUTTER = "--spacing-space-4";
/** The gutter the page keeps beside the drawing now (page-style.ts): {@link GUTTER}'s, or less where the window lacks the room. */
const STAGE_GUTTER_VAR = "--stage-gutter";
/** The room the stage's floating head takes over the page's top (page-style.ts), px as the panel said it. */
const STAGE_ROOM_VAR = "--stage-room";
/** The gap between the kept drawing and the compared one where the two stand side by side. */
const BESIDE_GAP = "--spacing-space-6";
/**
 * How long after Compare turns on (or turns to another state) each read of
 * the differences brings the first ring into view: the first read stands
 * on drawings still settling, and shown once it was brought to where the
 * ring stood, not where it stands (the design graph's branch, Stage.svelte).
 */
const SETTLE_MS = 1200;
/** What a reader sees of a drawing besides its words: its controls and its pictures (stage.ts `inkOf`). */
const INKED =
  "button, input, select, textarea, img, svg, canvas, video, [role=switch], [role=checkbox], [role=button]";
/** Solar's close glyph (bold duotone), the error formula's mark (DESIGN.md, Icons): the dashboard's `IconError`. */
const ERROR_GLYPH =
  '<g fill="currentColor"><path d="M5.53717 19.5302C5.24427 19.8231 4.7694 19.8231 4.47651 19.5302C4.18361 19.2373 4.18361 18.7624 4.47651 18.4696L18.4764 4.46967C18.7693 4.17678 19.2442 4.17678 19.5371 4.46967C19.8299 4.76256 19.8299 5.23744 19.5371 5.53033L5.53717 19.5302Z" opacity=".5"/><path d="M4.46978 5.53033C4.17689 5.23744 4.17689 4.76256 4.46978 4.46967C4.76268 4.17678 5.23755 4.17678 5.53044 4.46967L19.5303 18.4696C19.8232 18.7624 19.8232 19.2373 19.5303 19.5302C19.2374 19.8231 18.7626 19.8231 18.4697 19.5302L4.46978 5.53033Z"/></g>';

/** A state resolved on the page: its section, the story drawn (a variant's own), and the args it is drawn with. */
interface Target {
  args: Record<string, unknown>;
  ref: StateRef;
  section: Section;
  story: Story;
}

/** The live instance: what it stands at, how it was mounted, and what its mount said of itself. */
interface Live extends Target {
  into: { error?: PageError };
  mounted: Mounted | undefined;
}

/** The state Compare compares the drawing with: drawn hidden under it, in a body of its own. */
interface Against extends Live {
  body: HTMLElement;
  /** It has come to rest: its differences can be read. */
  rested: boolean;
}

/** An animation a reach set off, as first seen: its element, its frames and its timing. */
interface Taken {
  animation: Animation;
  /** Which way each of its runs goes. */
  direction: PlaybackDirection;
  /** Ms after the press it was first seen at. */
  first: number;
  /** How many times it runs; 0 for a loop. */
  iterations: number;
  keyframes: Keyframe[];
  /** What it animates, read as it was first seen (`propertyOf`). */
  property: string;
  read: AnimationRead;
  target: Element | null;
}

/** A story's `play`, as the stage runs it (core stage-play.ts's context). */
type PlayFn = (context: object) => Promise<void> | void;

/** A section's stories as the rig read them, for the report. */
type Reads = Map<Section, FrameRender[]>;

/** Whether two state names name one state. */
const sameRef = (a: StateRef | null, b: StateRef | null): boolean =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/**
 * An animation a reach set off, as first seen: its frames and timing as the
 * engine has them then (a transition's engine drops its effect once it
 * ends); null for one that runs no time.
 */
function takenOf(
  animation: Animation,
  first: number,
  t0: number
): Taken | null {
  const effect = animation.effect as KeyframeEffect | null;
  if (!((Number(effect?.getComputedTiming().duration) || 0) > 0)) {
    return null;
  }
  const timing = effect?.getComputedTiming();
  const iterations = Number(timing?.iterations ?? 1);
  return {
    animation,
    direction: timing?.direction ?? "normal",
    first,
    target: effect?.target ?? null,
    keyframes: effect?.getKeyframes() ?? [],
    iterations: Number.isFinite(iterations) ? iterations : 0,
    property: propertyOf(animation),
    read: readAnimation(animation, t0),
  };
}

/** A picture's key: a state of a story in an interaction. */
const pictureKey = (file: string, story: string, interaction: Interaction) =>
  `${file}|${story}|${interaction}`;

/**
 * Motion that is the state's own and never a move's: a loop, or one that
 * runs on a scroller and not on the clock (the house edge fade, a
 * scroll-driven animation). Landed, an edge fade jumped to its scroll's end.
 */
const statesOwn = (animation: Animation) =>
  !(animation.timeline instanceof DocumentTimeline) ||
  animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY;

/** An animation at its end at once; one that can't be (paused at no rate) is left as it stands. */
function land(animation: Animation): void {
  try {
    animation.finish();
  } catch {
    // InvalidStateError: a rate of 0 or an endless effect has no end to land on.
  }
}

const nextFrame = () =>
  new Promise<void>((done) => requestAnimationFrame(() => done()));

const MOTION_KEYS = new Set([
  "offset",
  "computedOffset",
  "easing",
  "composite",
]);
const UPPER = /[A-Z]/gu;

/** What an animation animates: a transition's property, a keyframes' name, a Web Animation's keyframes' properties. */
function propertyOf(animation: Animation): string {
  if (
    typeof CSSTransition !== "undefined" &&
    animation instanceof CSSTransition
  ) {
    return animation.transitionProperty;
  }
  if (
    typeof CSSAnimation !== "undefined" &&
    animation instanceof CSSAnimation
  ) {
    return animation.animationName;
  }
  const effect = animation.effect as KeyframeEffect | null;
  const keys = new Set<string>();
  for (const frame of effect?.getKeyframes() ?? []) {
    for (const key of Object.keys(frame)) {
      if (!MOTION_KEYS.has(key)) {
        keys.add(key.replace(UPPER, (c) => `-${c.toLowerCase()}`));
      }
    }
  }
  return [...keys].join(", ");
}

/** A token's length on the page's own tokens, px. */
const tokenPx = (name: string): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  ) || 0;

/**
 * A dial's value as written, from what the drawing holds for it: a
 * number's figure (a plain number, or one in the dial's own unit), a
 * toggle's state, a colour's or an option's words; null where it holds
 * none the dial can show.
 */
function dialValueOf(
  kind: string,
  raw: unknown,
  unit: string | undefined
): DialSet | null {
  if (typeof raw === "boolean") {
    return kind === "toggle" || kind === "action" ? raw : String(raw);
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string" || raw === "") {
    return kind === "action" ? 0 : null;
  }
  if (kind === "number" || kind === "action") {
    return figureOf(raw, unit);
  }
  return kind === "toggle" ? raw === "true" || raw === "1" : raw;
}

/** A plain number, or one in `unit`, read from its words; null for any other. */
function figureOf(raw: string, unit: string | undefined): number | null {
  const said = (
    unit && raw.endsWith(unit) ? raw.slice(0, -unit.length) : raw
  ).trim();
  const figure = Number(said);
  return said !== "" && Number.isFinite(figure) ? figure : null;
}

/**
 * Each dial's value as written on `body`: a `cssVar` dial's as the body
 * computes it with no dial set on it (each set one lifted for the read and
 * put back), an `arg` dial's as `own`, the story's args, hold it.
 */
function writtenOf(
  dials: readonly CanvasDial[],
  body: HTMLElement,
  own: Record<string, unknown>
): Record<string, DialSet> {
  const lifted = new Map<string, string>();
  for (const dial of dials) {
    const now =
      "cssVar" in dial.target
        ? body.style.getPropertyValue(dial.target.cssVar)
        : "";
    if ("cssVar" in dial.target && now) {
      lifted.set(dial.target.cssVar, now);
      body.style.removeProperty(dial.target.cssVar);
    }
  }
  const style = getComputedStyle(body);
  const values: Record<string, DialSet> = {};
  for (const dial of dials) {
    const raw =
      "cssVar" in dial.target
        ? style.getPropertyValue(dial.target.cssVar).trim()
        : own[dial.target.arg];
    const value = dialValueOf(dial.kind, raw, dial.unit);
    if (value !== null) {
      values[dial.name] = value;
    }
  }
  for (const [name, value] of lifted) {
    body.style.setProperty(name, value);
  }
  return values;
}

/* --- A drawing: what every page of the stage draws a story as ----------- */

/**
 * A drawing: one story mounted live in a body of its own (its scheme, its
 * width, the container its rules answer: runtime `dressBody`), in a frame
 * its width, marked with its story for the overlay's pins
 * (`data-cawco-story`, page.ts `sheetChain`) and the probe kit. The stage
 * draws the one state the panel keeps as a drawing; a Preview and a map's
 * card draw each story they name as one, in a column ({@link bootColumn}).
 */
interface Drawing {
  /** The story's body: the element it mounts into. */
  body: HTMLElement;
  /** What stands round it: its width, its rings. */
  frame: HTMLElement;
}

/** A frame and the body a story mounts into. */
function newDrawing(): Drawing {
  const frame = document.createElement("div");
  frame.className = "cawco-stage-frame";
  frame.hidden = true;
  const body = document.createElement("div");
  body.className = "cawco-frame-body cawco-stage-drawing";
  body.toggleAttribute("data-stage-drawing", true);
  frame.append(body);
  return { frame, body };
}

/** A state named by the panel or the page's address, resolved to its section, the story drawn and its args; or why it can't be, in words. */
function resolveState(page: Page, ref: StateRef): Target | { refused: string } {
  const section = page.sectionOf(ref.file);
  const sheet = section?.mod?.SHEET;
  if (!(section && sheet)) {
    return { refused: `${ref.file} is no states file of this canvas.` };
  }
  const drawn = storyOf(ref);
  const story = sheet.stories.find((one) => one.name === drawn);
  if (!story) {
    return { refused: `${ref.file} has no story ${drawn}.` };
  }
  let args = page.argsOf(section, drawn);
  if (ref.variant && "records" in ref.variant) {
    const arg = sheet.stories.find((one) => one.name === ref.story)?.records;
    const list = arg ? args[arg] : undefined;
    if (arg && Array.isArray(list)) {
      args = { ...args, [arg]: cutRecords(list, ref.variant.records) };
    }
  }
  return { section, story, args, ref };
}

/** A drawing's marks, read by the overlay's pins (page.ts `sheetChain`) and the probe kit: its story, its file and place, its state; its width where it has one. */
function markDrawing(
  body: HTMLElement,
  target: Target,
  scheme: Column["scheme"],
  width: number | null
): void {
  const { section, story } = target;
  body.dataset.cawcoStory = story.name;
  body.dataset.cawcoFile = section.file;
  body.dataset.cawcoSource = `${section.file}:${story.line}:${story.column}`;
  body.dataset.cawcoInteraction = "rest";
  body.dataset.cawcoScheme = scheme;
  if (width === null) {
    delete body.dataset.cawcoWidth;
  } else {
    body.dataset.cawcoWidth = String(width);
  }
  if (target.ref.variant) {
    body.dataset.cawcoVariant = JSON.stringify(target.ref.variant);
  } else {
    delete body.dataset.cawcoVariant;
  }
}

/**
 * `target` mounted afresh in `drawing`'s body, whatever stood there taken
 * down first and the body then dressed for it (`dress`: its scheme, its
 * width, its marks); what its mount said of itself is on its `into`.
 */
function mountDrawing(
  page: Page,
  drawing: Drawing,
  target: Target,
  was: Live | null,
  dress: () => void
): Live {
  was?.mounted?.unmount();
  drawing.body.replaceChildren();
  dress();
  drawing.frame.hidden = false;
  const into: { error?: PageError } = {};
  const mounted = page.mountInto(
    drawing.body,
    target.section,
    target.story.name,
    target.args,
    into
  );
  return { ...target, mounted, into };
}

/** The component threw as it mounted: the error formula's card, its own Try again (`again`), the error and where it threw under Show details. */
function faultCard(
  target: Target,
  error: PageError,
  again: () => void
): HTMLElement {
  const card = document.createElement("div");
  card.className = "cawco-stage-failed cawco-ui";
  card.setAttribute("role", "alert");
  const head = document.createElement("p");
  head.className = "cawco-stage-failed-head";
  const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  glyph.setAttribute("viewBox", "0 0 24 24");
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = ERROR_GLYPH;
  const line = document.createElement("span");
  line.textContent = words.mountFailed(
    target.section.name,
    shownName(target.story, target.section.mod?.SHEET.stories ?? [])
  );
  head.append(glyph, line);
  const message = document.createElement("p");
  message.className = "cawco-stage-failed-message";
  message.textContent = error.message.split("\n")[0] ?? error.message;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = words.tryAgain;
  button.addEventListener("click", again);
  const details = detailsOf(
    error.file
      ? `${error.message}\n${error.file}:${error.line ?? 1}:${error.column ?? 1}`
      : error.message
  );
  const actions = document.createElement("div");
  actions.append(button);
  card.append(head, message, actions, details);
  return card;
}

/**
 * A story drawn in `body`, in `column`, read for the render report at
 * `box`: drawn, empty, or failed with why (its mount threw, its own width
 * is one the stage can't read, it drew at its body's floor); its first
 * words, the parts it is made of and, at rest, its look (`lookOf`).
 */
function drawingRender(
  page: Page,
  story: Story,
  body: HTMLElement,
  column: Column,
  error: PageError | undefined,
  box: FrameRender["box"]
): FrameRender {
  let drawnAs: FrameRender["state"] = "empty";
  let said = error;
  if (said) {
    drawnAs = "failed";
  } else if (story.formUnread && page.view.widths === null) {
    // Its own width is one the stage can't read: drawn at none, it would pass for drawn at a width it never asked for.
    said = {
      message: story.formUnread,
      file: null,
      line: null,
      column: null,
    };
    drawnAs = "failed";
  } else if (drew(body)) {
    said = page.atFloor(story, column.width, body) ?? undefined;
    drawnAs = said ? "failed" : "drawn";
  }
  // Read at rest only: a forced state's frame is its rest's, the state put on.
  const look =
    drawnAs === "drawn" && column.interaction === "rest" ? lookOf(body) : null;
  return {
    story: story.name,
    label: story.label,
    form: page.formWords(story, column.width),
    interaction: column.interaction,
    scheme: page.schemeOf(column),
    width: box.w,
    state: drawnAs,
    box,
    text: firstWords(body),
    parts: partsOf(body, page.root),
    ...(look ? { look } : {}),
    ...(said ? { error: said } : {}),
  };
}

/**
 * A story's own outermost element in its drawing's body: past every box-less
 * wrapper a decorator mounts it in (the Svelte adapter mounts a decorated
 * story in a `display: contents` child, host.ts `mountSvelte`, and the
 * project's preview file decorates every story). Read as the wrapper, the
 * drawing measured 0 wide and the design graph's stage stood a sliver.
 */
function ownRoot(body: HTMLElement): HTMLElement | null {
  let el = body.firstElementChild as HTMLElement | null;
  while (el?.firstElementChild && getComputedStyle(el).display === "contents") {
    el = el.firstElementChild as HTMLElement;
  }
  return el;
}

/** What stands for the drawings until the first mounts, seen only past the wait's grace (DESIGN.md's Real Wait Rule). */
function waitingFor(name: string): HTMLElement {
  const waiting = document.createElement("div");
  waiting.className = "cawco-stage-waiting cawco-waiting";
  waiting.setAttribute("role", "status");
  waiting.setAttribute("aria-busy", "true");
  const said = document.createElement("span");
  said.className = "cawco-sr";
  said.textContent = words.mounting(name);
  const block = document.createElement("div");
  block.className = "cawco-stand-in-body";
  waiting.append(said, block);
  return waiting;
}

/** The ids a floating layer holds: its own and its parts' (a menu's content inside its positioned wrapper). */
const idsIn = (layer: Element): string[] =>
  [layer, ...layer.querySelectorAll("[id]")]
    .map((one) => one.id)
    .filter(Boolean);

/**
 * Each drawing a viewport to the floating layers its story opens
 * (viewport.ts), as the app's window at its width is: a layer answers at
 * the drawing it stands in, else at the one holding the trigger that names
 * it (`aria-controls`, a menu's or a popover's; `aria-describedby`, a
 * tooltip's), as a layer portalled out of its drawing (bits-ui's Portal,
 * to the body) is named; else at the one drawing with a trigger open
 * (`aria-expanded`), else the one last pressed or focused in, else the
 * only one. A drawing of no width of its own answers the window's, as
 * does a layer of none of `drawings` (a hidden drawing read against the
 * stage's, the rig's probes).
 */
function drawingsAsViewport(drawings: () => HTMLElement[]): void {
  /** The drawings that answer as a viewport: drawn, with a width of their own. */
  const widthy = () =>
    drawings().filter((body) => body.isConnected && body.style.width !== "");
  /** The drawing last pressed or focused in, where a menu or a popover opens from. */
  let touched: HTMLElement | null = null;
  /** The person has pressed, typed or scrolled here: a focus from then on is theirs. */
  let acted = false;
  const touchedIn = (event: Event) => {
    touched =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-stage-drawing]")
        : null;
  };
  document.addEventListener("pointerdown", touchedIn, true);
  document.addEventListener(
    "focusin",
    (event) => {
      if (acted) {
        touchedIn(event);
      }
    },
    true
  );
  for (const input of ["pointerdown", "keydown", "wheel"] as const) {
    document.addEventListener(
      input,
      () => {
        acted = true;
      },
      { capture: true, passive: true }
    );
  }
  /** Each portalled layer's drawing, by its trigger, as first found: a layer's trigger stays in its drawing while it stands. */
  const named = new WeakMap<Element, HTMLElement>();
  /** The drawing whose trigger names one of `layer`'s ids; null for none. */
  const triggerOf = (layer: Element, among: HTMLElement[]) => {
    const known = named.get(layer);
    if (known && among.includes(known)) {
      return known;
    }
    for (const id of idsIn(layer)) {
      const name = CSS.escape(id);
      const found = among.find((body) =>
        body.querySelector(
          `[aria-controls~="${name}"],[aria-describedby~="${name}"]`
        )
      );
      if (found) {
        named.set(layer, found);
        return found;
      }
    }
    return null;
  };
  /** The drawing a layer belongs to; null for one of none of them. */
  const layerDrawing = (layer: Element | null): HTMLElement | null => {
    if (!layer?.isConnected) {
      return null;
    }
    const among = widthy();
    const own = layer.closest<HTMLElement>("[data-stage-drawing]");
    if (own) {
      return among.includes(own) ? own : null;
    }
    return among.some((body) => layer.contains(body))
      ? null
      : triggerOf(layer, among);
  };
  /** The drawing script asks the viewport of when no layer of one asks. */
  const asked = (): HTMLElement | null => {
    const among = widthy();
    const open = among.filter((body) =>
      body.querySelector('[aria-expanded="true"]')
    );
    if (open.length === 1) {
      return open[0] ?? null;
    }
    if (
      touched &&
      among.includes(touched) &&
      (open.length === 0 || open.includes(touched))
    ) {
      return touched;
    }
    return open.length === 0 && among.length === 1 ? (among[0] ?? null) : null;
  };
  frameAsViewport(
    (layer) => (layerDrawing(layer) ?? asked())?.getBoundingClientRect() ?? null
  );
}

export function bootStage(page: Page): Mode {
  if (page.by === "embed" || page.by === "map") {
    return bootColumn(page);
  }
  const { rig, sections, state, view } = page;
  /**
   * A panel frames the page and says what it stands at; a page on its own
   * (the stage's render, the canvas opened in its own tab) stands at its
   * first states file's first story.
   */
  const framed = window.top !== window;
  document.documentElement.classList.add("cawco-stage-page");
  // The scroll edge effect under the panel's floating head shows once the
  // page has scrolled: clear at rest (page-style.ts).
  const edge = () =>
    document.documentElement.classList.toggle(
      "cawco-stage-scrolled",
      scrollY > 0
    );
  addEventListener("scroll", edge, { passive: true });
  const canvas = document.getElementById("cawco-canvas") as HTMLElement;
  canvas.classList.add("cawco-stage");
  /** The one drawing: the live instance of the state the panel keeps. */
  const stage = newDrawing();
  const { frame, body: drawing } = stage;
  /**
   * The person has pressed or typed in the drawing, or in a layer it
   * opened, since it was last mounted: the component's own handlers may
   * have taken it somewhere no state's args say (a press outside an open
   * column closed it). The next reach mounts its state afresh rather than
   * setting it in place (`standFor`). A play's own presses are not his:
   * they are not trusted.
   */
  let handled = false;
  for (const input of ["pointerdown", "keydown", "input"] as const) {
    document.addEventListener(
      input,
      (event) => {
        if (event.isTrusted) {
          handled = true;
        }
      },
      { capture: true, passive: true }
    );
  }
  /** Compare's rings: outside each element's box on its own shape, in a layer of the stage's own over both drawings, taking no press. */
  const rings = document.createElement("div");
  rings.className = "cawco-stage-rings";
  rings.setAttribute("aria-hidden", "true");
  /** The ring on the thing a row of the move names, in the rings' layer. */
  const litRing = document.createElement("span");
  litRing.className = "cawco-lit-ring";
  litRing.hidden = true;
  frame.append(rings, litRing);
  /** Compare side by side: each drawing named over its own column. */
  const names = document.createElement("div");
  names.className = "cawco-stage-names";
  names.hidden = true;
  const keptName = document.createElement("span");
  const againstName = document.createElement("span");
  names.append(keptName, againstName);
  /** What stands for the drawing until it first mounts, seen only past the wait's grace. */
  const waiting = waitingFor(sections[0]?.name ?? "the component");
  canvas.append(waiting, names, frame);

  let live: Live | null = null;
  /** The move the last reach read, replayed as the Animation face plays, scrubs and tunes it; the page its clock. */
  const replays = new Replays(
    (time) => tell<StageTime>(STAGE_TIME, time),
    () => ringLit(),
    (el) => rootOf(el)
  );
  /** The thing the face's row rests on, by the clips' id for it; null while none. */
  let lit: string | null = null;
  /** The panel's last Compare ask, while it compares; null while it doesn't. */
  let comparing: StageCompare | null = null;
  /** The state compared with, drawn hidden under the drawing; null until it mounts. */
  let against: Against | null = null;
  /** What differs, as last read: what came in or changed on the drawing, what went on the compared one. */
  let found: DifferenceRead[] = [];
  /** The two stand side by side: the page's room holds both at their width, the gap between. */
  let beside = false;
  /** Each read brings the first ring into view until then (performance.now()). */
  let firstUntil = 0;
  /** The drawing's width as the frame stands it, px (`laid`). */
  let drawnWidth = 0;
  let fault: HTMLElement | null = null;
  /** Each section's card saying it didn't load, by its file. */
  const failedCards = new Map<string, HTMLElement>();
  /** How many reaches the panel has asked for, in the order they came; the last one's place: one still waiting its turn behind it is passed over. */
  let arrivals = 0;
  let latest = 0;
  /** The reach under way: each waits for the one before it, so no two act on the instance at once. */
  let reaching: Promise<unknown> = Promise.resolve();
  /** The things the last reach moved, by the ids its clips name them by. */
  let moved = new Map<string, Element>();
  /** The drawing's own width where it stands narrower than the width it was laid out at, by states file and width picked; only ever widened. */
  const fitOf = new Map<string, number>();
  let laidSaid = "";
  /** The state a picture stands the drawing at, and its forced interaction. */
  let posed: { interaction: Interaction; key: string } | null = null;
  const reads: Reads = new Map();

  /** Whether `el` is the drawing's root: its body, or the story's own outermost element. */
  const rootOf = (el: Element) => el === drawing || el === ownRoot(drawing);

  /** Tells the panel, through the overlay (preview overlay/page.ts relays each to the pane). */
  const tell = <Message extends object>(type: string, message: Message) =>
    dispatchEvent(new CustomEvent(type, { detail: message }));

  // Which way the page scrolled, said once it turns past a dead zone: the
  // panel's tools over the drawing's foot leave on the way down and come
  // back on the way up.
  {
    const DEAD = 12;
    let from = 0;
    let down = false;
    addEventListener(
      "scroll",
      () => {
        const top = (document.scrollingElement ?? document.documentElement)
          .scrollTop;
        if (Math.abs(top - from) < DEAD) {
          return;
        }
        const now = top > from && top > 0;
        from = top;
        if (now !== down) {
          down = now;
          tell<StageScrolled>(STAGE_SCROLLED, { down });
        }
      },
      { passive: true }
    );
  }

  const scheme = (): Column["scheme"] =>
    view.scheme === "both" ? "light" : view.scheme;
  /** The page's room for the drawing: its own width inside its scroller's gutters, less its gutters. */
  const room = () => windowRoom() - 2 * tokenPx(GUTTER);
  /** The width a story is laid out at: his pick, else its own, else the desk's up to the page's room. */
  const roomWidth = (story: Story): number =>
    view.widths?.[0] ??
    story.form?.width ??
    Math.min(FORMS.desk, room() > 0 ? room() : FORMS.desk);
  /** The page's gutter beside a drawing standing `across` px wide: the token's where the window has room for it, else what room it has. */
  const gutterBeside = (across: number): number =>
    Math.max(0, Math.min(tokenPx(GUTTER), (windowRoom() - across) / 2));
  const columnOf = (story: Story): Column => ({
    interaction: "rest",
    scheme: scheme(),
    width: roomWidth(story),
  });

  /** A state named by the panel, resolved; or why it can't be, in words. */
  const resolved = (ref: StateRef) => resolveState(page, ref);

  /** A body dressed and sized for `target` as the drawing stands: its scheme, its width. */
  const dress = (body: HTMLElement, target: Target) =>
    page.dressBody(
      body,
      columnOf(target.story),
      target.story,
      page.fills(target.section, target.story.name)
    );

  /** The page round the drawing in the drawing's own ground and scheme: the page the component lives on, the gutter its own. */
  const ground = () => {
    const rootStyle = document.documentElement.style;
    rootStyle.backgroundColor = drawing.style.backgroundColor;
    rootStyle.colorScheme = drawing.style.colorScheme;
  };

  /** The drawing's own marks, at the width it is laid out at. */
  const mark = (target: Target) =>
    markDrawing(drawing, target, scheme(), roomWidth(target.story));

  /* --- Coming to rest --------------------------------------------------- */

  /**
   * A drawing as it mounts comes to rest: every animation it starts of its
   * own (a read-back the hub answered unfolding) is landed at once, until
   * none has started for {@link REST_MS}, at most {@link MOTION_MS}. The
   * stage shows a state at rest, so a press changes what it shows and
   * nothing slides in. A loop is the state's own and runs.
   */
  async function restOf(holder: HTMLElement): Promise<void> {
    const end = performance.now() + MOTION_MS;
    const known = new Set<Animation>();
    let still = performance.now();
    while (performance.now() < end && performance.now() - still < REST_MS) {
      await nextFrame();
      for (const animation of holder.getAnimations({ subtree: true })) {
        if (!(known.has(animation) || statesOwn(animation))) {
          known.add(animation);
          land(animation);
          still = performance.now();
        }
      }
    }
  }

  /** Waits until no animation it saw has run for {@link QUIET_MS}, at most {@link MOTION_MS}. */
  async function quietOf(seen: Map<Animation, number>): Promise<void> {
    const end = performance.now() + MOTION_MS;
    let quiet = performance.now();
    while (performance.now() < end) {
      await frameTick();
      if (
        [...seen.keys()].some(
          (one) => one.playState === "running" && !statesOwn(one)
        )
      ) {
        quiet = performance.now();
      } else if (performance.now() - quiet > QUIET_MS) {
        return;
      }
    }
  }

  /* --- The fault, and the drawing's place while it mounts ---------------- */

  function clearFault(): void {
    fault?.remove();
    fault = null;
  }

  /** The component threw as it mounted: the error formula in the drawing's place, its own Try again, the stack under Show details. */
  function faulted(target: Target, error: PageError): void {
    clearFault();
    frame.hidden = true;
    const card = faultCard(target, error, () => {
      queue(() => open(target));
    });
    canvas.append(card);
    fault = card;
    tell<StageFault>(STAGE_FAULT, { on: target.ref, message: error.message });
    reread();
  }

  /* --- Mounting, and the one way the instance moves ---------------------- */

  /** Holds the drawing's height while the next mounts, so the page's scroll stays where it stood. */
  const holdHeight = (on: boolean) =>
    frame.style.setProperty(
      "--held-h",
      on && !frame.hidden ? `${drawing.offsetHeight}px` : ""
    );

  /**
   * The page's scroll held at `at` while `run` runs, and put there once it
   * is done: a component that focuses a field or brings a row into view
   * as it mounts scrolls the page under the stage (RoutineForm's Name
   * label, the Long list's head stood above the stage's top).
   */
  async function holdScroll<T>(
    at: { left: number; top: number },
    run: () => Promise<T>
  ): Promise<T> {
    const scroller = document.scrollingElement ?? document.documentElement;
    const pin = () => scroller.scrollTo({ ...at, behavior: "instant" });
    addEventListener("scroll", pin);
    try {
      return await run();
    } finally {
      removeEventListener("scroll", pin);
      pin();
    }
  }

  /** Where the page's scroll stands now. */
  const scrolled = () => {
    const scroller = document.scrollingElement ?? document.documentElement;
    return { left: scroller.scrollLeft, top: scroller.scrollTop };
  };

  /**
   * The component mounted afresh at `target`, at rest: its own arrivals
   * landed. A drawing opened afresh stands at its top (`top`); one
   * mounted anew in place of the state it was (a state set in place that
   * differed, its states file edited) keeps the page's scroll.
   */
  async function open(target: Target, top = true): Promise<void> {
    await holdScroll(
      { left: scrolled().left, top: top ? 0 : scrolled().top },
      () => mount(target)
    );
    inkInView();
  }

  /** `target` mounted in the drawing, at rest. */
  async function mount(target: Target): Promise<void> {
    handled = false;
    replays.load([]);
    holdHeight(true);
    posed = null;
    moved = new Map();
    live = mountDrawing(page, stage, target, live, () => {
      clearFault();
      dress(drawing, target);
      ground();
      mark(target);
      frame.style.setProperty("--frame-w", `${roomWidth(target.story)}px`);
      waiting.remove();
    });
    const { into } = live;
    await frameTick();
    if (into.error) {
      holdHeight(false);
      faulted(target, into.error);
      return;
    }
    if (page.fillsScreen(target.section, target.story, drawing)) {
      dress(drawing, target);
    }
    await restOf(drawing);
    holdHeight(false);
    // The state compared with stands at the drawing's width, which another story may lay out anew.
    if (against) {
      dressAgainst(against);
    }
    laid();
    tellDials(target);
  }

  /** `next` set on the live instance, replacing its args whole: a key the next state lacks falls to the component's default. */
  async function setArgs(next: Record<string, unknown>): Promise<void> {
    if (!live?.mounted) {
      return;
    }
    const gone = Object.fromEntries(
      Object.keys(live.args)
        .filter((key) => !(key in next))
        .map((key) => [key, undefined])
    );
    live.mounted.update({ ...gone, ...next });
    live.args = { ...next };
    await frameTick();
  }

  /** A body for a drawing no one sees or presses: one held to the drawing, or the state compared with it. */
  function hiddenBody(className: string): HTMLElement {
    const body = document.createElement("div");
    body.className = `cawco-frame-body ${className}`;
    body.toggleAttribute("data-stage-drawing", true);
    body.toggleAttribute("inert", true);
    body.setAttribute("aria-hidden", "true");
    return body;
  }

  /** The layers a hidden drawing opens as it mounts (a popover its state opens, portalled to the body) hidden, never seen, until the watch is let go. */
  function hideLayers(): MutationObserver {
    const layers = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node !== rig) {
            node.style.visibility = "hidden";
          }
        }
      }
    });
    layers.observe(document.body, { childList: true });
    return layers;
  }

  /** The play pressed inside the drawing: the person's focus goes back where it was, or off the drawing. */
  function giveBack(had: Element | null): void {
    if (!drawing.contains(document.activeElement)) {
      return;
    }
    if (
      had instanceof HTMLElement &&
      had !== document.body &&
      had.isConnected
    ) {
      had.focus({ preventScroll: true });
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  /** `run` done on the live instance, every animation it starts read as a clip; with `still`, each landed as it is read. */
  async function act(
    run: () => Promise<void>,
    still: boolean
  ): Promise<{ clips: ClipRead[]; held: Held[] }> {
    const had = document.activeElement;
    // Where he left the page's scroll: a play's press focuses a control,
    // which scrolls it into view; the scroll is held there while it runs.
    const scroller = document.scrollingElement ?? document.documentElement;
    const left = { top: scroller.scrollTop, left: scroller.scrollLeft };
    const pin = () => scroller.scrollTo({ ...left, behavior: "instant" });
    addEventListener("scroll", pin);
    const t0 = performance.now();
    const seen = new Map<Animation, number>();
    const taken: Taken[] = [];
    const t0Timeline = Number(document.timeline.currentTime) || t0;
    /**
     * Where a clip was set off, ms after the press: its animation's own
     * start time on the document's timeline, so animations set off in one
     * frame share one moment; the frame it was first seen in only while
     * the engine has not yet started it.
     */
    const startOf = (animation: Animation, first: number) =>
      typeof animation.startTime === "number"
        ? animation.startTime - t0
        : first;
    const take = (animation: Animation, first: number) => {
      if (statesOwn(animation)) {
        return;
      }
      const one = takenOf(animation, first, t0Timeline);
      if (one) {
        // An authored clip's custom property on the drawing's root interpolates as it runs, so a mockup binds to its live value.
        if (one.target && rootOf(one.target)) {
          interpolated(one.keyframes);
        }
        taken.push(one);
      }
      if (still) {
        land(animation);
      }
    };
    let watching = true;
    const scan = () => {
      for (const animation of drawing.getAnimations({ subtree: true })) {
        if (!seen.has(animation)) {
          const first = performance.now() - t0;
          seen.set(animation, first);
          take(animation, first);
        }
      }
    };
    const watch = () => {
      if (watching) {
        scan();
        requestAnimationFrame(watch);
      }
    };
    // What already runs is the state's own, not this press's.
    for (const animation of drawing.getAnimations({ subtree: true })) {
      seen.set(animation, -1);
    }
    requestAnimationFrame(watch);
    const starts = new Map<Animation, number>();
    try {
      const ran = await readWithin(PLAY_MS, run);
      if (ran.kind === "unanswered") {
        throw new Error(`The play ran past ${PLAY_MS / 1000} s.`);
      }
      // The press's own frame: what it set has started its animations.
      await frameTick();
      scan();
      for (const one of taken) {
        starts.set(one.animation, startOf(one.animation, one.first));
      }
      await quietOf(seen);
      // A move longer than its read (a 30-minute fill, cut at MOTION_MS) is whole in its clips: nothing of it is left running.
      for (const [animation, since] of seen) {
        if (
          since >= 0 &&
          animation.playState === "running" &&
          !statesOwn(animation)
        ) {
          land(animation);
        }
      }
    } finally {
      removeEventListener("scroll", pin);
      watching = false;
      giveBack(had);
      scroller.scrollTo({ ...left, behavior: "instant" });
    }
    const clips = clipsOf(taken, starts);
    return {
      clips,
      held: clips.map((read, at) => ({
        read,
        keyframes: taken[at]?.keyframes ?? [],
        target: taken[at]?.target ?? null,
      })),
    };
  }

  /** The clips a reach read, each placed from where the move's first animation was set off, its thing named as it stands now. */
  function clipsOf(taken: Taken[], starts: Map<Animation, number>): ClipRead[] {
    moved = new Map();
    const ids = new Map<Element, string>();
    const origin = Math.min(
      ...taken.map((one) => starts.get(one.animation) ?? one.first)
    );
    // Each read as it was first seen: an animation's engine may drop its effect once it ends (a transition's), or cancel it (a Svelte outro).
    const targets = new Map<Element, string>();
    return taken.map((one, at) => {
      const { easing } = one.read;
      const { property } = one;
      const thing = one.target ? thingOf(one.target) : null;
      let id: string | null = null;
      if (thing?.isConnected) {
        id = ids.get(thing) ?? `t${ids.size}`;
        ids.set(thing, id);
        moved.set(id, thing);
      }
      let targetId = `e${at}`;
      if (one.target) {
        targetId = targets.get(one.target) ?? `e${targets.size}`;
        targets.set(one.target, targetId);
      }
      const inFrames = framedOf(easing, one.keyframes);
      return {
        id: String(at),
        element: thing?.isConnected ? nameOf(thing) : words.element,
        property,
        start: Math.round((starts.get(one.animation) ?? one.first) - origin),
        delay: Math.round(one.read.delay),
        direction: one.direction,
        duration: Math.round(one.read.duration),
        easing,
        framed: inFrames,
        frameCurve: inFrames ? frameCurveOf(one.keyframes) : null,
        group:
          one.target?.closest<HTMLElement>("[data-cawco-group]")?.dataset
            .cawcoGroup || null,
        iterations: one.iterations,
        legs: legsOf(one.keyframes, inFrames),
        target: targetId,
        thing: id,
        kind: clipKindOf(property.split(",")),
        values: valuesOf(one.keyframes),
      };
    });
  }

  /** Runs `turn` after every reach before it: no two act on the instance at once. */
  function queue<T>(turn: () => Promise<T>): Promise<T> {
    const next = reaching.then(turn);
    reaching = next.catch(page.heard);
    return next;
  }

  /**
   * The panel's reach (core `STAGE_REACH`): the first, one on another
   * states file, or one from nothing mounts the component at `to`, at
   * rest; with `play`, the move into `to` plays on the drawing from `from`
   * (stood there first unless it stands there now), its timeline docked
   * over it; else `to`'s args are set on it in place, or, once he has
   * pressed or typed in it, `to` is mounted afresh. A later reach passes
   * over one still waiting.
   */
  function reach(asking: StageReach): void {
    arrivals += 1;
    latest = arrivals;
    const mine = arrivals;
    page.quietly(queue(() => reachTurn(asking, mine)));
  }

  /** A reach's turn, once every reach before it is done. */
  async function reachTurn(asking: StageReach, mine: number): Promise<void> {
    const answer = (rest: Omit<StageReached, "ask" | "on">) =>
      tell<StageReached>(STAGE_REACHED, {
        ask: asking.ask,
        on: asking.to,
        ...rest,
      });
    if (mine !== latest) {
      answer({ move: null, superseded: true });
      return;
    }
    const target = await targetOf(asking.to);
    if ("refused" in target) {
      answer(refusal(target.refused));
      return;
    }
    // Whatever replays stood were the last move's.
    replays.load([]);
    const play = playOf(asking, target);
    const stood = await standFor(asking, target, play);
    if (stood === "opened") {
      answer({ move: null });
    } else if (stood !== "acts") {
      answer(refusal(stood.refused));
    } else if (fault) {
      answer(refusal(fault.textContent ?? ""));
    } else {
      answer(await actOn(asking, target, play));
    }
  }

  /** A refusal as a reach's answer. */
  const refusal = (said: string): Omit<StageReached, "ask" | "on"> => ({
    move: null,
    failed: { message: said, stack: said },
  });

  /** A state the panel names, resolved once its states file has loaded. */
  async function targetOf(
    ref: StateRef
  ): Promise<Target | { refused: string }> {
    const section = page.sectionOf(ref.file);
    if (section && !section.loaded) {
      await page.loadSection(section);
    }
    return resolved(ref);
  }

  /** The play that moves the drawing into `target`, when the panel asked for the move and its story has one. */
  function playOf(asking: StageReach, target: Target): PlayFn | null {
    const csf = page.csfOf(target.section.mod?.module ?? {}, target.ref.story);
    return asking.play &&
      asking.from !== null &&
      typeof csf?.play === "function"
      ? (csf.play as PlayFn)
      : null;
  }

  /** Whether the live instance stands at `ref` of `section`, mounted and unfaulted. */
  const standsAt = (section: Section, ref: StateRef): boolean =>
    !!live && !fault && live.section === section && sameRef(live.ref, ref);

  /**
   * Whether the live instance can be set to `target` in place: the same
   * component, laid out at the same width. A state drawn by a component of
   * its own (a story's `component`) or at another width is another
   * drawing: its args set on the live instance first painted the old
   * component with the new args at the old width ("Turn Caw off", unchecked,
   * at 334), then the fresh drawing replaced it at 402.
   */
  const settableTo = (target: Target): boolean =>
    !!live &&
    live.story.component === target.story.component &&
    roomWidth(live.story) === roomWidth(target.story);

  /**
   * Where the drawing stands before a reach acts: its from state, mounted
   * afresh where it doesn't stand there (a played move, a move he chose by
   * name); for a first
   * reach, one on another states file, one from nothing, one after a
   * fault, or one the live instance can't be set to in place (another
   * component, another width), `to` itself, mounted afresh, and nothing
   * more is done (`opened`).
   */
  async function standFor(
    asking: StageReach,
    target: Target,
    play: PlayFn | null
  ): Promise<"opened" | "acts" | { refused: string }> {
    // A reach from a state the drawing doesn't stand at (a played move, a
    // move he chose by name) stands there first, so the move read is that one.
    if (
      asking.from &&
      (play || (live?.section === target.section && !fault)) &&
      !standsAt(target.section, asking.from)
    ) {
      const start = resolved(asking.from);
      if ("refused" in start) {
        return start;
      }
      await open(start);
      return "acts";
    }
    if (play && asking.from) {
      return "acts";
    }
    if (
      !live ||
      live.section !== target.section ||
      asking.from === null ||
      fault ||
      !settableTo(target)
    ) {
      await open(target);
      return "opened";
    }
    if (handled && !play) {
      await open(target, false);
      return "opened";
    }
    return "acts";
  }

  /** The reach done on the live instance: `to`'s play run on it, or its args set in place; what it set off, read. */
  async function actOn(
    asking: StageReach,
    target: Target,
    play: PlayFn | null
  ): Promise<Omit<StageReached, "ask" | "on">> {
    const from = live?.ref ?? null;
    try {
      const read = await act(
        () => (play ? runPlay(play, target) : setArgs(target.args)),
        asking.still
      );
      if (live) {
        live = { ...live, ...target };
      }
      mark(target);
      laid();
      // The move the face plays and scrubs: each clip on its own element as
      // the reach read it. No replay is made yet, so the drawing rests on
      // the state reached, never at its move's first frame.
      replays.load(read.held);
      return {
        move: {
          from: from?.story ?? "",
          to: target.ref.story,
          clips: read.clips,
          length: Math.max(0, ...read.clips.map(clipEnd)),
        },
      };
    } catch (error) {
      const said = error instanceof Error ? error : new Error(String(error));
      return {
        move: null,
        failed: { message: said.message, stack: said.stack ?? said.message },
      };
    }
  }

  /** `to`'s story's `play` on the live instance: its args and `update` the instance's own. */
  async function runPlay(play: PlayFn, target: Target): Promise<void> {
    let current = { ...(live?.args ?? {}) };
    await play({
      args: current,
      canvasElement: drawing,
      canvas: queriesIn(drawing),
      userEvent: userEventIn(drawing),
      step: async (_name: string, run: () => Promise<void>) => await run(),
      update: async (next: Record<string, unknown>) => {
        current = { ...current, ...next };
        live?.mounted?.update(next);
        if (live) {
          live.args = current;
        }
        await frameTick();
      },
    });
    if (live) {
      live.args = { ...target.args, ...current };
    }
  }

  /* --- What the panel's split sizes the stage by --------------------------- */

  /**
   * The drawing measured: its own width where it stands narrower than the
   * width it was laid out at (its root's box, or what overflows it), kept
   * per states file and width picked and only ever widened, so a reach
   * never narrows the stage under him; and told the panel when it changed.
   */
  /**
   * The drawing's own width where it stands narrower than `width`, kept
   * by `key` (its states file and the width picked) and only ever widened;
   * null where it fills the width.
   */
  function fitAt(key: string, width: number): number | null {
    const own = ownRoot(drawing);
    // Read at 1:1: a box on screen stands at the frame's zoom.
    const zoomed = Number(frame.style.zoom) || 1;
    if (own) {
      const read = Math.ceil(
        Math.max(own.getBoundingClientRect().width / zoomed, own.scrollWidth)
      );
      const known = fitOf.get(key);
      if (known === undefined ? read < width - 1 : read > known) {
        fitOf.set(key, Math.min(width, read));
      }
    }
    return fitOf.get(key) ?? null;
  }

  function laid(): void {
    if (!live || frame.hidden) {
      return;
    }
    const width = roomWidth(live.story);
    const key = `${live.section.file}@${view.widths?.[0] ?? "own"}`;
    const fit = fitAt(key, width);
    const drawn = fit === null ? width : Math.min(width, fit);
    drawnWidth = drawn;
    frame.style.setProperty("--frame-w", `${drawn}px`);
    const scale = scaleOf(drawn);
    frame.style.zoom = scale < 1 ? String(scale) : "";
    canvas.style.setProperty(
      STAGE_GUTTER_VAR,
      `${gutterBeside(drawn * scale)}px`
    );
    const laidOut: StageLaid = {
      need: Math.ceil(
        drawn * scale + 2 * tokenPx(GUTTER) + windowWidth() - windowRoom()
      ),
      tall: Math.ceil(drawing.offsetHeight * scale),
      fit,
      scale,
    };
    const said = JSON.stringify(laidOut);
    if (said !== laidSaid) {
      laidSaid = said;
      tell<StageLaid>(STAGE_LAID, laidOut);
    }
    reread();
  }

  /**
   * How much the drawing is scaled down to stand whole on the stage: a
   * width he picked wider than the page's room is drawn at that width and
   * scaled to fit it (CSS `zoom`, so the frame takes the scaled room), his
   * view's `fit`; 1 at its own width, and with Actual size (`fit` off),
   * where it is drawn 1:1 and the page scrolls across it. Drawn 1:1, a
   * 1440 desk in a 461px stage stood cut at its right, a thin scrollbar
   * the only sign.
   */
  function scaleOf(drawn: number): number {
    const across = windowRoom();
    return view.fit &&
      view.widths?.[0] !== undefined &&
      across > 0 &&
      drawn > across
      ? across / drawn
      : 1;
  }

  /** The drawing laid out again at the width the page's room or his pick now gives it, in the scheme he picked: nothing remounts. */
  function relay(): void {
    if (!live) {
      return;
    }
    dress(drawing, live);
    if (against) {
      dressAgainst(against);
    }
    ground();
    mark(live);
    laid();
    inkInView();
  }

  /**
   * What the drawing shows a reader, its words and its controls (a text
   * run, a field, a button, a picture), as one box on the page; null when
   * it shows none. A box the component draws round them (a full-width
   * backdrop, a frame the width of the screen) is no part of it.
   */
  function inkOf(drawn: HTMLElement): { left: number; right: number } | null {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    // A box of a pixel or less is no ink: a reader-only label (`sr-only`'s 1px box at its parent's start) pulled the
    // box to the frame's far edge.
    const take = (box: DOMRect) => {
      if (box.width > 1 && box.height > 1) {
        left = Math.min(left, box.left);
        right = Math.max(right, box.right);
      }
    };
    const seen = (el: Element | null) =>
      !!el?.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      });
    const range = document.createRange();
    for (const el of [drawn, ...drawn.querySelectorAll("*")]) {
      if (!seen(el)) {
        continue;
      }
      if (el.matches(INKED)) {
        take(el.getBoundingClientRect());
      }
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
          range.selectNodeContents(child);
          take(range.getBoundingClientRect());
        }
      }
    }
    return left <= right ? { left, right } : null;
  }

  /**
   * The drawing's words and controls brought into the page's view across:
   * a component laid out wider than the stage (picked at 1440 in a 700px
   * stage) whose popover stands at the frame's far edge opened on a blank
   * stage, the page scrolled to the frame's start. Where they stand in view
   * already, his scroll is kept; where they fit, they stand in the middle
   * of the view, else from its start.
   */
  function inkInView(): void {
    const ink = live && !frame.hidden ? inkOf(drawing) : null;
    // The window's own width: what the drawing reads as `innerWidth` is the frame's (viewport.ts).
    const across = windowRoom();
    if (!ink || (ink.left >= 0 && ink.right <= across)) {
      return;
    }
    const scroller = document.scrollingElement ?? document.documentElement;
    const width = ink.right - ink.left;
    const margin = Math.max(tokenPx(GUTTER), (across - width) / 2);
    scroller.scrollTo({
      left: Math.max(0, scroller.scrollLeft + ink.left - margin),
      top: scroller.scrollTop,
      behavior: "instant",
    });
  }

  /** How the page scrolls to what it brings into view: at once where motion is reduced. */
  const scrolling = (): ScrollBehavior =>
    view.motion === "reduce" ||
    !matchMedia("(prefers-reduced-motion: no-preference)").matches
      ? "instant"
      : "smooth";

  /** How far a change ring stands outside the box it rings, px: its offset and its width. */
  const ringOut = () =>
    tokenPx("--spacing-c-change-ring-offset") +
    tokenPx("--spacing-c-change-ring-width");

  /** How far to scroll to stand `start`–`end` whole in a view `size` long by the least it takes; from its start where it can't stand whole. */
  const leastTo = (start: number, end: number, size: number): number => {
    if (start >= 0 && end <= size) {
      return 0;
    }
    return start < 0 || end - start > size ? start : end - size;
  };

  /**
   * A box of the frame (in its own px) brought into the page's view by the
   * least it takes, room kept for a ring round it and the page's gutter
   * (DESIGN.md, The One Ring Rule: a scroller brings a mark into view with
   * room for its ring); across too where `across`, in the one scroll: the
   * house's `bringIntoView` moves up and down only, and a second smooth
   * scroll of the page's one scroller cuts the first short.
   */
  function showBox(box: DrawingBox, across: boolean): void {
    // A drawing scaled to fit stands at its zoom.
    const zoomed = Number(frame.style.zoom) || 1;
    const at = frame.getBoundingClientRect();
    const margin = ringOut() + tokenPx(GUTTER);
    const top = leastTo(
      at.top + box.y * zoomed - margin,
      at.top + (box.y + box.h) * zoomed + margin,
      windowHeight()
    );
    const left = across
      ? leastTo(
          at.left + box.x * zoomed - margin,
          at.left + (box.x + box.w) * zoomed + margin,
          windowRoom()
        )
      : 0;
    if (Math.abs(top) >= 1 || Math.abs(left) >= 1) {
      (document.scrollingElement ?? document.documentElement).scrollBy({
        top,
        left,
        behavior: scrolling(),
      });
    }
  }

  /** The region the last reach changed, in the frame's own px; null when nothing it moved still stands. */
  function movedBox(): DrawingBox | null {
    return boxOf(
      ...[...moved.values()].filter(
        (el) => el.isConnected && drawing.contains(el)
      )
    );
  }

  /** The box round `els` in the frame's own px; null for none. */
  function boxOf(...els: Element[]): DrawingBox | null {
    if (els.length === 0) {
      return null;
    }
    const zoomed = Number(frame.style.zoom) || 1;
    const at = frame.getBoundingClientRect();
    const boxes = els.map((el) => el.getBoundingClientRect());
    const top = Math.min(...boxes.map((box) => box.top));
    const left = Math.min(...boxes.map((box) => box.left));
    return {
      x: (left - at.left) / zoomed,
      y: (top - at.top) / zoomed,
      w: (Math.max(...boxes.map((box) => box.right)) - left) / zoomed,
      h: (Math.max(...boxes.map((box) => box.bottom)) - top) / zoomed,
    };
  }

  /**
   * The panel's reveal (core `STAGE_REVEAL`). The move's: the region the
   * last reach changed, where none of it stands in view (brought whole into
   * view, a change taller than the stage, the Long list's rows, scrolled the
   * component's head off); while comparing, the first difference's ring
   * stands for it. A difference's: its ring, the compared drawing shown in
   * the kept one's place for one that went where the two don't stand side
   * by side, as its line's press asks (DesignGraph `showDifference`).
   */
  /** One thing the last reach moved brought into view, with room for its ring. */
  function revealThing(id: string): void {
    const thing = moved.get(id);
    const box = thing?.isConnected ? boxOf(thing) : null;
    if (box) {
      showBox(box, true);
    }
  }

  function reveal({ what }: StageReveal): void {
    if ("difference" in what) {
      const one = found[what.difference];
      if (!(one && comparing)) {
        return;
      }
      // His press wins over the first ring a settling read would bring back.
      firstUntil = 0;
      comparing = {
        ...comparing,
        show: !beside && one.kind === "went" ? "compared" : "kept",
      };
      arrange();
      showBox(ringBox(one), true);
      return;
    }
    if ("thing" in what) {
      revealThing(what.thing);
      return;
    }
    const [first] = ringed();
    if (first) {
      showBox(ringBox(first), true);
      return;
    }
    const box = movedBox();
    if (!box) {
      return;
    }
    const at = frame.getBoundingClientRect();
    const zoomed = Number(frame.style.zoom) || 1;
    if (
      at.top + (box.y + box.h) * zoomed > 0 &&
      at.top + box.y * zoomed < windowHeight()
    ) {
      return;
    }
    showBox(box, false);
  }

  /* --- The move's replays, as the Animation face asks ------------------- */

  /**
   * The ring on the thing a rested row names, its box as it stands now:
   * the replays hold it at the playhead's moment, so it is read again on
   * each frame of a play or a scrub.
   */
  function ringLit(): void {
    const thing = lit ? moved.get(lit) : undefined;
    const box =
      thing?.isConnected && drawing.contains(thing) && !frame.hidden
        ? boxOf(thing)
        : null;
    litRing.hidden = !box;
    if (box) {
      litRing.style.setProperty("--ring-x", `${box.x}px`);
      litRing.style.setProperty("--ring-y", `${box.y}px`);
      litRing.style.setProperty("--ring-w", `${box.w}px`);
      litRing.style.setProperty("--ring-h", `${box.h}px`);
    }
  }

  /** Reduced motion's Play: the end state fades in where it stands (DESIGN.md, The Reduced Motion Rule). */
  function fadeIn(): void {
    drawing.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: page.style.duration("--duration-fade", 200),
      easing: "linear",
    });
  }

  answerMoves(replays, {
    fadeIn,
    light: (thing) => {
      lit = thing;
      ringLit();
    },
    said: (time) => tell<StageTime>(STAGE_TIME, time),
  });

  /* --- The agent's dials, turned in the panel --------------------------- */

  /** The dials' values as written, as last told the panel: each said once it changes. */
  let writtenSaid = "";
  /**
   * Each of the agent's dials as written, read off the drawing as it
   * mounts and told the panel, which draws the dials once it has them: a
   * `cssVar` dial's value as the drawing computes it with no dial set on
   * it, an `arg` dial's as the story's own args hold it.
   */
  function tellDials(target: Target): void {
    const dials = page.spec.dials ?? [];
    if (dials.length === 0) {
      return;
    }
    const values = writtenOf(
      dials,
      drawing,
      page.ownArgsOf(target.section, target.story.name)
    );
    const said = JSON.stringify(values);
    if (said !== writtenSaid) {
      writtenSaid = said;
      tell<StageDialsWritten>(STAGE_DIALS_WRITTEN, { values });
    }
  }

  // The stage's floating head (the design graph's StagePane): the room it
  // takes over the page's top, which the column pads its top by.
  addEventListener(STAGE_ROOM, (event) => {
    const said = stageRoomOf((event as CustomEvent<unknown>).detail);
    if (said) {
      document.documentElement.style.setProperty(
        STAGE_ROOM_VAR,
        `${said.px}px`
      );
    }
  });

  addEventListener(STAGE_DIALS, (event) => {
    const asking = stageDialsOf((event as CustomEvent<unknown>).detail);
    if (asking) {
      page.applyDials(asking.values);
    }
  });

  /* --- Compare: the state compared with, drawn hidden under the drawing ---- */

  /** What came in or changed: ringed on the kept drawing. What went stands on the compared one. */
  const ringed = () =>
    comparing?.against ? found.filter((one) => one.kind !== "went") : [];

  /** Where a difference's ring stands in the frame: one that went on the compared drawing, beside the kept one where the two stand side by side. */
  const ringBox = (one: DifferenceRead): DrawingBox =>
    beside && one.kind === "went"
      ? { ...one.box, x: one.box.x + drawnWidth + tokenPx(BESIDE_GAP) }
      : one.box;

  /** A state's name as the states list says it: its own story's, whichever variant or width is drawn. */
  const stateName = (target: Target): string => {
    const stories = target.section.mod?.SHEET.stories ?? [];
    const own =
      stories.find((one) => one.name === target.ref.story) ?? target.story;
    return shownName(own, stories);
  };

  /** The state compared with, dressed as the drawing stands: at its width, in its scheme. */
  const dressAgainst = (one: Against) =>
    page.dressBody(
      one.body,
      live ? columnOf(live.story) : columnOf(one.story),
      one.story,
      page.fills(one.section, one.story.name)
    );

  /** Each body Compare draws lays itself out anew (a read-back the hub answered): read again. */
  const relaid = new ResizeObserver(() => reread());

  function unmountAgainst(): void {
    if (!against) {
      return;
    }
    relaid.unobserve(against.body);
    against.mounted?.unmount();
    against.body.remove();
    against = null;
  }

  /**
   * The state compared with drawn afresh from its story, hidden under the
   * drawing at the drawing's width, its own arrivals landed and its layers
   * hidden as it mounts; never moved after, nor seen but side by side or
   * flipped, nor pressed. Each read after it comes to rest, for a moment,
   * brings the first ring into view.
   */
  async function mountAgainst(target: Target): Promise<void> {
    unmountAgainst();
    const body = hiddenBody("cawco-stage-against");
    const one: Against = {
      ...target,
      body,
      into: {},
      mounted: undefined,
      rested: false,
    };
    dressAgainst(one);
    const layers = hideLayers();
    frame.insertBefore(body, rings);
    against = one;
    one.mounted = page.mountInto(
      body,
      target.section,
      target.story.name,
      target.args,
      one.into
    );
    try {
      await restOf(body);
      await frameTick();
    } finally {
      layers.disconnect();
    }
    if (against !== one) {
      return;
    }
    one.rested = true;
    relaid.observe(body);
    firstUntil = performance.now() + SETTLE_MS;
    reread();
  }

  /** The state a Compare mount waits its turn to draw (behind the reaches before it); null when none waits. */
  let mounting: StateRef | null = null;

  /**
   * The panel's Compare (core `STAGE_COMPARE`): another state mounted
   * hidden, in its turn behind the reaches before it; the same state, the
   * flip set and what differs told again for this ask; or Compare ended.
   */
  function compare(asking: StageCompare): void {
    comparing = asking.against ? asking : null;
    const ref = asking.against;
    if (!ref) {
      mounting = null;
      unmountAgainst();
      found = [];
      beside = false;
      arrange();
      tell<StageDifferences>(STAGE_DIFFERENCES, {
        ask: asking.ask,
        found,
        beside,
        same: false,
      });
      return;
    }
    if (sameRef(mounting, ref)) {
      // On its way: its first read answers this ask.
      return;
    }
    if (!mounting && against && sameRef(against.ref, ref)) {
      arrange();
      tellDifferences();
      return;
    }
    mounting = ref;
    page.quietly(
      queue(async () => {
        if (!sameRef(mounting, ref)) {
          // Passed over by another state, or Compare ended.
          return;
        }
        try {
          const target = await targetOf(ref);
          if ("refused" in target) {
            unmountAgainst();
            found = [];
            arrange();
            tellDifferences();
            return;
          }
          await mountAgainst(target);
        } finally {
          if (sameRef(mounting, ref)) {
            mounting = null;
          }
        }
      })
    );
  }

  /** Each read waits two frames after the layout it heard: both drawings laid out. */
  let readFrame = 0;
  function reread(): void {
    if (!comparing) {
      return;
    }
    cancelAnimationFrame(readFrame);
    readFrame = requestAnimationFrame(() => {
      readFrame = requestAnimationFrame(readDifferences);
    });
  }

  /** Both drawings stand at rest, mounted without a fault. */
  const bothDrawn = (): boolean =>
    !!(
      against?.rested &&
      !against.into.error &&
      live &&
      !live.into.error &&
      !fault &&
      !frame.hidden
    );

  /** What differs, read; the two arranged and ringed, and told the panel. */
  function readDifferences(): void {
    if (
      !comparing?.against ||
      (against && !sameRef(against.ref, comparing.against))
    ) {
      // Another state is on its way: its own read tells.
      return;
    }
    const drawn = bothDrawn();
    found =
      drawn && against
        ? differences(against.body, drawing, Number(frame.style.zoom) || 1)
        : [];
    beside = drawn && room() >= 2 * drawnWidth + tokenPx(BESIDE_GAP);
    arrange();
    tellDifferences();
    const [first] = ringed();
    if (first && performance.now() < firstUntil) {
      showBox(ringBox(first), true);
    }
  }

  /** The differences as last read, told the panel for its last Compare ask. */
  function tellDifferences(): void {
    if (comparing) {
      tell<StageDifferences>(STAGE_DIFFERENCES, {
        ask: comparing.ask,
        found,
        beside,
        same: bothDrawn() && found.length === 0,
      });
    }
  }

  /**
   * The two drawings arranged as Compare stands: side by side, each named,
   * where the page's room holds both; else the kept one, or (flipped) the
   * compared one in its place; and the rings drawn on what shows. The frame
   * stands at least as tall as the compared drawing, so a ring where
   * something went stands whole inside it.
   */
  function arrange(): void {
    const on = !!(comparing && against);
    const flipped = on && !beside && comparing?.show === "compared";
    frame.classList.toggle("cawco-stage-beside", on && beside);
    frame.classList.toggle("cawco-stage-flipped", flipped);
    frame.style.setProperty(
      "--against-h",
      on && against ? `${against.body.offsetHeight}px` : ""
    );
    names.hidden = !(on && beside && live && against);
    if (!names.hidden && live && against) {
      names.style.setProperty("--frame-w", `${drawnWidth}px`);
      keptName.textContent = stateName(live);
      againstName.textContent = stateName(against);
    }
    // Side by side, both drawings' rings; flipped, what went where it
    // stood; else what came in or changed. What went, ringed on the kept
    // drawing, stood over whatever stands there now.
    const shown = on
      ? found.filter((one) => beside || (one.kind === "went") === flipped)
      : [];
    rings.replaceChildren(
      ...shown.map((one) => {
        const box = ringBox(one);
        const ring = document.createElement("span");
        ring.className = "cawco-change-ring";
        ring.dataset.kind = one.kind;
        // Its place among the differences told, as a reveal names it.
        ring.dataset.at = String(found.indexOf(one));
        ring.style.setProperty("--ring-x", `${box.x}px`);
        ring.style.setProperty("--ring-y", `${box.y}px`);
        ring.style.setProperty("--ring-w", `${box.w}px`);
        ring.style.setProperty("--ring-h", `${box.h}px`);
        ring.style.setProperty("--ring-r", one.radius);
        return ring;
      })
    );
  }

  new ResizeObserver(() => laid()).observe(drawing);
  addEventListener("resize", () => relay());
  // Each layer the drawing opens collides with the drawing, as with the app's window at its width.
  drawingsAsViewport(() => (live && !frame.hidden ? [drawing] : []));

  addEventListener(STAGE_REACH, (event) => {
    const asking = stageReachOf((event as CustomEvent<unknown>).detail);
    if (asking) {
      reach(asking);
    }
  });
  addEventListener(STAGE_REVEAL, (event) => {
    const asking = stageRevealOf((event as CustomEvent<unknown>).detail);
    if (asking) {
      reveal(asking);
    }
  });
  addEventListener(STAGE_COMPARE, (event) => {
    const asking = stageCompareOf((event as CustomEvent<unknown>).detail);
    if (asking) {
      compare(asking);
    }
  });

  /* --- The report: each section read in the rig --------------------------- */

  /** Where the sweep stands, for the stage's render to name when it runs out of time (stage-render.ts). */
  const sweepOn = (section: Section, step: SweepStep, story?: string) => {
    state.sweepAt = { file: section.file, step, ...(story ? { story } : {}) };
  };

  /** A story read as the rig drew it, in `column`, its box at `y` in the section's column of reads. */
  const rigRender = (
    story: Story,
    body: HTMLElement,
    column: Column,
    error: PageError | undefined,
    y: number
  ): FrameRender =>
    drawingRender(page, story, body, column, error, {
      x: 0,
      y,
      w: body.offsetWidth,
      h: body.offsetHeight,
    });

  /** The column a section's stories are read in: the view's scheme, its width picked or each story's own. */
  const rigColumn = (): Column => ({
    interaction: "rest",
    scheme: scheme(),
    width: view.widths?.[0] ?? "own",
  });

  /** Stories mounted in the rig, each in a body of its own dressed as the drawing would be. */
  function mountInRig(section: Section, stories: Story[]) {
    return stories.map((story) => {
      const body = document.createElement("div");
      body.className = "cawco-frame-body";
      page.dressBody(body, rigColumn(), story, page.fills(section, story.name));
      rig.append(body);
      const into: { error?: PageError } = {};
      const mounted = page.mountInto(
        body,
        section,
        story.name,
        page.argsOf(section, story.name),
        into
      );
      return { story, body, mounted, into };
    });
  }

  /**
   * A section's stories read in the rig, one at a time, each its own
   * tasks: mounted as the drawing would be (the view's scheme, its own
   * width or the one picked), read at rest once its first frames are
   * drawn, then probed in each interaction its CSS reaches (runtime.ts
   * `probe`), each state's frame read as its values are; then taken down,
   * its box under the one before, as a column. One mount serves its frames
   * and its probe: the probe mounted every story a second time.
   */
  async function readInRig(section: Section): Promise<void> {
    const stories = section.mod?.SHEET.stories ?? [];
    const read: FrameRender[] = [];
    const probes = new Map<string, Probe>();
    let y = 0;
    for (const story of stories) {
      // Never while the person's act is still being answered.
      await page.turn();
      sweepOn(section, "draw");
      const [one] = mountInRig(section, [story]);
      if (!one) {
        continue;
      }
      try {
        await frameTick();
        // Read in a task of its own, never inside the frame it waited for.
        await page.turn();
        page.rewriteAll();
        if (page.fillsScreen(section, story, one.body)) {
          page.dressBody(one.body, rigColumn(), story, true);
        }
        const reached = page.reachedIn(one.body);
        section.interactions.set(story.name, reached);
        const at = y;
        const frameIn = (interaction: Interaction) =>
          rigRender(
            story,
            one.body,
            { ...rigColumn(), interaction },
            one.into.error,
            at
          );
        read.push(frameIn("rest"));
        sweepOn(section, "probe");
        const probed = await page.probe(
          one.body,
          reached.filter(
            (interaction): interaction is Exclude<Interaction, "rest"> =>
              interaction !== "rest"
          ),
          (interaction) => read.push(frameIn(interaction))
        );
        if (probed.delta.size > 0) {
          probes.set(story.name, probed);
        }
        y += one.body.offsetHeight + ROW_GAP;
      } finally {
        one.mounted?.unmount();
        one.body.remove();
      }
    }
    reads.set(section, read);
    section.probes = probes;
  }

  /** The sections whose read is under way: a report says them as drawing, never their half-read frames. */
  const reading = new Set<Section>();
  /** The sections the sweep has still to read, in its order. */
  const unswept = new Set(state.sweeps);

  /**
   * A section read for the report: its stories in the rig, each with its
   * probe, then its moves; one pass at a time. A report says it as drawing
   * from the read's start to its end, then posts it.
   */
  function readSection(section: Section): Promise<void> {
    const before = section.settling ?? Promise.resolve();
    reading.add(section);
    page.later();
    const settling: Promise<void> = before
      .catch(() => undefined)
      .then(async () => {
        sweepOn(section, "draw");
        await readInRig(section);
        await page.playAll(section, (to) => sweepOn(section, "move", to));
      })
      .finally(() => {
        // A read asked since stands in this one's place: the section is drawing until that one ends.
        if (section.settling === settling) {
          reading.delete(section);
          page.later();
        }
      });
    section.settling = settling;
    return settling;
  }

  /** Every section read again once the page has been quiet a moment: an edit, or another view, reached what the report says. */
  let againTimer: ReturnType<typeof setTimeout> | undefined;
  const readAgain = () => {
    clearTimeout(againTimer);
    againTimer = setTimeout(() => {
      for (const section of sections) {
        if (section.loaded) {
          page.quietly(readSection(section).then(() => page.later()));
        }
      }
    }, READ_AGAIN_MS);
  };

  /**
   * Every section in turn, each read and reported before the next: the
   * panel's page and the stage's render alike, so the hub answers an open
   * canvas from the report the person's own page posts.
   */
  async function sweep(): Promise<void> {
    for (const file of state.sweeps) {
      const section = page.sectionOf(file);
      if (!section) {
        unswept.delete(file);
        continue;
      }
      try {
        sweepOn(section, "load");
        await page.loadSection(section);
        if (section.loaded) {
          await section.settling;
        }
      } finally {
        unswept.delete(file);
      }
      sweepOn(section, "post");
      await page.post();
      state.drawn.push(file);
    }
    // A sweep of no section (a state no states file holds) still reports: the render reads it, then the page's refusal.
    if (state.sweeps.length === 0) {
      await page.post();
    }
    state.sweepAt = null;
    state.swept = true;
  }

  /* --- Pictures: the stage at a state, posed and read for the daemon ------- */

  /** The section and story a picture names (`Story`, or `file:Story`), or why there is none. */
  async function stateNamed(
    name: string,
    interaction: Interaction = "rest"
  ): Promise<{ key: string } | { refused: string }> {
    const { story: storyName } = storyRefOf(name);
    // Found by the plans the stage wrote into the page: no other section is loaded, so none is drawn for it.
    const holders = holdersOf(page.files, page.plans, name);
    const section =
      holders.length === 1 ? page.sectionOf(holders[0] as string) : undefined;
    if (holders.length === 0) {
      return {
        refused: `No states file of this canvas has a story ${name}: ${page.files.map((file) => `${file} has ${page.plans[file]?.stories.map((each) => each.name).join(", ") || "none"}`).join("; ")}.`,
      };
    }
    if (!section) {
      return {
        refused: stageRenderWords.storyInSeveral(storyName, holders),
      };
    }
    // Its read done first: it says which interactions the story reaches.
    await page.loadSection(section);
    await section.settling;
    const reached = section.interactions.get(storyName) ?? ["rest"];
    return reached.includes(interaction)
      ? { key: pictureKey(section.file, storyName, interaction) }
      : {
          refused: `${name} has no ${interaction} state: its states are ${reached.join(", ")}.`,
        };
  }

  /** The room the window lacks to hold the drawing whole at 1:1, posed at `key`; null when it isn't. */
  const lacks = (key: string) =>
    posed?.key === key
      ? {
          w: Math.max(0, Math.ceil(frame.offsetWidth - windowRoom())),
          h: Math.max(
            0,
            Math.ceil(
              frame.offsetHeight +
                2 * tokenPx(GUTTER) +
                tokenPx(STAGE_ROOM_VAR) -
                windowHeight()
            )
          ),
        }
      : null;

  /** The stage posed at `key` for its picture: mounted afresh at its story, at rest, its interaction forced on the drawing. */
  async function pose(key: string): Promise<{ h: number; w: number } | null> {
    const [file, story, interaction] = key.split("|") as [
      string,
      string,
      Interaction,
    ];
    if (posed?.key !== key) {
      const target = resolved({ file, story });
      if ("refused" in target) {
        return null;
      }
      await queue(() => open(target));
      posed = { key, interaction };
    }
    if (interaction !== "rest") {
      for (const pseudo of FORCED[interaction]) {
        drawing.classList.add(allClass(pseudo));
      }
      drawing.dataset.cawcoInteraction = interaction;
    }
    // Laid out at the window as it stands now: one just grown for the
    // picture answers its resize a frame later, and a drawing still scaled
    // to the old window's room was refused as scaled.
    relay();
    scrollTo({ top: 0, left: 0, behavior: "instant" });
    return lacks(key);
  }

  /** Whether the drawing posed at `key` is settled: fonts loaded, and no finite animation running in it (its open shadow roots too). */
  function settled(key: string): boolean {
    if (posed?.key !== key || document.fonts.status !== "loaded") {
      return false;
    }
    const running: Animation[] = [...drawing.getAnimations({ subtree: true })];
    const trees: (Element | ShadowRoot)[] = [drawing];
    for (let tree = trees.pop(); tree; tree = trees.pop()) {
      for (const one of tree.querySelectorAll("*")) {
        if (one.shadowRoot) {
          running.push(...one.shadowRoot.getAnimations());
          trees.push(one.shadowRoot);
        }
      }
    }
    return !running.some(
      (run) =>
        run.playState === "running" &&
        Number.isFinite(Number(run.effect?.getComputedTiming().endTime ?? 0))
    );
  }

  /** The drawing as it stands on the page, for its picture: its rect, its own CSS size, the device's scale, whether it stands whole in the window. */
  function picture(key: string): FramePictureRead | null {
    if (posed?.key !== key) {
      return null;
    }
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    return {
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      own: {
        w: Number.parseFloat(style.width) || 0,
        h: Number.parseFloat(style.height) || 0,
      },
      scale: devicePixelRatio,
      whole:
        rect.left >= -0.5 &&
        rect.top >= -0.5 &&
        rect.right <= windowWidth() + 0.5 &&
        rect.bottom <= windowHeight() + 0.5,
      view: `the stage's drawing at 1:1 in a ${windowWidth()}×${windowHeight()} window`,
    };
  }

  Object.assign(state, { stateNamed, pose, lacks, picture, settled });

  /* --- The first drawing --------------------------------------------------- */

  /** A page on its own stands at its first states file's first story once that has loaded; a panel's page waits for the panel's reach. */
  function standFirst(section: Section): void {
    const [first] = section.mod?.SHEET.stories ?? [];
    if (framed || live || arrivals > 0 || !first) {
      return;
    }
    const target = resolved({ file: section.file, story: first.name });
    if (!("refused" in target)) {
      page.quietly(queue(() => open(target)));
    }
  }

  page.quietly(sweep());

  return {
    // The state compared with too: a dial turned on the drawing turns on it, so only the states differ.
    bodies: () => [
      ...(live
        ? [
            {
              body: drawing,
              mounted: live.mounted,
              written: page.ownArgsOf(live.section, live.story.name),
            },
          ]
        : []),
      ...(against
        ? [
            {
              body: against.body,
              mounted: against.mounted,
              written: page.ownArgsOf(against.section, against.story.name),
            },
          ]
        : []),
    ],
    drawing: () => [
      ...new Set([...unswept, ...[...reading].map((section) => section.file)]),
    ],
    framesOf: (section) =>
      reads.get(section)?.map((one) => {
        const delta = section.probes.get(one.story)?.delta.get(one.interaction);
        return one.interaction === "rest" || !delta ? one : { ...one, delta };
      }) ?? null,
    mediaWidth: () =>
      live && !frame.hidden ? Number.parseFloat(drawing.style.width) : null,
    overridden: (section, story) => {
      const now = live;
      if (now && now.section === section && now.story.name === story) {
        page.quietly(
          queue(async () => {
            const target = resolved(now.ref);
            if (!("refused" in target) && live) {
              await act(() => setArgs(target.args), view.motion === "reduce");
              live = { ...live, ...target };
              laid();
            }
          })
        );
      }
      readAgain();
    },
    shown: (section) => {
      failedCards.get(section.file)?.remove();
      failedCards.delete(section.file);
      page.quietly(readSection(section));
      const now = live;
      if (now?.section === section) {
        // Its states file edited: the drawing stands at its state, from the module as it reads now.
        const target = resolved(now.ref);
        if (!("refused" in target)) {
          page.quietly(queue(() => open(target, false)));
        }
      }
      const standing = against;
      if (standing?.section === section) {
        // And the state compared with, from the module as it reads now.
        const target = resolved(standing.ref);
        if (!("refused" in target)) {
          page.quietly(queue(() => mountAgainst(target)));
        }
      }
      standFirst(section);
    },
    failed: (section, failure: SectionFailure) => {
      failedCards.get(section.file)?.remove();
      const card = page.failedCard(section, failure);
      failedCards.set(section.file, card);
      canvas.prepend(card);
      if (!live) {
        waiting.remove();
      }
    },
    reported: () => undefined,
    restyled: () => laid(),
    // An update reads nothing again: Vite sends every page each update the
    // stage's graph takes, whatever page holds its modules (its client
    // fires `vite:afterUpdate` though it applied none), so an edit to any
    // file of the project read every open canvas again. One a section's
    // frames are drawn from updates that section's own module (host.ts
    // `hotUpdate`), and it is read again as it is shown (`cawco:section`).
    updated: () => laid(),
    redressed: () => {
      relay();
      readAgain();
    },
    selected: () => undefined,
  };
}

/* --- A Preview's column, and a map card's ------------------------------- */

/** A drawing in a column: the state it stands at, its live instance, why it threw, and the observer that hears it lay out. */
interface InColumn extends Drawing {
  fault: HTMLElement | null;
  heard: ResizeObserver | null;
  /** Its observer has heard it lay out since it last mounted: a frame has laid it out, its own observers' first answers in. */
  laid: boolean;
  live: Live | null;
  target: Target;
}

/** A states file as a column draws it: its place among the column's, its drawings by story, or the card saying why it didn't load. */
interface ColumnPart {
  drawings: Map<string, InColumn>;
  el: HTMLElement;
  failedCard: HTMLElement | null;
  section: Section;
}

/** Where a map card's column stands from the card's corner. */
const CARD_INSET = { x: 24, y: 16 };
/** A map card's least zoom. */
const CARD_ZOOM_MIN = 0.1;

/** A finite animation that runs: one a story's arrival set off (a Svelte `in:`, a fold), never a loop or a scroller's. */
const arriving = (run: Animation): boolean =>
  run.playState === "running" &&
  !statesOwn(run) &&
  Number.isFinite(Number(run.effect?.getComputedTiming().endTime));

/**
 * A decision page's Preview (`by=embed`) and a map's card (`by=map`): each
 * story the page names (a Preview's `story`s, in the order it names them;
 * a card's every one) drawn as the stage draws its one state, a drawing,
 * one under another in a column, each at its own width (or the one the
 * view names), at rest, 1 CSS px per px. A Preview's column stands in the
 * page's own flow and tells the page holding it its shape (embed.ts); a
 * card's is fitted to the card by one transform. Neither posts a report,
 * nor reads anything in the rig: the report stays the panel's own page's.
 */
function bootColumn(page: Page): Mode {
  const { sections, view } = page;
  const embed = page.by === "embed";
  const named = new Set(new URLSearchParams(location.search).getAll("story"));
  document.documentElement.classList.add(
    "cawco-column-page",
    embed ? "cawco-embed" : "cawco-map"
  );
  const canvas = document.getElementById("cawco-canvas") as HTMLElement;
  const column = document.createElement("div");
  column.className = "cawco-column";
  const waiting = waitingFor(sections[0]?.name ?? "the component");
  column.append(waiting);
  canvas.append(column);
  const parts: ColumnPart[] = sections.map((section) => {
    const el = document.createElement("div");
    el.className = "cawco-column-part";
    el.dataset.cawcoFile = section.file;
    column.append(el);
    return { section, el, drawings: new Map(), failedCard: null };
  });
  const partOf = (section: Section) =>
    parts.find((one) => one.section === section) as ColumnPart;
  const drawn = () => parts.flatMap((one) => [...one.drawings.values()]);

  /** The stories of `all` the page draws: a Preview's the ones it names, in its order; a card's every one, in its file's. */
  const toDraw = (all: readonly Story[]): Story[] =>
    named.size === 0
      ? [...all]
      : [...named].flatMap((name) => all.filter((one) => one.name === name));

  const scheme = (): Column["scheme"] =>
    view.scheme === "both" ? "light" : view.scheme;
  const columnOf = (): Column => ({
    interaction: "rest",
    scheme: scheme(),
    width: view.widths?.[0] ?? "own",
  });
  const widthOf = (one: InColumn) =>
    page.widthOf(one.target.story, columnOf().width);

  /** A drawing dressed as it stands: its scheme, its width, its marks. */
  function dress(one: InColumn): void {
    const width = widthOf(one);
    page.dressBody(
      one.body,
      columnOf(),
      one.target.story,
      page.fills(one.target.section, one.target.story.name)
    );
    markDrawing(one.body, one.target, scheme(), width);
    one.frame.style.setProperty(
      "--frame-w",
      width === null ? "auto" : `${width}px`
    );
  }

  /** A drawing's story mounted afresh, heard as it lays out once its own effects have run. */
  function draw(one: InColumn): void {
    one.heard?.disconnect();
    one.heard = null;
    one.laid = false;
    one.fault?.remove();
    one.fault = null;
    one.live = mountDrawing(page, one, one.target, one.live, () => dress(one));
    const { live } = one;
    if (live.into.error) {
      faulted(one, live.into.error);
      return;
    }
    // The component's own observers are made in its effects, which its framework runs in a microtask after the mount: this one is made after them, so it hears what their answers lay out.
    queueMicrotask(() => {
      if (one.live === live && !one.fault) {
        one.heard = new ResizeObserver(() => laidOut(one));
        one.heard.observe(one.body);
      }
    });
  }

  /** A drawing taken down. */
  function undraw(one: InColumn): void {
    one.heard?.disconnect();
    one.live?.mounted?.unmount();
    one.fault?.remove();
    one.frame.remove();
  }

  /** The story threw as it mounted: the error formula in its drawing's place, its own Try again. */
  function faulted(one: InColumn, error: PageError): void {
    one.heard?.disconnect();
    one.heard = null;
    one.frame.hidden = true;
    one.body.dataset.cawcoState = "failed";
    const card = faultCard(one.target, error, () => {
      const target = resolveState(page, one.target.ref);
      if (!("refused" in target)) {
        one.target = target;
        draw(one);
        changed();
      }
    });
    one.frame.after(card);
    one.fault = card;
    changed();
  }

  /** A drawing laid out anew: whether it drew, its error if its framework said one since, and the column's shape read again. */
  function laidOut(one: InColumn): void {
    const error = one.live?.into.error;
    if (error) {
      faulted(one, error);
      return;
    }
    one.body.dataset.cawcoState = drew(one.body) ? "drawn" : "empty";
    one.laid = true;
    changed();
    // What the page's own report reads of it, read again once it has been quiet a moment.
    page.later();
  }

  /**
   * Each picture's address as its load or error was heard: a picture has
   * arrived once its event has run, never when it says it is `complete` (a
   * broken one is complete before its error's handler runs, and what that
   * handler draws, ReportOutputs' failed thumbnail, laid out a frame after
   * the shape was said).
   */
  const pictured = new WeakMap<HTMLImageElement, string>();
  for (const type of ["load", "error"] as const) {
    column.addEventListener(
      type,
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          pictured.set(event.target, event.target.src);
        }
      },
      true
    );
  }

  /** A Preview's shape, told the page holding it; a card's column, fitted. */
  const teller = embed
    ? tellHolder({
        el: column,
        ready: () =>
          sections.every((one) => one.loaded || one.failure) &&
          drawn().every((one) => one.laid || one.fault),
        failure: embedFailure,
        arriving: () => [
          ...document
            .getAnimations()
            .filter(
              (run) =>
                arriving(run) &&
                run.effect instanceof KeyframeEffect &&
                !!run.effect.target &&
                column.contains(run.effect.target)
            )
            .map((run) => run.finished),
          // A lazy picture loads only once its frame is laid out at its height, which waits on this: never waited for.
          ...[...column.querySelectorAll("img")]
            .filter(
              (img) =>
                img.loading !== "lazy" &&
                !!img.getAttribute("src") &&
                pictured.get(img) !== img.src
            )
            .map(
              (img) =>
                new Promise((done) => {
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                })
            ),
        ],
        stories: () => [
          ...new Set(drawn().map((one) => one.target.story.name)),
        ],
        width: () => {
          const widths = drawn().flatMap((one) => widthOf(one) ?? []);
          return widths.length > 0 ? Math.max(...widths) : null;
        },
      })
    : null;
  const changed = () => (teller ? teller.changed() : fit());

  /** How much a map card's column is scaled to fit the card; 1 for a Preview. */
  let zoom = 1;
  /** A map card's column zoomed to the card's width, never past 1. */
  function fit(): void {
    const box = canvas.getBoundingClientRect();
    const width = column.scrollWidth || box.width;
    zoom = Math.max(
      CARD_ZOOM_MIN,
      Math.min(1, (box.width - 2 * CARD_INSET.x) / width)
    );
    column.style.transform = `translate(${CARD_INSET.x}px, ${CARD_INSET.y}px) scale(${zoom})`;
  }

  /**
   * Why a Preview can't draw what it names, in plain words; null while it
   * draws: a story of it that threw as it mounted, or, with no story of it
   * drawn, a states file that didn't load (its card's line).
   */
  function embedFailure(): string | null {
    const all = drawn();
    const threw = all.find((one) => one.live?.into.error);
    const error = threw?.live?.into.error;
    if (threw && error) {
      const first = error.message.split("\n")[0]?.trim() ?? "";
      const said =
        first.length > EMBED_WHY_MAX
          ? `${first.slice(0, EMBED_WHY_MAX - 1)}…`
          : first;
      return `its story ${threw.target.story.name} threw as it mounted${said ? `: ${said}` : "."}`;
    }
    const failedOne = sections.find((one) => one.failure);
    if (all.length === 0 && failedOne?.failure) {
      return FAILED_LINE[failedOne.failure.kind](failedOne.name);
    }
    return null;
  }

  /** The line saying which stories a Preview names that no states file of its canvas has; none while every one is held. */
  let unnamedLine: HTMLElement | null = null;

  /**
   * A Preview's named stories that no states file holds, said once in the
   * column's own place, after every one has loaded: a story is the
   * canvas's, from whichever states file holds it. While one is still on
   * its way, or failed (it says why in its own place), nothing is said.
   */
  function unnamed(): void {
    unnamedLine?.remove();
    unnamedLine = null;
    if (sections.some((one) => !one.loaded || one.failure)) {
      return;
    }
    const have = new Set(
      sections.flatMap(
        (one) => one.mod?.SHEET.stories.map((story) => story.name) ?? []
      )
    );
    const missing = [...named].filter((name) => !have.has(name));
    if (missing.length === 0) {
      return;
    }
    unnamedLine = document.createElement("p");
    unnamedLine.className = "cawco-section-failed-line cawco-ui";
    unnamedLine.setAttribute("role", "alert");
    unnamedLine.textContent = `${page.spec.name ?? "This canvas"} has no ${missing.length === 1 ? "story" : "stories"} named ${missing.join(", ")}.`;
    column.prepend(unnamedLine);
  }

  /** A states file's place cleared: its drawings taken down, the card saying why it didn't load gone, the wait over. */
  function cleared(section: Section): ColumnPart {
    const part = partOf(section);
    for (const one of part.drawings.values()) {
      undraw(one);
    }
    part.drawings.clear();
    part.failedCard?.remove();
    part.failedCard = null;
    waiting.remove();
    return part;
  }

  /** A states file's stories drawn from its module, whatever stood of the last one taken down. */
  function shown(section: Section): void {
    const part = cleared(section);
    teller?.mounted();
    for (const story of toDraw(section.mod?.SHEET.stories ?? [])) {
      const target = resolveState(page, {
        file: section.file,
        story: story.name,
      });
      if ("refused" in target) {
        continue;
      }
      const one: InColumn = {
        ...newDrawing(),
        target,
        live: null,
        fault: null,
        heard: null,
        laid: false,
      };
      part.el.append(one.frame);
      part.drawings.set(story.name, one);
      draw(one);
    }
    // A story with a width and no height of its own drawn as tall as its screen, as it fills a window.
    for (const one of part.drawings.values()) {
      if (!one.fault && page.fillsScreen(section, one.target.story, one.body)) {
        dress(one);
      }
    }
    if (embed) {
      unnamed();
    }
    changed();
  }

  /** A states file whose module didn't load says so in its own place, its error and where it threw under Show details. */
  function failed(section: Section, failure: SectionFailure): void {
    const part = cleared(section);
    part.failedCard = page.failedCard(section, failure);
    part.el.append(part.failedCard);
    changed();
  }

  // Each layer a drawing opens collides with that drawing, as with the app's window at its width.
  drawingsAsViewport(() =>
    drawn().flatMap((one) => (one.live && !one.fault ? [one.body] : []))
  );
  if (!embed) {
    new ResizeObserver(() => fit()).observe(canvas);
  }

  // Every states file in order, once the page may load its stories: a Preview's once the page holding it says its whole graph is in the renderer (host.ts `graphPreloads`, core `CANVAS_EMBED_READY`), any other page's at once.
  page.quietly(
    (async () => {
      await (window as unknown as { __cawcoGraph?: CanvasGraph }).__cawcoGraph
        ?.go;
      for (const section of sections) {
        await page.loadSection(section);
      }
    })()
  );

  return {
    bodies: () =>
      drawn().flatMap((one) =>
        one.live
          ? [
              {
                body: one.body,
                mounted: one.live.mounted,
                written: page.ownArgsOf(
                  one.target.section,
                  one.target.story.name
                ),
              },
            ]
          : []
      ),
    // A column posts no report: what it reads of its drawings is the page's own (`__cawcoCanvas.report`).
    drawing: () => [],
    framesOf: (section) =>
      section.loaded
        ? [...partOf(section).drawings.values()].map((one) => {
            const at = column.getBoundingClientRect();
            const box = one.body.getBoundingClientRect();
            return drawingRender(
              page,
              one.target.story,
              one.body,
              columnOf(),
              one.live?.into.error,
              {
                x: Math.round((box.left - at.left) / zoom),
                y: Math.round((box.top - at.top) / zoom),
                w: one.body.offsetWidth,
                h: one.body.offsetHeight,
              }
            );
          })
        : null,
    mediaWidth: () => {
      // Asked between mounts: at the one width every drawing has.
      const widths = new Set(drawn().map(widthOf));
      const [only] = widths;
      return (
        (widths.size === 1 && only !== undefined ? only : null) ??
        canvas.clientWidth
      );
    },
    overridden: (section, story) => {
      const one = partOf(section).drawings.get(story);
      const target = one ? resolveState(page, one.target.ref) : null;
      if (one && target && !("refused" in target)) {
        one.target = target;
        draw(one);
      }
    },
    shown,
    failed,
    reported: () => undefined,
    restyled: () => undefined,
    updated: () => undefined,
    redressed: () => {
      for (const one of drawn()) {
        dress(one);
      }
    },
    selected: () => undefined,
  };
}
