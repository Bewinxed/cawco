/**
 * Caw's settings panel (a prototype on the design graph): what it shows and
 * what it sends. The per-kind trigger settings mirror the hub's API as
 * tsk-310 fixes it (not on main yet, so its types stand here until core's
 * `@cawco/core/trigger-settings` lands):
 *
 * - `GET /api/projects/:id/trigger-settings` answers {@link TriggerSettingsView};
 * - `PATCH /api/projects/:id/trigger-settings/:kind` takes a partial
 *   {@link TriggerLayer}, null clearing a field back to inherited, and
 *   answers the whole view.
 *
 * Caw's own chat runs as `GET`/`PATCH /api/projects/:id/caw` keep it
 * (harness, model, mode); its account is a field that view lacks yet.
 */
import type { HarnessKind as Harness } from "@cawco/core/harness/kinds";
import type { OfferedMode, PermissionMode } from "@cawco/core/harness/modes";
import { type TriggerKind, triggerModeDefault } from "@cawco/core/triggers";

/** One layer of a kind's settings (the fleet's or the project's): null is unset. */
export interface TriggerLayer {
  account: string | null;
  harness: Harness | null;
  mode: PermissionMode | null;
  model: string | null;
}

export type TriggerField = keyof TriggerLayer;

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

/** One kind as the hub answers it: the project's own layer, and what runs. */
export interface TriggerKindView {
  inEffect: {
    account: InEffect<string | null>;
    harness: InEffect<Harness | null>;
    mode: InEffect<PermissionMode | null>;
    model: InEffect<string | null>;
  };
  own: TriggerLayer;
}

export interface TriggerSettingsView {
  kinds: Record<TriggerKind, TriggerKindView>;
}

/**
 * The fleet's layer as the fleet's row reads it: what it sets is its own,
 * and what it leaves unset falls to each project's Caw.
 */
export function fleetKind(fleet: TriggerLayer): TriggerKindView {
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

/** What Caw's chat runs as: the project's own, and the default a kind falls to. */
export interface CawRunsAs {
  account: string | null;
  harness: Harness;
  mode: OfferedMode | null;
  model: string | null;
}

/** An empty layer: everything inherited. */
export const UNSET: TriggerLayer = {
  account: null,
  harness: null,
  mode: null,
  model: null,
};

/**
 * What a kind runs as, from its layers, as the hub resolves it: the
 * project's own, then the fleet's, then Caw's chat. A model follows its
 * harness: a harness set without a model in its layer runs that harness's
 * default, never a model of another layer's harness.
 */
export function resolveKind(
  own: TriggerLayer,
  fleet: TriggerLayer,
  caw: CawRunsAs
): TriggerKindView["inEffect"] {
  const pick = <K extends TriggerField>(
    field: K
  ): InEffect<TriggerLayer[K]> | null => {
    if (own[field] !== null) {
      return { value: own[field], from: "project" };
    }
    if (fleet[field] !== null) {
      return { value: fleet[field], from: "fleet" };
    }
    return null;
  };
  const harness = pick("harness") ?? { value: caw.harness, from: "caw" };
  const layerOf = (from: TriggerSource) => {
    if (from === "project") {
      return own;
    }
    return from === "fleet" ? fleet : null;
  };
  const harnessLayer = layerOf(harness.from);
  const model: InEffect<string | null> =
    harnessLayer === null
      ? (pick("model") ?? { value: caw.model, from: "caw" })
      : {
          // The model of the layer that named the harness, or its default.
          value: harnessLayer.model,
          from: harness.from,
        };
  return {
    harness: { value: harness.value ?? caw.harness, from: harness.from },
    model,
    // A kind's mode nothing sets is the triggers' own default, never the chat's.
    mode: pick("mode") ?? {
      value: triggerModeDefault(harness.value ?? caw.harness),
      from: "default",
    },
    account: pick("account") ?? { value: caw.account, from: "caw" },
  };
}
