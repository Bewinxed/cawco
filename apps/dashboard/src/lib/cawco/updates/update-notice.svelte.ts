/**
 * Puts the one update notice on screen. A single custom toast under one id:
 * the box stays mounted and its props change in place, so every state
 * replaces the last in the same box. Started once from the root layout.
 *
 * Every notice is acknowledged on the hub (notices.svelte.ts), by the ids of
 * the events it announces: closing it, or acting on it, clears it for every
 * tab and device, and a reload never brings it back. A Home card on screen
 * is the landing's one surface while it is there.
 */
import { machineLabel } from "@cawco/core";
import { untrack } from "svelte";
import { page } from "$app/state";
import { cawco } from "../client.svelte";
import { notices } from "../notices.svelte";
import { newerBuild } from "../served-build.svelte";
import { toast } from "../toasts";
import { type Notice, noticeFor } from "./model";
import UpdateNotice from "./UpdateNotice.svelte";
import { updates } from "./updates.svelte";

const ID = "cawco-update";
/** How long "running on N machines" stays up. */
const DONE_MS = 6000;

/**
 * Has sonner measure the toast `id` again once its box settled at a new
 * height, whatever changed it (UpdateNotice's ResizeObserver). svelte-sonner (1.2.1, the latest) stores each toast's
 * height when it mounts and measures it again only when its title or
 * description changes (Toast.svelte's height effect, upstream PR #76), and
 * stacks every older toast by those stored heights; a custom toast that
 * grows in place would otherwise lie over the toasts behind it. So the same
 * toast is given again, by its id, with a description naming its height. A
 * custom toast never draws its description (Toast.svelte renders the
 * component in place of title and description), so the word is never shown;
 * the update keeps its component, props, duration and onDismiss.
 */
export const remeasure =
  (id: string) =>
  (height: number): void => {
    toast.custom(UpdateNotice, { id, description: `${height}px` });
  };

/**
 * Reload chosen: what the notice said is acknowledged on the hub first, so
 * neither the reloaded tab nor any other says it again, then the tab loads
 * the build the dashboard's server is running.
 */
export async function reloadAcknowledging(acks: string[]): Promise<void> {
  await notices.acknowledge(acks);
  location.reload();
}

export function startUpdateNotice(): () => void {
  return $effect.root(() => {
    const view = $state<{ notice: Notice; onPage: boolean }>({
      notice: undefined as unknown as Notice,
      onPage: false,
    });
    let shown = false;
    /** A dismissal we asked for ourselves is not the person's. */
    let ours = false;
    /** Reload was chosen: the box says its goodbye, and nothing replaces or closes it, until the tab goes. */
    let leaving = false;

    /** The person closed the notice (its ✕). */
    const dismiss = () => {
      if (ours) {
        return;
      }
      shown = false;
      const { notice } = view;
      // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
      void notices.acknowledge(notice.acks);
      if (notice.kind === 3) {
        updates.commanded.clear();
      }
    };

    const finishDone = (acks: string[]) => {
      // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
      void notices.acknowledge(acks);
      updates.commanded.clear();
    };

    const act = (action: NonNullable<Notice["action"]>) => {
      const { notice } = view;
      if (action === "reload") {
        leaving = true;
        // biome-ignore lint/complexity/noVoid: the tab goes once the acknowledgement is in
        void reloadAcknowledging(notice.acks);
        return;
      }
      const { policy } = updates;
      if (action === "install-all" && policy) {
        // biome-ignore lint/complexity/noVoid: each machine reports its own outcome
        void updates.installAll(cawco.machines, policy);
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
    };

    const clearOurs = () => {
      ours = true;
      toast.dismiss(ID);
      setTimeout(() => {
        ours = false;
      }, 1000);
    };

    $effect(() => {
      const { policy } = updates;
      // Until the hub's record is in, no notice can know it was already seen.
      const input =
        policy && notices.known
          ? {
              commanded: new Set(updates.commanded),
              machines: cawco.machines,
              newerBuild: newerBuild(),
              policy,
              seen: new Set(notices.seen),
            }
          : null;
      const found = input
        ? noticeFor(input, (hostname) => machineLabel(hostname))
        : null;
      // A Home card on screen says the landing: one surface, never the toast and the card together.
      const notice = found?.kind === 6 && updates.cards > 0 ? null : found;
      const onPage = page.url.pathname === "/config/updates";
      untrack(() => {
        if (leaving) {
          return;
        }
        if (!notice) {
          if (shown) {
            shown = false;
            clearOurs();
          }
          return;
        }
        view.notice = notice;
        view.onPage = onPage;
        if (!shown) {
          shown = true;
          toast.custom(UpdateNotice, {
            id: ID,
            duration: Number.POSITIVE_INFINITY,
            // Closing it acknowledges it for every tab and device, so only its
            // own ✕ closes it: never a stray swipe.
            dismissible: false,
            onDismiss: dismiss,
            componentProps: {
              view,
              onaction: act,
              ondismiss: dismiss,
              onsettle: remeasure(ID),
            },
          });
        }
      });
    });

    // "Running on N machines" leaves by itself, unless it is also this tab's reload.
    $effect(() => {
      const { notice } = view;
      if (!(shown && notice?.kind === 3)) {
        return;
      }
      const { acks } = notice;
      // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
      void notices.acknowledge(acks.filter((id) => id.startsWith("landed:")));
      if (notice.action === "reload") {
        return;
      }
      const timer = setTimeout(() => finishDone(acks), DONE_MS);
      return () => clearTimeout(timer);
    });
  });
}
