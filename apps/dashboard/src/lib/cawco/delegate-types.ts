import type { DelegateType } from "@cawco/core/delegate-types";
import { hub } from "#lib/platform/hub.js";
import { couldNotOrAway } from "#lib/platform/hub-read.js";

/**
 * The dashboard's side of delegate types: fetch wrappers in the shape
 * `rules.ts` established — a refusal from the hub is an Elysia bare string,
 * so `said` unwraps it and every call throws a whole sentence the caller can
 * print.
 *
 * Validation lives in `@cawco/core`'s `delegateTypeProblem`, reused here
 * rather than re-derived, so the form's refusals agree with the hub's own.
 */

export type { DelegateType } from "@cawco/core/delegate-types";

/**
 * A type a project's `delegates/` folder holds (hub project-delegate-types.ts):
 * the file it was read from, and whether it replaces a fleet type of its name.
 */
export type ProjectDelegateType = DelegateType & {
  path: string;
  shadows?: boolean;
  source: "project";
};

/** A file under `delegates/` that did not make a type, or a field one ignored. */
interface TypeFileProblem {
  path: string;
  problem: string;
}

/** One project's own types, under the project they apply in, with its files that made none. */
export interface ProjectTypes {
  problems: TypeFileProblem[];
  project: { id: string; name: string };
  types: ProjectDelegateType[];
}

/**
 * Create and edit are the same route on the hub — `PUT` upserts by name. Its
 * body is the fields the route takes: the name rides the path, and `role`
 * is a project type file's alone (core `DelegateType`).
 */
export const saveDelegateType = async (draft: DelegateType) => {
  const answer = await hub.api["delegate-types"]({ name: draft.name }).put({
    description: draft.description,
    harness: draft.harness,
    model: draft.model,
    effort: draft.effort,
    skills: draft.skills,
    denyTools: draft.denyTools,
    mayStart: draft.mayStart,
    account: draft.account,
    connections: draft.connections,
    startingSet: draft.startingSet,
  });
  if (answer.error) {
    throw couldNotOrAway(`save ${draft.name || "the delegate type"}`)(answer);
  }
  return answer.data;
};

/** Deletes a type, into the hub's trash for its Undo (config/undo.ts). */
export const removeDelegateType = async (name: string) => {
  const answer = await hub.api["delegate-types"]({ name }).delete();
  if (answer.error) {
    throw couldNotOrAway(`delete ${name}`)(answer);
  }
  return answer.data;
};

/** A blank draft, on the defaults that make the common case one field of typing. */
export const blankDelegateType = (): DelegateType => ({
  name: "",
  description: "",
  harness: "claude",
  model: "",
});
