/**
 * What a setting's pick is, read off its control, and what is held of one
 * for a process on a machine that is away (setting-picks.ts): shapes every
 * reader of a pick shares, below them all.
 */

import { type EffortLevel, isEffortLevel } from "@cawco/core/harness/kinds";
import {
  type PermissionMode,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/modes";
import {
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
} from "@cawco/core/session/controls";
import { controlWords } from "@cawco/core/words/controls";
import { spawnWords } from "@cawco/core/words/spawn";

/** A setting's pick, read off its control: the method and the value it names. */
export type SettingPick =
  | { method: typeof CONTROL_SET_MODEL; value: string }
  | { method: typeof CONTROL_SET_EFFORT; value: EffortLevel }
  | { method: typeof CONTROL_SET_PERMISSION_MODE; value: PermissionMode };

/**
 * The picks held for a process that may run on a machine that is away,
 * each the latest picked. `runs` is the mode the process ran in as the
 * first mode was held: entering Bypass or Full Send from another mode is a
 * launch's to make, never a control's.
 */
export interface HeldPicks {
  effort?: EffortLevel;
  model?: string;
  permissionMode?: { mode: PermissionMode; runs: string | null };
}

/**
 * A control's pick of a setting, or why it names none; undefined for any
 * other control.
 */
export const settingPickOf = (
  method: string,
  value: unknown
): SettingPick | { refusal: string } | undefined => {
  switch (method) {
    case CONTROL_SET_MODEL:
      return typeof value === "string" && value
        ? { method, value }
        : { refusal: controlWords.noSetting("model") };
    case CONTROL_SET_EFFORT:
      return isEffortLevel(value)
        ? { method, value }
        : { refusal: controlWords.noSetting("effort") };
    case CONTROL_SET_PERMISSION_MODE: {
      const mode = WIRE_PERMISSION_MODES.find((one) => one === value);
      return mode
        ? { method, value: mode }
        : {
            refusal:
              typeof value === "string"
                ? spawnWords.modeUnknown(value)
                : controlWords.noSetting("permission mode"),
          };
    }
    default:
      return;
  }
};
