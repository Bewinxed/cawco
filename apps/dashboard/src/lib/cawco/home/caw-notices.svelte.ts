/**
 * The notices Caw's panel lists under "Notices" (NeedsCaw): the update
 * notice (updates/update-notice), the logins moved into CawCo, what an
 * account's arrival set moving, and each artifact's notice (a revision with
 * nothing asked, a pin's closing answer, a session that ended with its ask
 * unanswered; core artifact-needs.ts), each until someone acknowledges it
 * (notices.svelte.ts). The panel is their one surface; his label counts
 * them, and his rim does not (the rim counts needs you only).
 */
import type { ArtifactNeedNotice } from "@cawco/core/artifact-needs";
import { movedLogins, rebalancesUnseen } from "../accounts/model.svelte";
import { cawco } from "../client.svelte";
import { connect } from "../connect/installs.svelte";
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
  /** Each artifact's notice, its parts nobody has acknowledged yet. */
  readonly artifacts = $derived<ArtifactNeedNotice[]>(
    notices.known
      ? cawco.artifactNotices.flatMap((notice) => {
          const parts = notice.parts.filter(
            (part) => !notices.seen.has(part.id)
          );
          return parts.length > 0 ? [{ ...notice, parts }] : [];
        })
      : []
  );
  /** Machines Add machine brought in, until the person acknowledges them (connect/). */
  readonly joined = $derived(
    connect.installs.filter((one) => one.state === "joined")
  );
  /** The notices standing: the update, each moved login and rebalance, each machine joined, and a damaged record's Reset. */
  readonly count = $derived(
    (this.updated ? 1 : 0) +
      this.moved.length +
      this.rebalanced.length +
      this.joined.length +
      this.artifacts.length +
      (notices.damaged ? 1 : 0)
  );
  /** Every notice id standing, for his beat on a new one. */
  readonly keys = $derived([
    ...(notices.damaged ? [`damaged:${notices.damaged.file}`] : []),
    ...(this.updated?.acks ?? []),
    ...this.moved.map((one) => one.id),
    ...this.rebalanced.map((one) => one.id),
    ...this.joined.map((one) => `install:${one.id}`),
    ...this.artifacts.flatMap((one) => one.parts.map((part) => part.id)),
  ]);
}

export const cawNotices = new CawNotices();
