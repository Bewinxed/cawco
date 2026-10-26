import type { DelegateType, Deleted } from "@cawco/core";
import { HARNESSES } from "@cawco/core";
import { hubFailure } from "#lib/cawco/hub-read.js";

/**
 * The dashboard's side of delegate types: fetch wrappers in the shape
 * `rules.ts` established — a refusal from the hub is an Elysia bare string,
 * so `said` unwraps it and every call throws a whole sentence the caller can
 * print.
 *
 * Validation lives in `@cawco/core`'s `delegateTypeProblem`, reused here
 * rather than re-derived, so the form's refusals agree with the hub's own.
 */

export type { DelegateType } from "@cawco/core";

/** `DelegateType['harness']` is the same three-value union `HARNESSES` already is. */
export const DELEGATE_HARNESSES = HARNESSES;

export interface DelegateTypesPayload {
  types: DelegateType[];
}

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
export interface TypeFileProblem {
  path: string;
  problem: string;
}

/**
 * `GET /api/projects/:id/delegate-types`: the project's types first, then
 * the fleet types they leave, and the files that kept themselves out.
 */
export interface ProjectCatalogPayload {
  problems: TypeFileProblem[];
  types: (ProjectDelegateType | (DelegateType & { source: "fleet" }))[];
}

/** One project's own types, under the project they apply in, with its files that made none. */
export interface ProjectTypes {
  problems: TypeFileProblem[];
  project: { id: string; name: string };
  types: ProjectDelegateType[];
}

/** What the hub said went wrong, in one sentence without its stop (hub-read `hubFailure`). */
async function said(response: Response): Promise<string> {
  return (await hubFailure(response)).detail;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Could not ${attempt}. ${await said(response)}.`);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const loadDelegateTypes = (): Promise<DelegateTypesPayload> =>
  send<DelegateTypesPayload>(
    "/api/delegate-types",
    {},
    "load the delegate types"
  );

/** Create and edit are the same route on the hub — `PUT` upserts by name. */
export const saveDelegateType = (draft: DelegateType): Promise<DelegateType> =>
  send<DelegateType>(
    `/api/delegate-types/${encodeURIComponent(draft.name)}`,
    { method: "PUT", ...json(draft) },
    `save ${draft.name || "the delegate type"}`
  );

/** Deletes a type, into the hub's trash for its Undo (config/undo.ts). */
export const removeDelegateType = (name: string): Promise<Deleted> =>
  send<Deleted>(
    `/api/delegate-types/${encodeURIComponent(name)}`,
    { method: "DELETE" },
    `delete ${name}`
  );

/** A blank draft, on the defaults that make the common case one field of typing. */
export const blankDelegateType = (): DelegateType => ({
  name: "",
  description: "",
  harness: "claude",
  model: "",
});
