/**
 * The dashboard's registry of rich references (core references.ts): for
 * each kind a `cawco:` link can name, how the dashboard finds the id it
 * names and the element that draws it. A new kind is added to core's
 * `REFERENCE_KINDS` and here, and nowhere else: the record is keyed by
 * that list, so a kind without its entry fails the type check.
 *
 * What a written link draws as (`referenceOf`): a known kind naming
 * something the dashboard holds or the hub names is that kind's element,
 * given the link's written label (what it falls back to while the doc it
 * reads isn't held); a `cawco:` link of any other kind, or naming nothing
 * (or while the hub is asked), is its label alone; any other destination is
 * a link.
 *
 * A page of another origin that draws a reference (a decision page's words,
 * core reference-faces.ts) cannot read the store: its host says each one's
 * face as data (`referenceFace`, read by the same `find` and the same reads
 * as the kind's element), and opens it as the element opens
 * (`followReference`).
 */
import { pinName } from "@cawco/core/pin-name";
import type { ReferenceFace } from "@cawco/core/reference-faces";
import {
  changeReference,
  decisionReference,
  parseReference,
  pinReference,
  type ReferenceKind,
} from "@cawco/core/references";
import type { Component } from "svelte";
import { goto } from "$app/navigation";
import ArtifactReference from "./ArtifactReference.svelte";
import {
  artifactMarksKnown,
  artifactNamed,
  pinNamed,
} from "./artifact-names.svelte";
import ChangeReference from "./ChangeReference.svelte";
import CommentChip from "./CommentChip.svelte";
import DecisionReference from "./DecisionReference.svelte";
import { sessionName } from "./home/home-state.svelte";
import { conversationHref } from "./links";
import {
  type Drawn,
  type ElementProps,
  plainReferenceOf,
} from "./markdown-fleet";
import { openReference, openThing } from "./reference-open.svelte";
import { type ThingKind, thingNamed } from "./reference-things.svelte";
import SessionReference from "./SessionReference.svelte";
import { sessionNamed, sessionPlace } from "./session-names.svelte";
import { boardStore } from "./stores/board.svelte";
import ThingReference from "./ThingReference.svelte";

interface ReferenceElement {
  /** What draws it. */
  readonly element: Component<ElementProps>;
  /** Its face, as its element shows it, for a page of another origin to draw (core reference-faces.ts); read by the id `find` answered. */
  face: (id: string) => ReferenceFace;
  /** The id as the dashboard holds it, or null when it holds none by that id. */
  find: (id: string) => string | null;
  /**
   * Opens it as a press on its element does, from a page of another origin
   * standing in `here`'s panel (a session's id; none: the page stands on no
   * session's): the refusal's words, or null once it opened.
   */
  follow: (id: string, here?: string) => Promise<string | null>;
}

/** A face whose words are the link's written label. */
const labelled = (mark: ReferenceFace["mark"]): ReferenceFace => ({
  words: null,
  state: null,
  mark,
  title: null,
});

/**
 * A task, a to-do, a plan, a step, a routine, a project or a machine
 * (reference-things.svelte.ts): drawn as its chip
 * (ThingReference) once the dashboard holds it or the hub named it.
 */
const thing = (kind: ThingKind): ReferenceElement => ({
  find: (id) => (thingNamed(kind, id) ? id : null),
  face: (id) => {
    const named = thingNamed(kind, id);
    return {
      words: named?.label || null,
      state: named?.state ?? null,
      mark: null,
      title:
        named?.label && named.state ? `${named.label}, ${named.state}` : null,
    };
  },
  follow: async (id) => {
    const named = thingNamed(kind, id);
    if (named) {
      await openThing(named);
    }
    return null;
  },
  get element() {
    return ThingReference as unknown as Component<ElementProps>;
  },
});

/** An id whose artifact part the dashboard holds or the hub names; null while it is asked, and when it names none. */
const ofArtifact = (id: string, artifact: string | undefined): string | null =>
  artifact && artifactNamed(artifact) ? id : null;

