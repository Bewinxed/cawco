/**
 * A project's name, its Review before done and its Apple build gate
 * (apple-gate.ts), changed by the person (`PATCH /api/projects/:id`) or by
 * its Caw (`project_settings` `rename`, `set_review`, `set_apple_gate`): one
 * check and one write for all three. The change reaches every
 * dashboard and the app at once: `projects.changed` makes each read the
 * projects again, and a review change is a change to the stages the hub
 * applies, so the project's boards read its tasks and stages again too.
 *
 * Names are not unique: a project is known by its id, and the hub makes two
 * projects of one name as readily (`POST /api/projects`).
 */
import type { DbShape, ProjectRow } from "./db";

/** As long as a name `POST /api/projects` takes. */
export const PROJECT_NAME_LIMIT = 200;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a name is one line of text, so control characters are what it refuses
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface ProjectEdit {
  appleGate?: boolean;
  name?: string;
  review?: boolean;
}

/** A change the hub refuses, in a sentence the person reads under the field. */
export class ProjectEditRefusal extends Error {
  readonly status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.status = status;
  }
}

/** A name as the hub keeps it: trimmed, one line, not empty, at most 200 characters. */
export const projectName = (raw: string): string => {
  const name = raw.trim();
  if (!name) {
    throw new ProjectEditRefusal(400, "A project needs a name.");
  }
  if (CONTROL.test(name)) {
    throw new ProjectEditRefusal(400, "A project's name is one line of text.");
  }
  if (name.length > PROJECT_NAME_LIMIT) {
    throw new ProjectEditRefusal(
      400,
      `A project's name is at most ${PROJECT_NAME_LIMIT} characters; this one is ${name.length}.`
    );
  }
  return name;
};

export interface ProjectEditsDeps {
  readonly db: Pick<DbShape, "project" | "setProjectDetails">;
  /** Every dashboard and the app read the projects again. */
  readonly projectsChanged: () => void;
  /** The project's boards read its tasks and stages again (tasks.ts `touched`). */
  readonly stagesChanged: (projectId: string) => void;
}

/** What `asked` changes of `project`: each field asked that differs, the name checked. */
const changeOf = (project: ProjectRow, asked: ProjectEdit): ProjectEdit => {
  const change: ProjectEdit = {};
  if (asked.name !== undefined) {
    const name = projectName(asked.name);
    if (name !== project.name) {
      change.name = name;
    }
  }
  if (asked.review !== undefined && asked.review !== project.review) {
    change.review = asked.review;
  }
  if (asked.appleGate !== undefined && asked.appleGate !== project.appleGate) {
    change.appleGate = asked.appleGate;
  }
  return change;
};

export const createProjectEdits = ({
  db,
  projectsChanged,
  stagesChanged,
}: ProjectEditsDeps) => ({
  /**
   * Checks and applies a change to a project's name, Review before done and Apple build gate;
   * answers the project as it is now. Nothing asked is refused.
   */
  edit(projectId: string, asked: ProjectEdit): ProjectRow {
    const project = db.project(projectId);
    if (!project) {
      throw new ProjectEditRefusal(
        404,
        "This project is no longer recorded. Refresh."
      );
    }
    if (
      asked.name === undefined &&
      asked.review === undefined &&
      asked.appleGate === undefined
    ) {
      throw new ProjectEditRefusal(
        400,
        "Name what changes: the project's name, whether it reviews before done, or whether its work waits for the iOS build."
      );
    }
    const change = changeOf(project, asked);
    if (Object.keys(change).length === 0) {
      return project;
    }
    db.setProjectDetails(projectId, change);
    projectsChanged();
    if (change.review !== undefined) {
      stagesChanged(projectId);
    }
    return db.project(projectId) ?? project;
  },
});

export type ProjectEdits = ReturnType<typeof createProjectEdits>;
