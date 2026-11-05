import type { Account, AccountReading, AccountSignin } from "./accounts";
import { IMAGE_PROVIDERS, type ImageProviderId } from "./image-generation";
import { machineLabel } from "./machine-names";
import type { ToolStatus } from "./tools";

/**
 * Whether each image provider can make an image on each machine, read from
 * what the hub already holds, as the machine's own pre-flight (agent
 * image-providers/*.ts `readiness`) would judge it before any request:
 *
 * - chatgpt: a ChatGPT login (an `openai-codex` OAuth account) signed in
 *   there, on any plan but Free, the one plan known to make no images
 *   (chatgpt.ts `NO_IMAGES_PLAN`); the plan is the account's last reading.
 * - antigravity: the Antigravity CLI installed there, runnable, and not
 *   signed out (antigravity.ts `readiness`), as the machine's tool status
 *   last said.
 * - gemini-api: a Gemini API key (a `google` key account) signed in there
 *   (gemini-api.ts `heldKeys`).
 *
 * What only the request can tell (a ChatGPT token that won't renew, the
 * Google AI plan behind Antigravity, billing on a Gemini key's project) is
 * not read here: the call says it.
 */

/** What stops a provider making an image on one machine. */
export type ImageLack =
  | { kind: "no-login" }
  | { kind: "signed-out"; accountId: string; who: string }
  | { kind: "free-plan"; accountId: string; who: string }
  | { kind: "agy-missing" }
  | { kind: "agy-installing" }
  | { kind: "agy-broken"; detail: string }
  | { kind: "agy-signed-out" }
  | { kind: "no-key" };

/** The fields of a machine the reading takes (core protocol `AgentRow`). */
export interface ImageMachine {
  hostname: string;
  machineId: string;
  os: string;
  status: string;
  tools?: Record<string, ToolStatus>;
}

/** The accounts the reading takes (the dashboard's `/api/accounts` view). */
export interface ImageAccounts {
  accounts: Pick<Account, "email" | "id" | "kind" | "label" | "provider">[];
  readings: Pick<AccountReading, "accountId" | "subscription">[];
  signins: Pick<AccountSignin, "accountId" | "machineId" | "state">[];
}

/** One machine, as one provider stands on it. */
export interface MachineImageReadiness {
  /** Null: the provider can make an image there. */
  lack: ImageLack | null;
  machineId: string;
  name: string;
  online: boolean;
  os: string;
}

/** The plan ChatGPT makes no images on (agent chatgpt.ts `NO_IMAGES_PLAN`). */
const NO_IMAGES_PLAN = "free";

/** The account provider of a ChatGPT login, and of a Gemini API key. */
const CHATGPT_ACCOUNT = "openai-codex";
const GEMINI_ACCOUNT = "google";

const who = (account: Pick<Account, "email" | "id" | "label">): string =>
  account.label ?? account.email ?? account.id;

/**
 * An account provider's lack on one machine: none when an account of it is
 * signed in there (and, for ChatGPT, on a plan that makes images); else the
 * nearest fix: a login on the Free plan, a login signed out there, none.
 */
const accountLack = (
  machineId: string,
  fleet: ImageAccounts,
  provider: string,
  kind: Account["kind"]
): ImageLack | null => {
  const own = fleet.accounts.filter(
    (account) => account.provider === provider && account.kind === kind
  );
  const signin = (accountId: string) =>
    fleet.signins.find(
      (one) => one.accountId === accountId && one.machineId === machineId
    );
  const signedIn = own.filter(
    (account) => signin(account.id)?.state === "signed-in"
  );
  const plan = (accountId: string) =>
    fleet.readings.find((one) => one.accountId === accountId)?.subscription;
  const usable = signedIn.filter(
    (account) =>
      provider !== CHATGPT_ACCOUNT ||
      plan(account.id)?.toLowerCase() !== NO_IMAGES_PLAN
  );
  if (usable.length) {
    return null;
  }
  const [free] = signedIn;
  if (free) {
    return { kind: "free-plan", accountId: free.id, who: who(free) };
  }
  const out = own.find((account) => signin(account.id));
  if (out) {
    return { kind: "signed-out", accountId: out.id, who: who(out) };
  }
  return provider === CHATGPT_ACCOUNT
    ? { kind: "no-login" }
    : { kind: "no-key" };
};

/** The Antigravity CLI's lack on one machine, from its last tool status there. */
const agyLack = (tool: ToolStatus | undefined): ImageLack | null => {
  switch (tool?.state) {
    case "installed":
      return tool.signin?.state === "signed-out"
        ? { kind: "agy-signed-out" }
        : null;
    case "installing":
      return { kind: "agy-installing" };
    case "failed":
    case "unsupported":
      return { kind: "agy-broken", detail: tool.detail ?? tool.state };
    case "missing":
    case undefined:
      return { kind: "agy-missing" };
    default:
      return { kind: "agy-missing" };
  }
};

const lackOf = (
  provider: ImageProviderId,
  machine: ImageMachine,
  fleet: ImageAccounts | null
): ImageLack | null => {
  switch (provider) {
    case "chatgpt":
      return fleet
        ? accountLack(machine.machineId, fleet, CHATGPT_ACCOUNT, "oauth")
        : { kind: "no-login" };
    case "antigravity":
      return agyLack(machine.tools?.antigravity);
    case "gemini-api":
      return fleet
        ? accountLack(machine.machineId, fleet, GEMINI_ACCOUNT, "api_key")
        : { kind: "no-key" };
    default:
      return null;
  }
};

/** Every provider's standing on every machine, in the machines' order. */
export const imageReadiness = (
  machines: readonly ImageMachine[],
  fleet: ImageAccounts | null
): Record<ImageProviderId, MachineImageReadiness[]> =>
  Object.fromEntries(
    IMAGE_PROVIDERS.map((provider) => [
      provider,
      machines.map((machine): MachineImageReadiness => ({
        machineId: machine.machineId,
        name: machineLabel(machine.hostname),
        os: machine.os,
        online: machine.status === "online",
        lack: lackOf(provider, machine, fleet),
      })),
    ])
  ) as Record<ImageProviderId, MachineImageReadiness[]>;
