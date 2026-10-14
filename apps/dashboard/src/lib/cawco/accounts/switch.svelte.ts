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
import { failureWords } from "#lib/cawco/hub-read.js";
import { cawco, type InstanceRow, moveInstanceAccount } from "../client.svelte";
import { faultOn, pendingOn } from "../session-acts.svelte";
import { accountsOf, nameOf, signinState } from "./model.svelte";

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
 * signed in on its machine.
 */
export function signedInHere(instance: InstanceRow): Account[] {
  const provider = providerOfSession(instance);
  if (!provider) {
    return [];
  }
  const signins = cawco.accounts?.signins ?? [];
  return accountsOf(provider).filter(
    (one) => signinState(signins, one.id, instance.machineId) === "signed-in"
  );
}

/** {@link signedInHere}, for the menu: empty unless there is a choice (two or more). */
export function switchable(instance: InstanceRow): Account[] {
  const eligible = signedInHere(instance);
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

/**
 * Asks the hub to move the session. Its rows say so until they name the new
 * account: "Moves to X when this turn ends" mid-turn, "Moving to X…" at
 * rest (the hub moves it at once then). A refusal stays on its rows, in the
 * hub's words, with Try again.
 */
export async function moveTo(
  instance: InstanceRow,
  accountId: string
): Promise<void> {
  if (accountId === instance.accountId || movingTo(instance) === accountId) {
    return;
  }
  const account = cawco.accounts?.accounts.find((one) => one.id === accountId);
  const name = account ? nameOf(account) : "the other account";
  const working = cawco.activityOf(instance.id) === "working";
  moving.set(instance.id, accountId);
  pendingOn(
    instance.id,
    working ? `Moves to ${name} when this turn ends` : `Moving to ${name}…`
  );
  try {
    await moveInstanceAccount(instance.id, accountId);
  } catch (error) {
    moving.delete(instance.id);
    pendingOn(instance.id, undefined);
    faultOn(instance.id, {
      reason: failureWords(error),
      again: () => moveTo(instance, accountId),
    });
  }
}

// A move is over once the session's row names its account: the entry goes,
// and its rows stop saying it moves.
$effect.root(() => {
  $effect(() => {
    for (const [id, target] of moving) {
      const row = cawco.instances.find((one) => one.id === id);
      if (!row || row.accountId === target) {
        moving.delete(id);
        pendingOn(id, undefined);
      }
    }
  });
});
