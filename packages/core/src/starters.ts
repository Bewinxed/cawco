/**
 * A project's starters: what an empty board (StarterCards) and Caw's panel
 * hero (CawStarters) offer to say to Caw, written for that project from what
 * it holds now (hub project-starters.ts, asked of Jev in jev-placement.ts).
 * Each carries why it is offered and what in the project it comes from.
 */

/**
 * The kinds of work a starter names, each drawn by the dashboard as its
 * Solar duotone glyph (CawStarters, StarterCards).
 */
export const STARTER_GLYPHS = [
  "brief",
  "bug",
  "calendar",
  "draft",
  "explore",
  "grill",
  "ideas",
  "mail",
  "palette",
  "people",
  "refresh",
  "reply",
  "rocket",
  "routine",
  "screen",
  "search",
  "site",
  "stages",
  "system",
  "tasks",
  "triage",
  "voice",
] as const;
export type StarterGlyph = (typeof STARTER_GLYPHS)[number];

/** What in a project a starter comes from. */
export const STARTER_SOURCE_KINDS = [
  "task",
  "thread",
  "path",
  "commit",
  "routine",
] as const;
export type StarterSourceKind = (typeof STARTER_SOURCE_KINDS)[number];

/** One thing a starter comes from: a task id, a thread id, a folder path, a commit sha, a routine id. */
export interface StarterSource {
  kind: StarterSourceKind;
  ref: string;
}

/**
 * One starter: a sentence the person would say to Caw, put in the composer
 * when pressed (nothing is sent), the glyph for its kind of work, why it is
 * offered, and what it comes from.
 */
export interface ProjectStarter {
  glyph: StarterGlyph;
  /** Why it is offered, naming what in the project it comes from; at most 120 characters. */
  reason: string;
  sources: StarterSource[];
  /** At most 90 characters. */
  text: string;
}

/** What the person did with a starter: sent it as it stood, sent it changed, or let it be replaced unpressed. */
export type StarterOutcome = "picked" | "edited" | "ignored";

/**
 * Hub-originated: a project's starters were written again; the whole set,
 * in its order (empty when none is offered, Jev off included).
 */
export interface StartersChangedFrame {
  instanceId?: undefined;
  kind: "starters.changed";
  projectId: string;
  starters: ProjectStarter[];
}
