/**
 * Configure → Accounts, as data: the providers the fleet knows, what an
 * account is called and drawn in, where it is signed in and what is wrong
 * with that, how a provider's routing reads in a line, and which accounts the
 * rail counts as faults. Everything here is derived from what `/api/accounts`
 * and `/api/accounts/providers` answered (`cawco.accounts`,
 * `cawco.accountProviders`) and the fleet's machines.
 */
import {
  ACCOUNT_RULES,
  type Account,
  type AccountHue,
  type AccountProvider,
  type AccountSignin,
  accountName,
  CLAUDE_PROVIDER,
  type HarnessKind,
  type HomeStore,
  LIMITED_PROVIDERS,
  machineLabel,
  type PlacementStrategy,
  type ProviderChoice,
  type ProviderRouting,
  type RebalanceNotice,
  type SigninState,
  accountsWords as words,
} from "@cawco/core";
import { cawco } from "../client.svelte";

/** The colour token an account is drawn in. */
export const hueVar = (hue: AccountHue): string => `var(--account-${hue})`;

/** The colours an account can take, in the order the swatches offer them. */
export const SWATCHES: readonly AccountHue[] = words.swatches.map(
  (swatch) => swatch.hue
);

/** A new account's colour: the first swatch none of its provider's accounts wears. */
export const nextHue = (accounts: Account[]): AccountHue =>
  SWATCHES.find((hue) => !accounts.some((one) => one.hue === hue)) ??
  SWATCHES[accounts.length % SWATCHES.length];

const ELLIPSIS = /^…/;

/**
 * The name it goes by: its nickname, else its email; a key with no nickname
 * goes by its last four characters (its identity's email is `…a1b2`).
 */
export const nameOf = (
  account: Pick<Account, "email" | "id" | "label"> &
    Partial<Pick<Account, "kind">>
): string => {
  if (account.kind === "api_key" && !account.label && account.email) {
    return words.keyTail(account.email.replace(ELLIPSIS, "").slice(-4));
  }
  return accountName(account);
};

// ── Providers ───────────────────────────────────────────────────────────

/** The picker's rows, as the hub serves them; empty until read. */
export const choicesOf = (): ProviderChoice[] => cawco.accountProviders ?? [];

/** A provider row as the picker names it: "OpenRouter API key", "Anthropic Console". */
export function choiceLabel(choice: ProviderChoice): string {
  if (choice.provider === CLAUDE_PROVIDER) {
    return choice.kind === "console" ? words.anthropicConsole : words.claude;
  }
  return choice.name;
}

/** What a provider is called: its first picker row's name ("Claude" for Anthropic). */
export const providerName = (provider: AccountProvider): string =>
  choicesOf().find((one) => one.provider === provider)?.name ??
  (provider === CLAUDE_PROVIDER ? words.claude : provider);

/** The harnesses that use an account of a provider. */
function providerHarnesses(provider: AccountProvider): HarnessKind[] {
  if (provider === CLAUDE_PROVIDER) {
    return ["claude"];
  }
  return [
    ...new Set(
      choicesOf()
        .filter((one) => one.provider === provider)
        .flatMap((one) => one.harnesses)
    ),
  ];
}

/** Whether CawCo reads the provider's limits: reserves and at-limit moves apply. */
export const providerLimits = (provider: AccountProvider): boolean =>
  LIMITED_PROVIDERS.includes(provider);

/** The order harnesses are named in: "OpenCode and pi". */
const HARNESS_ORDER: readonly HarnessKind[] = ["claude", "opencode", "pi"];

/** "Claude Code", "OpenCode and pi": the harnesses that use a provider's accounts. */
export const harnessWords = (provider: AccountProvider): string =>
  words.harnessList(
    HARNESS_ORDER.filter((harness) =>
      providerHarnesses(provider).includes(harness)
    ).map((harness) => words.harnesses[harness])
  );

// ── Machines ────────────────────────────────────────────────────────────

/** The machines that run any of a provider's harnesses: those an account of it signs in on. */
export function machinesFor(provider: AccountProvider) {
  const harnesses = providerHarnesses(provider);
  return cawco.machines.filter((machine) =>
    machine.harnesses?.some((entry) =>
      harnesses.includes(entry.harness as HarnessKind)
    )
  );
}

export type AccountMachine = ReturnType<typeof machinesFor>[number];

export const machineName = (machine: AccountMachine): string =>
  machineLabel(machine.hostname);

/** A machine that can take a sign-in now: its daemon is connected. */
export const machineOnline = (machine: AccountMachine): boolean =>
  machine.status === "online";

// ── Accounts ────────────────────────────────────────────────────────────

/** The hub's accounts (one provider's, given one), in fill-first order; empty until read. */
export const accountsOf = (provider?: AccountProvider): Account[] =>
  (cawco.accounts?.accounts ?? [])
    .filter((one) => provider === undefined || one.provider === provider)
    .sort((a, b) => a.order - b.order);

/** One provider's accounts, as the list groups them. */
interface ProviderGroup {
  accounts: Account[];
  name: string;
  provider: AccountProvider;
}

/**
 * Each provider that has an account, in the picker's order; a provider no
 * connected machine knows any more (its machines are offline) after them.
 */
export function groupsOf(): ProviderGroup[] {
  const accounts = accountsOf();
  const known = [...new Set(choicesOf().map((one) => one.provider))];
  const rest = [...new Set(accounts.map((one) => one.provider))]
    .filter((provider) => !known.includes(provider))
    .sort();
  return [...known, ...rest].flatMap((provider) => {
    const mine = accounts.filter((one) => one.provider === provider);
    return mine.length > 0
      ? [{ provider, name: providerName(provider), accounts: mine }]
      : [];
  });
}

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
 * What is wrong with an account, in its row's one line, or null: a machine
 * signed it in as somebody else, it is signed in nowhere, or an online
 * machine that runs its harnesses doesn't have it. An offline machine is
 * not a problem.
 */
