import type { ProjectNote } from "@cawco/core/project-conversation";
import type { StagesTemplate } from "@cawco/core/views";
import type { problem } from "elysia";
import type { PlaceRow, ProjectRow } from "./db/projects";

export interface ProjectAsk {
  /** Made with Caw: a new project's Caw starts on. */
  caw?: boolean;
  checkout?: { machineId: string; cwd: string };
  name: string;
  /** What its setup conversation opens with: your prompt, or a note of where the project came from. */
  setup?: {
    note?: ProjectNote;
    prompt?: string;
    promptId?: string;
  };
  /** The template tapped on New project, kept as tapped until the setup page is sent. */
  tapped?: StagesTemplate;
}
export interface ProjectMade {
  joined: boolean;
  place: PlaceRow;
  placeAdded: boolean;
  project: ProjectRow;
}

/** Why a project is not made or joined: a folder that is no absolute path on its machine, or a paused machine's (project-joining.ts `createOrJoinProject`). */
export type ProjectMakeProblem =
  | ReturnType<
      typeof problem<
        400,
        { code: "project-checkout-path-unfit"; detail: string }
      >
    >
  | ReturnType<
      typeof problem<409, { code: "project-machine-paused"; detail: string }>
    >;

/** Makes the project asked for, or joins the one that has the folder's remote (project-joining.ts `createOrJoinProject`). */
export type CreateOrJoinProject = (
  asked: ProjectAsk
) => Promise<ProjectMade | ProjectMakeProblem>;
