/** How a fleet catalog item is bound to its machines and projects. */
import type { FleetPlacement, FleetScope } from "@cawco/core/fleet-placement";

/** What a write asks of a fleet row's binding: a project, an area, null for every machine, left out as it was. */
interface BindingAsk {
  areaId?: string | null;
  projectId?: string | null;
}

/** A fleet row's binding as its columns keep it. */
interface BindingColumns {
  areaId: string | null;
  projectId: string | null;
  scope: FleetScope | null;
}

/**
 * A fleet row's placement after a write: a project or an area asked binds
 * it there (under `scope`) and lets go of the other, null for both makes it
 * every machine's, and neither asked keeps what it was (`stored`).
 */
export const placementOf = (
  asked: BindingAsk,
  stored: Partial<Pick<BindingColumns, "areaId" | "projectId">> | undefined,
  scope: FleetScope
): BindingColumns => {
  const kept = asked.projectId === undefined && asked.areaId === undefined;
  const projectId = (kept ? stored?.projectId : asked.projectId) ?? null;
  const areaId = (kept ? stored?.areaId : asked.areaId) ?? null;
  return { projectId, areaId, scope: projectId || areaId ? scope : null };
};

/**
 * A fleet row's binding as the wire carries it (core `FleetPlacement`): its
 * project or its area under its scope (`fallback` when none is stored), or
 * nothing for every machine's.
 */
export const bindingOf = (
  row: BindingColumns,
  fallback: FleetScope
): Pick<FleetPlacement, "areaId" | "projectId" | "scope"> => {
  if (row.projectId) {
    return { projectId: row.projectId, scope: row.scope ?? fallback };
  }
  if (row.areaId) {
    return { areaId: row.areaId, scope: row.scope ?? fallback };
  }
  return {};
};
