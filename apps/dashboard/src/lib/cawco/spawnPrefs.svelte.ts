// biome-ignore lint/style/useFilenamingConvention: renaming would break the "./spawnPrefs.svelte" import path used by routes/project/[id]/+page.svelte, a file this batch does not own
import type {
  EffortLevel,
  HarnessKind,
  HarnessReport,
  PermissionMode,
} from "@cawco/core";
import { defaultModelFor, MODEL_DEFAULT } from "./models.svelte";
import {
  fallbackMode,
  permissionModesFor,
  unpickedMode,
} from "./permission-modes";

/**
 * What the new-session form was last set to. A user who picks Fable and a
 * permission mode is telling us how they work, not just how this one session
 * starts — a form that resets to the defaults every visit makes them say it
 * again for every session. Where a session runs is not a preference: a plain
 * New session opens with no location, and one opened from a project carries
 * that project. Kept out of the model store because these are session
 * preferences.
 */
const KEY = "cawco-spawn-prefs";

interface SpawnPrefs {
  /**
   * `null` is a choice too, and the one to start from: only the model knows
   * which stops it has, so a form that opened on a level would be asserting one
   * before it has anything to assert it against.
   */
  effort: EffortLevel | null;
  harness: HarnessKind;
  model: string;
  permissionMode: PermissionMode;
}

const FALLBACK: SpawnPrefs = {
  harness: "claude",
  model: MODEL_DEFAULT,
  permissionMode: "bypassPermissions",
  effort: null,
};

const load = (): SpawnPrefs => {
  if (typeof localStorage === "undefined") {
    return FALLBACK;
  }
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) {
      return FALLBACK;
    }
    const parsed = JSON.parse(stored) as Partial<SpawnPrefs>;
    const harness = ["claude", "opencode", "pi"].includes(parsed.harness ?? "")
      ? parsed.harness
      : undefined;
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
  } catch {
    return FALLBACK;
  }
};

const store = $state<SpawnPrefs>(load());

export const spawnPrefs = {
  get harness(): HarnessKind {
    return store.harness;
  },
  get model(): string {
    return store.model;
  },
  get permissionMode(): PermissionMode {
    return store.permissionMode;
  },
  get effort(): EffortLevel | null {
    return store.effort;
  },
};

/**
 * What the New Session form shows before anything is touched, for a spawn
 * that has no form: its default model entry, and the remembered permission
 * mode unless the machine's harness cannot honour it, then the nearest one it
 * can — the same correction the form makes. A harness that reports no
 * modes at all (pi) has none, and none is given. A path that starts a session
 * without saying either takes these, never the machine's own defaults. With
 * no form there is no Full Send warning to read, so a remembered Full Send
 * starts these on Bypass ({@link unpickedMode}).
 *
 * Full Send is remembered only as a form's own choice: the form reaches it
 * through its confirmation, or opens on it under its warning.
 */
export function spawnDefaults(
  harness: HarnessKind,
  machineId: string,
  report?: HarnessReport
): { model: string; permissionMode?: PermissionMode } {
  const model = defaultModelFor(harness, [machineId]);
  if (report?.capabilities.permissionModes.length === 0) {
    return { model };
  }
  const remembered = unpickedMode(store.permissionMode);
  if (!report) {
    return { model, permissionMode: remembered };
  }
  const honoured = permissionModesFor(harness)
    .map((mode) => mode.value)
    .filter((mode) => report.capabilities.permissionModes.includes(mode));
  return {
    model,
    permissionMode: honoured.includes(remembered)
      ? remembered
      : (fallbackMode(remembered, honoured) ?? remembered),
  };
}

/** Called when a spawn actually goes out, so a form the user abandoned teaches nothing. */
export function rememberSpawn(prefs: SpawnPrefs): void {
  store.harness = prefs.harness;
  store.model = prefs.model;
  store.permissionMode = prefs.permissionMode;
  store.effort = prefs.effort;
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // A browser that refuses to store just starts from the defaults next time.
  }
}
