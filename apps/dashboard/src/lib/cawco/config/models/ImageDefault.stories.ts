/**
 * Models CawCo uses › Images (Component Story Format 3, live components):
 * the provider and model `generate_image` goes to when a call names none,
 * and where the chosen provider can make an image, on the owner's four
 * machines (image-fixtures.ts). The meta's args are every story's; a
 * story's own args are what it changes.
 */
import { imageReadiness } from "@cawco/core/image-readiness";
import { imageSettingsWords } from "@cawco/core/words/image-settings";
import ImageDefault from "./ImageDefault.svelte";
import {
  ACCOUNTS,
  MACHINES,
  NO_MACHINES,
  READY_ACCOUNTS,
  READY_MACHINES,
} from "./image-fixtures";

const none = () => undefined;
const today = imageReadiness(MACHINES, ACCOUNTS);

export default {
  title: "Configure/Models/Images",
  component: ImageDefault,
  args: {
    hue: "var(--color-hue-orange-500)",
    value: { provider: "chatgpt", model: null },
    readiness: today,
    phase: "idle",
    fault: null,
    onchoose: none,
  },
  parameters: { viewport: 1100 },
};

/** Nothing set: calls go to ChatGPT, which uwucloud and niftybot.art can't run. */
export const NothingSet = { args: {} };

/** Every machine holds every sign-in: each provider reads ready on all four. */
export const AllReady = {
  args: { readiness: imageReadiness(READY_MACHINES, READY_ACCOUNTS) },
};

/** Antigravity chosen: installed and signed in only on obelisk-of-light. */
export const Antigravity = {
  args: { value: { provider: "antigravity", model: null } },
};

/** The Gemini API on its own default model: its model setting wakes under it; the key is only on obelisk-of-light. */
export const GeminiApi = {
  args: { value: { provider: "gemini-api", model: null } },
};

/** The Gemini API on a model picked from its four. */
export const GeminiApiModel = {
  args: { value: { provider: "gemini-api", model: "gemini-3-pro-image" } },
};

/** A pick on its way to the hub. */
export const Saving = {
  args: {
    value: { provider: "antigravity", model: null },
    phase: "saving",
  },
};

/** The hub kept it. */
export const Saved = {
  args: {
    value: { provider: "antigravity", model: null },
    phase: "saved",
  },
};

/** The hub refused the save in its words: Not saved in the head, why under the providers, the choice back on ChatGPT. */
export const Refused = {
  args: {
    phase: "failed",
    fault: imageSettingsWords.refused("database is locked (500)", "chatgpt"),
  },
};

/** The hub couldn't be reached. */
export const Unsent = {
  args: {
    phase: "failed",
    fault: imageSettingsWords.unsent(
      "The dashboard couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again.",
      "chatgpt"
    ),
  },
};

/** A hub no machine has joined yet. */
export const NoMachines = {
  args: { readiness: imageReadiness(NO_MACHINES, null) },
};

/** On a phone: the machines under the providers. */
export const Phone = {
  args: { value: { provider: "gemini-api", model: null } },
  parameters: { viewport: 390 },
};
