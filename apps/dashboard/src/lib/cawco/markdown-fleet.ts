/**
 * What markdown reads of the fleet, provided by its host: how a `cawco:`
 * reference draws (references.ts, its chips reading the live store) and the
 * skill chip a code span naming a session's skill draws as. The app's
 * hosts hand in the live one (markdown-live.ts); markdown drawn with none
 * (a component on the stage, a comment card's thread) draws each reference
 * as its written label, a code span as code, and never loads the store.
 */
import type { ReferenceKind } from "@cawco/core";
import type { Component } from "svelte";
import { getContext, setContext } from "svelte";
import type { Skill } from "./skill-chips";

/** What a reference's element is given: the id `find` answered, its kind, and the link's written label. */
export interface ElementProps {
  id: string;
  kind: ReferenceKind;
  label?: string;
}

/** What a written link draws as: a reference's element, its label alone, or a link. */
export type Drawn =
  | { draw: "link" }
  | { draw: "label" }
  | {
      draw: "element";
      element: Component<ElementProps>;
      id: string;
      kind: ReferenceKind;
    };

export interface MarkdownFleet {
  /** What a written link whose destination is `href` draws as. */
  referenceOf: (href: string) => Drawn;
  /** A skill's chip. */
  SkillChip: Component<{ skill: Skill }>;
}

const KEY = Symbol("markdown-fleet");

/** What the markdown under this component reads of the fleet; `fleet` may answer none until it has loaded. */
export function provideMarkdownFleet(
  fleet: () => MarkdownFleet | undefined
): void {
  setContext(KEY, fleet);
}

/** What a host above provides, or nothing when none does. */
export const markdownFleetAbove = ():
  (() => MarkdownFleet | undefined) | undefined =>
  getContext<() => MarkdownFleet | undefined>(KEY);

/** What the markdown here reads of the fleet: none where no host provides it. */
export const markdownFleetHere = (): (() => MarkdownFleet | undefined) =>
  markdownFleetAbove() ?? (() => undefined);

/** A link drawn with no fleet: a `cawco:` reference as its written label, any other a link. */
export const plainReferenceOf = (href: string): Drawn =>
  href.startsWith("cawco:") ? { draw: "label" } : { draw: "link" };

/** A backslash escape in a link's label (core `referenceLink` writes them). */
const ESCAPED = /\\([\\[\]])/g;

/** A link's label as written, its escapes read: what an element falls back to. */
export const writtenLabel = (text: string | undefined): string =>
  (text ?? "").replace(ESCAPED, "$1");
