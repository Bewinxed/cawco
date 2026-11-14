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
const NO_TABS: FollowedTabs = {
  openIds: [],
  named: () => true,
  machineOf: () => {
    throw new Error(
      "follows: tabMachine was called before the workspace registered its tabs (followTabs)"
    );
  },
};

let tabs: FollowedTabs = NO_TABS;

/**
 * The workspace's tabs, followed: what it says from here on
 * (workspace.svelte.ts `startWorkspace`). Returns its release: no tab is
 * followed then.
 */
export function followTabs(source: FollowedTabs): () => void {
  tabs = source;
  return () => {
    if (tabs === source) {
      tabs = NO_TABS;
    }
  };
}

/** The sessions the workspace's tabs hold open. */
const openTabs = (): string[] => tabs.openIds;

/** Whether the hub has named tab `id` (workspace `named`). */
export const tabNamed = (id: string): boolean => tabs.named(id);

/** The machine tab `id`'s conversation lives on, as the workspace resolves it. */
export const tabMachine = (id: string): string | undefined =>
  tabs.machineOf(id);

/** The session the board is peeking — subscribed for frames, like an open tab. */
export const peek = $state<{
  id: string | null;
}>({
  id: null,
});

/**
 * Delegates something on screen is reading live: an expanded card, the tray's
 * open panel. A delegate is a full instance, but its parent's transcript is
 * what the reader is in — so it is not an open tab, and without this it
 * receives no frames. Counted by watcher, so the tray's panel closing never
 * stops the frames an expanded card is still reading.
 */
export const watchedDelegates = new Map<string, number>();

/**
 * A session is "open" when a tab the workspace holds or the peek pane is
 * watching it. The workspace's tabs, not the working set: the working set
 * keeps ten and lets the coldest go, while the tab it let go stays in its
 * strip — and a tab that is not subscribed never streams, however often it
 * is clicked (activating a tab does not visit it).
 */
export function isSubscribed(instanceId: string): boolean {
  return openTabs().includes(instanceId) || peek.id === instanceId;
}

/**
 * Every session something on this page shows: the tabs, the peek, the
 * delegate cards, and a project's conversation in its panel. Its streams' places ({@link forgetUnwatched}) are kept
 * for all of them, a tab waiting on its name included, so a page read
 * before the tab was asked keeps its `seq`.
 */
export function watchedIds(): string[] {
  const ids = new Set(openTabs());
  if (peek.id) {
    ids.add(peek.id);
  }
  for (const id of watchedDelegates.keys()) {
    ids.add(id);
  }
  return [...ids];
}

/**
 * The full set of instance ids this dashboard wants `frame` frames for: the
 * watched ones the hub has named; a tab not named yet is followed once it
 * has (workspace `named`).
 */
export function subscriptionIds(): string[] {
  return watchedIds().filter((id) => tabNamed(id));
}
