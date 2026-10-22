/**
 * How each reference kind looks, one entry per kind and nowhere else: the
 * one place the chosen design of each kind's chip is applied (DESIGN.md, A
 * pin's, a card's and an artifact's chip). Nothing of a chip's behaviour
 * (what it names, its peek, its press) reads anything here, and nothing of
 * its look is written anywhere but here.
 *
 * Until that design is chosen, every kind below is today's shared inline
 * chip (ui/chip `inline`): no mark of its own, its label, and its state
 * after the label in the muted ink. The owner asked for a design that tells
 * the kinds apart; it replaces these entries.
 */
import type { Component } from "svelte";
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
  workflow: SHARED,
  project: SHARED,
  machine: SHARED,
};
