/**
 * Every account sign-in under way in this tab, by `account:machine`
 * (DESIGN.md, The Work Outlives Its Surface Rule). A sign-in belongs to the
 * account on that machine, not to the popover or setup step that drew it:
 * putting the popover away or leaving the page keeps the flow (a device
 * code's wait goes on, since the hub only finishes it while someone waits),
 * and drawing it again draws the same flow, link or code as it was. A flow
 * made here takes up what the hub kept of a sign-in already under way
 * (`AccountsView.pending`), so a reload shows the same link or code again;
 * an idle one already made takes it up as the accounts read that carries it
 * lands (`takeAccounts`, which the app's start hands it: {@link startFlows}),
 * never from an effect of the surface that draws it.
 *
 * A setup that has not made its account yet keys its flows by `new:…`, and
 * hands them to the account's key once it is made (`adoptFlows`).
 */
import type { PendingAccountSignin } from "@cawco/core/accounts";
import { SvelteMap } from "svelte/reactivity";
import { accountsStore, takeAccounts } from "../stores/accounts.svelte";

import { codexAsks, DeviceFlow } from "./device.svelte";
import { SigninFlow } from "./signin.svelte";

const flows = new SvelteMap<string, SigninFlow | DeviceFlow>();

export const flowKey = (accountId: string, machineId: string): string =>
  `${accountId}:${machineId}`;

/**
 * Each accounts read from now on: the flow under each sign-in the hub says
 * is under way takes up its link or code (a flow already under way keeps
 * its own). The app starts it once (start.ts `startApp`); importing this
 * module starts nothing, and a read that lands before the start is taken up
 * by the flow made after it (a flow takes up what the hub kept as it is
 * made). Returns its stop.
 */
export const startFlows = (): (() => void) =>
  takeAccounts((view) => {
    for (const pending of view.pending) {
      flows
        .get(
          pending.codex
            ? codexKey(pending.accountId, pending.machineId)
            : flowKey(pending.accountId, pending.machineId)
        )
        ?.resume(pending);
    }
  });

/**
 * What the hub kept of a sign-in under way for the account on the machine:
 * its own, or (`codex`) Codex's own.
 */
export const pendingOf = (
  accountId: string | null,
  machineId: string,
  codex = false
): PendingAccountSignin | undefined =>
  accountId === null
    ? undefined
    : accountsStore.accounts?.pending?.find(
        (one) =>
          one.accountId === accountId &&
          one.machineId === machineId &&
          (one.codex ?? false) === codex
      );

/** The flow under `key`, made (and caught up from the hub) when there is none. */
function flow<T extends SigninFlow | DeviceFlow>(
  key: string,
  Kind: new (account: () => Promise<string>, machineId: string) => T,
  account: () => Promise<string>,
  accountId: string | null,
  machineId: string
): T {
  const held = flows.get(key);
  if (held instanceof Kind) {
    return held;
  }
  const made = new Kind(account, machineId);
  made.resume(pendingOf(accountId, machineId));
  flows.set(key, made);
  return made;
}

/** A Claude Code login's flow: link, pasted code. */
export const pasteFlow = (
  key: string,
  account: () => Promise<string>,
  machineId: string,
  accountId: string | null
): SigninFlow => flow(key, SigninFlow, account, accountId, machineId);

/** A provider's device-code flow. */
export const deviceFlow = (
  key: string,
  account: () => Promise<string>,
  machineId: string,
  accountId: string | null
): DeviceFlow => flow(key, DeviceFlow, account, accountId, machineId);

/** The key of Codex's own sign-in for the account on the machine, beside the provider's. */
export const codexKey = (accountId: string, machineId: string): string =>
  `${flowKey(accountId, machineId)}:codex`;

/** Codex's own device-code flow for the account on the machine, made when there is none. */
export function codexFlow(
  account: () => Promise<string>,
  accountId: string,
  machineId: string
): DeviceFlow {
  const key = codexKey(accountId, machineId);
  const held = flows.get(key);
  if (held instanceof DeviceFlow) {
    return held;
  }
  const made = new DeviceFlow(account, machineId, codexAsks);
  made.resume(pendingOf(accountId, machineId, true));
  flows.set(key, made);
  return made;
}

/** The flow under `key`, if one is under way or has an outcome to show. */
export const heldFlow = (key: string): SigninFlow | DeviceFlow | undefined =>
  flows.get(key);

/** The sign-in is over and acknowledged: the next one starts afresh. */
export function dropFlow(key: string): void {
  const held = flows.get(key);
  if (held instanceof DeviceFlow) {
    held.dispose();
  }
  flows.delete(key);
}

/** A setup's flows, keyed before its account was made, under that account's keys now. */
export function adoptFlows(from: string, accountId: string): void {
  for (const [key, held] of [...flows]) {
    if (key.startsWith(`${from}:`)) {
      flows.delete(key);
      flows.set(flowKey(accountId, key.slice(from.length + 1)), held);
    }
  }
}
