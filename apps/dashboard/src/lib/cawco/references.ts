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
 */
import {
  changeReference,
  decisionReference,
  parseReference,
  pinReference,
  type ReferenceKind,
} from "@cawco/core";
import type { Component } from "svelte";
import ArtifactReference from "./ArtifactReference.svelte";
import { artifactNamed } from "./artifact-names.svelte";
import ChangeReference from "./ChangeReference.svelte";
import DecisionReference from "./DecisionReference.svelte";
import {
  type Drawn,
  type ElementProps,
  plainReferenceOf,
} from "./markdown-fleet";
import PinReference from "./PinReference.svelte";
import { type ThingKind, thingNamed } from "./reference-things.svelte";
import SessionReference from "./SessionReference.svelte";
import { sessionNamed } from "./session-names.svelte";
import ThingReference from "./ThingReference.svelte";

interface ReferenceElement {
  /** What draws it. */
  readonly element: Component<ElementProps>;
  /** The id as the dashboard holds it, or null when it holds none by that id. */
  find: (id: string) => string | null;
}

/**
 * A task, a to-do, a plan, a step, a routine, a project or a machine
 * (reference-things.svelte.ts): drawn as its chip
 * (ThingReference) once the dashboard holds it or the hub named it.
 */
const thing = (kind: ThingKind): ReferenceElement => ({
  find: (id) => (thingNamed(kind, id) ? id : null),
  get element() {
    return ThingReference as unknown as Component<ElementProps>;
  },
});

/** An id whose artifact part the dashboard holds or the hub names; null while it is asked, and when it names none. */
const ofArtifact = (id: string, artifact: string | undefined): string | null =>
  artifact && artifactNamed(artifact) ? id : null;

export const REFERENCE_ELEMENTS: Record<ReferenceKind, ReferenceElement> = {
  /**
   * A session, delegate or Caw thread, by its full id, a
   * short one or its handle (session-names.svelte.ts): a row of the
   * instance index, else the session the hub's names hold. A thread is
   * written by its own id (hub caw.ts) and listed by its tab's,
   * `thread:<id>` (thread-tabs.ts).
   */
  session: {
    find: sessionNamed,
    // Read when drawn, not when this module loads: the element's own
    // imports reach the markdown that imports this registry.
    get element() {
      return SessionReference;
    },
  },
  /** A pin, by its artifact and number (`<artifact>/<number>`): its artifact held or named (artifact-names.svelte.ts). */
  pin: {
    find: (id) => ofArtifact(id, pinReference(id)?.artifact),
    get element() {
      return PinReference;
    },
  },
  /** A spot an update changed, by its artifact and anchor (`<artifact>/<anchor>`). */
  change: {
    find: (id) => ofArtifact(id, changeReference(id)?.artifact),
    get element() {
      return ChangeReference;
    },
  },
  /** A decision card, by its artifact and id (`<artifact>/<card>`). */
  decision: {
    find: (id) => ofArtifact(id, decisionReference(id)?.artifact),
    get element() {
      return DecisionReference;
    },
  },
  /** An artifact, by its id. */
  artifact: {
    find: (id) => ofArtifact(id, id),
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
  if (!isKind(reference.kind)) {
    return { draw: "label" };
  }
  const entry = REFERENCE_ELEMENTS[reference.kind];
  const id = entry.find(reference.id);
  return id
    ? { draw: "element", element: entry.element, id, kind: reference.kind }
    : { draw: "label" };
}
