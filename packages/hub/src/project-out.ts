import { placeNesting } from "@cawco/core/place-nesting";
import type { BridgedHeldPlace } from "./bridged-held-place";
import type { DbShape } from "./db";
import { checkoutOf, type PlaceRow, type ProjectRow } from "./db/projects";

/**
 * A project as the API answers it: its places, and its primary checkout's
 * id (`primaryPlaceId`, null while it has none). A held workspace is no
 * decision of the person's: the session that started its work is told
 * (workspaces.ts `heldNotice`). Each place's `held` is null, sent only
 * while installable apps' documents declare it ({@link BridgedHeldPlace}).
 * Each place's `within` is the live projects whose checkout holds it, as a
 * delete with its files reads it (core place-nesting.ts), for its files
 * box; `live` is every live project, read once by a caller listing them all.
 */
export const createProjectOut =
  (db: DbShape) =>
  (project: ProjectRow, live: readonly ProjectRow[] = db.listProjects()) => ({
    ...project,
    places: project.places.map((place) => ({
      ...place,
      held: null as BridgedHeldPlace | null,
      within:
        place.kind === "checkout"
          ? placeNesting(project.id, place, live).within
          : [],
    })),
    primaryPlaceId: checkoutOf(project)?.id ?? null,
    // Read by nothing: the Apple build is a step a project declares in its
    // gate.md (gate-file.ts). Kept for the shipped apps that require it
    // (TestFlight 20261015.3 to 20261018); it goes once none is installable.
    appleGate: false as boolean,
    // Read by nothing: a project links a repository each (`links`). Kept
    // for the shipped apps that require it (every TestFlight build before
    // 2026-11-03), as their one link; it goes once none is installable.
    remote: (project.links[0] ?? null) as string | null,
  });

/** What adding a place answers: the project as above, the place, and whether it was new. */
export const placeAddedOf = (
  project: ReturnType<ReturnType<typeof createProjectOut>>,
  place: PlaceRow,
  added: boolean
) => ({ ...project, place, placeAdded: added });
