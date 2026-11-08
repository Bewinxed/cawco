/**
 * The artifacts a written word names (`[label](cawco:artifact/<id>)`,
 * `cawco:pin/<artifact>/<number>`, `cawco:decision/<artifact>/<card>`, core
 * references.ts), as the chips that draw them read them: which session's
 * panel holds the artifact, its kind, name and title, and its pins and picks.
 *
 * An artifact a pane holds (PreviewPane, {@link holdArtifact}) is read from
 * the doc that pane joins, live. Any other is asked of the hub once
 * (`GET /api/artifacts/<id>`, then its pins by the person's read, which
 * counts as no one's hearing), and the answer is kept for this tab; one the
 * hub holds no longer (404) is null, and its chip is its label alone. A read
 * that failed otherwise (the hub unreached, a 5xx) keeps nothing: it says
 * why in one line, and the next draw asks again.
 *
 * A press on a chip asks the panel to open the artifact at a place
 * ({@link askOpen}): the request stands until the pane holding that artifact
 * has its page and its pins, and is taken once ({@link takeOpen}), so a
 * press made before the page is ready still lands.
 */
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import type { ArtifactPlace } from "@cawco/core/artifact-needs";
import type { ChoiceEntry } from "@cawco/core/choices";
import type { Pin } from "@cawco/core/comments/model";
import { hubRequest } from "@cawco/core/hub-request";
import { pinReference } from "@cawco/core/references";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { hubFetch } from "#lib/cawco/hub-read.js";
import { browser } from "$app/env";
import { ArtifactRefused, findArtifact } from "./artifact-api";

/** An artifact as a chip names it. */
export interface NamedArtifact {
  instanceId: string;
  kind: ArtifactKind;
  /** Its slug, which a Decisions address names a project's page by. */
  name: string;
  /** Its project, for a project's page (core `ArtifactSummary.project`): a setup page's lands by core `setupLanding`. */
  project?: string;
  /** What its chip names it by. */
  title: string;
}

/** What a chip reads of an artifact's doc: its pins and picks. */
export interface HeldMarks {
  choices: Record<string, ChoiceEntry>;
  pins: Pin[];
}

/** Each artifact the hub answered for, or null when it holds none by that id. */
const answered = new SvelteMap<string, NamedArtifact | null>();
/** Each artifact's doc as a pane holds it now. */
const held = new SvelteMap<string, HeldMarks>();
/** Each artifact's pins as the hub last answered them, for one no pane holds. */
const read = new SvelteMap<string, HeldMarks>();
/** Artifacts whose pins the hub was asked for and has answered, or refused: what a pin's chip can know of them, it knows. */
const pinsAnswered = new SvelteSet<string>();
/** Pins asked of the hub and not answered yet: never asked twice at once. */
const asking = new Set<string>();

/** The pane holding artifact `id` says what it is, so a chip never asks the hub for it. */
export function noteArtifact(id: string, named: NamedArtifact): void {
  const was = answered.get(id);
  if (
    !was ||
    was.name !== named.name ||
    was.title !== named.title ||
    was.kind !== named.kind ||
    was.instanceId !== named.instanceId
  ) {
    answered.set(id, named);
  }
}

/** A pane holds artifact `id`'s doc: its pins and picks as they stand now. */
export function holdArtifact(id: string, marks: HeldMarks): void {
  held.set(id, marks);
}

/** The pane let artifact `id`'s doc go: a chip reads the hub again. */
export function releaseArtifact(id: string): void {
  held.delete(id);
  read.delete(id);
}

/**
 * The browser asks, from its own origin: the server's render has no origin
 * to fetch a relative URL from, and these answers are this tab's, never
 * shared across requests. It draws the chip by its label, and hydration asks.
 */
function askPins(id: string, instanceId: string): void {
  const key = `pins:${id}`;
  if (!browser || asking.has(key)) {
    return;
  }
  asking.add(key);
  hubFetch(
    hubRequest("GET /api/instances/:id/artifacts/comments", {
      path: { id: instanceId },
      query: { artifact: id, filter: "all" },
    })
  )
    .then(async (response) => {
      if (!response.ok) {
        return;
      }
      const answer = (await response.json()) as {
        artifacts: { id: string; pins: Pin[] }[];
      };
      read.set(id, {
        choices: {},
        pins: answer.artifacts.find((one) => one.id === id)?.pins ?? [],
      });
    })
    .catch((error: unknown) => {
      console.error(`[cawco] reading ${id}'s pins failed:`, error);
    })
    .finally(() => {
      asking.delete(key);
      pinsAnswered.add(id);
    });
}

