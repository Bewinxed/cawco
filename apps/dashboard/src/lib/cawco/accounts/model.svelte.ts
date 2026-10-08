/**
 * Configure → Accounts, as data: what an account is called and drawn in,
 * where it is signed in, how a provider's routing reads in a line, and which
 * accounts the rail counts as faults. Everything here is derived from what
 * `/api/accounts` answered (`cawco.accounts`) and the fleet's machines.
 */
import {
  type Account,
  type AccountHue,
  type AccountSignin,
  accountName,
  machineLabel,
  type PlacementStrategy,
  type ProviderRouting,
  type SigninState,
} from "@cawco/core";
import { cawco } from "../client.svelte";
import { planName } from "../usage";

/** The colour token an account is drawn in. */
export const hueVar = (hue: AccountHue): string => `var(--account-${hue})`;

/** The colours an account can take, in the order the swatches offer them. */
export const SWATCHES: readonly AccountHue[] = [
  "orange",
  "cyan",
  "green",
  "amber",
  "blue",
];

/** A new account's colour: the first swatch no account wears yet. */
export const nextHue = (accounts: Account[]): AccountHue =>
  SWATCHES.find((hue) => !accounts.some((one) => one.hue === hue)) ??
  SWATCHES[accounts.length % SWATCHES.length];

/** The name it goes by: its nickname, else its email. */
export const nameOf = (
  account: Pick<Account, "email" | "id" | "label">
): string => accountName(account);

/** The machines that can sign an account in: those with Claude Code. */
export function claudeMachines() {
  return cawco.machines.filter((machine) =>
    machine.harnesses?.some((entry) => entry.harness === "claude")
  );
}

export type ClaudeMachine = ReturnType<typeof claudeMachines>[number];

export const machineName = (machine: ClaudeMachine): string =>
  machineLabel(machine.hostname);

/** A machine that can take a sign-in now: its daemon is connected. */
export const machineOnline = (machine: ClaudeMachine): boolean =>
  machine.status === "online";

/** The hub's accounts, in fill-first order; empty until read. */
export const accountsOf = (): Account[] =>
  [...(cawco.accounts?.accounts ?? [])].sort((a, b) => a.order - b.order);

/** The machines an account is signed in on. */
export const signedInCount = (account: Account): number =>
  (cawco.accounts?.signins ?? []).filter(
    (one) => one.accountId === account.id && one.state === "signed-in"
  ).length;

/** Where the account stands on a machine; signed out when the hub has no row. */
export function signinState(
  signins: AccountSignin[],
  accountId: string,
  machineId: string
): SigninState {
  return (
    signins.find(
      (one) => one.accountId === accountId && one.machineId === machineId
    )?.state ?? "signed-out"
  );
}

/**
 * An account the rail counts as a fault: one a machine signed in as
 * somebody else, or one signed in nowhere.
 */
export function faulted(account: Account, signins: AccountSignin[]): boolean {
  const mine = signins.filter((one) => one.accountId === account.id);
  return (
    mine.some((one) => one.state === "mismatch") ||
    !mine.some((one) => one.state === "signed-in")
  );
}

/** The accounts the Accounts rail entry flags. */
export function accountFaults(): number {
  const view = cawco.accounts;
  return view
    ? view.accounts.filter((account) => faulted(account, view.signins)).length
    : 0;
}

/**
 * What the row says it is: the plan its Claude Code reported (as the usage
 * panel names it), "Console" for an organization billed by usage, and the
 * kind itself until a session has reported a plan.
 */
export function planOf(account: Account): string {
  if (account.kind === "console") {
    return "Console";
  }
  const reading = cawco.accounts?.readings.find(
    (one) => one.accountId === account.id
  );
  return planName(reading?.subscription ?? null) ?? "Subscription";
}

/** The provider's routing as the hub holds it (its defaults until saved). */
export const routingOf = (): ProviderRouting | null =>
  cawco.accounts?.routing.find((one) => one.provider === "anthropic") ?? null;

/** A strategy, as the picker draws it and its figure plays it. */
export interface Strategy {
  board: "pinned" | "fill" | "spread" | "soonest";
  id: PlacementStrategy;
  label: string;
  line: string;
}

export const STRATEGIES: readonly Strategy[] = [
  {
    id: "pinned",
    board: "pinned",
    label: "Pinned",
    line: "Always one account",
  },
  {
    id: "fill-first",
    board: "fill",
    label: "Fill first",
    line: "In your order; the next when one is blocked",
  },
  {
    id: "spread",
    board: "spread",
    label: "Spread",
    line: "The account with the most headroom",
  },
  {
    id: "soonest-reset",
    board: "soonest",
    label: "Soonest reset",
    line: "Whose 5-hour window resets first",
  },
];

export const strategyLabel = (id: PlacementStrategy): string =>
  STRATEGIES.find((one) => one.id === id)?.label ?? id;

/** The account a pinned choice names: its own, else the first in order. */
export function pinnedOf(
  accounts: Account[],
  pinnedAccountId: string | undefined
): Account | undefined {
  return (
    accounts.find((one) => one.id === pinnedAccountId) ??
    [...accounts].sort((a, b) => a.order - b.order)[0]
  );
}

/** "Pinned to you@gmail.com" or "Soonest reset". */
export function choiceLine(
  accounts: Account[],
  choice: ProviderRouting["yours"]
): string {
  const label = strategyLabel(choice.strategy);
  if (choice.strategy !== "pinned") {
    return label;
  }
  const pinned = pinnedOf(accounts, choice.pinnedAccountId);
  return pinned ? `${label} to ${nameOf(pinned)}` : label;
}

/** "You: Pinned to you@gmail.com · Delegates: Soonest reset". */
export const routingLine = (
  accounts: Account[],
  routing: Pick<ProviderRouting, "yours" | "delegates">
): string =>
  `You: ${choiceLine(accounts, routing.yours)} · Delegates: ${choiceLine(accounts, routing.delegates)}`;

/** "a, b and c". */
export function listed(names: string[]): string {
  if (names.length < 2) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The terms that cover moving a conversation between subscriptions. */
export const TERMS_URL = "https://code.claude.com/docs/en/legal-and-compliance";
