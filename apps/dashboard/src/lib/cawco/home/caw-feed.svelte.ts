/**
 * What Caw's panel (CawPanel) lists and where its acts land: the live fleet
 * (`liveFeed`, NeedsCaw's) or a fixture (/motion/caw-notices). The panel
 * reads nothing else, so a preview drives the real panel with no hub.
 */
import type { DamagedHubRecord, RebalanceNotice } from "@cawco/core";
import type { MovedLogin } from "../accounts/model.svelte";
import { notices } from "../notices.svelte";
import type { Notice } from "../updates/model";
import { actOnUpdate, dismissUpdate } from "../updates/update-notice.svelte";
import { cawNotices } from "./caw-notices.svelte";
import { home, type NeedsItem } from "./home-state.svelte";

export interface CawFeed {
  /** Notice ids acknowledged: gone here at once, and everywhere once the hub has them. */
  acknowledge: (ids: string[]) => void;
  actOnUpdate: (notice: Notice, action: NonNullable<Notice["action"]>) => void;
  /** Live and read: the empty block may draw his face. */
  readonly connected: boolean;
  dismissUpdate: (notice: Notice) => void;
  /** The hub is live: a row that is not can't be answered (NeedsCard `stale`). */
  readonly live: boolean;
  readonly moved: MovedLogin[];
  readonly needs: NeedsItem[];
  /** The hub's notices record is damaged: notices are off until Reset. */
  readonly noticesDamaged: DamagedHubRecord | null;
  readonly rebalanced: RebalanceNotice[];
  /** Reset: the hub writes a fresh notices record, and notices come back on. */
  resetNotices: () => Promise<void>;
  readonly updated: Notice | null;
}

export const liveFeed: CawFeed = {
  get live() {
    return home.live;
  },
  get connected() {
    return home.status === "connected";
  },
  get needs() {
    return home.needs;
  },
  get updated() {
    return cawNotices.updated;
  },
  get moved() {
    return cawNotices.moved;
  },
  get rebalanced() {
    return cawNotices.rebalanced;
  },
  get noticesDamaged() {
    return notices.damaged;
  },
  resetNotices: () => notices.reset(),
  acknowledge(ids) {
    // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
    void notices.acknowledge(ids);
  },
  dismissUpdate,
  actOnUpdate,
};
