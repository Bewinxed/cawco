import type { problem } from "elysia";
import type { BuiltProgram, buildProgram } from "./decision-program";
import type { AwayProblem } from "./machine-answers";
import type { changeFolderFiles, readFolderFile } from "./project-folder";
import type { ProblemsOf } from "./refusal";

/** Why a page's source was not read from, or kept in, its project's folder: the folder's own problems (project-folder.ts). */
export type PageFolderProblem =
  | ProblemsOf<ReturnType<typeof readFolderFile>>
  | ProblemsOf<ReturnType<typeof changeFolderFiles>>;

/** Why a page's source was not found, or not said, where it was asked from (artifact-pages.ts `artifactPageSources`, `programFrom`). */
type PageSourceProblem =
  | ReturnType<
      typeof problem<400, { code: "page-program-missing"; detail: string }>
    >
  | ReturnType<
      typeof problem<400, { code: "page-source-unnamed"; detail: string }>
    >
  | ReturnType<
      typeof problem<404, { code: "page-source-missing"; detail: string }>
    >
  | ReturnType<
      typeof problem<404, { code: "page-unpublished"; detail: string }>
    >
  | AwayProblem
  | ReturnType<
      typeof problem<504, { code: "page-machine-late"; detail: string }>
    >;

/** A page built, its project's folder kept as it was or written, or why not (artifact-pages.ts `keptArtifactPage`): the source's, the folder's, the program's, or the page's own. */
export type PageBuilt =
  | { html: string; program?: BuiltProgram }
  | PageFolderProblem
  | PageSourceProblem
  | ProblemsOf<ReturnType<typeof buildProgram>>
  | ReturnType<typeof problem<422, { code: "page-unbuilt"; detail: string }>>;
