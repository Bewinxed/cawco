/**
 * An artifact's doc's `meta` map, typed: every key the hub, a page, a
 * canvas's screen and the panel read or write there ({@link DocMeta}), who
 * may write each ({@link META_WRITERS}), and the one door to the map
 * ({@link docMeta}, {@link getMeta}, {@link setMeta}). The keys are the
 * stored strings; nothing else names the map.
 */
import type { ArtifactDoes, ArtifactKind } from "./artifact-kinds";
import type { MapChange, MapDoc } from "./doc-maps";
import type { PageFaultsKept } from "./page-faults";
import type { ArtifactPromotion } from "./protocol";
import type {
  CanvasShapes,
  PageError,
  RenderReport,
  SectionRender,
  SheetRead,
  StageState,
  StageUnreached,
} from "./stage";

/**
 * The artifact's latest ask, kept in its doc (`meta.asked`): the session
 * whose tool call made it (create, update, revise, show), when, the step
 * it was asked at while the session was at work on its plan (`step`: set,
 * the plan waits on it until it is answered or deleted, {@link planHolds}),
 * and when the writer's next turn ended with its plan not waiting on it and
 * no new show.
 */
export interface ArtifactAsked {
  at: string;
  by: string;
  movedAt?: string;
  step?: string;
}

/** One states file's last draw as a component canvas's doc keeps it (`meta.drawn`): the section, when and by whom, and the page's errors with it. */
export interface DrawnKept {
  at: string;
  by: RenderReport["by"];
  errors: PageError[];
  section: SectionRender;
}

/** The agent's close of a question: acted on his answer (`taken`), or superseded (`withdrawn`). */
export interface QuestionClose {
  as: "taken" | "withdrawn";
  at: string;
  /** The session that closed it. */
  by: string;
  /** Taken: his words it acted on, quoted; withdrawn: what superseded it. */
  why: string;
}

/**
 * Who sent a page: the person pressing Send, or the hub, once every
 * question had his answer (`sendAnswered`). A send from before the hub
 * kept it (2026-11-05) reads as his.
 */
export type SentBy = "person" | "hub";

/**
 * What an artifact's revisions changed that the person hasn't looked at, as
 * the hub reads them (the doc's `meta.changes`): a page's elements, a
 * decision page's cards, a canvas's elements. Each is a stop the panel
 * marks until the person has looked at it; one he hasn't is carried into
 * the next revision's set ({@link carryChanges}), so the set is "since you
 * looked", never only the latest revision's.
 */
export interface ArtifactChanges {
  /** When the latest revision was read. */
  at: string;
  items: ChangedItem[];
  /**
   * What the person's looks at them are kept by (the doc's `seen`): a page's
   * revision; a canvas's scene version (`meta.sceneVersion`), which each of
   * the agent's updates moves while the canvas stays the one live scene.
   */
  revision: number;
  /**
   * When the revision before it was made: an agent's reply in a pin's thread
   * after it is that revision's answer ({@link bindChanges}).
   */
  since?: string;
}

/**
 * One thing a revision changed: `element`, a page's element by its
 * selector, marked where it stands; `card`, a decision card, by its
 * selector (`#decision-<id>`); `canvas`, a canvas's element by its id;
 * `removed`, something gone, with no box to mark, stood in the tag by its
 * label alone. The anchor is what the person's look is kept by.
 */
export interface ChangedItem {
  /** Its words now, whole (up to {@link CHANGE_WORDS_MOST}); `label` when it has none past its label. */
  after?: string;
  anchor: string;
  /** Whether the agent answered its pin in the revision that changed it (a reply in its thread since the revision before). */
  answered?: boolean;
  /** Its words, whole (up to {@link CHANGE_WORDS_MOST}), when the person last looked; none when it was put in. */
  before?: string;
  /** What it is, by name ("Headline", "Button": core pin-name.ts `elementName`). */
  element?: string;
  kind: "element" | "card" | "canvas" | "removed";
  /** Its words now, or what it is: the "after". */
  label: string;
  /** It moved: the element it came after then, and the one it comes after now, by their words (empty: it came first). */
  moved?: { after: string; before: string };
  /** The comment it answers, or the one that stands on it, by pin id. */
  pin?: string;
  /** The revision (a canvas's scene version) that last changed it. */
  revision?: number;
  /** How many revisions changed it since the person looked. */
  times?: number;
}

