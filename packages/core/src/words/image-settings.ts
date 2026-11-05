import type { ImageProviderId } from "../image-generation";
import type { ImageLack } from "../image-readiness";
import { unhandled } from "../unhandled";

/**
 * Configure › Models CawCo uses, its Images group: the provider and model
 * `generate_image` goes to when a call names none (hub `GET`/`PUT
 * /api/image-settings`), and where each provider can make an image now
 * (core image-readiness.ts).
 */

/** Each provider as the group names it, and what it runs on. */
const PROVIDERS: Readonly<
  Record<ImageProviderId, { name: string; runsOn: string }>
> = {
  chatgpt: {
    name: "ChatGPT",
    runsOn: "On a ChatGPT login, any plan but Free",
  },
  antigravity: {
    name: "Gemini through Antigravity",
    runsOn: "On a Google AI Pro or Ultra login",
  },
  "gemini-api": {
    name: "Gemini API",
    runsOn: "On a Gemini API key, billed per image",
  },
};

/** Where a lack is put right: a Configure page, an account's page, or ChatGPT's plans. */
export type ImageFix =
  | { kind: "page"; slug: "accounts" | "cli-tools"; label: string }
  | { kind: "account"; accountId: string; label: string };

export const imageSettingsWords = {
  heading: "Images",
  note: "The provider generate_image goes to when a call names none. The image is made on the calling session's machine.",
  /** The radio group's accessible name. */
  providers: "Image provider",
  name: (id: ImageProviderId) => PROVIDERS[id].name,
  runsOn: (id: ImageProviderId) => PROVIDERS[id].runsOn,
  /** A provider's standing across the fleet's machines (one at least), beside its name. */
  standing: (ready: number, of: number): string => {
    if (of === 1) {
      return ready === 1 ? "Ready" : "Not ready";
    }
    if (ready === of) {
      return `Ready on all ${of} machines`;
    }
    return ready === 0
      ? "Ready on no machine"
      : `Ready on ${ready} of ${of} machines`;
  },
  /** Under Machines while no machine has joined. */
  noMachines:
    "No machine has joined yet. Each machine's readiness for the chosen provider shows here once one does.",
  /** The chosen provider's machines, headed. */
  machinesHead: "Machines",
  ready: "Ready",
  offline: "offline",
  model: "Model",
  /** The provider's own default model, marked among its models. */
  modelDefault: "default",
  /** What stops a provider on one machine. */
  lack: (lack: ImageLack): string => {
    switch (lack.kind) {
      case "no-login":
        return "No ChatGPT login";
      case "signed-out":
        return `${lack.who} is signed out`;
      case "free-plan":
        return `${lack.who} is on the Free plan`;
      case "agy-missing":
        return "Antigravity CLI isn't installed";
      case "agy-installing":
        return "Antigravity CLI is installing…";
      case "agy-broken":
        return `Antigravity CLI can't run (${lack.detail})`;
      case "agy-signed-out":
        return "Antigravity CLI isn't signed in to Google";
      case "no-key":
        return "No Gemini API key";
      default:
        return unhandled("lack", lack);
    }
  },
  /** Where each lack is put right. */
  fix: (lack: ImageLack): ImageFix | null => {
    switch (lack.kind) {
      case "no-login":
      case "no-key":
        return { kind: "page", slug: "accounts", label: "Add account" };
      case "signed-out":
      case "free-plan":
        return {
          kind: "account",
          accountId: lack.accountId,
          label: "Open account",
        };
      case "agy-missing":
      case "agy-broken":
      case "agy-signed-out":
        return { kind: "page", slug: "cli-tools", label: "Open CLI tools" };
      case "agy-installing":
        return null;
      default:
        return unhandled("lack", lack);
    }
  },
  saving: "Saving…",
  saved: "Saved",
  /** A save the hub refused, in its words, and what calls still go to. */
  refused: (said: string, current: ImageProviderId) =>
    `Not saved. ${said}. Calls still go to ${PROVIDERS[current].name}.`,
  /** A save that never reached the hub: why, as a sentence of its own. */
  unsent: (why: string, current: ImageProviderId) =>
    `Not saved. ${why} Calls still go to ${PROVIDERS[current].name}.`,
  /** The setting couldn't be read. */
  unread: (clause: string) => `Could not read the image settings — ${clause}.`,
};
