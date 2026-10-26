// biome-ignore lint/style/useFilenamingConvention: renaming would break the "./spawnPrefs.svelte" import path used by routes/project/[id]/+page.svelte, a file this batch does not own
import {
  type EffortLevel,
  type HarnessKind,
  harnessNamed,
  type PermissionMode,
} from "@cawco/core";
import { z } from "zod";
import { SpawnPrefsShape } from "#lib/cawco/stored-shapes.js";
import { MODEL_DEFAULT } from "./models.svelte";
import { readJson, writeJson } from "./storage";

/**
 * What the new-session form was last set to. A user who picks Fable and a
 * permission mode is telling us how they work, not just how this one session
 * starts — a form that resets to the defaults every visit makes them say it
 * again for every session. A plain New session opens with no folder, and one
 * opened from a project carries that project; its machine is the one the
 * form last started a session on ({@link rememberedMachine}), only ever its
 * id, never a folder that would fill in after a check. Kept out of the model
 * store because these are session preferences.
 */
const KEY = "cawco-spawn-prefs";
const MACHINE_KEY = "cawco-spawn-machine";

export interface SpawnPrefs {
  /**
   * `null` is a choice too, and the one to start from: only the model knows
   * which stops it has, so a form that opened on a level would be asserting one
   * before it has anything to assert it against.
   */
  effort: EffortLevel | null;
  harness: HarnessKind;
  model: string;
  /**
   * None until a form in this browser has started a session on one. The
   * form opens on the hub's last chosen mode for its machine and harness
   * first (AgentRow `chosenModes`), this one after it; with neither, on no
   * mode, and Start says it waits for one.
   */
  permissionMode: PermissionMode | null;
}

const FALLBACK: SpawnPrefs = {
  harness: "claude",
  model: MODEL_DEFAULT,
  permissionMode: null,
  effort: null,
};

const load = (): SpawnPrefs => {
  const parsed = readJson(KEY, SpawnPrefsShape.partial().nullable(), null);
  if (!parsed || typeof parsed !== "object") {
    return FALLBACK;
  }
  const harness = harnessNamed(parsed.harness);
  return {
    harness: harness ?? FALLBACK.harness,
    model:
      harness && typeof parsed.model === "string"
        ? parsed.model
        : FALLBACK.model,
    permissionMode:
      typeof parsed.permissionMode === "string"
        ? (parsed.permissionMode as PermissionMode)
        : FALLBACK.permissionMode,
    effort:
      harness && typeof parsed.effort === "string"
        ? (parsed.effort as EffortLevel)
        : FALLBACK.effort,
  };
};

const store = $state<SpawnPrefs>(load());

export const spawnPrefs = {
  get harness(): HarnessKind {
    return store.harness;
  },
  get model(): string {
    return store.model;
  },
  get permissionMode(): PermissionMode | null {
    return store.permissionMode;
  },
  get effort(): EffortLevel | null {
    return store.effort;
  },
};

/** Called when a spawn actually goes out, so a form the user abandoned teaches nothing. */
export function rememberSpawn(prefs: SpawnPrefs): void {
  store.harness = prefs.harness;
  store.model = prefs.model;
  store.permissionMode = prefs.permissionMode;
  store.effort = prefs.effort;
  writeJson(KEY, store);
}

/**
 * The machine the New Session form last started a session on, which it
 * opens on next; null when it has started none. Read as the form opens.
 */
export const rememberedMachine = (): string | null => {
  const id = readJson(MACHINE_KEY, z.unknown(), null);
  return typeof id === "string" && id ? id : null;
};

/** Called with the machines a spawn from the form went out to: the first is the one it opens on next. */
export function rememberMachine(machineIds: readonly string[]): void {
  const [first] = machineIds;
  if (first) {
    writeJson(MACHINE_KEY, first);
  }
}
