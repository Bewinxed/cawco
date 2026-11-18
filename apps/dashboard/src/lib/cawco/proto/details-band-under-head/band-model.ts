/**
 * What the band reads beyond the records the hub serves today
 * (ProjectRow, Machine, AccountsView, TrackerView, DecidesTable). The hub
 * has none of these yet: each is the shape of a call the build adds, and
 * the prototype's fixtures stand at it.
 */

/** Whether a place's folder is where the project expects it (TOM T12): read from its machine at register and before a start. */
type FolderStanding = "there" | "missing";

/** What the hub knows of one place beyond ProjectPlace. */
export interface PlaceStanding {
  folder: FolderStanding;
  /** CawCo made the folder (a copy to another machine); else the person named it. */
  madeByCawco: boolean;
}

/** A Move's steps, in order, for a copy between disks or machines (TOM T2). */
const MOVE_STEPS = [
  "stop",
  "copy",
  "check",
  "place",
  "remove",
  "resume",
] as const;
export type MoveStep = (typeof MOVE_STEPS)[number];

/** A Move under way, as a place's row shows it in place of its acts. */
export interface MoveUnderWay {
  placeId: string;
  /** How far the step is, 0 to 1. */
  share: number;
  step: MoveStep;
  /** Where the folder goes. */
  to: { machineId: string; path: string };
}
