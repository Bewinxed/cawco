import type { ProjectNote } from "@cawco/core/project-conversation";
import type { StagesTemplate } from "@cawco/core/views";
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