/** The person's note with what they held, kept until the delivery that carries them (`meta.heldNote`). */
export interface HeldNote {
  at: string;
  text: string;
}

/**
 * What an artifact's doc keeps in its `meta` map, by key. Every key is
 * optional: a doc made before a key was kept, or one the hub never wrote,
 * reads it as absent.
 */
export interface DocMeta {
  /** The panel head's one line: what the person does here, in his words (hub `stampMeta`). */
  ask: string;
  /** Its latest ask: who asked, when, at which plan step (hub artifacts needs.ts). */
  asked: ArtifactAsked;
  /** What its revisions changed that the person hasn't looked at. */
  changes: ArtifactChanges;
  /** Who may answer it and how (hub `stampMeta`). */
  does: ArtifactDoes;
  /** A draft: a canvas the person started, or a page not yet shown. */
  draft: boolean;
  /** A component canvas's last draw of each states file, by file. */
  drawn: Record<string, DrawnKept>;
  /** A component canvas's frames as a browser drew them, by frame. */
  drawnShapes: CanvasShapes["drawn"];
  /** A served artifact's page errors the agent has been told of. */
  errorsHeard: string[];
  /** What a browser met drawing a page or preview at its revision now (core page-faults.ts, hub `pageFault`). */
  faults: PageFaultsKept;
  /** A held next version: its artifact's seq when it was forked (hub `holdNext`), after which the person's answers there are newer than it (hub `promote`). */
  forkedAt: number;
  /** An artifact handed to its parent and not opened since (hub `handOver`). */
  handed: true;
  /** The person's note with what they held, until the delivery that carries them. */
  heldNote: HeldNote;
  /** The artifact's kind, copied from its row (hub `stampMeta`). */
  kind: ArtifactKind;
  /** When the person last looked at it. */
  lookedAt: string;
  /** The last piece a decision page shows that moved to another version, and that version (hub `versionMoved`, preview overlay/page.ts `mediaMoved`). */
  mediaAt: string;
  /** An option's media whose decision page went: the page's id (hub `discard`). */
  mediaOf: string;
  /** Its name (hub `stampMeta`). */
  name: string;
  /** A page that asks choices carries its own Send at its foot (hub `stampMeta`). */
  ownSend: boolean;
  /** Its page's hash: its program's for a decision page, its HTML's for a page, its canvas address's for a component. */
  pageHash: string;
  /** Excalidraw's pen mode, once a pen touched a canvas: its screen's to write. */
  penDetected: boolean;
  penMode: boolean;
  /** When a canvas's latest picture was kept; null once it holds nothing (hub artifacts sync.ts `artifactPicture`). */
  pictureAt: string | null;
  /** A decision page's: the machine each picture it shows was read on, by the name its Image gives. */
  pictureMachines: Record<string, string>;
  /** A decision page's: the work folder its relative Images were last published from. */
  programDir: string;
  /** A decision page's: the machine that folder is on. */
  programMachine: string;
  /** A project page's last commit into the project's folder. */
  promoted: ArtifactPromotion;
  /** The agent's closes of its questions, by question key: the hub's alone to write. */
  questionsClosed: Record<string, QuestionClose>;
  /** When the session last changed it, a revision or a new ask. */
  revisedAt: string;
  /** Its revision, copied from its row (hub `stampMeta`). */
  revision: number;
  /** A component canvas's frames as the agent said them, by frame. */
  saidShapes: CanvasShapes["said"];
  /** A sheet's saved sections the agent has not heard yet. */
  saves: string[];
  /** A canvas's scene version, which each of the agent's updates moves. */
  sceneVersion: number;
  /** When the person last pressed Send. */
  sentAt: string;
  /** Who sent it last: the person, or the hub once every question had his answer. */
  sentBy: SentBy;
  /** The words a page's `cawco.send(text)` sent with the last send. */
  sentText: string | null;
  /** The address the person's last send was made on. */
  sentUrl: string;
  /** A component canvas's sheet as its stage last read it. */
  sheet: SheetRead;
  /** A preview whose folder its machine said is gone at its last start, with the daemon's words (hub `sourceSeen`). */
  sourceGone: { at: string; why: string };
  /** A served artifact's stage as it last stood. */
  stage: StageState;
  /** Its title, as the session last named it. */
  title: string;
  /** A served artifact whose stage could not be reached, and why. */
  unreached: StageUnreached;
  /** When the agent's last write to a canvas landed (hub artifacts/canvas.ts): a picture posted before it (`pictureAt`) shows the drawing as it was before that write. */
  wroteAt: string;
}

