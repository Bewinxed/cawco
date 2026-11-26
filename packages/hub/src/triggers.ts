/**
 * The trigger router (tsk-310; PRD §5.3 D3, D4; the owner's cards "Where
 * triggers go", "What a trigger wakes" and "When the owner of a thing has
 * gone quiet"). Every trigger on a project's thing (a task's comment, move
 * or creation, a pin or a page's Send, a card to settle, a routine's run or
 * report, an inbound event, fleet watch's nudge, an attempt's
 * report or judgement) is one {@link TriggerEvent} through {@link route}.
 * Callers say what happened; this module alone decides who hears it. The
 * project's Caw conversation is never one of them: it hears only what the
 * person types to it and the reports of delegates it started (caw.ts).
 *
 * - **The thing's own session** hears it: the fresh session already on the
 *   thing (so a burst on one thing reaches one session), else its live
 *   owner (a task's running attempt, the filer of a task the person
 *   approved, a page's writer), when that session is still open, even idle
 *   past its cache, and its context is under its token cap
 *   (core `STANDING_CONTEXT_SHARE`).
 * - **Else a fresh session** takes it: an ordinary hub-started session, a
 *   work item whose parent id names the thing (core `thingParentId`), host
 *   scope in the project's checkout, on its kind's settings
 *   (trigger-settings.ts), briefed with the trigger. Triggers on one thing
 *   at once share its start. It writes its result on the thing, asks the
 *   person for what it needs, and ends once idle {@link idleMs} with nothing
 *   pending: no ask of its waiting on the person, no delegate of its live.
 * - **Off, past the spend cap or with no machine online, nothing starts**:
 *   a live owner still hears its own thing's trigger; anything else is held
 *   on the project (`held_triggers`). Once a session can start again (the
 *   switch turned on, a machine come online, the spend cap no longer
 *   quieting the project: project-caps.ts `freed`), one fresh session reads
 *   everything held, grouped by thing, a thing gone by then left out
 *   ({@link rerunHeld}); nothing held, nothing starts.
 */
import { ANY_TYPE } from "@cawco/core/delegate-types";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import type { InstanceRow } from "@cawco/core/protocol";
import { OVER_STATUSES } from "@cawco/core/protocol";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { shortId } from "@cawco/core/short-id";
import { MINUTE_MS } from "@cawco/core/time";
import {
  FRESH_IDLE_MS,
  isThingParent,
  type Thing,
  type TriggerKind,
  thingParentId,
} from "@cawco/core/triggers";
import { unhandled } from "@cawco/core/unhandled";
import { type HeldThing, triggerWords } from "@cawco/core/words/triggers";
import { ElysiaStatus } from "elysia";
import { isProjectConversation, type PersonsSend } from "./caw";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { HeldTriggerRow } from "./db/triggers";
import { ROUTINE_ORIGIN } from "./hub-words";
import type { HubLifetimeShape } from "./lifetime";
import type { Caps } from "./project-caps";
import { type AnyProblem, isProblem } from "./refusal";
import type { Tasks } from "./tasks";
import {
  type Carried,
  EVENT_SKILLS,
  type EventKind,
  PROJECT_ORIGIN,
  type TriggerEvent,
} from "./trigger-event";
import type { TriggerSettings } from "./trigger-settings";
import type { Parent } from "./work-item-state";
import { isLive } from "./work-item-state";
import type { WorkItems } from "./work-items";

/** How often the idle sweep looks at the live fresh sessions. */
const SWEEP_MS = 15_000;

/** Where a trigger went: the session that heard it, or why it waits. */
export type Routed =
  | { instanceId: string; to: "owner" }
  | { instanceId: string; itemId: string; started: boolean; to: "fresh" }
  | { to: "held"; why: string }
  | { to: "lost"; why: string };

