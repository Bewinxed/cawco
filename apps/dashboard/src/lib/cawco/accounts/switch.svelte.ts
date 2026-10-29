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
import type { Account, AccountProvider } from "@cawco/core/accounts";
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

/**
 * The account a session is moving to, until its row names that account: the
 * move this tab is asking for, else the one the hub keeps for its next
 * launch (its row's `owedMove`), which a reload reads the same.
 */
export function movingTo(instance: BoardRow): string | undefined {
  const target = moving.get(instance.id) ?? instance.owedMove?.accountId;
  return target && target !== instance.accountId ? target : undefined;
}

/** Whether this tab's ask for a move is on its way to the hub: no other pick goes meanwhile. */
export const asking = (instance: BoardRow): boolean => moving.has(instance.id);

/** The account a session's row draws: the one it is moving to, else its own. */
export const shownAccount = (instance: BoardRow): string | null =>
  movingTo(instance) ?? instance.accountId ?? null;

/**
 * When the move a session is making takes effect, in its rows' words, or
 * undefined when it makes none: the hub moves a session at rest (asleep,
 * stopped, stopped at its limit, or running between turns) at once; one
 * mid-turn at the turn's end; one whose background work keeps its process
 * when that work ends; one whose machine is away once that machine is
 * connected again, as its conversation is copied there. What it waits on is
 * the hub's (its row's `owedMove.waits`), never guessed: a session stopped
 * at its limit has no turn to end.
 */
export function movingWords(instance: BoardRow): string | undefined {
  const target = movingTo(instance);
  if (target === undefined) {
    return;
  }
  const account = cawco.accounts?.accounts.find((one) => one.id === target);
  const name = account ? nameOf(account) : "another account";
  if (!machineConnected(instance.machineId)) {
    const host =
      cawco.machines.find((one) => one.machineId === instance.machineId)
        ?.hostname || instance.machineId;
    return `Moves to ${name} when ${host} is connected again`;
  }
  switch (instance.owedMove?.waits) {
    case "turn":
      return `Moves to ${name} when this turn ends`;
    case "work":
      return `Moves to ${name} when its background work ends`;
    case "machine":
    case undefined:
      break;
  }
  return `Moving to ${name}…`;
}

/**
 * A session stopped at its account's limit, as an error says it (DESIGN.md's
 * error formula): what happened and when it carries on, in the hub's words
 * (its row's `stalled`), then the way out while one is open, another
 * account signed in on its machine, which moves it now. Undefined while it
 * runs, or while a move it was given is on its way (that move says itself).
 */
export function stopWords(instance: BoardRow): string | undefined {
  const { stalled } = instance;
  if (!stalled || movingTo(instance) !== undefined) {
    return;
  }
  return switchable(instance).length > 0
    ? `${stalled.words}. Pick another account to move it now.`
    : `${stalled.words}. Sign in another account on its machine to move it now.`;
}

/**
 * Asks the hub to move the session, whatever its state. Its rows say so
 * until they name the new account ({@link movingWords}). Asking for the
 * account it runs on while it owes a move calls that move off. A refusal
 * stays on its rows, in the hub's words, with Try again.
 */
export async function moveTo(
  instance: BoardRow,
  accountId: string
): Promise<void> {
  const owed = instance.owedMove?.accountId;
  if (
    asking(instance) ||
    accountId === owed ||
    (accountId === instance.accountId && owed === undefined)
  ) {
    return;
  }
  moving.set(instance.id, accountId);
  try {
    await moveInstanceAccount(instance.id, accountId);
  } catch (error) {
    moving.delete(instance.id);
    faultOn(instance.id, {
      reason: failureWords(error),
      again: () => moveTo(instance, accountId),
    });
  }
}

/** The words each session's rows were given for its move, by session. */
const said = new Map<string, string>();

/**
 * This tab's asks the hub has answered, gone: the row names the account,
 * or the hub keeps the move for it (`owedMove`), or it ran on that account
 * all along (a move called off).
 */
function settleAsks(): void {
  for (const [id, target] of moving) {
    const row = cawco.instances.find((one) => one.id === id);
    if (
      !row ||
      row.accountId === target ||
      row.owedMove?.accountId === target
    ) {
      moving.delete(id);
    }
  }
}

/** Each session's rows say the move it is making ({@link movingWords}), and stop once it makes none. */
function sayMoves(): void {
  const now = new Map<string, string>();
  for (const row of cawco.instances) {
    const words = movingWords(row);
    if (words) {
      now.set(row.id, words);
    }
  }
  for (const [id, words] of now) {
    if (said.get(id) !== words) {
      pendingOn(id, words);
      said.set(id, words);
    }
  }
  for (const id of [...said.keys()]) {
    if (!now.has(id)) {
      pendingOn(id, undefined);
      said.delete(id);
    }
  }
}

$effect.root(() => {
  $effect(() => {
    settleAsks();
    sayMoves();
  });
});
