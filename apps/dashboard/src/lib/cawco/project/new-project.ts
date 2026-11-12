/**
 * New project (design §5): the templates its cards offer, and which one fits
 * what the person typed: a hint where Caw peeks, never the pick (only a tap
 * picks a card). The project takes no name from the words: Caw names it.
 */

import { OFFERED_TEMPLATES, type OfferedTemplate } from "@cawco/core/views";
import type { Component } from "svelte";
import {
  IconChat,
  IconFileCode,
  IconPalette,
  IconPenLine,
  IconRocket,
  IconSearch,
} from "#lib/icons.js";

/** A template New project offers: core's one list, which `project_setup` lists too. */
export type TemplateName = OfferedTemplate;

export interface TemplateCard {
  /** The tile glyph's section hue (decision page `onboarding-design`, card `card-hues`: each card's own). */
  hue: string;
  /** Its glyph on the card's icon tile (Solar duotone). */
  icon: Component;
  /** What its work runs through, in one sentence-case line. */
  meta: string;
  name: string;
  template: TemplateName;
}

/** Each offered template's card, by name: a template added to core's list is a type error here until it has one. */
const CARDS: Record<TemplateName, Omit<TemplateCard, "template">> = {
  code: {
    icon: IconFileCode,
    hue: "var(--color-hue-cyan-500)",
    name: "Code",
    meta: "Tasks worked on, reviewed by you, then landed",
  },
  launch: {
    icon: IconRocket,
    hue: "var(--color-hue-orange-500)",
    name: "Launch campaign",
    meta: "Pieces planned, made, reviewed and sent live",
  },
  seo: {
    icon: IconSearch,
    hue: "var(--color-hue-green-500)",
    name: "SEO program",
    meta: "Topics briefed, drafted, published and measured",
  },
  brand: {
    icon: IconPalette,
    hue: "var(--color-hue-amber-500)",
    name: "Brand kit",
    meta: "Voice, colour and type drawn from a source",
  },
  design: {
    icon: IconPenLine,
    hue: "var(--color-hue-cyan-400)",
    name: "Design",
    meta: "Variants explored, one picked and built",
  },
  social: {
    icon: IconChat,
    hue: "var(--color-hue-green-600)",
    name: "Social",
    meta: "Posts drafted, reviewed, scheduled and measured",
  },
};

/** The cards New project shows, in core's order. */
export const TEMPLATE_CARDS: readonly TemplateCard[] = OFFERED_TEMPLATES.map(
  (template) => ({ template, ...CARDS[template] })
);

/** The starter chips: a press puts its words in the field. */
export const STARTERS = [
  "Set up a board for a repo",
  "Plan the Q4 launch",
  "Audit top pages Mondays",
  "Turn a voice doc into a brand kit",
] as const;

/** A URL, or a path (`/srv/site`, `~/code/site`, `./site`). */
const URL_OR_PATH =
  /\bhttps?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+\/\S+|(?:^|\s)(?:~|\.{1,2})?\/[\w.-]+(?:\/[\w.-]+)*/u;

/** The fit rule, first match wins; "repo" counts with URLs and paths, as the code chip names one. */
const RULES: readonly [RegExp, TemplateName][] = [
  [URL_OR_PATH, "code"],
  [/\brepo(?:sitory)?\b/iu, "code"],
  [/\b(?:launch|campaign)/iu, "launch"],
  [/\b(?:seo|audit|pages?)\b/iu, "seo"],
  [/\b(?:voice|brand)/iu, "brand"],
  [/\b(?:design|screens?)\b/iu, "design"],
  [/\b(?:posts?|social)\b/iu, "social"],
  // X, the network: the capital letter alone, so "x" in "2x" is not it.
  [/\bX\b/u, "social"],
];

/** The template the words fit, or null. */
export function fitOf(words: string): TemplateName | null {
  const text = words.trim();
  if (!text) {
    return null;
  }
  return RULES.find(([rule]) => rule.test(text))?.[1] ?? null;
}
