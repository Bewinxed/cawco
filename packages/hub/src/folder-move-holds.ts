/**
 * The sessions a move of their folder holds (folder-moves.ts): paused for
 * it, and started again only by it, in the new folder. A send or a wake
 * that would start one meanwhile is refused in these words (spawns.ts
 * `launchRefusal`), never started in the folder that is moving.
 */

let holding: (instanceId: string) => string | undefined = () => undefined;

/** The folder moves' word on whether `instanceId` is held, set once they are made. */
export const holdSessionsBy = (
  held: (instanceId: string) => string | undefined
): void => {
  holding = held;
};

/** Why `instanceId` can't start now: its folder is moving. */
export const folderMoveHold = (instanceId: string): string | undefined =>
  holding(instanceId);