const REFERENCE_ELEMENTS: Record<ReferenceKind, ReferenceElement> = {
  /**
   * A session or delegate, by its full id, a short one or its handle
   * (session-names.svelte.ts): a row of the instance index, else the
   * session the hub's names hold.
   */
  session: {
    find: sessionNamed,
    face: (id) => ({
      words: sessionName(id),
      state: null,
      mark: { of: "session", seed: id, place: sessionPlace(id) },
      title: null,
    }),
    // Its chip's panel stands in the dashboard: from a page, its conversation opens.
    follow: async (id) => {
      await goto(conversationHref(id, boardStore.instanceIndex));
      return null;
    },
    // Read when drawn, not when this module loads: the element's own
    // imports reach the markdown that imports this registry.
    get element() {
      return SessionReference;
    },
  },
  /**
   * A pin, by its artifact and number (`<artifact>/<number>`): its artifact
   * held or named, and its pins known (artifact-names.svelte.ts
   * `artifactMarksKnown`). Its chip shows what the pin stands on (DESIGN.md,
   * Inline chip: it keeps its words and box from its first paint), so it is drawn once that is known, never
   * before with the written label and again with the pin's name: a chip
   * keeps its words and its width from its first paint. It is the comment
   * chip (CommentChip): pressed, it opens the pin's thread there, as the
   * chip under a call that answered it does.
   */
  pin: {
    find: (id) => {
      const artifact = pinReference(id)?.artifact;
      return ofArtifact(id, artifact) &&
        artifact &&
        artifactMarksKnown(artifact)
        ? id
        : null;
    },
    face: (id) => {
      const at = pinReference(id);
      const pin = pinNamed(id);
      const kind = (at && artifactNamed(at.artifact)?.kind) || "page";
      return {
        words: pin ? pinName(pin) : null,
        state: null,
        mark: { of: "artifact", kind },
        title: null,
      };
    },
    // Its thread opens over its page: from a page, the page opens at the pin.
    follow: (id, here) => {
      const at = pinReference(id);
      return at
        ? openReference(at.artifact, { pin: at.number }, here)
        : Promise.resolve(null);
    },
    get element() {
      return CommentChip;
    },
  },
  /** A spot an update changed, by its artifact and anchor (`<artifact>/<anchor>`). */
  change: {
    find: (id) => ofArtifact(id, changeReference(id)?.artifact),
    face: () => labelled({ of: "change" }),
    follow: (id, here) => {
      const at = changeReference(id);
      return at
        ? openReference(at.artifact, { change: at.anchor }, here)
        : Promise.resolve(null);
    },
    get element() {
      return ChangeReference;
    },
  },
  /** A decision card, by its artifact and id (`<artifact>/<card>`). */
  decision: {
    find: (id) => ofArtifact(id, decisionReference(id)?.artifact),
    face: () => labelled({ of: "decision" }),
    follow: (id, here) => {
      const at = decisionReference(id);
      return at
        ? openReference(at.artifact, { card: at.card }, here)
        : Promise.resolve(null);
    },
    get element() {
      return DecisionReference;
    },
  },
  /** An artifact, by its id. */
  artifact: {
    find: (id) => ofArtifact(id, id),
    face: (id) => {
      const named = artifactNamed(id);
      return {
        words: named?.title ?? null,
        state: null,
        mark: { of: "artifact", kind: named?.kind ?? "page" },
        title: null,
      };
    },
    follow: (id, here) => openReference(id, { top: true }, here),
    get element() {
      return ArtifactReference;
    },
  },
  task: thing("task"),
  todo: thing("todo"),
  plan: thing("plan"),
  step: thing("step"),
  routine: thing("routine"),
  project: thing("project"),
  machine: thing("machine"),
};

const isKind = (kind: string): kind is ReferenceKind =>
  Object.hasOwn(REFERENCE_ELEMENTS, kind);

/** What a written link whose destination is `href` draws as. */
export function referenceOf(href: string): Drawn {
  const reference = parseReference(href);
  if (!reference) {
    return plainReferenceOf(href);
  }
  const found = held(href);
  return found && isKind(reference.kind)
    ? {
        draw: "element",
        element: found.entry.element,
        id: found.id,
        kind: reference.kind,
      }
    : { draw: "label" };
}

/** The entry and the id the dashboard holds a `cawco:` destination by; null when it holds none by it. */
function held(href: string): { entry: ReferenceElement; id: string } | null {
  const reference = parseReference(href);
  if (!(reference && isKind(reference.kind))) {
    return null;
  }
  const entry = REFERENCE_ELEMENTS[reference.kind];
  const id = entry.find(reference.id);
  return id ? { entry, id } : null;
}

/**
 * The face a page of another origin draws the reference `href` with (core
 * reference-faces.ts): what its element shows now. Null where the element
 * would be its label alone: an unknown kind, an id the dashboard holds
 * nothing by, or while the hub is asked.
 */
export function referenceFace(href: string): ReferenceFace | null {
  const found = held(href);
  return found ? found.entry.face(found.id) : null;
}

/**
 * A page's press on the reference `href`, from `here`'s panel: it opens as
 * its element pressed opens. The refusal's words, or null once it opened;
 * a reference the dashboard holds nothing by is said so.
 */
export function followReference(
  href: string,
  here?: string
): Promise<string | null> {
  const found = held(href);
  return found
    ? found.entry.follow(found.id, here)
    : Promise.resolve(
        "It was not opened: the hub holds nothing by that link now."
      );
}