/** Each read of the hub asked and not answered yet, by id: a press waits on the one a draw began. */
const reading = new Map<string, Promise<void>>();

/** Asks the hub what artifact `id` is, once it answers; the browser asks ({@link askPins}). */
function ask(id: string): Promise<void> {
  const already = reading.get(id);
  if (!browser || already) {
    return already ?? Promise.resolve();
  }
  const found = findArtifact(id)
    .then((one) => {
      answered.set(id, {
        instanceId: one.instanceId,
        kind: one.kind,
        name: one.name,
        title: one.title,
        ...(one.project ? { project: one.project } : {}),
      });
    })
    .catch((error: unknown) => {
      if (error instanceof ArtifactRefused && error.status === 404) {
        // Gone, or never one: its chip is its label alone.
        answered.set(id, null);
        return;
      }
      const why = error instanceof Error ? error.message : String(error);
      console.error(`[cawco] reading artifact ${id} failed: ${why}`);
    })
    .finally(() => {
      reading.delete(id);
    });
  reading.set(id, found);
  return found;
}

/**
 * What artifact `id` is, once the hub has answered: a press made before
 * the chip's own read came back waits for it, so the first press lands
 * (null: the hub holds none by that id, or could not be read).
 */
export async function artifactNamedNow(
  id: string
): Promise<NamedArtifact | null> {
  const known = answered.get(id);
  if (known !== undefined) {
    return known;
  }
  await ask(id);
  return answered.get(id) ?? null;
}

/**
 * Artifact `id` as a chip names it: what a pane holds, else the hub's
 * answer. Null while the hub is asked, and when it holds none by that id.
 */
export function artifactNamed(id: string): NamedArtifact | null {
  const known = answered.get(id);
  if (known !== undefined) {
    return known;
  }
  ask(id);
  return null;
}

/** Artifact `id`'s pins and picks: the pane's live doc, else the hub's last answer (asked once). */
export function artifactMarks(id: string): HeldMarks | null {
  const live = held.get(id);
  if (live) {
    return live;
  }
  const kept = read.get(id);
  if (kept) {
    return kept;
  }
  const named = artifactNamed(id);
  if (named) {
    askPins(id, named.instanceId);
  }
  return null;
}

/**
 * The pin a link names (`<artifact>/<number>`, core `pinReference`), as
 * {@link artifactMarks} holds it: null while its pins are asked, and when it
 * names none.
 */
export function pinNamed(id: string): Pin | null {
  const at = pinReference(id);
  return at
    ? (artifactMarks(at.artifact)?.pins.find(
        (one) => one.number === at.number
      ) ?? null)
    : null;
}

/**
 * Whether what a chip can know of artifact `id`'s pins is known: a pane
 * holds its doc, or the hub answered (or refused) the pins it was asked
 * for. A pin's chip is drawn once it is, so the name it shows at its first
 * paint is the one it keeps (references.ts).
 */
export function artifactMarksKnown(id: string): boolean {
  return artifactMarks(id) !== null || pinsAnswered.has(id);
}

/** Where a press opens an artifact: core `ArtifactPlace`, which its address (`?stop=`) and the hub's show carry too. */
export type OpenAt = ArtifactPlace;

/** The open each artifact's pane is asked for; a second press asks again with a new object. */
const asked = new SvelteMap<string, OpenAt>();

/** A press asks the pane holding artifact `id` to open it at `at`. */
export function askOpen(id: string, at: OpenAt): void {
  asked.set(id, { ...at });
}

/** What the pane holding artifact `id` is asked to open, read where it is drawn. */
export function openAsked(id: string): OpenAt | null {
  return asked.get(id) ?? null;
}

/** The pane opened what it was asked for: taken once. */
export function takeOpen(id: string): void {
  asked.delete(id);
}
