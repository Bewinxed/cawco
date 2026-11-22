import type { ProjectNote } from "@cawco/core/project-conversation";
import type { StagesTemplate } from "@cawco/core/views";
import type { problem } from "elysia";
import type { PlaceRow, ProjectRow } from "./db/projects";
import type { ScratchPlaceProblem } from "./project-place-scratch";

export interface ProjectAsk {
  /** Made with Caw: a new project's Caw starts on. */
  caw?: boolean;
  checkout?: { machineId: string; cwd: string };
  name: string;
  /**
   * A new project only: a folder a project holds already, as a place or by
   * its repository's remote, is refused (`project-folder-held`), never
   * joined. A session's `project_create` asks so (project-create.ts).
   */
  newOnly?: true;
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
  /**
   * The conversation a project made with a prompt started, by its session's
   * id once it has; undefined when it did not start (caw.ts `setup` logs
   * why, and the project's page says it). Absent for a project joined or
   * made without a prompt.
   */
  conversation?: Promise<string | undefined>;
  joined: boolean;
  place: PlaceRow;
  placeAdded: boolean;
  project: ProjectRow;
}

/** Why a project is not made or joined: a folder that is no absolute path on its machine, one in its scratch root, a paused machine's, or, for a new project only, one a project holds (project-joining.ts `createOrJoinProject`). */
export type ProjectMakeProblem =
  | ScratchPlaceProblem
  | ReturnType<
      typeof problem<
        400,
        { code: "project-checkout-path-unfit"; detail: string }
      >
    >
  | ReturnType<
      typeof problem<409, { code: "project-machine-paused"; detail: string }>
    >
  | ReturnType<
      typeof problem<409, { code: "project-folder-held"; detail: string }>
    >;

/** Makes the project asked for, or joins the one that has the folder's remote (project-joining.ts `createOrJoinProject`). */
export type CreateOrJoinProject = (
  asked: ProjectAsk
) => Promise<ProjectMade | ProjectMakeProblem>;

/** A project as `POST /api/projects` and `project_create` ask for it (project-joining.ts `newProject`). */
export interface NewProjectBody {
  /** Made with Caw: its Caw starts on. A folder that joins a project leaves that project's setting as it is. */
  caw?: boolean;
  cwd?: string;
  machineId?: string;
  name?: string;
  /** A new project only: a folder a project holds already is refused, never joined. */
  newOnly?: true;
  /** The person's words its conversation starts with, which set it up. */
  prompt?: string;
  promptId?: string;
  template?: StagesTemplate;
}

/** Why `POST /api/projects` or `project_create` made nothing: the ask's own shape, or its name (project-edit.ts `projectName`) or a {@link ProjectMakeProblem} said as `project-not-made`. */
export type NewProjectProblem =
  | ReturnType<
      typeof problem<
        400,
        { code: "checkout-machine-folder-send"; detail: string }
      >
    >
  | ReturnType<
      typeof problem<400, { code: "project-needs-name"; detail: string }>
    >
  | ReturnType<
      typeof problem<400, { code: "project-not-made"; detail: string }>
    >
  | ReturnType<
      typeof problem<
        ProjectMakeProblem["status"],
        { code: "project-not-made"; detail: string }
      >
    >;

/** A project made or joined as asked, or why not (project-joining.ts `newProject`). */
export type NewProject = (
  body: NewProjectBody
) => Promise<ProjectMade | NewProjectProblem>;
