/**
 * Moving a session to another account from its menu: which accounts it can
 * move to, and the move in flight. A session can move to an account of its
 * own provider that is signed in on its machine. The hub moves it whole, now
 * if it is at rest, else at its next turn boundary; until its row names the
 * new account, the row's dot shows the account it is moving to and the menu
 * says so.
 */
import { type Account, type AccountProvider, providerOf } from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";
import { cawco, type InstanceRow, moveInstanceAccount } from "../client.svelte";
import { toast } from "../toasts.js";
import { accountsOf, signinState } from "./model.svelte";

/** Session id → the account it is moving to. */
const moving = new SvelteMap<string, string>();

/** The provider a session bills: its account's, else its model's. */
function providerOfSession(instance: InstanceRow): AccountProvider | undefined {
  const own = cawco.accounts?.accounts.find(
    (one) => one.id === instance.accountId
  );
  return (
    own?.provider ?? providerOf(instance.harness ?? "claude", instance.model)
  );
}

/**
 * The accounts a session can run on, in fill-first order: its provider's,
 * signed in on its machine. Empty unless there is a choice (two or more).
 */
export function switchable(instance: InstanceRow): Account[] {
  const provider = providerOfSession(instance);
  if (!provider) {
    return [];
  }
  const signins = cawco.accounts?.signins ?? [];
  const eligible = accountsOf(provider).filter(
    (one) => signinState(signins, one.id, instance.machineId) === "signed-in"
  );
  return eligible.length > 1 ? eligible : [];
}

/** The account a session is moving to, until its row names that account. */
export function movingTo(instance: InstanceRow): string | undefined {
  const target = moving.get(instance.id);
  return target && target !== instance.accountId ? target : undefined;
}

/** The account a session's row draws: the one it is moving to, else its own. */
export const shownAccount = (instance: InstanceRow): string | null =>
  movingTo(instance) ?? instance.accountId ?? null;

/** Asks the hub to move the session; its refusal is a toast in its words. */
export async function moveTo(
  instance: InstanceRow,
  accountId: string
): Promise<void> {
  if (accountId === instance.accountId || movingTo(instance) === accountId) {
    return;
  }
  moving.set(instance.id, accountId);
  try {
    await moveInstanceAccount(instance.id, accountId);
  } catch (error) {
    moving.delete(instance.id);
    toast.error(error instanceof Error ? error.message : String(error));
  }
}

// A move is over once the session's row names its account: the entry goes.
$effect.root(() => {
  $effect(() => {
    for (const [id, target] of moving) {
      const row = cawco.instances.find((one) => one.id === id);
      if (!row || row.accountId === target) {
        moving.delete(id);
      }
    }
  });
});
