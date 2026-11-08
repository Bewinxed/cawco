/** Every kind of artifact ({@link ArtifactKind}). */
export const ARTIFACT_KINDS = [
  "page",
  "canvas",
  "preview",
  "component",
  "browser",
] as const;
/**
 * The kinds of artifact: HTML the agent wrote, a drawing, a dev
 * server or folder shown live, a sheet: a story file's stories, each a
 * real component mounted by the project's own toolchain (core `stage.ts`),
 * and the project's browser, listed for every session of the project (or of
 * the machine, for the machine's browser). A browser's source is its key as
 * a page (`{ page: "project:<id>" }`): the hub holds it, no machine's
 * preview listener serves it, and every installed app reads that shape.
 */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * The kinds a session makes and keeps in sync with its page: every kind but
 * the browser, which the hub holds for the project.
 */
export const MADE_ARTIFACT_KINDS = [
  "page",
  "component",
  "preview",
  "canvas",
] as const satisfies readonly ArtifactKind[];
export type MadeArtifactKind = (typeof MADE_ARTIFACT_KINDS)[number];

/** An artifact's name: lowercase letters, digits and dashes, like `onboarding`. */
export const ARTIFACT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/** What the person does on an artifact: the reason it is in their panel. */
export const ARTIFACT_DOES = ["pick", "judge", "try", "draw"] as const;
export type ArtifactDoes = (typeof ARTIFACT_DOES)[number];
/** The ask's length: one line in the panel's head. */
export const ASK_LIMIT = 160;
/** A title's length: the panel head's name, a menu row, a chip. */
export const ARTIFACT_TITLE_LIMIT = 80;
/** Words the owner banned from anything that reaches him. */
export const ASK_BANNED = /\b(tap|poke)(s|ped|ping)?\b/iu;
/** A path or a file in the ask: the person's words carry neither. */
export const ASK_PATHLIKE =
  /(^|[\s(])[\w.-]*\/[\w.-]+\.[a-z]{1,5}\b|\b[\w-]+\.(svelte|tsx?|png|webp|jpe?g|oui|html)\b/iu;
/** Desk captures one page for judging or picking may hold: past it, the page is a catalogue of pictures drawn at a fraction of their size in the panel. */
export const DESK_CAPTURES_PER_PAGE = 2;
/** A capture wider than this many pixels is a desk capture: the panel is 600px beside the transcript, 390px on a phone. */
export const DESK_CAPTURE_WIDTH = 1600;
