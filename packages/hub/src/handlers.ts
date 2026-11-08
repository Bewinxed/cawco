/**
 * Handlers (the owner's card "What a trigger wakes", 2026-11-07): what a
 * trigger on a project's thing wakes when no live, warm session is on that
 * thing. A pin, a task's comment or move, a routine's run or report, an
 * inbound event, a card Caw settles, a stuck session: each caller first
 * offers it to the session already on the thing (the running attempt, the
 * artifact's writer, the delegate's parent, the card's asker); with none,
 * it comes here.
 *
 * - **One handler per thing at a time.** A trigger on a thing whose handler
 *   lives goes to that handler at its next step; else the hub starts a fresh
 *   one: a work item of the `handler` kind (`handles`: the thing), host
 *   scope in the project's checkout, on the project's harness and model, in
 *   the project's permission mode and spend, briefed with the trigger
 *   ({@link handlerWords}). Triggers at once share one start.
 * - **It ends idle.** The hub ends a handler once it has been idle
 *   {@link HANDLER_IDLE_MS} with nothing open: no ask of its waiting on the
 *   person, no delegate of its live (an attempt it started included). Its
 *   last turn's words and its headline land on its item; the thing's
 *   handlers are read newest first (db `handledBy`).
 * - **Caw off: nothing starts.** While the project's switch is off no
 *   handler starts and none is sent to: the trigger waits on its thing.
 *   Past the project's spend cap, likewise.
 * - It never resumes another session: it tells the person, answers where the
 *   trigger was written, and may delegate.
 */
import {
  CAWCO_ENV,
  type Envelope,
  HANDLER_IDLE_MS,
  type HandledThing,
  type InstanceRow,
  type NeutralOrigin,
  type OfferedMode,
  readEnv,
  type SendPayload,
} from "@cawco/core";
import { MINUTE_MS } from "@cawco/core/time";
import { handlerWords } from "@cawco/core/words/handlers";
import type { Carried, EventKind } from "./caw";
import { EVENT_SKILLS, PROJECT_ORIGIN } from "./caw";
import type { DbShape, ProjectRow, WorkItemRow } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import { ROUTINE_ORIGIN } from "./memory";
import type { Caps } from "./project-caps";
import { handlerParent, isLive, type WorkItems } from "./work-items";

/** How often the idle sweep looks at the live handlers. */
const SWEEP_MS = 15_000;

/** One trigger on a thing, as a handler reads it (core `HandlerTrigger`), with what routes it. */
export interface Trigger {
  /** When it happened; now when left out. */
  at?: Date;
  /**
   * The person's own act asked for it (their Start of an attempt): a
   * handler starts even while Caw is off, the work theirs (origin `you`).
   */
  byPerson?: true;
  /** Pictures and files that came with it. */
  carried?: Carried;
  /** What happened, one line with the thing's link. */
  context: string;
  /** The change itself, verbatim. */
  delta: string;
  /** Its kind: the skill it names. */
  kind: EventKind;
  /** The thing as the handler's title names it: "tsk-12 Price the worktops". */
  name: string;
  /** The event route that delivered it, when one did: its mode. */
  route?: string;
  /** The routine whose run it is: its mode, and its send's origin. */
  routine?: string;
  thing: HandledThing;
  /** Who did it: "you", a session's link, "the hub". */
  who: string;
}

/** What a trigger came to: the handler that took it, or why none did. */
export type Handled =
  | { instanceId: string; itemId: string; started: boolean; woke: true }
  | { thrown?: unknown; why: string; woke: false };

