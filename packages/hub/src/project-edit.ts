/**
 * A project's name, its Review before done, its Apple build gate
 * (apple-gate.ts), where its work lands and its upstream choice
 * (upstream.ts), changed by the person (`PATCH /api/projects/:id`, the
 * project head's details tray) or, but for the upstream choice, by its Caw
 * (`project_settings` `rename`, `set_review`, `set_apple_gate`,
 * `set_lands`): one check and one write for all five. Where work lands is
 * a dispatch setting, written by the dispatcher's own `configure`
 * (`lands`), so the dispatcher looks at the project again as it changes.
 * The upstream choice is the person's alone: it is what keeps sessions, Caw
 * among them, off other people's repositories. The change reaches every
 * dashboard and the app at once: `projects.changed` makes each read the
 * projects again, and a review change is a change to the stages the hub
 * applies, so the project's boards read its tasks and stages again too.
 *
 * Names are not unique: a project is known by its id, and the hub makes two
 * projects of one name as readily (`POST /api/projects`).
 */
import { LANDS_MODES, type LandsMode } from "@cawco/core";
import type { DbShape, ProjectRow } from "./db";

/** As long as a name `POST /api/projects` takes. */
export const PROJECT_NAME_LIMIT = 200;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a name is one line of text, so control characters are what it refuses
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface ProjectEdit {
  appleGate?: boolean;
  /** Where its attempts land when their task says nothing. */
  lands?: LandsMode;
  name?: string;
  review?: boolean;
  /** Its sessions may post to other repositories; null: the fleet's answer. */
  upstreamPosts?: boolean | null;
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
  /** Where its work lands, through the dispatch settings' own path (dispatch.ts `configure`). */
  readonly lands: (projectId: string, lands: LandsMode) => Promise<unknown>;
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
  if (
    asked.upstreamPosts !== undefined &&
    asked.upstreamPosts !== project.upstreamPosts
  ) {
    change.upstreamPosts = asked.upstreamPosts;
  }
  if (asked.lands !== undefined) {
    if (!LANDS_MODES.includes(asked.lands)) {
      throw new ProjectEditRefusal(
        400,
        `Work lands on ${LANDS_MODES.join(", ")}; ${String(asked.lands)} is none of them.`
      );
    }
    if (asked.lands !== project.lands) {
      change.lands = asked.lands;
    }
  }
  return change;
};

export const createProjectEdits = ({
  db,
  lands,
  projectsChanged,
  stagesChanged,
}: ProjectEditsDeps) => ({
  /**
   * Checks and applies a change to a project's name, Review before done,
   * Apple build gate, landing and upstream choice; answers the project as it
   * is now. Nothing asked is refused.
   */
  async edit(projectId: string, asked: ProjectEdit): Promise<ProjectRow> {
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
      asked.appleGate === undefined &&
      asked.lands === undefined &&
      asked.upstreamPosts === undefined
    ) {
      throw new ProjectEditRefusal(
        400,
        "Name what changes: the project's name, whether it reviews before done, whether its work waits for the iOS build, where its work lands, or whether its agents may post to other repositories."
      );
    }
    const { lands: landsTo, ...details } = changeOf(project, asked);
    if (Object.keys(details).length === 0 && landsTo === undefined) {
      return project;
    }
    if (Object.keys(details).length > 0) {
      db.setProjectDetails(projectId, details);
    }
    if (landsTo !== undefined) {
      await lands(projectId, landsTo);
    }
    projectsChanged();
    if (details.review !== undefined) {
      stagesChanged(projectId);
    }
    return db.project(projectId) ?? project;
  },
});

export type ProjectEdits = ReturnType<typeof createProjectEdits>;
