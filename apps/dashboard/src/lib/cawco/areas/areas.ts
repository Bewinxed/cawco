/**
 * Areas (core areas.ts, hub areas.ts): the dashboard's side of the hub's
 * routes. Every call throws the hub's refusal as a whole sentence
 * ("Couldn't rename the area. An area needs a name. (400)"), so a row puts
 * it under itself as it is.
 */

import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { Area, CapAmount } from "@cawco/core/areas";
import type { DelegateType } from "@cawco/core/delegate-types";
import type { OfferedMode } from "@cawco/core/harness";
import type { OnCap } from "@cawco/core/project-conversation";
import type { StageColor, StageIcon } from "@cawco/core/views";
import { hubCall, jsonBody } from "#lib/cawco/hub-read.js";

/** An area as the API answers it: its row and the projects in it, oldest first. */
export interface AreaView extends Omit<Area, "createdAt"> {
  createdAt: string;
  projects: string[];
}

/** What an area's write may change: any field, null clearing one. */
export interface AreaChange {
  account?: string | null;
  accountAtLimit?: ProjectAtLimit;
  cap?: CapAmount | null;
  cawMode?: OfferedMode | null;
  /** Its look (core `AreaLook`): null puts the section's back. */
  color?: StageColor | null;
  icon?: StageIcon | null;
  name?: string;
  onCap?: OnCap | null;
}

/** A type the area's `delegates/` holds: its file, and whether it replaces a fleet type of its name. */
type AreaDelegateType = DelegateType & {
  path: string;
  shadows?: boolean;
  source: "area";
};

/** `GET /api/areas/:id/delegate-types`: the area's own types and the files that made none. */
export interface AreaTypes {
  problems: { path: string; problem: string }[];
  types: AreaDelegateType[];
}

const at = (id: string) => `/api/areas/${encodeURIComponent(id)}`;

export const createArea = (name: string): Promise<AreaView> =>
  hubCall(
    "/api/areas",
    { method: "POST", ...jsonBody({ name }) },
    "create the area"
  );

export const orderAreas = (ids: string[]): Promise<{ areas: AreaView[] }> =>
  hubCall(
    "/api/areas/order",
    { method: "PUT", ...jsonBody({ ids }) },
    "move the area"
  );

/** Writes an area's name or settings: the area as it is now, and what moved with it, in sentences. */
export const changeArea = (
  id: string,
  change: AreaChange,
  attempt: string
): Promise<AreaView & { said: string[] }> =>
  hubCall(at(id), { method: "PATCH", ...jsonBody(change) }, attempt);

/** Deletes an area: its projects ungrouped, and what fell back, in sentences. */
export const deleteArea = (
  id: string
): Promise<{ name: string; projects: string[]; said: string[] }> =>
  hubCall(at(id), { method: "DELETE" }, "delete the area");

export const readAreaTypes = (id: string): Promise<AreaTypes> =>
  hubCall(`${at(id)}/delegate-types`, {}, "read the area's delegate types");

export const readAreaFile = (
  id: string,
  path: string
): Promise<{ content: string; path: string }> =>
  hubCall(
    `${at(id)}/folder/file?path=${encodeURIComponent(path)}`,
    {},
    `read ${path}`
  );

export const writeAreaFile = (
  id: string,
  path: string,
  content: string
): Promise<unknown> =>
  hubCall(
    `${at(id)}/folder/file`,
    { method: "PUT", ...jsonBody({ path, content }) },
    `save ${path}`
  );

export const deleteAreaFile = (id: string, path: string): Promise<unknown> =>
  hubCall(
    `${at(id)}/folder/file?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
    `delete ${path}`
  );

/** `GET /api/areas`: every area in its order, for a pick of one. */
export const readAreas = (): Promise<{ areas: AreaView[] }> =>
  hubCall("/api/areas", {}, "read the areas");

/** Puts a project in an area, or in none (null): what it takes or falls back to, in sentences. */
export const placeProject = (
  projectId: string,
  areaId: string | null
): Promise<{ areaId: string | null; said: string[] }> =>
  hubCall(
    `/api/projects/${encodeURIComponent(projectId)}/area`,
    { method: "PUT", ...jsonBody({ areaId }) },
    areaId ? "put the project in the area" : "take the project out of its area"
  );
