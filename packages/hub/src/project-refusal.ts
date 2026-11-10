import { ElysiaStatus, problem } from "elysia";
import { projectRoot } from "./project-folder";
import { StatusRefusal } from "./refusal";

/**
 * A refusal still thrown by the families that threw the project folder's own
 * before the folder returned its refusals (project-folder.ts): tasks,
 * dispatch, Jev's tasks, the project, design and Git LFS offers, starters,
 * the gate file and joining a project. A folder refusal one of them reads is
 * thrown on as this, its status and words kept; each family returns its own
 * once it is converted.
 */
export class ProjectRefusal extends StatusRefusal<
  400 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 503 | 504
> {}

/** Runs a route's work, a {@link ProjectRefusal} answered as the route's refusal in its status and words; anything else is thrown on. */
export const projectAttempt = async <T>(work: () => T | Promise<T>) => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProjectRefusal) {
      return problem(error.status, {
        code: "project-refused",
        detail: error.message,
      });
    }
    throw error;
  }
};

/** A folder refusal a family that still throws reads, as the {@link ProjectRefusal} it throws on, its status and words kept. */
export const projectRefusalOf = (refused: {
  response: { detail: string };
  status: ProjectRefusal["status"];
}) => new ProjectRefusal(refused.status, refused.response.detail);

/** A project's folder on disk (project-folder.ts `projectRoot`) for a family that still throws: its path, a refused id thrown on as a {@link ProjectRefusal}. */
export const projectRootOf = (projectId: string): string => {
  const root = projectRoot(projectId);
  if (root instanceof ElysiaStatus) {
    throw projectRefusalOf(root);
  }
  return root;
};
