/**
 * Puts the one update notice on screen. A single custom toast under one id:
 * the box stays mounted and its props change in place, so every state
 * replaces the last in the same box. Started once from the root layout.
 */
import { machineLabel } from "@cawco/core";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { toast } from "svelte-sonner";
import { page } from "$app/state";
import { cawco } from "../client.svelte";
import { deployPending } from "../deploy-toast.svelte";
import {
  dismissKey,
  type Notice,
  noticeFor,
  type UpdateMachine,
} from "./model";
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
    const view = $state<{ notice: Notice; onPage: boolean }>({
      notice: undefined as unknown as Notice,
      onPage: false,
    });
    let shown = false;
    /** A dismissal we asked for ourselves is not the person's. */
    let ours = false;

    const commandedKey = () => [...updates.commanded].sort().join(",");
    const machines = (): UpdateMachine[] => updates.withSeen(cawco.machines);

    /** The `machineId:updatedAt` keys of the machines an updated notice stands for. */
    const updatedKeys = (ids: string[]): string[] =>
      ids.flatMap((id) => {
        const state = cawco.machines.find(
          (row) => row.machineId === id
        )?.binaryUpdate;
        return state ? [`${id}:${state.updatedAt}`] : [];
      });

    const acknowledge = (ids: string[]) => {
      for (const id of ids) {
        const machine = cawco.machines.find((row) => row.machineId === id);
        if (machine?.binaryUpdate?.unseen) {
          // biome-ignore lint/complexity/noVoid: the acknowledgement reports through the next machine frame
          void updates.acknowledge(machine);
        }
      }
    };

    /** The person closed the notice (✕ or swipe). */
    const dismiss = () => {
      if (ours) {
        return;
      }
      shown = false;
      const { notice } = view;
      switch (notice.kind) {
        case 1:
          acknowledge(notice.machineIds);
          break;
        case 6:
          // Only hides the toast in this tab; the Home card acknowledges.
          for (const key of updatedKeys(notice.machineIds)) {
            dismissed.add(key);
          }
          localStorage.setItem(STORE, JSON.stringify([...dismissed]));
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
      acknowledge(ids);
      updates.commanded.clear();
    };

    const act = (action: "retry" | "install-all") => {
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
        acknowledge([machine.machineId]);
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
            deployPending: deployPending(),
            dismissed: new Set(dismissed),
            installingDismissed: installingDismissed === commandedKey(),
            machines: machines(),
            policy,
          }
        : null;
      const found = input
        ? noticeFor(input, (hostname) => machineLabel(hostname))
        : null;
      // An updated notice the person closed stays closed in this tab.
      const notice =
        found?.kind === 6 &&
        updatedKeys(found.machineIds).every((key) => dismissed.has(key))
          ? null
          : found;
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
            onDismiss: dismiss,
            componentProps: { view, onaction: act, ondismiss: dismiss },
          });
        }
      });
    });

    // "Running on N machines" leaves by itself.
    $effect(() => {
      const { notice } = view;
      if (!(shown && notice?.kind === 3)) {
        return;
      }
      const ids = notice.machineIds;
      acknowledge(ids);
      const timer = setTimeout(() => finishDone(ids), DONE_MS);
      return () => clearTimeout(timer);
    });
  });
}
