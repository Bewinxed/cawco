/**
 * What this page follows: the sessions the workspace's tabs hold open, the
 * session the board peeks, and the delegates something on screen reads live.
 * The workspace says what its tabs follow ({@link followTabs}); this store
 * never reads the workspace itself.
 */

/** What the workspace's tabs follow, as the workspace says it. */
export interface FollowedTabs {
  /** The machine tab `id`'s conversation lives on, as the workspace resolves it. */
  machineOf: (id: string) => string | undefined;
  /** Whether the hub has named tab `id`: until it has, nothing reads it. */
  named: (id: string) => boolean;
  /** The sessions the tabs hold open. */
  readonly openIds: string[];
}

/** Before the workspace says otherwise, no tab is open, and an id no tab holds is no tab's to name. */
let tabs: FollowedTabs = {
  openIds: [],
  named: () => true,
  machineOf: () => undefined,
};

/** The workspace's tabs, followed: what it says from here on (workspace.svelte.ts). */
export function followTabs(source: FollowedTabs): void {
  tabs = source;
}

/** The sessions the workspace's tabs hold open. */
export const openTabs = (): string[] => tabs.openIds;

/** Whether the hub has named tab `id` (workspace `named`). */
export const tabNamed = (id: string): boolean => tabs.named(id);

/** The machine tab `id`'s conversation lives on, as the workspace resolves it. */
export const tabMachine = (id: string): string | undefined =>
  tabs.machineOf(id);