export type DocMetaKey = keyof DocMeta;

/**
 * Who may write each key: the hub; the person, on any artifact (Send all's
 * note); or the person's canvas screen, on a canvas. The hub's socket gate
 * (hub artifacts sync.ts) keeps a client's change to any other key out.
 */
export const META_WRITERS = {
  asked: "hub",
  ask: "hub",
  changes: "hub",
  does: "hub",
  draft: "hub",
  drawn: "hub",
  drawnShapes: "hub",
  errorsHeard: "hub",
  faults: "hub",
  forkedAt: "hub",
  handed: "hub",
  heldNote: "person",
  kind: "hub",
  lookedAt: "hub",
  mediaAt: "hub",
  mediaOf: "hub",
  name: "hub",
  ownSend: "hub",
  pageHash: "hub",
  penDetected: "canvas",
  penMode: "canvas",
  pictureAt: "hub",
  pictureMachines: "hub",
  programDir: "hub",
  programMachine: "hub",
  promoted: "hub",
  questionsClosed: "hub",
  revision: "hub",
  revisedAt: "hub",
  saidShapes: "hub",
  saves: "hub",
  sceneVersion: "hub",
  sentAt: "hub",
  sentBy: "hub",
  sentText: "hub",
  sentUrl: "hub",
  sheet: "hub",
  sourceGone: "hub",
  stage: "hub",
  title: "hub",
  unreached: "hub",
  wroteAt: "hub",
} as const satisfies { [K in DocMetaKey]-?: "hub" | "person" | "canvas" };

/** The keys a client writes: the person's on any artifact, his canvas screen's on a canvas. */
export type ClientMetaKey = {
  [K in DocMetaKey]: (typeof META_WRITERS)[K] extends "hub" ? never : K;
}[DocMetaKey];

/** Who may write `key`, any string a client sent; undefined for a key the doc does not keep. */
export const metaWriter = (
  key: string
): (typeof META_WRITERS)[DocMetaKey] | undefined =>
  Object.hasOwn(META_WRITERS, key)
    ? META_WRITERS[key as DocMetaKey]
    : undefined;

/** A doc's `meta` map, its keys and values {@link DocMeta}'s. */
export interface MetaMap {
  delete: (key: DocMetaKey) => void;
  /** Every key and value it holds, a key a client wrote that the doc does not keep included. */
  entries: () => IterableIterator<[string, unknown]>;
  get: <K extends DocMetaKey>(key: K) => DocMeta[K] | undefined;
  has: (key: DocMetaKey) => boolean;
  keys: () => IterableIterator<string>;
  observe: (watcher: (change: MapChange) => void) => void;
  set: <K extends DocMetaKey>(key: K, value: DocMeta[K]) => unknown;
  unobserve: (watcher: (change: MapChange) => void) => void;
}

/** `doc`'s `meta` map: the one place a doc's map is named "meta". */
export const docMeta = (doc: MapDoc): MetaMap =>
  doc.getMap("meta") as unknown as MetaMap;

/** `doc`'s `meta` value at `key`; undefined when it holds none. */
export const getMeta = <K extends DocMetaKey>(
  doc: MapDoc,
  key: K
): DocMeta[K] | undefined => docMeta(doc).get(key);

/** Writes `value` at `key` of `doc`'s `meta` (inside the caller's transaction, when it has one). */
export const setMeta = <K extends DocMetaKey>(
  doc: MapDoc,
  key: K,
  value: DocMeta[K]
): void => {
  docMeta(doc).set(key, value);
};
