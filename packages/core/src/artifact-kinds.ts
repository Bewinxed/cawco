/** Every kind of artifact ({@link ArtifactKind}). */
export const ARTIFACT_KINDS = [
  "page",
  "canvas",
  "preview",
  "component",
  "browser",
] as const;
/**
 * The kinds of artifact (WORDS.md): HTML the agent wrote, a drawing, a dev
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
