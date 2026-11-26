/**
 * Which harnesses a person may pick for a machine: those a start can run on
 * there, by the rule the hub refuses a start by (core
 * accounts/harness-signins.ts `hasHarnessSignin`). Installed, and, for a
 * harness each account signs in itself (descriptor `homeLogin` "none"), an
 * account signed in for it there. Every place a harness is picked for a
 * machine reads it here.
 */

import { hasHarnessSignin } from "@cawco/core/accounts/harness-signins";
import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
import type { AgentRow } from "@cawco/core/protocol";
import { accountsStore } from "./stores/accounts.svelte";

type OfferMachine = Pick<AgentRow, "harnesses" | "machineId">;

/** The harnesses installed on `machine`, in {@link HARNESSES} order. */
export const installedOn = (
  machine: OfferMachine | null | undefined
): HarnessKind[] =>
  HARNESSES.filter((kind) =>
    machine?.harnesses?.some(
      (entry) => entry.harness === kind && entry.installed
    )
  );

/**
 * Whether `machineId` holds a sign-in a start of `harness` can run on. Until
 * the hub's accounts are read it does: the hub's own refusal of a start
 * says so then, and a picker that opened before the read never drops the
 * person's harness for it.
 */
export const signedInOn = (
  harness: HarnessKind,
  machineId: string
): boolean => {
  const view = accountsStore.accounts;
  const choices = accountsStore.accountProviders;
  if (!(view && choices)) {
    return true;
  }
  return hasHarnessSignin(harness, machineId, {
    accounts: view.accounts,
    apart: { codex: view.codexSignins },
    choices,
    signins: view.signins,
  });
};

/** What a harness picker shows for `machine`: the harnesses a start can run on, and those installed with no account signed in for them. */
export const harnessOffer = (
  machine: OfferMachine | null | undefined
): { offered: HarnessKind[]; unsigned: HarnessKind[] } => {
  const installed = installedOn(machine);
  const unsigned = machine
    ? installed.filter((kind) => !signedInOn(kind, machine.machineId))
    : [];
  return {
    offered: installed.filter((kind) => !unsigned.includes(kind)),
    unsigned,
  };
};

/** The harnesses a start can run on on any of `machines`, in {@link HARNESSES} order. */
export const offeredOnAny = (
  machines: readonly OfferMachine[]
): HarnessKind[] =>
  HARNESSES.filter((kind) =>
    machines.some((machine) => harnessOffer(machine).offered.includes(kind))
  );
