/**
 * How each reference kind looks, one entry per kind and nowhere else: the
 * one place the chosen design of each kind's chip is applied (the artifact panel's surface brief, A
 * pin's, a card's and an artifact's chip). Nothing of a chip's behaviour
 * (what it names, its peek, its press) reads anything here, and nothing of
 * its look is written anywhere but here.
 *
 * Until that design is chosen, every kind below is today's shared inline
 * chip (ui/chip `inline`): no mark of its own, its label, and its state
 * after the label in the muted ink. The owner asked for a design that tells
 * the kinds apart; it replaces these entries.
 */
import type { ReferenceMark } from "@cawco/core/reference-faces";
import type { Component } from "svelte";
import { IconDecisions, IconRefresh } from "#lib/icons.js";
import { ARTIFACT_GLYPH } from "./artifact-glyph";
import { type MarkHue, markHue, sessionSprite } from "./mark";
import type { ThingKind } from "./reference-things.svelte";

/** A kind's look on the shared inline chip. */
export interface ReferenceLook {
  /** Its mark before its label, a 16px glyph; null: no mark. */
  mark: Component<{ class?: string }> | null;
  /** The classes its state words take after its label. */
  state: string;
}

/** Today's shared look: the inline chip as it is, no mark, the state in the muted ink. */
const SHARED: ReferenceLook = { mark: null, state: "text-ink-muted" };

export const REFERENCE_LOOKS: Record<ThingKind, ReferenceLook> = {
  task: SHARED,
  todo: SHARED,
  plan: SHARED,
  step: SHARED,
  routine: SHARED,
  project: SHARED,
  machine: SHARED,
};

/** A mark as ReferenceFace draws it: its glyph, tinted by `tone`, or on a session's `hue`. */
export interface MarkLook {
  glyph: Component<{ class?: string }>;
  hue?: MarkHue;
  tone?: string;
}

/**
 * Each mark a reference's chip wears before its words (core
 * reference-faces.ts `ReferenceMark`): a session's sprite on its hue, an
 * artifact's kind's glyph (an artifact's chip, a pin's), a decision page's
 * glyph (a card's), and the change glyph in the change ring's ink.
 */
export function markLook(mark: ReferenceMark): MarkLook {
  switch (mark.of) {
    case "session":
      return { glyph: sessionSprite(mark.seed), hue: markHue(mark.place) };
    case "artifact":
      return { glyph: ARTIFACT_GLYPH[mark.kind] };
    case "decision":
      return { glyph: IconDecisions };
    case "change":
      return { glyph: IconRefresh, tone: "text-c-change-ring" };
    default:
      return mark satisfies never;
  }
}
