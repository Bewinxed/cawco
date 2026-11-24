/**
 * Triggers (tsk-310, PRD §5.3 D3/D4): everything that happens to a
 * project's thing other than the person's own words to Caw. Each is one
 * event of one shape (what happened, to which thing, what changed, who,
 * when, its kind) through one router (hub triggers.ts), which hands it to
 * the session already working on that thing, else to a fresh short-lived
 * session tagged with the thing.
 *
 * A fresh session is an ordinary hub-started session: a work item whose
 * parent id names its thing ({@link thingParentId}), as a routine's run
 * names its routine. There is no other record of it.
 */
import type { HarnessKind } from "./harness/kinds";
import { AUTO_ELSEWHERE, modeOn, type OfferedMode } from "./harness/modes";
import { hasMode, traitsOf } from "./harness/traits";
import { MINUTE_MS } from "./time";

/** The kinds of thing a trigger happens to. */
export const THING_KINDS = [
  "artifact",
  "card",
  "connection",
  "event",
  "project",
  "routine",
  "session",
  "task",
] as const;

type ThingKind = (typeof THING_KINDS)[number];

/** A thing of a project: its kind and its id (a task's `tsk-12`, an artifact's id, a session's id). */
export interface Thing {
  id: string;
  kind: ThingKind;
}

/** What a fresh session's work item names as its parent: `thing:<kind>:<id>`, which no session's row has. */
const THING_PARENT = "thing:";

/** The parent id a fresh session for `thing` carries on its work item and its row. */
export const thingParentId = (thing: Thing): string =>
  `${THING_PARENT}${thing.kind}:${thing.id}`;

/** Whether a parent id is a thing's ({@link thingParentId}): its session is a fresh session for that thing. */
export const isThingParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(THING_PARENT);

/**
 * How long a fresh session may sit idle with nothing pending before the hub
 * ends it: five minutes, Devin's own idle sleep ("Devin sleeps
 * automatically after 5 minutes of inactivity",
 * https://docs.devin.ai/llms-full.txt, read 2026-11-07; the advisor's table
 * in the project's assets/8e44527f/ephemeral-advice.md). Pending means an
 * ask of its waiting on the person, or a delegate of its own still live.
 */
export const FRESH_IDLE_MS = 5 * MINUTE_MS;

/**
 * The share of its model's window a standing session's context may fill
 * and still be handed a trigger on its thing (the owner's card "What a
 * trigger wakes": over its token cap, a fresh session takes the trigger).
 * Half the window is where re-reading the context costs as much as a fresh
 * start from the thing's record. A delegate's report to the session that
 * started it is not a trigger on a thing and is never held back by it.
 */
export const STANDING_CONTEXT_SHARE = 0.5;

/**
 * The kinds of trigger that have their own harness, model, mode and account
 * (the owner's card "Where triggers go", settings: "Its own setting per
 * kind of trigger"): comments (a task's comments and to-dos, a page's
 * pins and notes), routine results (a routine's runs and reports), task
 * moves (a task moved or created) and inbound events (inbound, GitHub and
 * fleet-watch events). Any other trigger takes the project's Caw settings.
 */
export const TRIGGER_KINDS = [
  "comments",
  "routine-results",
  "task-moves",
  "inbound-events",
] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** One value for each kind of trigger, `of` each. */
export const byTriggerKind = <T>(
  of: (kind: TriggerKind) => T
): Record<TriggerKind, T> => ({
  comments: of("comments"),
  "routine-results": of("routine-results"),
  "task-moves": of("task-moves"),
  "inbound-events": of("inbound-events"),
});

/**
 * One layer's setting for a kind of trigger (the fleet's, or a project's
 * over it): null is unset, and the layer below speaks. `account` is an
 * account's id.
 */
export interface TriggerSetting {
  account: string | null;
  harness: HarnessKind | null;
  mode: OfferedMode | null;
  model: string | null;
}

/** A setting with every field unset. */
export const UNSET_TRIGGER_SETTING: TriggerSetting = {
  account: null,
  harness: null,
  mode: null,
  model: null,
};

/**
 * Where a trigger setting in effect came from: the project's own override,
 * the fleet's default for the kind, or neither, so the project's Caw
 * settings (its harness and model; the account its sessions start on).
 */
type TriggerSettingSource = "project" | "fleet" | "caw";

