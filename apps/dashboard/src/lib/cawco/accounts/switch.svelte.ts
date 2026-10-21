/**
 * Moving a session to another account from its menu: which accounts it can
 * move to, and the move in flight. A session can move to an account of its
 * own provider that is signed in on its machine, running or not: the account
 * is the session's, and its next launch runs on it. The hub moves it whole,
 * now if it is at rest, else at its next turn boundary, or once its machine
 * is connected again; until its row names the
 * new account, the row's dot shows the account it is moving to and the menu
 * says so.
 */
import type { Account, AccountProvider } from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";
import { failureWords } from "#lib/cawco/hub-read.js";
import {
  type BoardRow,
  cawco,
  machineConnected,
  moveInstanceAccount,
} from "../client.svelte";
import { faultOn, pendingOn } from "../session-acts.svelte";
import { accountsOf, nameOf, signinState } from "./model.svelte";

/** Session id → the account it is moving to. */
const moving = new SvelteMap<string, string>();

/**
 * The provider a session bills: its account's, as the hub keeps it. A session
 * with no account on record bills none the hub knows, so it is offered no move.
 */
const providerOfSession = (instance: BoardRow): AccountProvider | undefined =>
  cawco.accounts?.accounts.find((one) => one.id === instance.accountId)
    ?.provider;

/**
 * The accounts a session can run on, in fill-first order: its provider's,
 * signed in on its machine.
 */
export function signedInHere(instance: BoardRow): Account[] {
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
export function switchable(instance: BoardRow): Account[] {
  const eligible = signedInHere(instance);
  return eligible.length > 1 ? eligible : [];
}

/** The account a session is moving to, until its row names that account. */
export function movingTo(instance: BoardRow): string | undefined {
  const target = moving.get(instance.id);
  return target && target !== instance.accountId ? target : undefined;
}

/** The account a session's row draws: the one it is moving to, else its own. */
export const shownAccount = (instance: BoardRow): string | null =>
  movingTo(instance) ?? instance.accountId ?? null;

/**
 * When a move asked now takes effect, in its rows' words: the hub moves a
 * session at rest (asleep, stopped, or running between turns) at once; one
 * mid-turn at the turn's end; one whose machine is away once that machine
 * is connected again, as its conversation is copied there.
 */
function movingWords(instance: BoardRow, name: string): string {
  if (!machineConnected(instance.machineId)) {
    const host =
      cawco.machines.find((one) => one.machineId === instance.machineId)
        ?.hostname || instance.machineId;
    return `Moves to ${name} when ${host} is connected again`;
  }
  return cawco.activityOf(instance.id) === "working"
    ? `Moves to ${name} when this turn ends`
    : `Moving to ${name}…`;
}

/**
 * Asks the hub to move the session, whatever its state. Its rows say so
 * until they name the new account ({@link movingWords}). A refusal stays on
 * its rows, in the hub's words, with Try again.
 */
export async function moveTo(
  instance: BoardRow,
  accountId: string
): Promise<void> {
  if (accountId === instance.accountId || movingTo(instance) === accountId) {
    return;
  }
  const account = cawco.accounts?.accounts.find((one) => one.id === accountId);
  const name = account ? nameOf(account) : "the other account";
  moving.set(instance.id, accountId);
  pendingOn(instance.id, movingWords(instance, name));
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