export interface HandlersDeps {
  readonly caps: Pick<Caps, "quiets">;
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "handledBy"
    | "liveHandlers"
    | "project"
    | "projectWorkItems"
    | "workItem"
  >;
  /** Whether the session is in a turn now, and when its last turn ended (ms); null: never. */
  readonly idle: (instanceId: string) => {
    busy: boolean;
    lastTurnAt: number | null;
  };
  readonly lifetime: HubLifetimeShape;
  /** The permission mode a start in `project` takes for a trigger (caw.ts `modeFor`); undefined: the one last chosen. */
  readonly mode: (
    project: ProjectRow,
    trigger: Pick<Trigger, "route" | "routine">
  ) => OfferedMode | undefined;
  /** What of the session still waits on the person: an ask, a card; undefined when nothing does. */
  readonly openAsk: (instanceId: string) => string | undefined;
  /** Where a project's sessions start: its checkout, else its folder (caw.ts `placeFor`). */
  readonly place: (
    project: ProjectRow
  ) => Promise<{ cwd: string; machineId: string } | undefined>;
  /** Delivers one message through the hub's one send path. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  readonly workItems: Pick<WorkItems, "endHandler" | "startForHub">;
}

/** How long a handler may sit idle: the scratch fleet's own, else {@link HANDLER_IDLE_MS}. */
const idleMsOf = (): number => {
  const asked = Number(readEnv(CAWCO_ENV.handlerIdleMs));
  return Number.isFinite(asked) && asked > 0 ? asked : HANDLER_IDLE_MS;
};

const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createHandlers = (deps: HandlersDeps) => {
  const { db } = deps;
  const idleMs = idleMsOf();
  const idleMinutes = Math.max(1, Math.round(idleMs / MINUTE_MS));
  /** Handlers the sweep found idle and held open, said once each. */
  const heldSaid = new Set<string>();
  /** Handlers being started now, by thing: triggers at once share one start. */
  const starting = new Map<string, Promise<Handled>>();

  const keyOf = (projectId: string, thing: HandledThing): string =>
    `${projectId}\0${thing.kind}\0${thing.id}`;

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  /** The thing's handler that lives now: its newest item, live, its session's row there. */
  const living = (
    projectId: string,
    thing: HandledThing
  ): { item: WorkItemRow; session: InstanceRow } | undefined => {
    const [newest] = db.handledBy(projectId, thing.kind, thing.id);
    const session =
      newest && isLive(newest.state) ? row(newest.instanceId) : undefined;
    return newest && session ? { item: newest, session } : undefined;
  };

  /** The trigger as the handler's words take it. */
  const said = (one: Trigger) => ({
    at: (one.at ?? new Date()).toISOString(),
    context: one.context,
    delta: one.delta,
    skill: EVENT_SKILLS[one.kind],
    who: one.who,
  });

  /** The origin a send to a handler is drawn by: the hub's word, a routine's naming its routine. */
  const originOf = (one: Trigger): NeutralOrigin => ({
    kind: "system",
    name: one.routine ? `${ROUTINE_ORIGIN}${one.routine}` : PROJECT_ORIGIN,
  });

  /** One message to a handler's session: its uuid when the hub took it, else why not. */
  const message = (
    session: InstanceRow,
    content: string,
    origin: NeutralOrigin,
    carried?: Carried
  ): { uuid: string } | { why: string } => {
    const uuid = crypto.randomUUID();
    const record = deps.send({
      verb: "send",
      machineId: session.machineId,
      instanceId: session.id,
      payload: {
        ...carried,
        instanceId: session.id,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin,
        },
      },
    });
    return record.state === "pending"
      ? { uuid }
      : { why: record.reason ?? "Its session didn't take the message." };
  };

  /** A fresh handler for `thing`, briefed with `trigger`; what the pictures that came with it are, sent after. */
  const start = async (
    project: ProjectRow,
    asked: Trigger
  ): Promise<Handled> => {
    const place = await deps.place(project);
    if (!place) {
      return {
        woke: false,
        why: "No machine of the project's is online to start a handler on.",
      };
    }
    const mode = deps.mode(project, asked);
    const title = handlerWords.title(asked.name);
    const begun = await deps.workItems.startForHub(
      {
        title,
        prompt: handlerWords.brief(
          `the project “${project.name}”`,
          place.cwd,
          asked.name,
          idleMinutes,
          said(asked)
        ),
        host: true,
        cwd: place.cwd,
        machineId: place.machineId,
        harness: project.cawHarness,
        ...(project.cawModel ? { model: project.cawModel } : {}),
        origin: asked.byPerson ? "you" : "event",
        handles: asked.thing,
        ...(mode ? { mode } : {}),
      },
      handlerParent({
        projectId: project.id,
        thing: asked.thing,
        cwd: place.cwd,
        machineId: place.machineId,
        title,
      })
    );
    const session = row(begun.item.instanceId);
    if (asked.carried && session) {
      message(session, "What came with it.", originOf(asked), asked.carried);
    }
    console.log(
      `[handlers] ${project.name}: a handler for ${asked.thing.kind} ${asked.thing.id} started (item ${begun.item.id}, session ${begun.item.instanceId.slice(0, 8)})`
    );
    return {
      woke: true,
      started: true,
      instanceId: begun.item.instanceId,
      itemId: begun.item.id,
    };
  };

