/**
 * The notices Caw's panel lists under "Notices" (NeedsCaw): the update
 * notice (updates/update-notice), the logins moved into CawCo, and what an
 * account's arrival set moving, each until someone acknowledges it
 * (notices.svelte.ts). The panel is their one surface; his label counts
 * them, and his rim does not (the rim counts needs you only).
 */
import { movedLogins, rebalancesUnseen } from "../accounts/model.svelte";
import { notices } from "../notices.svelte";
import { updateNotice } from "../updates/update-notice.svelte";

class CawNotices {
  /** The update notice the fleet's state calls for, if any. */
  readonly updated = $derived(updateNotice.current);
  /** Logins moved into CawCo that nobody has dismissed yet. */
  readonly moved = $derived(notices.known ? movedLogins(notices.seen) : []);
  /** What an account that came set moving, until the ✕ acknowledges it. */
  readonly rebalanced = $derived(
    notices.known ? rebalancesUnseen(notices.seen) : []
  );
  /** The notices standing: the update, and each moved login and rebalance. */
  readonly count = $derived(
    (this.updated ? 1 : 0) + this.moved.length + this.rebalanced.length
  );
  /** Every notice id standing, for his beat on a new one. */
  readonly keys = $derived([
    ...(this.updated?.acks ?? []),
    ...this.moved.map((one) => one.id),
    ...this.rebalanced.map((one) => one.id),
  ]);
}

export const cawNotices = new CawNotices();
