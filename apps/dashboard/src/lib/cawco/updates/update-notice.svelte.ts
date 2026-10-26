/**
 * The one update notice, which Caw's panel shows as its update row
 * (home/CawPanel, home/UpdateCard): the notice the fleet's state calls for
 * now (`noticeFor`), what its buttons do, and what goes on without anyone
 * looking (`startUpdateWatch`): "running on N machines" leaving by itself,
 * and the update toast of a tab older than the dashboard (update-toast).
 *
 * Every notice is acknowledged on the hub (notices.svelte.ts), by the ids of
 * the events it announces: its ✕, or acting on it, clears it for every tab
 * and device, and a reload never brings it back. Nothing else acknowledges a
 * landing: not a reload for the new build, not a page viewed.
 */
import { machineLabel } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { cawco } from "../client.svelte";
import { notices } from "../notices.svelte";
import { newerBuild } from "../served-build.svelte";
import { type Notice, noticeFor } from "./model";
import { watchUpdateToast } from "./update-toast.svelte";
import { updates } from "./updates.svelte";

/** How long "running on N machines" stays up. */
const DONE_MS = 6000;

class UpdateNotice {
  /** The notice to show, or null; until the hub's record is in, none can know it was seen. */
  readonly current = $derived.by<Notice | null>(() => {
    const { policy } = updates;
    if (!(policy && notices.known)) {
      return null;
    }
    return noticeFor(
      {
        commanded: new Set(updates.commanded),
        machines: cawco.machines,
        newerBuild: newerBuild(),
        policy,
        refused: new Map(updates.refused),
        seen: new Set(notices.seen),
      },
      (hostname) => machineLabel(hostname)
    );
  });
}

export const updateNotice = new UpdateNotice();

/**
 * The notice's ✕: acknowledged everywhere; "running on N machines" also
 * forgets this tab's installs, and a refusal, this tab's own, is forgotten here.
 */
export function dismissUpdate(notice: Notice): void {
  if (notice.kind === 9) {
    updates.forgetRefusal(notice.machineIds);
    return;
  }
  detach(notices.acknowledge(notice.acks), "acknowledge");
  if (notice.kind === 3) {
    updates.forgetCommanded();
  }
}

/** The notice's button. */
export function actOnUpdate(
  notice: Notice,
  action: NonNullable<Notice["action"]>
): void {
  const { policy } = updates;
  if (action === "install-all" && policy) {
    detach(updates.installAll(cawco.machines, policy), "installAll");
    return;
  }
  if (notice.kind === 9) {
    // Each refused ask again, as it was asked: an install, or its cancel.
    for (const id of notice.machineIds) {
      const machine = cawco.machines.find((row) => row.machineId === id);
      if (machine) {
        detach(updates.again(machine), "again");
      }
    }
    return;
  }
  const machine = cawco.machines.find(
    (row) => row.machineId === notice.machineIds[0]
  );
  if (machine) {
    detach(updates.installNow(machine), "installNow");
    detach(notices.acknowledge(notice.acks), "acknowledge");
  }
}

/** What runs with nobody looking at the notice. Started once from the root layout. */
export function startUpdateWatch(): () => void {
  return $effect.root(() => {
    // A tab older than the dashboard offers its reload in the update toast.
    // The reload acknowledges nothing: the landing's notes stand in Caw's
    // panel on the reloaded tab until the notice's ✕ (or its act).
    watchUpdateToast();

    // "Running on N machines" leaves by itself. It acknowledges itself, never
    // the landings: what landed then stands as notice 6, with its notes.
    $effect(() => {
      const notice = updateNotice.current;
      if (notice?.kind !== 3) {
        return;
      }
      const { acks } = notice;
      const timer = setTimeout(() => {
        detach(notices.acknowledge(acks), "acknowledge");
        updates.forgetCommanded();
      }, DONE_MS);
      return () => clearTimeout(timer);
    });
  });
}
