import type { AfterLinks } from "@cawco/core/decisions";
import type { problem } from "elysia";
import type { FolderProblem } from "./decision-page";
import type { changeFolderFiles, folderFileNames } from "./project-folder";
import type { ProblemsOf } from "./refusal";
import type { Tasks } from "./tasks";

/** Every problem a decisions dep answers: a folder file's read, a commit, a listing or the tasks' list. */
export type DecisionProblem =
  | FolderProblem
  | ProblemsOf<ReturnType<typeof changeFolderFiles>>
  | ProblemsOf<ReturnType<typeof folderFileNames>>
  | ProblemsOf<ReturnType<Tasks["list"]>>;

/** What page `name` drawn with `cards` does to its project's links, or why it is not said (decisions.ts `linksOf`): a project the hub does not keep is refused. */
export type DecisionLinks =
  | AfterLinks
  | DecisionProblem
  | ReturnType<
      typeof problem<404, { code: "decision-project-unknown"; detail: string }>
    >;
