/**
 * WHAT A WORKSPACE ID NAMES. Every tree a boundary holds (its state dir,
 * scratch and door dirs, a stage's key, a preview's bridge, the hub's record
 * of it) is keyed by an id of one of these kinds, told apart by its shape
 * alone:
 *
 * - `clone`: a uuid. A copy CawCo cut and owns: a delegate's workspace (the
 *   hub's row), a place's stage clone (workspace-policy.ts `stageCloneId`),
 *   a pin (agent stage-clone.ts `cutPin`), a routine's or a host delegate's.
 * - `place`: 8 hex digits and `-caw`. The boundary over a person's own
 *   folder, never written into (hub caw.ts `stagePlaceRef`; workspace-policy.ts
 *   says what it may do). The suffix is the one it had when only Caw had a
 *   place, so the place records already on disk still read as places.
 * - `design`: an artifact's uuid and `-design`. The folder the hub keeps
 *   for a design artifact (hub design-folder.ts), run by a stage in a
 *   boundary of its own (agent stage-design.ts): no clone, no place.
 *
 * Every check of an id's kind, in the daemon, the hub and core, asks
 * {@link workspaceIdKindOf} and switches on what it answers: a kind added here
 * is a case each of those switches must name (scripts/lint/
 * switch-exhaustiveness.ts), so a check never takes a new kind for another
 * one through its else. Pure: the dashboard reads it too (core stage.ts
 * `designOf`).
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLACE_SUFFIX = "-caw";
const DESIGN_SUFFIX = "-design";

/** The kinds of tree a workspace id names ({@link workspaceIdKindOf}). */
export type WorkspaceIdKind = "clone" | "design" | "place";

const SHAPES: readonly (readonly [WorkspaceIdKind, RegExp])[] = [
  ["clone", new RegExp(`^${UUID}$`, "u")],
  ["place", new RegExp(`^[0-9a-f]{8}${PLACE_SUFFIX}$`, "u")],
  ["design", new RegExp(`^${UUID}${DESIGN_SUFFIX}$`, "u")],
];

/** The kind of tree `id` names, or nothing when it is no workspace id. */
export const workspaceIdKindOf = (id: string): WorkspaceIdKind | undefined =>
  SHAPES.find(([, shape]) => shape.test(id))?.[0];

/** The kind of tree `id` names; throws, saying so, when it is no workspace id. */
export const workspaceIdKind = (id: string): WorkspaceIdKind => {
  const kind = workspaceIdKindOf(id);
  if (!kind) {
    throw new Error(`${id} is not a workspace id.`);
  }
  return kind;
};

/** Whether `id` is a workspace id of any kind. */
export const isWorkspaceId = (id: string): boolean =>
  workspaceIdKindOf(id) !== undefined;

/**
 * What `answers` says for the kind of tree `id` names, one answer per kind:
 * the form of a check whose every kind's answer is a value. A check whose
 * kinds run code switches on {@link workspaceIdKind} instead. Throws when `id`
 * is no workspace id.
 */
export const byWorkspaceIdKind = <T>(
  id: string,
  answers: Readonly<Record<WorkspaceIdKind, T>>
): T => answers[workspaceIdKind(id)];

/** The place id whose 8 hex digits are `hex`'s first 8 (hub caw.ts hashes a session's machine and folder). */
export const placeIdOf = (hex: string): string =>
  `${hex.slice(0, 8)}${PLACE_SUFFIX}`;

/**
 * The tree id of the design artifact `artifactId` first made (the owner's
 * pin on graph-general-canvas, 2026-11-22): a held next version copies its
 * source, so it serves from the same folder.
 */
export const designTreeId = (artifactId: string): string =>
  `${artifactId}${DESIGN_SUFFIX}`;

/** The artifact whose folder holds design tree `id`'s files ({@link designTreeId}). */
export const designArtifactOf = (id: string): string =>
  id.slice(0, -DESIGN_SUFFIX.length);