/**
 * Where a trigger's mode in effect came from: the project's own override,
 * the fleet's default for the kind, or neither, so CawCo's own default for
 * a trigger's session ({@link triggerModeDefault}). Caw's chat mode is no
 * layer of it.
 */
type TriggerModeSource = "project" | "fleet" | "default";

/** A setting in effect, and where it came from. */
interface TriggerSourced<T, From = TriggerSettingSource> {
  from: From;
  value: T;
}

/** One kind's settings in effect for a project, each field with its source. */
export interface TriggerSettingInEffect {
  account: TriggerSourced<string | null>;
  harness: TriggerSourced<HarnessKind>;
  /** The mode its session runs in on the harness in effect (core modes.ts `modeOn`). */
  mode: TriggerSourced<OfferedMode, TriggerModeSource>;
  model: TriggerSourced<string | null>;
}

/**
 * The mode a trigger's session runs in when neither the project nor the
 * fleet sets one for its kind: Claude Code's Auto on a harness that has it,
 * else Bypass (the owner, 2026-11-23: "for claude, offer 'auto' mode as an
 * additional one, for harnesses that don't offer it, show bypass"). Nobody
 * watches a trigger's session for a tool ask, so it runs in one that never
 * waits on one; Auto has a second model review each action in their place.
 */
export const triggerModeDefault = (harness: HarnessKind): OfferedMode =>
  hasMode(harness, "auto") ? "auto" : AUTO_ELSEWHERE;

/** The fleet's own settings, kind by kind (`GET /api/fleet/trigger-settings`). */
export interface FleetTriggerSettings {
  kinds: Record<TriggerKind, TriggerSetting>;
}

/** The project's Caw settings, what a kind's harness, model and account fall back to when neither layer sets them. */
export interface CawFallback {
  account: string | null;
  harness: HarnessKind;
  model: string | null;
}

/**
 * A project's settings, kind by kind (`GET /api/projects/:id/trigger-settings`):
 * its own, the fleet's under it and what is in effect; and its Caw settings
 * under both, so a change can be resolved where it is made, by
 * {@link triggerSettingInEffect}, as the hub resolves it.
 */
export interface ProjectTriggerSettings {
  caw: CawFallback;
  kinds: Record<
    TriggerKind,
    {
      fleet: TriggerSetting;
      inEffect: TriggerSettingInEffect;
      own: TriggerSetting;
    }
  >;
}

/**
 * One kind's settings in effect: each field from the most specific layer
 * that sets it (the project's, then the fleet's, then the project's Caw
 * settings; for the mode, {@link triggerModeDefault} on the harness in
 * effect). A model follows its harness: it comes from the most specific
 * layer that sets one, but never from a layer below the one that set the
 * harness (a layer naming a harness and no model means that harness's
 * default). A mode the harness lacks is the one it runs instead: Auto set
 * for a harness without it is Bypass in effect (core modes.ts `modeOn`).
 */
export const triggerSettingInEffect = (
  project: TriggerSetting,
  fleet: TriggerSetting,
  caw: CawFallback
): TriggerSettingInEffect => {
  const firstOf = <T>(
    own: T | null,
    fleets: T | null,
    fallback: T
  ): TriggerSourced<T> => {
    if (own !== null) {
      return { value: own, from: "project" };
    }
    if (fleets !== null) {
      return { value: fleets, from: "fleet" };
    }
    return { value: fallback, from: "caw" };
  };
  const harness = firstOf(project.harness, fleet.harness, caw.harness);
  const layers: { from: TriggerSettingSource; model: string | null }[] = [
    { from: "project", model: project.model },
    { from: "fleet", model: fleet.model },
  ];
  const reach = layers.findIndex((layer) => layer.from === harness.from);
  const allowed = reach === -1 ? layers : layers.slice(0, reach + 1);
  const named = allowed.find((layer) => layer.model !== null);
  const model: TriggerSourced<string | null> = named
    ? { value: named.model, from: named.from }
    : { value: harness.from === "caw" ? caw.model : null, from: harness.from };
  const setMode = firstOf(project.mode, fleet.mode, null);
  const mode: TriggerSourced<OfferedMode, TriggerModeSource> =
    setMode.value === null
      ? { value: triggerModeDefault(harness.value), from: "default" }
      : {
          value: modeOn(setMode.value, traitsOf(harness.value).permissionModes),
          from: setMode.from === "project" ? "project" : "fleet",
        };
  return {
    harness,
    model,
    mode,
    account: firstOf(project.account, fleet.account, caw.account),
  };
};
