/**
 * New project (design §5): the templates its cards offer, which one fits
 * what the person typed, and the name the project takes from it.
 */

/** A template New project offers: the hub's stages template of the same name (stages.ts). */
export type TemplateName =
  | "code"
  | "launch"
  | "seo"
  | "brand"
  | "design"
  | "social";

export interface TemplateCard {
  /** What kind of work it is, in the code role. */
  kind: string;
  /** Its stages, first to last: the one meta line. */
  meta: string;
  name: string;
  template: TemplateName;
}

export const TEMPLATE_CARDS: readonly TemplateCard[] = [
  {
    template: "code",
    kind: "code",
    name: "Code",
    meta: "Ready → working → review → done",
  },
  {
    template: "launch",
    kind: "knowledge",
    name: "Launch campaign",
    meta: "Plan → make → review → live",
  },
  {
    template: "seo",
    kind: "knowledge",
    name: "SEO program",
    meta: "Topic → brief → draft → published",
  },
  {
    template: "brand",
    kind: "knowledge",
    name: "Brand kit",
    meta: "Source → extract → review → kit",
  },
  {
    template: "design",
    kind: "design",
    name: "Design",
    meta: "Brief → explore → review → build",
  },
  {
    template: "social",
    kind: "social",
    name: "Social",
    meta: "Idea → draft → review → posted",
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
