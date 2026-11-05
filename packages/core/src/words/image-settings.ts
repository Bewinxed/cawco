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

/**
 * The Gemini API's models, each by the name Google gives it and what tells
 * it apart: speed, quality, and the price of one 1K image on the paid tier.
 * Read 2026-11-05 from https://aistudio.google.com/docs/models/<id>.md and
 * https://aistudio.google.com/docs/pricing.md ("Output images at 1K
 * (1024x1024px) consume 1120 tokens and are equivalent to $0.0336 per
 * image" for Nano Banana 2.1 and 2 Lite, "$0.067 per image" for Nano
 * Banana 2, "$0.134 per image" for Nano Banana Pro).
 */
const MODELS: Readonly<
  Record<string, { name: string; note: string; price: string }>
> = {
  "gemini-nano-banana-2.1": {
    name: "Nano Banana 2.1",
    note: "Fast, with sharper text and detail.",
    price: "$0.034 an image",
  },
  "gemini-3.1-flash-image": {
    name: "Nano Banana 2",
    note: "The earlier fast model.",
    price: "$0.067 an image",
  },
  "gemini-3.1-flash-lite-image": {
    name: "Nano Banana 2 Lite",
    note: "Under 2 seconds, 1K images only.",
    price: "$0.034 an image",
  },
  "gemini-3-pro-image": {
    name: "Nano Banana Pro",
    note: "Best for text, mockups and charts; slower.",
    price: "$0.134 an image",
  },
};

/** Where a lack is put right: a Configure page, an account's page, or ChatGPT's plans. */
export type ImageFix =
  | { kind: "page"; slug: "accounts" | "cli-tools"; label: string }
  | { kind: "account"; accountId: string; label: string };

export const imageSettingsWords = {
  heading: "Images",
  note: "Agents make images through this provider unless they ask for another. Each image is made on the machine the agent runs on.",
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
  /** Why the machines list is empty, under "No machines yet" and over Add machine. */
  noMachines:
    "Where the chosen provider can make an image shows here, machine by machine.",
  /** The chosen provider's machines, headed by its name. */
  machinesHead: (id: ImageProviderId) =>
    `${PROVIDERS[id].name} on each machine`,
  /** A machine's state, as its glyph is named. */
  ready: "Ready",
  notReady: "Not ready",
  installing: "Installing",
  offline: "Offline",
  /** The Gemini API's own setting, under its option. */
  model: "Model",
  /** The provider's own default model, marked among its models. */
  modelDefault: "default",
  modelName: (id: string) => MODELS[id]?.name ?? id,
  modelNote: (id: string) => MODELS[id]?.note ?? "",
  /** One 1K image on the paid tier, kept on one line. */
  modelPrice: (id: string) => MODELS[id]?.price ?? "",
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
        return { kind: "page", slug: "accounts", label: "Add login" };
      case "no-key":
        return { kind: "page", slug: "accounts", label: "Add API key" };
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
  notSaved: "Not saved",
  /** Any other refusal, in the hub's words. */
  refused: (said: string, current: ImageProviderId) =>
    `${said}. Images still go to ${PROVIDERS[current].name}.`,
  /** A save that never reached the hub: why, as a sentence of its own. */
  unsent: (why: string, current: ImageProviderId) =>
    `${why} Images still go to ${PROVIDERS[current].name}.`,
  /** The setting couldn't be read. */
  unread: (clause: string) => `Could not read the image settings — ${clause}.`,
};