  /**
   * One trigger on a thing of a project, to its handler: the one that
   * lives, told at its next step, else a fresh one. Nothing while the
   * project's Caw is off or past its spend cap: the trigger waits on its
   * thing.
   */
  const trigger = async (
    projectId: string,
    asked: Trigger
  ): Promise<Handled> => {
    const project = db.project(projectId);
    if (!project) {
      return { woke: false, why: `The hub keeps no project ${projectId}.` };
    }
    if (!(project.eventsOn || asked.byPerson)) {
      return { woke: false, why: handlerWords.cawOff };
    }
    const capped = deps.caps.quiets(projectId);
    if (capped !== undefined) {
      return { woke: false, why: capped };
    }
    const key = keyOf(projectId, asked.thing);
    const pending = starting.get(key);
    if (pending !== undefined) {
      await pending.catch(() => undefined);
    }
    const live = living(projectId, asked.thing);
    if (live) {
      const sent = message(
        live.session,
        handlerWords.again(said(asked)),
        originOf(asked),
        asked.carried
      );
      return "uuid" in sent
        ? {
            woke: true,
            started: false,
            instanceId: live.session.id,
            itemId: live.item.id,
          }
        : { woke: false, why: sent.why };
    }
    const begun = start(project, asked).catch((error: unknown): Handled => ({
      woke: false,
      why: errorWords(error),
      thrown: error,
    }));
    starting.set(key, begun);
    try {
      return await begun;
    } finally {
      if (starting.get(key) === begun) {
        starting.delete(key);
      }
    }
  };

  /** Why the handler `item` is still open, or nothing: an ask of its waits, a delegate of its lives. */
  const openOf = (
    item: WorkItemRow,
    session: InstanceRow
  ): string | undefined => {
    const asked = deps.openAsk(session.id);
    if (asked) {
      return asked;
    }
    const delegate = db
      .projectWorkItems(item.projectId ?? "")
      .find((one) => one.parentInstanceId === session.id && isLive(one.state));
    return delegate ? `its delegate ${delegate.id} is live` : undefined;
  };

  /** The idle sweep: each live handler idle {@link idleMs} with nothing open ends. */
  const sweep = (): void => {
    const now = Date.now();
    for (const item of db.liveHandlers()) {
      const session = row(item.instanceId);
      if (!session) {
        continue;
      }
      const state = deps.idle(session.id);
      if (state.busy) {
        continue;
      }
      const since = Math.max(state.lastTurnAt ?? 0, item.createdAt.getTime());
      if (now - since < idleMs) {
        continue;
      }
      const open = openOf(item, session);
      if (open) {
        if (!heldSaid.has(item.id)) {
          heldSaid.add(item.id);
          console.log(handlerWords.heldOpen(item.id, open));
        }
        continue;
      }
      console.log(
        `[handlers] ${item.id} (${item.handlesKind} ${item.handlesId}) ends: ${handlerWords.idleWhy(idleMinutes)}`
      );
      deps.workItems.endHandler(item.id, {
        headline: handlerWords.endedIdle(idleMinutes),
        why: handlerWords.idleWhy(idleMinutes),
      });
    }
  };
  deps.lifetime.every(SWEEP_MS, sweep);

  return {
    trigger,
    /** The thing's handler that lives now, its session; undefined when none does. */
    living: (projectId: string, thing: HandledThing): InstanceRow | undefined =>
      living(projectId, thing)?.session,
    /**
     * The projects `instanceId` handles a thing of now: its own when its
     * item is a live handler's. Such a session reads every page of its
     * project and answers the pins of ended writers, as the project's
     * conversation does (artifacts/service.ts `answerable`).
     */
    handlesIn: (instanceId: string): string[] => {
      const session = row(instanceId);
      const item = session?.workItemId
        ? db.workItem(session.workItemId)
        : undefined;
      return item?.handlesKind && item.projectId && isLive(item.state)
        ? [item.projectId]
        : [];
    },
    /** Whether `instanceId` is a handler of `thing` in `projectId`, live or ended. */
    handled: (
      projectId: string,
      thing: HandledThing,
      instanceId: string
    ): boolean =>
      db
        .handledBy(projectId, thing.kind, thing.id)
        .some((item) => item.instanceId === instanceId),
    sweep,
  };
};
