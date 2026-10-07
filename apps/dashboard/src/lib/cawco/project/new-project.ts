/**
 * New project (design §5): the templates its cards offer, which one fits
 * what the person typed, and the name the project takes from it.
 */

import type { Component } from "svelte";
import {
  IconChat,
  IconPalette,
  IconPenLine,
  IconRocket,
  IconSearch,
  IconToolCode,
} from "#lib/icons.js";

/** A template New project offers: the hub's stages template of the same name (stages.ts). */
export type TemplateName =
  | "code"
  | "launch"
  | "seo"
  | "brand"
  | "design"
  | "social";

export interface TemplateCard {
  /** The tile glyph's section hue. */
  hue: string;
  /** Its glyph on the card's icon tile (Solar duotone). */
  icon: Component;
  /** What its work runs through, in one sentence-case line. */
  meta: string;
  name: string;
  template: TemplateName;
}

export const TEMPLATE_CARDS: readonly TemplateCard[] = [
  {
    template: "code",
    icon: IconToolCode,
    hue: "var(--hue-cyan-500)",
    name: "Code",
    meta: "Tasks worked on, reviewed by you, then landed",
  },
  {
    template: "launch",
    icon: IconRocket,
    hue: "var(--hue-orange-500)",
    name: "Launch campaign",
    meta: "Pieces planned, made, reviewed and sent live",
  },
  {
    template: "seo",
    icon: IconSearch,
    hue: "var(--hue-green-500)",
    name: "SEO program",
    meta: "Topics briefed, drafted, published and measured",
  },
  {
    template: "brand",
    icon: IconPalette,
    hue: "var(--hue-amber-500)",
    name: "Brand kit",
    meta: "Voice, colour and type drawn from a source",
  },
  {
    template: "design",
    icon: IconPenLine,
    hue: "var(--hue-cyan-400)",
    name: "Design",
    meta: "Variants explored, one picked and built",
  },
  {
    template: "social",
    icon: IconChat,
    hue: "var(--hue-green-600)",
    name: "Social",
    meta: "Posts drafted, reviewed, scheduled and measured",
  },
];

/** The starter chips: a press puts its words in the field. */
export const STARTERS = [
  "Set up a board for a repo",
  "Plan the Q4 launch",
  "Audit top pages Mondays",
  "Turn a voice doc into a brand kit",
] as const;

/** A URL, or a path (`/srv/site`, `~/code/site`, `./site`). */
const URL_OR_PATH =
  /\bhttps?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+\/\S+|(?:^|\s)(?:~|\.{1,2})?\/[\w.-]+(?:\/[\w.-]+)*/;

/** The fit rule, first match wins; "repo" counts with URLs and paths, as the code chip names one. */
const RULES: readonly [RegExp, TemplateName][] = [
  [URL_OR_PATH, "code"],
  [/\brepo(?:sitory)?\b/i, "code"],
  [/\b(?:launch|campaign)/i, "launch"],
  [/\b(?:seo|audit|pages?)\b/i, "seo"],
  [/\b(?:voice|brand)/i, "brand"],
  [/\b(?:design|screens?)\b/i, "design"],
  [/\b(?:posts?|social)\b/i, "social"],
  // X, the network: the capital letter alone, so "x" in "2x" is not it.
  [/\bX\b/, "social"],
];

/** The template the words fit, or null. */
export function fitOf(words: string): TemplateName | null {
  const text = words.trim();
  if (!text) {
    return null;
  }
  return RULES.find(([rule]) => rule.test(text))?.[1] ?? null;
}

const TRAILING = /[/\s]+$/;
const GIT_SUFFIX = /\.git$/;
const LAST_SEGMENT = /([^/\s]+)\/?$/;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
 * The name a project takes from the words that start it: a URL's or path's
 * last segment (`github.com/you/site` → `site`, `site.git` → `site`), else
 * its first three words.
 */
export function nameFrom(words: string): string {
  const located = URL_OR_PATH.exec(words)?.[0]?.trim();
  if (located) {
    const segment = LAST_SEGMENT.exec(located.replace(TRAILING, ""))?.[1];
    if (segment) {
      return segment.replace(GIT_SUFFIX, "");
    }
  }
  return (words.match(WORD) ?? []).slice(0, 3).join(" ");
}
