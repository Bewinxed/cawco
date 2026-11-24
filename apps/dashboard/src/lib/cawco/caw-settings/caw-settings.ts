/**
 * Caw's settings panel: what it shows of each kind of trigger and of his
 * chat, read from the hub's views (core triggers.ts):
 *
 * - `GET /api/projects/:id/trigger-settings` answers core
 *   `ProjectTriggerSettings`, each kind's own layer and what is in effect,
 *   which a {@link TriggerSettingsView} reads;
 * - `PATCH /api/projects/:id/trigger-settings/:kind` takes a partial core
 *   `TriggerSetting`, null clearing a field back to inherited;
 * - `GET`/`PATCH /api/fleet/trigger-settings` the fleet's layer, which
 *   {@link fleetKind} reads for the fleet's rows;
 * - his chat runs as the project keeps it: its harness, model and mode
 *   (`/api/projects/:id/caw`), its account the project's own
 *   (`PATCH /api/projects/:id`).
 */
import type { HarnessKind as Harness } from "@cawco/core/harness/kinds";
import type { OfferedMode, PermissionMode } from "@cawco/core/harness/modes";
import {
  type TriggerKind,
  type TriggerSetting,
  triggerModeDefault,
} from "@cawco/core/triggers";

export type TriggerField = keyof TriggerSetting;

/**
 * Where a value in effect comes from: the project's own, the fleet's
 * default, Caw's chat (at the fleet's level, each project's own Caw, its
 * value then unknown here), or, for a mode nothing sets, the triggers'
 * own default (`default`: core `triggerModeDefault`, Auto on Claude Code, else Bypass).
 */
type TriggerSource = "project" | "fleet" | "caw" | "default";

interface InEffect<T> {
  from: TriggerSource;
  value: T;
}

/**
 * One kind as a row reads it: its own layer, and what runs. A project's is
 * core's `ProjectTriggerSettings` kind; the fleet's ({@link fleetKind})
 * leaves a value null where each project's own Caw decides it.
 */
export interface TriggerKindView {
  inEffect: {
    account: InEffect<string | null>;
    harness: InEffect<Harness | null>;
    mode: InEffect<PermissionMode | null>;
    model: InEffect<string | null>;
  };
  own: TriggerSetting;
}

export interface TriggerSettingsView {
  kinds: Record<TriggerKind, TriggerKindView>;
}

/**
 * The fleet's layer as the fleet's row reads it: what it sets is its own,
 * and what it leaves unset falls to each project's Caw.
 */
export function fleetKind(fleet: TriggerSetting): TriggerKindView {
  const of = <K extends TriggerField>(field: K) =>
    fleet[field] === null
      ? { value: null, from: "caw" as const }
      : { value: fleet[field], from: "fleet" as const };
  return {
    own: fleet,
    inEffect: {
      account: of("account"),
      harness: of("harness"),
      mode:
        fleet.mode === null
          ? {
              // With no harness of its own, each project's decides it.
              value: fleet.harness ? triggerModeDefault(fleet.harness) : null,
              from: "default" as const,
            }
          : { value: fleet.mode, from: "fleet" as const },
      model:
        fleet.harness === null
          ? of("model")
          : { value: fleet.model, from: "fleet" as const },
    },
  };
}

/**
 * What Caw's chat runs as: the project's account (null: the fleet's
 * routing), his harness, model (null: its default) and mode (null: the
 * fleet's).
 */
export interface CawRunsAs {
  account: string | null;
  harness: Harness;
  mode: OfferedMode | null;
  model: string | null;
}