export function problemOf(account: Account): string | null {
  const signins = (cawco.accounts?.signins ?? []).filter(
    (one) => one.accountId === account.id
  );
  const online = machinesFor(account.provider).filter(machineOnline);
  const someoneElse = online.find(
    (machine) =>
      signinState(signins, account.id, machine.machineId) === "mismatch"
  );
  if (someoneElse) {
    return words.problem.someoneElse(machineName(someoneElse));
  }
  if (!signins.some((one) => one.state === "signed-in")) {
    return words.problem.nowhere;
  }
  const missing = online.filter(
    (machine) =>
      signinState(signins, account.id, machine.machineId) !== "signed-in"
  );
  if (missing.length === 0) {
    return null;
  }
  return words.problem.missingOn(machineName(missing[0]), missing.length - 1);
}

/** A store a login moved from, by the harness that kept it. */
const STORE_WORDS: Record<HomeStore, string> = words.harnesses;

/**
 * A machine's own login moved into CawCo: the account it went into, the
 * store and machine it came from and when, and whether a machine that runs
 * the account's harnesses still lacks it. Its notice id is acknowledged on
 * the hub once.
 */
export interface MovedLogin {
  account: Account;
  at: number;
  /** "from OpenCode on gauntlet". */
  from: string;
  id: string;
  /** Online machines that could use it and aren't signed in to it yet. */
  missing: number;
  /** What it is called in the notice: a key leads with its provider ("Anthropic key ••••4DEY"). */
  name: string;
}

/**
 * An account's name where nothing around it says what it is: a key with no
 * nickname goes by four characters, so its provider and "key" lead.
 */
export const namedForNotice = (account: Account): string =>
  account.kind === "api_key" && !account.label
    ? `${account.provider === CLAUDE_PROVIDER ? "Anthropic" : providerName(account.provider)} key ${nameOf(account)}`
    : nameOf(account);

/** Every move whose notice nobody has acknowledged, newest first. */
export function movedLogins(seen: ReadonlySet<string>): MovedLogin[] {
  const view = cawco.accounts;
  if (!view) {
    return [];
  }
  return view.signins
    .flatMap((signin) => {
      const account = view.accounts.find((one) => one.id === signin.accountId);
      const from = cawco.machines.find(
        (one) => one.machineId === signin.machineId
      );
      if (!(account && signin.movedAt !== null && from)) {
        return [];
      }
      const id = `moved-login:${account.id}:${signin.machineId}:${signin.movedAt}`;
      if (seen.has(id)) {
        return [];
      }
      return [
        {
          account,
          at: signin.movedAt,
          from: `from ${STORE_WORDS[signin.movedFrom ?? "claude"]} on ${machineLabel(from.hostname)}`,
          id,
          missing: machinesFor(account.provider).filter(
            (machine) =>
              machineOnline(machine) &&
              signinState(view.signins, account.id, machine.machineId) !==
                "signed-in"
          ).length,
          name: namedForNotice(account),
        },
      ];
    })
    .sort((a, b) => b.at - a.at);
}

/** What adding an account set moving, nobody has acknowledged yet, newest first. */
export const rebalancesUnseen = (
  seen: ReadonlySet<string>
): RebalanceNotice[] =>
  (cawco.accounts?.rebalances ?? []).filter((one) => !seen.has(one.id));

/**
 * An account the rail counts as a fault: one a machine signed in as
 * somebody else, or one signed in nowhere.
 */
function faulted(account: Account, signins: AccountSignin[]): boolean {
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

// ── Routing ─────────────────────────────────────────────────────────────

/** A provider's routing as the hub holds it (its defaults until saved). */
export const routingOf = (provider: AccountProvider): ProviderRouting | null =>
  cawco.accounts?.routing.find((one) => one.provider === provider) ?? null;

/** A strategy, as the picker draws it and its figure plays it. */
export interface Strategy {
  board: "pinned" | "fill" | "spread" | "soonest";
  id: PlacementStrategy;
  label: string;
  line: string;
}

/** The figure each strategy plays. */
const BOARDS: Record<PlacementStrategy, Strategy["board"]> = {
  pinned: "pinned",
  "fill-first": "fill",
  spread: "spread",
  "soonest-reset": "soonest",
};

/** The strategies, in the picker's order, as core's words name them. */
export const STRATEGIES: readonly Strategy[] = words.strategies.map(
  (strategy) => ({ ...strategy, board: BOARDS[strategy.id] })
);

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
function choiceLine(
  accounts: Account[],
  choice: ProviderRouting["yours"]
): string {
  const label = strategyLabel(choice.strategy);
  if (choice.strategy !== "pinned") {
    return label;
  }
  const pinned = pinnedOf(accounts, choice.pinnedAccountId);
  return pinned ? words.routingEditor.pinnedTo(label, nameOf(pinned)) : label;
}

/** "You: Pinned to you@gmail.com · Delegates: Soonest reset". */
export const routingLine = (
  accounts: Account[],
  routing: Pick<ProviderRouting, "yours" | "delegates">
): string =>
  words.routingEditor.line(
    choiceLine(accounts, routing.yours),
    choiceLine(accounts, routing.delegates)
  );

/** The terms that cover moving a conversation between subscriptions. */
export const TERMS_URL = ACCOUNT_RULES.termsUrl;