/** The kind of setting each kind of trigger starts a fresh session on; undefined: the project's Caw settings. */
const settingKindOf = (event: TriggerEvent): TriggerKind | undefined => {
  switch (event.kind) {
    case "task-input":
      return "comments";
    case "person-request":
      return event.thing.kind === "artifact" ? "comments" : undefined;
    case "routine-run":
    case "routine-report":
      return "routine-results";
    case "task-move":
      return "task-moves";
    case "inbound-event":
    case "fleet-watch":
      return "inbound-events";
    case "attempt-judgement":
    case "connection":
    case "decision":
    case "delegate-report":
    case "held-triggers":
    case "project-setup":
    case "view-request":
      return;
    default:
      return unhandled("trigger kind", event.kind);
  }
};

/** The kinds a task's running attempt hears: everything but the reports about attempts themselves. */
const ATTEMPT_DEAF: ReadonlySet<EventKind> = new Set([
  "delegate-report",
  "attempt-judgement",
]);

export interface TriggersDeps {
  readonly caps: Pick<Caps, "quiets">;
  readonly db: Pick<
    DbShape,
    | "artifacts"
    | "connections"
    | "getInstancesByIds"
    | "liveWorkItems"
    | "liveWorkItemsOf"
    | "project"
    | "projectAttempts"
    | "routines"
    | "triggers"
    | "workItem"
  >;
  /** Whether the session is in a turn now, and when its last turn ended (ms); null: never. */
  readonly idle: (instanceId: string) => {
    busy: boolean;
    lastTurnAt: number | null;
  };
  /** How long a fresh session may sit idle; {@link FRESH_IDLE_MS} unless the scratch fleet names less. */
  readonly idleMs?: number;
  readonly lifetime: Pick<HubLifetimeShape, "every">;
  /** What of the session waits on the person now (an open ask); undefined when nothing does. */
  readonly openAsk: (instanceId: string) => string | undefined;
  /** Why the session's context is over its token cap, or nothing (server.ts, core `STANDING_CONTEXT_SHARE`). */
  readonly overCap: (row: InstanceRow) => Promise<string | undefined>;
  /** Where a project's sessions start: its checkout, else its folder (caw.ts `placeFor`); undefined while no machine of its is online. */
  readonly place: (
    project: ProjectRow
  ) => Promise<Place | AnyProblem | undefined>;
  /** Why a session takes no input now (server.ts `inputRefusal`), or nothing. */
  readonly refusal: (row: InstanceRow) => string | undefined;
  /** Delivers the hub's word through the one send path. */
  readonly send: (
    row: InstanceRow,
    message: { carried?: Carried; content: string; origin: NeutralOrigin }
  ) => { reason: string | null; state: string };
  /** The person's words to a session, theirs alone with CawCo's note beside them (server.ts `sendYours`). */
  readonly sendYours: (row: InstanceRow, said: PersonsSend) => void;
  readonly settings: Pick<TriggerSettings, "forEvent">;
  readonly tasks: Pick<Tasks, "get">;
  readonly workItems: Pick<WorkItems, "endForHub" | "startForHub">;
}

/** Where a fresh session starts: a folder on a machine that is online. */
interface Place {
  cwd: string;
  machineId: string;
}

