/**
 * The artifacts a written word names (`[label](cawco:artifact/<id>)`,
 * `cawco:pin/<artifact>/<number>`, `cawco:decision/<artifact>/<card>`, core
 * references.ts), as the chips that draw them read them: which session's
 * panel holds the artifact, its kind and name, and its pins and picks.
 *
 * An artifact a pane holds (PreviewPane, {@link holdArtifact}) is read from
 * the doc that pane joins, live. Any other is asked of the hub once
 * (`GET /api/artifacts/<id>`, then its pins by the person's read, which
 * counts as no one's hearing), and the answer is kept for this tab; one the
 * hub holds no longer is null, and its chip is its label alone.
 *
 * A press on a chip asks the panel to open the artifact at a place
 * ({@link askOpen}): the request stands until the pane holding that artifact
 * has its page and its pins, and is taken once ({@link takeOpen}), so a
 * press made before the page is ready still lands.
 */
import type { ArtifactKind, ChoiceEntry } from "@cawco/core";
import type { Pin } from "@cawco/core/comments";
import { SvelteMap } from "svelte/reactivity";
import { browser } from "$app/env";
import { findArtifact } from "./artifact-api";

/** An artifact as a chip names it. */
export interface NamedArtifact {
  instanceId: string;
  kind: ArtifactKind;
  name: string;
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
/** Ids asked of the hub and not answered yet: never asked twice at once. */
const asking = new Set<string>();

/** The pane holding artifact `id` says what it is, so a chip never asks the hub for it. */
export function noteArtifact(id: string, named: NamedArtifact): void {
  const was = answered.get(id);
  if (
    !was ||
    was.name !== named.name ||
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
  fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/artifacts/comments?artifact=${encodeURIComponent(id)}&filter=all`
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
    });
}

/** Asks the hub what artifact `id` is, once; the browser asks ({@link askPins}). */
function ask(id: string): void {
  if (!browser || asking.has(id)) {
    return;
  }
  asking.add(id);
  findArtifact(id)
    .then((found) => {
      answered.set(id, {
        instanceId: found.instanceId,
        kind: found.kind,
        name: found.name,
      });
    })
    .catch(() => {
      // Gone, or never one: its chip is its label alone.
      answered.set(id, null);
    })
    .finally(() => {
      asking.delete(id);
    });
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

/** Where a press opens an artifact: at a pin's thread, at a decision card, or at its top. */
export type OpenAt = { pin: number } | { card: string } | { top: true };

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
