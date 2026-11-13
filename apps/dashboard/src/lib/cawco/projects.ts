import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { ProjectCap } from "@cawco/core/areas";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { LandsMode } from "@cawco/core/injected";
import type { PlaceProject } from "@cawco/core/place-nesting";
import { primaryPlaceOf } from "@cawco/core/project-membership";

/**
 * Where a project's files are (place): a checkout on a machine, a
 * delegate's workspace while it lives or is held, or the project's folder on
 * the hub.
 */
export interface ProjectPlace {
  createdAt: string;
  id: string;
  /** The project's primary checkout: exactly one once it has any. */
  isPrimary: boolean;
  /** A `hub` place is the project's folder on the hub (machine `hub`, path `projects/<id>`). */
  kind: "checkout" | "hub";
  machineId: string;
  path: string;
  projectId: string;
  /** A checkout's live projects whose checkout holds it: a delete with its files takes their files there too (core place-nesting.ts). */
  within: PlaceProject[];
}

/**
 * A project the hub knows about (`GET /api/projects`). `places` holds every
 * place, its primary checkout first, then its folder on the hub; read the
 * primary with `checkoutOf` (projects.ts).
 */
export interface ProjectRow {
  /** The account its sessions start on when a start names none (hub project-edit.ts); null: the fleet's routing. */
  account: string | null;
  /** What its sessions on {@link account} do at that account's limit. */
  accountAtLimit: ProjectAtLimit;
  /** The area it sits in, as the hub's row names it (home/areas.svelte.ts `areaIdOf`); null for none. */
  areaId?: string | null;
  /** Its spend cap as it stands, kept by `project.cap` frames; null: none. */
  cap?: ProjectCap | null;
  /** The harness its Caw runs on. */
  cawHarness: HarnessKind;
  /** The model its Caw runs; null: its harness's default. */
  cawModel: string | null;
  /**
   * Its Caw's session, once the hub has started one; null before and after
   * one is retired. Read again on `projects.changed`, which the hub sends as
   * it changes (caw.ts `setLead`).
   */
  conversationInstanceId: string | null;
  createdAt: string;
  /** Its events reach its conversation (made with Caw: on). */
  eventsOn: boolean;
  id: string;
  /** Where its attempts land when their task says nothing. */
  lands: LandsMode;
  /** The connection that signs in to {@link lfsUrl}; null with it. */
  lfsConnection: string | null;
  /** Where its large files live, an LFS endpoint; null: each repository's origin's own LFS. */
  lfsUrl: string | null;
  /** Its links, one per repository, `host/owner/repo`, oldest first. */
  links: string[];
  name: string;
  places: ProjectPlace[];
  /** Its primary checkout's id; null while it has none (a New project before its place is picked). */
  primaryPlaceId: string | null;
  /** Review before done: only you move a task to done, and landed work waits in review. */
  review: boolean;
}

/* A session lists in one project, the `projectId` the hub wrote on it
   (core project-membership): the rail and the hub's forget read that one
   field. */

/** The project's primary checkout; undefined while it has none (only its folder on the hub). */
export const checkoutOf = (project: ProjectRow): ProjectPlace | undefined =>
  primaryPlaceOf(project);

/**
 * The folder a project is known by (its hue, its rail row): its primary
 * checkout's path, else its folder on the hub's (`projects/<id>`).
 */
export const folderOf = (project: ProjectRow): string =>
  checkoutOf(project)?.path ?? `projects/${project.id}`;

/** Where a session on `machineId` starts in the project: its checkout there, the primary first. */
export function checkoutOn(
  project: ProjectRow,
  machineId: string
): ProjectPlace | undefined {
  const checkouts = project.places.filter(
    (place) => place.machineId === machineId && place.kind === "checkout"
  );
  return checkouts.find((place) => place.isPrimary) ?? checkouts[0];
}

/** Whether a session on `machineId` can be one of the project's: it has a place there. */
export const placedOn = (project: ProjectRow, machineId: string): boolean =>
  project.places.some((place) => place.machineId === machineId);