const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createTriggers = (deps: TriggersDeps) => {
  const { db } = deps;
  const idleMs = deps.idleMs ?? FRESH_IDLE_MS;
  const idleMinutes = Math.max(1, Math.round(idleMs / MINUTE_MS));
  /** Fresh sessions being started now, by project and thing: triggers at once share one start. */
  const starting = new Map<string, Promise<Routed>>();
  /** Fresh sessions the sweep found idle and held open, said once each. */
  const heldSaid = new Set<string>();
  /** One run of a project's held list at a time ({@link rerunHeld}). */
  const heldTurns = makeKeyedLock<string>();

  const keyOf = (projectId: string, thing: Thing): string =>
    `${projectId}\0${thing.kind}\0${thing.id}`;

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0];

  /** The fresh session on `thing` that lives now: its item, and its session's row. */
  const freshOn = (projectId: string, thing: Thing) => {
    const item = db
      .liveWorkItemsOf(thingParentId(thing))
      // An attempt the hub started under its task (dispatch.ts
      // `taskParentOf`) shares the parent id; it is no fresh session.
      .find(
        (one) => one.projectId === projectId && !one.taskId && isLive(one.state)
      );
    const session = item ? row(item.instanceId) : undefined;
    return item && session && !OVER_STATUSES.has(session.status)
      ? { item, session }
      : undefined;
  };

  /**
   * Why `session` cannot hear a trigger as its thing's owner, or nothing:
   * over (ended, failed), continued elsewhere, refusing input, the
   * project's Caw conversation (which hears none), or over its token cap
   * (`capped`; a delegate's report to its parent is not held to it). A
   * session idle past its cache still hears it.
   */
  const unfit = async (
    session: InstanceRow,
    project: ProjectRow,
    capped = true
  ): Promise<string | undefined> => {
    if (OVER_STATUSES.has(session.status)) {
      return `it is ${session.status}`;
    }
    if (session.continuedInto) {
      return "it was continued in another session";
    }
    if (isProjectConversation(session, () => project)) {
      return "it is the project's Caw conversation";
    }
    return (
      deps.refusal(session) ??
      (capped ? await deps.overCap(session) : undefined)
    );
  };

  /** The parent of the delegate whose report `event` is, while it hears input. */
  const reportee = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<InstanceRow | undefined> => {
    const parentId = event.from ? row(event.from)?.parentInstanceId : undefined;
    const parent = parentId ? row(parentId) : undefined;
    if (!parent) {
      return;
    }
    const why = await unfit(parent, project, false);
    if (why !== undefined) {
      console.log(triggerWords.passedOver(shortId(parent.id), why));
      return;
    }
    return parent;
  };

  /** A task's owners for `event`: its running attempt; for a move the person approved with none, its filer. */
  const taskOwners = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<InstanceRow[]> => {
    const taskId = event.thing.id;
    const deaf =
      ATTEMPT_DEAF.has(event.kind) ||
      (event.kind === "task-input" && !project.attemptsHearComments);
    const attempts = deaf
      ? []
      : db
          .projectAttempts(project.id)
          .filter((one) => one.taskId === taskId && isLive(one.state))
          .flatMap((one) => row(one.instanceId) ?? []);
    if (attempts.length > 0 || event.kind !== "task-move") {
      return attempts;
    }
    // The person approved it: its filer decides what comes next.
    const task = await deps.tasks.get(project.id, taskId);
    const by = task instanceof ElysiaStatus ? undefined : task.createdBy;
    const filer = by?.mover === "session" && by.id ? row(by.id) : undefined;
    return filer ? [filer] : [];
  };

  /** The sessions that own `thing` for `event`, most specific first. */
  const ownersOf = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<InstanceRow[]> => {
    const { thing } = event;
    switch (thing.kind) {
      case "task":
        return await taskOwners(project, event);
      case "artifact": {
        const writer = db.artifacts.get(thing.id)?.instanceId;
        const session = writer ? row(writer) : undefined;
        return session ? [session] : [];
      }
      case "card":
      case "connection":
      case "event":
      case "project":
      case "routine":
      case "session":
        return [];
      default:
        return unhandled("thing kind", thing.kind);
    }
  };

  /** The first owner of `thing` that can hear it now. */
  const liveOwner = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<InstanceRow | undefined> => {
    for (const owner of await ownersOf(project, event)) {
      const why = await unfit(owner, project);
      if (why === undefined) {
        return owner;
      }
      console.log(triggerWords.passedOver(shortId(owner.id), why));
    }
  };

  /** The trigger as a session reads it. */
  const linesOf = (event: TriggerEvent) => ({
    at: (event.at ?? new Date()).toISOString(),
    delta: event.delta,
    skill: EVENT_SKILLS[event.kind],
    what: event.what,
    who: event.who,
  });

  /** The origin a trigger is drawn by: the hub's word, a routine's naming its routine. */
  const originOf = (event: Pick<TriggerEvent, "routine">): NeutralOrigin => ({
    kind: "system",
    name: event.routine ? `${ROUTINE_ORIGIN}${event.routine}` : PROJECT_ORIGIN,
  });

  /** `event` said to a session already on its thing: whether it took it. */
  const tell = async (
    session: InstanceRow,
    event: TriggerEvent
  ): Promise<string | undefined> => {
    if (event.by === session.id) {
      return;
    }
    if (event.deliver) {
      return (await event.deliver(session))
        ? undefined
        : "its session did not take it";
    }
    if (event.who === "you" && !event.carried) {
      // The person's words, drawn as theirs (sends.ts `personsMessage`).
      deps.sendYours(session, {
        by: "you",
        words: event.delta,
        note: `${event.what} For how to handle it, use the ${EVENT_SKILLS[event.kind]} skill.`,
      });
      return;
    }
    const sent = deps.send(session, {
      ...(event.carried ? { carried: event.carried } : {}),
      content: triggerWords.again(linesOf(event)),
      origin: originOf(event),
    });
    return sent.state === "pending"
      ? undefined
      : (sent.reason ?? "its session did not take it");
  };

  /** A fresh session for `thing` at `place`, briefed with `prompt`, on the settings its kind takes. */
  const startFresh = async (
    project: ProjectRow,
    place: Place,
    thing: Thing & { name: string },
    kind: TriggerKind | undefined,
    event: Pick<TriggerEvent, "carried" | "kind" | "route" | "routine">,
    prompt: (folder: string) => string
  ): Promise<Routed> => {
    const set = deps.settings.forEvent(project, kind, event);
    const title = triggerWords.title(thing.name);
    const parent: Parent = {
      id: thingParentId(thing),
      projectId: project.id,
      machineId: place.machineId,
      cwd: place.cwd,
      title,
      launchDir: "unknown",
      harness: null,
      model: null,
      sessionId: null,
      delegateType: null,
      mayStart: [ANY_TYPE],
    };
    const begun = await deps.workItems.startForHub(
      {
        title,
        prompt: prompt(place.cwd),
        host: true,
        cwd: place.cwd,
        machineId: place.machineId,
        harness: set.harness,
        ...(set.model ? { model: set.model } : {}),
        ...(set.account ? { account: set.account } : {}),
        mode: set.mode,
        mayStart: [ANY_TYPE],
        skills: [EVENT_SKILLS[event.kind]],
        origin: "event",
      },
      parent
    );
    if (begun instanceof ElysiaStatus) {
      return { to: "lost", why: begun.response.detail };
    }
    const session = row(begun.item.instanceId);
    if (event.carried && session) {
      deps.send(session, {
        carried: event.carried,
        content: triggerWords.carried,
        origin: originOf(event),
      });
    }
    console.log(
      `[triggers] ${project.name}: a fresh session for ${thing.kind} ${thing.id} started (item ${begun.item.id}, session ${shortId(begun.item.instanceId)})`
    );
    return {
      to: "fresh",
      started: true,
      instanceId: begun.item.instanceId,
      itemId: begun.item.id,
    };
  };

  /** Holds `event` on its project: nothing started for it. */
  const hold = (project: ProjectRow, event: TriggerEvent, why: string) => {
    db.triggers.hold(project.id, {
      at: event.at ?? new Date(),
      delta: event.delta,
      kind: event.kind,
      thing: event.thing,
      what: event.what,
      who: event.who,
    });
    console.log(
      `[triggers] ${project.name}: ${event.kind} on ${event.thing.kind} ${event.thing.id} is held: ${why}`
    );
    return { to: "held" as const, why };
  };

  /**
   * The session already on `event`'s thing that took it: a report's
   * parent, the thing's fresh session, its live owner; undefined when none
   * did. A fresh session that refuses it is where it is lost.
   */
  const heardOnThing = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<Routed | undefined> => {
    const parent =
      event.kind === "delegate-report"
        ? await reportee(project, event)
        : undefined;
    if (parent && (await tell(parent, event)) === undefined) {
      return { to: "owner", instanceId: parent.id };
    }
    const on = freshOn(project.id, event.thing);
    if (on) {
      const why = await tell(on.session, event);
      return why === undefined
        ? {
            to: "fresh",
            started: false,
            instanceId: on.session.id,
            itemId: on.item.id,
          }
        : { to: "lost", why };
    }
    const owner = await liveOwner(project, event);
    if (owner) {
      const why = await tell(owner, event);
      if (why === undefined) {
        return { to: "owner", instanceId: owner.id };
      }
      console.log(triggerWords.passedOver(shortId(owner.id), why));
    }
  };

  /** {@link route} once no start for its thing is under way. */
  const routeNow = async (
    project: ProjectRow,
    event: TriggerEvent
  ): Promise<Routed> => {
    const heard = await heardOnThing(project, event);
    if (heard) {
      return heard;
    }
    if (event.kind === "task-input" && !project.hearsTasks) {
      return { to: "lost", why: triggerWords.notHeard };
    }
    if (!project.eventsOn) {
      return hold(project, event, triggerWords.heldOff);
    }
    const capped = deps.caps.quiets(project.id);
    if (capped !== undefined) {
      return hold(project, event, triggerWords.heldCapped(capped));
    }
    const place = await deps.place(project);
    if (isProblem(place)) {
      return { to: "lost", why: place.response.detail };
    }
    if (!place) {
      return hold(project, event, triggerWords.heldNoMachine);
    }
    return await startFresh(
      project,
      place,
      event.thing,
      settingKindOf(event),
      event,
      (folder) =>
        triggerWords.brief(
          `the project “${project.name}”`,
          folder,
          event.thing.name,
          idleMinutes,
          linesOf(event)
        )
    );
  };

  /**
   * One trigger on a thing of a project, to the session that hears it: the
   * thing's fresh session, else its live owner, else a fresh one; held on
   * the project while its triggers are off, it is past its spend cap, or no
   * machine of its is online.
   * Triggers on one thing while its fresh session starts wait for it.
   */
  const route = async (
    projectId: string,
    event: TriggerEvent
  ): Promise<Routed> => {
    const project = db.project(projectId);
    if (!project) {
      return { to: "lost", why: `The hub keeps no project ${projectId}.` };
    }
    const key = keyOf(projectId, event.thing);
    const pending = starting.get(key);
    if (pending !== undefined) {
      await pending.catch(() => undefined);
    }
    const run = routeNow(project, event).catch((error: unknown): Routed => ({
      to: "lost",
      why: errorWords(error),
    }));
    starting.set(key, run);
    try {
      return await run;
    } finally {
      if (starting.get(key) === run) {
        starting.delete(key);
      }
    }
  };

  /** {@link route} for callers that only log where it did not go: a trigger is never lost silently. */
  const routeQuietly = (projectId: string, event: TriggerEvent): void => {
    route(projectId, event).then(
      (routed) => {
        if (routed.to === "lost") {
          console.warn(
            `[triggers] ${projectId}: ${event.kind} on ${event.thing.kind} ${event.thing.id} reached nobody: ${routed.why}`
          );
        }
      },
      (error: unknown) =>
        console.warn(
          `[triggers] ${projectId}: ${event.kind} on ${event.thing.kind} ${event.thing.id} reached nobody: ${errorWords(error)}`
        )
    );
  };

  /** Why the task `taskId` is gone, or nothing while the project has it. */
  const taskGone = async (
    projectId: string,
    taskId: string
  ): Promise<string | undefined> => {
    const task = await deps.tasks.get(projectId, taskId);
    return isProblem(task) && task.response.code === "task-missing"
      ? task.response.detail
      : undefined;
  };

  /** Why the artifact or decision page `id` is gone, or nothing while it stands. */
  const artifactGone = (kind: "artifact" | "card", id: string) => {
    // A decision page no artifact names yet (decisions.ts) is its folder's.
    if (id.startsWith("decisions/") || db.artifacts.get(id)) {
      return;
    }
    return `the ${kind === "card" ? "decision page" : "artifact"} ${id} was deleted`;
  };

  /** Why a thing the hub keeps a row of is gone, or nothing while it stands; a task is {@link taskGone}'s. */
  const rowGone = (thing: Thing): string | undefined => {
    switch (thing.kind) {
      case "artifact":
      case "card":
        return artifactGone(thing.kind, thing.id);
      case "connection":
        return db.connections.byName(thing.id)
          ? undefined
          : `the connection “${thing.id}” was removed`;
      case "routine":
        return db.routines.get(thing.id)
          ? undefined
          : `the routine ${thing.id} was deleted`;
      case "session":
        return row(thing.id) ? undefined : `the session ${thing.id} is gone`;
      case "event":
      case "project":
      case "task":
        return;
      default:
        return unhandled("thing kind", thing.kind);
    }
  };

  /** Why `thing` is gone, so a trigger held on it is closed, not routed; undefined while it stands. */
  const goneWhy = async (
    project: ProjectRow,
    thing: Thing
  ): Promise<string | undefined> =>
    thing.kind === "task"
      ? await taskGone(project.id, thing.id)
      : rowGone(thing);

  /** A held row back on its project, as it was held. */
  const holdAgain = (projectId: string, one: HeldTriggerRow): void =>
    db.triggers.hold(projectId, {
      at: one.at,
      delta: one.delta,
      kind: one.kind,
      thing: { kind: one.thingKind, id: one.thingId, name: one.thingName },
      what: one.what,
      who: one.who,
    });

  /** Where the project's held list starts a session now: its triggers on, under its cap, a machine online; else nothing. */
  const rerunPlace = async (
    project: ProjectRow | undefined
  ): Promise<{ place: Place; project: ProjectRow } | undefined> => {
    if (!project?.eventsOn || deps.caps.quiets(project.id) !== undefined) {
      return;
    }
    const place = await deps.place(project);
    if (isProblem(place)) {
      console.warn(
        `[triggers] ${project.name}: what it holds stays held: ${place.response.detail}`
      );
      return;
    }
    return place ? { place, project } : undefined;
  };

  /** The held rows whose thing still stands; each other is closed, its reason logged. */
  const standing = async (
    project: ProjectRow,
    held: HeldTriggerRow[]
  ): Promise<HeldTriggerRow[]> => {
    const kept: HeldTriggerRow[] = [];
    for (const one of held) {
      const gone = await goneWhy(project, {
        kind: one.thingKind,
        id: one.thingId,
      });
      if (gone === undefined) {
        kept.push(one);
        continue;
      }
      console.log(
        `[triggers] ${project.name}: ${one.kind} on ${one.thingKind} ${one.thingId}, held since ${one.at.toISOString()}, is closed: ${gone}`
      );
    }
    return kept;
  };

  /** The held rows grouped by thing, oldest first within each. */
  const heldThings = (held: HeldTriggerRow[]): HeldThing[] => {
    const things = new Map<string, HeldThing>();
    for (const one of held) {
      const key = `${one.thingKind}\0${one.thingId}`;
      const thing = things.get(key) ?? { name: one.thingName, held: [] };
      thing.held.push({
        at: one.at.toISOString(),
        delta: one.delta,
        what: one.what,
        who: one.who,
      });
      things.set(key, thing);
    }
    return [...things.values()];
  };

  /** {@link rerunHeld} in the project's turn. */
  const rerunNow = async (projectId: string): Promise<Routed | undefined> => {
    const ready = await rerunPlace(db.project(projectId));
    if (!ready) {
      return;
    }
    const { place, project } = ready;
    const kept = await standing(project, db.triggers.takeHeld(projectId));
    if (kept.length === 0) {
      return;
    }
    const skill = EVENT_SKILLS["held-triggers"];
    const started = await startFresh(
      project,
      place,
      {
        kind: "project",
        id: project.id,
        name: triggerWords.heldThing(project.name),
      },
      undefined,
      { kind: "held-triggers" },
      (folder) =>
        triggerWords.held(
          `the project “${project.name}”`,
          folder,
          idleMinutes,
          skill,
          heldThings(kept)
        )
    ).catch((error: unknown): Routed => ({
      to: "lost",
      why: errorWords(error),
    }));
    if (started.to === "lost") {
      for (const one of kept) {
        holdAgain(projectId, one);
      }
      console.warn(
        `[triggers] ${project.name}: what was held did not reach a session, and is held again: ${started.why}`
      );
    }
    return started;
  };

  /**
   * What the project held while nothing could start for it, once a session
   * can: its triggers on, under its spend cap, a machine of its online. One
   * fresh session reads every held trigger whose thing still stands,
   * grouped by thing, and decides what to act on; a trigger whose thing is
   * gone is closed, its reason logged. Nothing held, nothing starts. Taking
   * the list empties it, and one run at a time per project takes it, so a
   * trigger reaches one session; a start that does not go gives the list
   * back to the project.
   */
  const rerunHeld = (projectId: string): Promise<Routed | undefined> =>
    heldTurns.run(projectId, () => rerunNow(projectId));

  /**
   * A machine came online: each project that holds a trigger runs its held
   * list ({@link rerunHeld}), which starts a session where one now can.
   */
  const machineOnline = async (machineId: string): Promise<void> => {
    await Promise.all(
      db.triggers
        .heldProjects()
        .map((projectId) =>
          rerunHeld(projectId).catch((error: unknown) =>
            console.warn(
              `[triggers] ${projectId}: ${machineId} came online, and what it holds stays held: ${errorWords(error)}`
            )
          )
        )
    );
  };

  /** Why the fresh session `session` is still pending, or nothing: an ask of its waits, a delegate of its lives. */
  const pendingOf = (session: InstanceRow): string | undefined =>
    deps.openAsk(session.id) ??
    (db.liveWorkItemsOf(session.id).length > 0
      ? "a delegate of its is live"
      : undefined);

  /** Whether the fresh session `session` of `item` has sat idle {@link idleMs}: out of a turn that long since its last, or since it began. */
  const idleLong = (
    item: { createdAt: Date },
    session: InstanceRow,
    now: number
  ): boolean => {
    const state = deps.idle(session.id);
    const since = Math.max(state.lastTurnAt ?? 0, item.createdAt.getTime());
    return !state.busy && now - since >= idleMs;
  };

  /** The idle sweep: each fresh session idle {@link idleMs} with nothing pending ends. */
  const sweep = (): void => {
    const now = Date.now();
    for (const item of db.liveWorkItems()) {
      const session =
        item.projectId && !item.taskId && isThingParent(item.parentInstanceId)
          ? row(item.instanceId)
          : undefined;
      if (!(session && idleLong(item, session, now))) {
        continue;
      }
      const pending = pendingOf(session);
      if (pending) {
        if (!heldSaid.has(item.id)) {
          heldSaid.add(item.id);
          console.log(
            `[triggers] ${item.id} stays past its idle spell: ${pending}`
          );
        }
        continue;
      }
      heldSaid.delete(item.id);
      console.log(
        `[triggers] ${item.id} (${item.parentInstanceId}) ends: idle ${idleMinutes} minutes with nothing pending`
      );
      deps.workItems.endForHub(item.id, triggerWords.endedIdle(idleMinutes));
    }
  };
  deps.lifetime.every("fresh session sweep", SWEEP_MS, sweep);

  return {
    machineOnline,
    route,
    routeQuietly,
    rerunHeld,
    sweep,
  };
};

export type Triggers = ReturnType<typeof createTriggers>;
