/**
 * A look at one project that a change to its tasks asks for (waits.ts,
 * wait-flags.ts): one at a time per project, one asked for during a look
 * run after it, and a burst of changes looked at once, `settleMs` after the
 * last. A look's refusal or throw is said in the log under `name`.
 */

import type { HubLifetimeShape } from "./lifetime";

export interface ProjectLooksDeps {
  readonly lifetime: HubLifetimeShape;
  /** One look at a project; its refusal (an ElysiaStatus problem), when one ends it. */
  readonly lookAt: (
    projectId: string
  ) => Promise<{ readonly response: { readonly detail: string } } | undefined>;
  /** The log's tag, like `waits`. */
  readonly name: string;
  /** How long a change's look waits for the next change. */
  readonly settleMs: number;
}

export const createProjectLooks = ({
  lifetime,
  lookAt,
  name,
  settleMs,
}: ProjectLooksDeps) => {
  /** Projects whose look is under way, and those asked again meanwhile. */
  const looking = new Set<string>();
  const again = new Set<string>();
  const soon = new Map<string, ReturnType<HubLifetimeShape["after"]>>();

  /** One look at a project at a time; one asked for during a look runs after it. */
  const look = (projectId: string): void => {
    if (looking.has(projectId)) {
      again.add(projectId);
      return;
    }
    looking.add(projectId);
    const failed = (words: string) =>
      console.warn(`[${name}] ${projectId}: ${words}`);
    lookAt(projectId)
      .then(
        (refused) => refused && failed(refused.response.detail),
        (error: unknown) =>
          failed(error instanceof Error ? error.message : String(error))
      )
      .finally(() => {
        looking.delete(projectId);
        if (again.delete(projectId)) {
          look(projectId);
        }
      });
  };

  return {
    look,
    /** A project's tasks changed: it is looked at once the changes settle. */
    soon(projectId: string): void {
      lifetime.cancel(soon.get(projectId));
      soon.set(
        projectId,
        lifetime.after(`${name} settle`, settleMs, () => {
          soon.delete(projectId);
          look(projectId);
        })
      );
    },
  };
};
