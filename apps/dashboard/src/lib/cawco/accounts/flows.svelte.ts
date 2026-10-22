/**
 * Every account sign-in under way in this tab, by `account:machine`
 * (DESIGN.md, The Work Outlives Its Surface Rule). A sign-in belongs to the
 * account on that machine, not to the popover or setup step that drew it:
 * putting the popover away or leaving the page keeps the flow (a device
 * code's wait goes on, since the hub only finishes it while someone waits),
 * and drawing it again draws the same flow, link or code as it was. A flow
 * made here takes up what the hub kept of a sign-in already under way
 * (`AccountsView.pending`), so a reload shows the same link or code again.
 *
 * A setup that has not made its account yet keys its flows by `new:…`, and
 * hands them to the account's key once it is made (`adoptFlows`).
 */
import type { PendingAccountSignin } from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";
import { cawco } from "../client.svelte";
import { DeviceFlow } from "./device.svelte";
import { SigninFlow } from "./signin.svelte";

const flows = new SvelteMap<string, SigninFlow | DeviceFlow>();

export const flowKey = (accountId: string, machineId: string): string =>
  `${accountId}:${machineId}`;

/** What the hub kept of a sign-in under way for the account on the machine. */
export const pendingOf = (
  accountId: string | null,
  machineId: string
): PendingAccountSignin | undefined =>
  accountId === null
    ? undefined
    : cawco.accounts?.pending?.find(
        (one) => one.accountId === accountId && one.machineId === machineId
      );

/** The flow under `key`, made (and caught up from the hub) when there is none. */
function flow<T extends SigninFlow | DeviceFlow>(
  key: string,
  make: () => T,
  accountId: string | null,
  machineId: string
): T {
  const held = flows.get(key) as T | undefined;
  if (held) {
    return held;
  }
  const made = make();
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
): SigninFlow =>
  flow(key, () => new SigninFlow(account, machineId), accountId, machineId);

/** A provider's device-code flow. */
export const deviceFlow = (
  key: string,
  account: () => Promise<string>,
  machineId: string,
  accountId: string | null
): DeviceFlow =>
  flow(key, () => new DeviceFlow(account, machineId), accountId, machineId);

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
