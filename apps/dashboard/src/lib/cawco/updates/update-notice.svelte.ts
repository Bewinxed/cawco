/**
 * The one update notice, which Caw's panel shows as its update row
 * (home/CawPanel, home/UpdateCard): the notice the fleet's state calls for
 * now (`noticeFor`), what its buttons do, and what goes on without anyone
 * looking (`startUpdateWatch`): "running on N machines" leaving by itself,
 * and a tab older than the dashboard reloading once no keystroke or press is
 * in hand (reload.svelte.ts).
 *
 * Every notice is acknowledged on the hub (notices.svelte.ts), by the ids of
 * the events it announces: its ✕, or acting on it, clears it for every tab
 * and device, and a reload never brings it back.
 */
import { machineLabel } from "@cawco/core";
import { cawco } from "../client.svelte";
import { leaveThePage } from "../leaving";
import { notices } from "../notices.svelte";
import { bidFarewell, reloadWhenIdle } from "../reload.svelte";
import { newerBuild } from "../served-build.svelte";
import { type Notice, noticeFor, reloadId } from "./model";
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
 * Reload chosen: what the notice said is acknowledged on the hub first, so
 * neither the reloaded tab nor any other says it again, then the tab loads
 * the build the dashboard's server is running.
 */
export async function reloadAcknowledging(acks: string[]): Promise<void> {
  await notices.acknowledge(acks);
  leaveThePage(() => location.reload());
}

/**
 * The notice's ✕: acknowledged everywhere; "running on N machines" also
 * forgets this tab's installs, and a refusal, this tab's own, is forgotten here.
 */
export function dismissUpdate(notice: Notice): void {
  if (notice.kind === 9) {
    updates.forgetRefusal(notice.machineIds);
    return;
  }
  // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
  void notices.acknowledge(notice.acks);
  if (notice.kind === 3) {
    updates.forgetCommanded();
  }
}

/** The notice's button. */
export function actOnUpdate(
  notice: Notice,
  action: NonNullable<Notice["action"]>
): void {
  if (action === "reload") {
    const build = newerBuild();
    // biome-ignore lint/complexity/noVoid: the tab goes once the acknowledgement is in
    void reloadAcknowledging([
      ...notice.acks,
      ...(build ? [reloadId(build)] : []),
    ]);
    return;
  }
  const { policy } = updates;
  if (action === "install-all" && policy) {
    // biome-ignore lint/complexity/noVoid: each machine reports its own outcome
    void updates.installAll(cawco.machines, policy);
    return;
  }
  if (notice.kind === 9) {
    // Each refused ask again, as it was asked: an install, or its cancel.
    for (const id of notice.machineIds) {
      const machine = cawco.machines.find((row) => row.machineId === id);
      if (machine) {
        // biome-ignore lint/complexity/noVoid: the machine reports its own outcome
        void updates.again(machine);
      }
    }
    return;
  }
  const machine = cawco.machines.find(
    (row) => row.machineId === notice.machineIds[0]
  );
  if (machine) {
    // biome-ignore lint/complexity/noVoid: the machine reports its own outcome
    void updates.installNow(machine);
    // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
    void notices.acknowledge(notice.acks);
  }
}

/** What runs with nobody looking at the notice. Started once from the root layout. */
export function startUpdateWatch(): () => void {
  return $effect.root(() => {
    // A tab older than the dashboard reloads itself once no input is in
    // hand (reload.svelte.ts `busy`); the reload acknowledges what the
    // notice said, as Reload does.
    const unbid = bidFarewell({
      acks: (build) => [...(updateNotice.current?.acks ?? []), reloadId(build)],
    });
    $effect(() => {
      if (newerBuild() !== null) {
        // biome-ignore lint/complexity/noVoid: a reload ends this page
        void reloadWhenIdle();
      }
    });
    $effect(() => unbid);

    // "Running on N machines" leaves by itself, unless it is also this tab's reload.
    $effect(() => {
      const notice = updateNotice.current;
      if (notice?.kind !== 3) {
        return;
      }
      const { acks } = notice;
      // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
      void notices.acknowledge(acks.filter((id) => id.startsWith("landed:")));
      if (notice.action === "reload") {
        return;
      }
      const timer = setTimeout(() => {
        // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
        void notices.acknowledge(acks);
        updates.forgetCommanded();
      }, DONE_MS);
      return () => clearTimeout(timer);
    });
  });
}
