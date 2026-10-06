/**
 * Puts the one update notice on screen. A single custom toast under one id:
 * the box stays mounted and its props change in place, so every state
 * replaces the last in the same box. Started once from the root layout.
 *
 * A landing (an install or a rollback that finished) is seen once, by
 * anyone, anywhere: closing it acknowledges it on its machine, which clears
 * it for every tab and device. A Home card on screen is the landing's one
 * surface while it is there.
 */
import { machineLabel } from "@cawco/core";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { toast } from "svelte-sonner";
import { page } from "$app/state";
import { cawco } from "../client.svelte";
import { servedNewer } from "../served-build.svelte";
import { dismissKey, type Notice, noticeFor } from "./model";
import UpdateNotice from "./UpdateNotice.svelte";
import { updates } from "./updates.svelte";

const ID = "cawco-update";
const STORE = "cawco.update.dismissed";
/** How long "running on N machines" stays up. */
const DONE_MS = 6000;

function stored(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function startUpdateNotice(): () => void {
  return $effect.root(() => {
    const dismissed = new SvelteSet<string>(stored());
    /** The commanded set the person dismissed notice 2 for. */
    let installingDismissed = $state("");
    /** The person closed the reload: this tab stays as it is. */
    let reloadDismissed = $state(false);
    const view = $state<{ notice: Notice; onPage: boolean }>({
      notice: undefined as unknown as Notice,
      onPage: false,
    });
    let shown = false;
    /** A dismissal we asked for ourselves is not the person's. */
    let ours = false;

    const commandedKey = () => [...updates.commanded].sort().join(",");

    /** Acknowledges the landings of the machines a notice stands for. */
    const acknowledge = (ids: string[]): Promise<unknown> =>
      Promise.all(
        ids.map((id) => {
          const machine = cawco.machines.find((row) => row.machineId === id);
          return machine ? updates.acknowledge(machine) : undefined;
        })
      );

    /** The person closed the notice (✕ or swipe). */
    const dismiss = () => {
      if (ours) {
        return;
      }
      shown = false;
      const { notice } = view;
      if (notice.action === "reload") {
        // Closing the reload keeps this tab as it is, and its landing seen.
        reloadDismissed = true;
      }
      switch (notice.kind) {
        case 1:
        case 6:
          // biome-ignore lint/complexity/noVoid: the acknowledgement reports through the next machine frame
          void acknowledge(notice.machineIds);
          break;
        case 7:
          break;
        case 2:
          installingDismissed = commandedKey();
          break;
        case 3:
          finishDone(notice.machineIds);
          break;
        default:
          dismissed.add(dismissKey(notice));
          localStorage.setItem(STORE, JSON.stringify([...dismissed]));
      }
    };

    const finishDone = (ids: string[]) => {
      // biome-ignore lint/complexity/noVoid: the acknowledgement reports through the next machine frame
      void acknowledge(ids);
      updates.commanded.clear();
    };

    const act = (action: NonNullable<Notice["action"]>) => {
      if (action === "reload") {
        // The landing the reload stands for is seen by reloading for it.
        // biome-ignore lint/complexity/noVoid: the reload waits on the acknowledgement, and nothing waits on the reload
        void acknowledge(view.notice.machineIds).finally(() =>
          location.reload()
        );
        return;
      }
      const { policy } = updates;
      if (action === "install-all" && policy) {
        // biome-ignore lint/complexity/noVoid: each machine reports its own outcome
        void updates.installAll(cawco.machines, policy);
        return;
      }
      const machine = cawco.machines.find(
        (row) => row.machineId === view.notice.machineIds[0]
      );
      if (machine) {
        // biome-ignore lint/complexity/noVoid: the machine reports its own outcome
        void updates.installNow(machine);
        // biome-ignore lint/complexity/noVoid: the acknowledgement reports through the next machine frame
        void acknowledge([machine.machineId]);
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
      const input = policy
        ? {
            commanded: new Set(updates.commanded),
            dismissed: new Set(dismissed),
            installingDismissed: installingDismissed === commandedKey(),
            machines: updates.withSeen(cawco.machines),
            policy,
            stale: servedNewer() && !reloadDismissed,
          }
        : null;
      const found = input
        ? noticeFor(input, (hostname) => machineLabel(hostname))
        : null;
      // A Home card on screen says the landing: one surface, never the toast and the card together.
      const notice = found?.kind === 6 && updates.cards > 0 ? null : found;
      const onPage = page.url.pathname === "/config/updates";
      untrack(() => {
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
            // Closing it acknowledges a landing on its machine, for every tab and device, so only its
            // own ✕ closes it: never a stray swipe.
            dismissible: false,
            onDismiss: dismiss,
            componentProps: { view, onaction: act, ondismiss: dismiss },
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
      const ids = notice.machineIds;
      // biome-ignore lint/complexity/noVoid: the acknowledgement reports through the next machine frame
      void acknowledge(ids);
      if (notice.action === "reload") {
        return;
      }
      const timer = setTimeout(() => finishDone(ids), DONE_MS);
      return () => clearTimeout(timer);
    });
  });
}
