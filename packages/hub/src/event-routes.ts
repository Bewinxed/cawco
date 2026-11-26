/**
 * Event routing (Projects spec §5.9, provider spec §2.5 step 4): the last
 * of the door's subscribers (intake.ts), and the project's routes, their
 * tools and HTTP routes, and its ingress view.
 *
 * - **Routes** filter first: the project's enabled routes whose every
 *   condition holds (source pattern, kinds, author, label, branch, a regex
 *   over title and body, both matched on RE2 in linear time). Jev on: Jev
 *   chooses among their routines, or none, which leaves it to the trigger;
 *   a Jev that does not answer leaves the event stored and unrouted, and
 *   says so in the log. Jev off: the oldest matching route takes it. The
 *   routine runs with the event as the run's input (routines.ts
 *   `runForEvent`; behind a run still going it queues, and is handled when
 *   it starts). Routes see every event.
 * - **A trigger** (triggers.ts) takes an event no route took: on the task
 *   that links its item (thing `task`, so the task's running attempt hears
 *   it), else on the item itself (thing `event`, keyed by its URL, so a run
 *   of events on one item reaches one session); never the project's Caw
 *   conversation. A merged pull request whose task the lifecycle step
 *   moved raises none. On an issue the tracker sync took in, an opening
 *   (on the task the sync filed for it) and a comment raise one; a close,
 *   a reopen or a label, which the sync took into its task, none. An event
 *   the outsider rule held (outsiders.ts) goes to no route and raises none.
 *   An event CawCo's own write caused (writes.ts, its `origin` `ours`)
 *   goes to a route that matches it, and raises no trigger. While the project's triggers are off it is held on
 *   the project, and the session that starts when they are switched on
 *   reads it with the rest.
 * - **Data, never instructions.** An event reaches a model only inside a
 *   delimited block (inbound-event.ts `eventData`) whose JSON cannot close
 *   it, after a sentence that says it is untrusted content.
 * - **Connector polls** are written here (a watch of provider
 *   `connection`), and read by the poll loop (clock.ts).
 */
import {
  type OfferedMode,
  SESSION_CHOSEN_MODES,
} from "@cawco/core/harness/modes";
import type { InstanceRow } from "@cawco/core/protocol";
import { taskLink } from "@cawco/core/references";
import { shortId } from "@cawco/core/short-id";
import type { WaitTarget } from "@cawco/core/wait-targets";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { externalItemWords } from "@cawco/core/words/external-items";
import { taskLinkWords } from "@cawco/core/words/task-links";
import { CONNECTOR_MIN_S } from "@cawco/providers/connection/descriptor";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { RE2JS } from "re2js";
import { z } from "zod";
import type { Clock } from "./clock";
import { readsOnly } from "./connection-writes";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type {
  ConnectorPollRow,
  Delivery,
  EventRouteRow,
  InboundEventRow,
} from "./db/ingress";
import { GITHUB } from "./db/watches";
import { byHandle } from "./handles";
import { eventData, type InboundEvent } from "./inbound-event";
import type {
  ConnectorPollView,
  EventRouteView,
  InboundEventView,
  IngressView,
} from "./ingress-views";
import { PAYLOAD_MAX } from "./ingress-views";
import type { Arrived, Routing } from "./intake";
import type { JevAccess } from "./jev";
import { JevFailed, jevRoute, offLine, TO_CONVERSATION } from "./jev-placement";
import { defineTool } from "./mcp-tool";
import {
  deletedWords,
  ingressWords,
  pollListWords,
  pollWords,
  routeWords,
} from "./presenters/project";
import type { Routines } from "./routines";
import { normaliseTaskRef } from "./task-file";
import { MODE } from "./tasks";
import type { TriggerEvent } from "./trigger-event";
import type { Routed } from "./triggers";

/**
 * The events on a synced issue that raise a trigger when no route took
 * them (provider spec §2.5's table, with the owner's "Opened" cell): its
 * opening, on the task the sync filed for it, and a comment, filed there.
 * A close, a reopen or a label the sync took into its task raises none.
 */
const SYNCED_TRIGGERS: ReadonlySet<string> = new Set([
  "issue.opened",
  "comment.created",
]);

/**
 * What a route's regex reads at most: what is stored of an event
 * ({@link PAYLOAD_MAX}). RE2 is linear, so reading all of it costs little.
 * And how long the regex may be.
 */
const MATCH_TEXT_MAX = PAYLOAD_MAX;
/** Events an ingress view lists a page of; `eventsMore` counts the older ones, which `skip` reaches. */
const EVENTS_SHOWN = 50;

/**
 * Route patterns run on RE2 (re2js, "the JavaScript port of RE2, a regular
 * expression engine that provides linear time matching",
 * npmjs.com/package/re2js): no pattern a session writes can make a match
 * backtrack, so none can hold the hub's loop. Compiled once each.
 */
const compiled = new Map<string, RE2JS>();
const re2 = (pattern: string, flags = 0): RE2JS => {
  const key = `${flags}\0${pattern}`;
  const known = compiled.get(key);
  if (known) {
    return known;
  }
  const made = RE2JS.compile(pattern, flags);
  compiled.set(key, made);
  return made;
};

/** `*` matching any run of characters; everything else literal; any case. */
const globMatches = (pattern: string, source: string): boolean =>
  re2(
    pattern.split("*").map(RE2JS.quote).join(".*"),
    RE2JS.CASE_INSENSITIVE
  ).testExact(source);

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Why a route's regex cannot be one, or nothing. RE2 has no backreferences
 * or lookaround (they are what make a match backtrack): a pattern using
 * them is refused with RE2's own words.
 */
const regexProblem = (regex: string): string | undefined => {
  try {
    re2(regex);
    return undefined;
  } catch (error) {
    return `regex is not one RE2 runs (it has no backreferences or lookaround, which is what keeps every match linear in time): ${error instanceof Error ? error.message : String(error)}`;
  }
};

/** Whether every condition `route` sets holds for `event`, its kinds aside: the routes are read for the event's kind. */
const matches = (route: EventRouteRow, event: InboundEvent): boolean => {
  if (!globMatches(route.source, event.source)) {
    return false;
  }
  if (route.author !== null && !same(route.author, event.actor)) {
    return false;
  }
  if (
    route.label !== null &&
    !event.labels.some((label) => same(route.label, label))
  ) {
    return false;
  }
  if (route.branch !== null && route.branch !== event.branch) {
    return false;
  }
  if (route.regex === null) {
    return true;
  }
  const text = [
    event.title,
    event.body,
    event.data === undefined ? null : JSON.stringify(event.data),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .slice(0, MATCH_TEXT_MAX);
  return re2(route.regex).test(text);
};

/** Who sent an event, as a trigger's line names it: its provider, and where. */
const sourceName = (source: string): string => {
  const [provider = "", ...rest] = source.split(":");
  const where = rest.join(":");
  switch (provider) {
    case "github":
      return `GitHub (${where})`;
    case "conn":
      return `The connector poll ${where}`;
    case "hook":
      return `Relay ${where}`;
    default:
      return source;
  }
};

/** Who acts: you (the dashboard), or a session through its tools. */
export type IngressActor = "owner" | InstanceRow;

/** A route's conditions as written. */
export interface RouteInput {
  author?: string | null;
  branch?: string | null;
  enabled?: boolean;
  kinds?: string[];
  label?: string | null;
  /** The mode its event starts the project's conversation in when it has none; null: its routine's. */
  mode?: OfferedMode | null;
  regex?: string | null;
  routineId: string;
  source: string;
}

/** A connector poll as written. */
export interface ConnectorPollInput {
  args?: Record<string, unknown>;
  connection: string;
  enabled?: boolean;
  idPath: string;
  intervalS: number;
  itemsPath?: string;
  tool: string;
  versionPath: string;
}

export interface EventRoutesDeps {
  /** The poll loop: a project's GitHub poll as its view says it, and a poll asked for now (clock.ts). */
  readonly clock: Pick<
    Clock,
    "forgeViews" | "githubView" | "pollConnectorNow" | "pollGitHubNow"
  >;
  readonly connections: Pick<Connections, "listConnectionTools">;
  readonly db: Pick<
    DbShape,
    "connections" | "ingress" | "project" | "routines"
  >;
  /** Jev's route while Jev is on (jev.ts `jevAccess`). */
  readonly jevAccess: () => JevAccess | undefined;
  /** Runs a routine once with an event as its input (routines.ts). */
  readonly routines: Pick<Routines, "runForEvent">;
  /** A task's title, for the trigger that names it; undefined when it is gone. */
  readonly taskTitle: (
    projectId: string,
    taskId: string
  ) => Promise<string | undefined>;
  /** A trigger on an event no route took, to the router (triggers.ts `route`). */
  readonly trigger: (projectId: string, event: TriggerEvent) => Promise<Routed>;
}

/** Each route's last delivery by its id (`IngressDb.deliveries`). */
const deliveredBy = (deliveries: Delivery[]): Map<string, number> =>
  new Map(deliveries.map((each) => [each.routeId, each.receivedAt]));

const routeView = (
  row: EventRouteRow,
  delivered: Map<string, number>
): EventRouteView => ({
  lastDeliveryAt: delivered.get(row.id) ?? null,
  id: row.id,
  projectId: row.projectId,
  source: row.source,
  kinds: row.kinds,
  author: row.author,
  label: row.label,
  branch: row.branch,
  regex: row.regex,
  routineId: row.routineId,
  enabled: row.enabled,
  mode: row.mode,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
});

const pollView = (row: ConnectorPollRow): ConnectorPollView => ({
  id: row.id,
  projectId: row.projectId,
  connection: row.connection,
  tool: row.tool,
  args: row.args,
  intervalS: row.intervalS,
  itemsPath: row.itemsPath,
  idPath: row.idPath,
  versionPath: row.versionPath,
  enabled: row.enabled,
  seen: row.seen,
  reason: row.reason,
  polledAt: row.polledAt?.getTime() ?? null,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
});

const eventView = (row: InboundEventRow): InboundEventView => {
  const event: unknown = JSON.parse(row.payload);
  return {
    id: row.id,
    source: row.source,
    key: row.deliveryKey,
    kind: row.kind,
    via: row.via,
    event,
    receivedAt: row.receivedAt.getTime(),
    routedTo: row.routedTo,
    handledAt: row.handledAt?.getTime() ?? null,
  };
};

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const conditions = {
  source: z.string().describe("* globs: github:*, conn:<connection>:<tool>."),
  kinds: z
    .array(z.string())
    .optional()
    .describe(
      "{pr,issue}.{opened,closed,reopened}, pr.merged, issue.labeled, comment.created, discussion{,_comment}.created, item."
    ),
  author: z.string().optional(),
  label: z.string().optional(),
  branch: z.string().optional().describe("PR head branch."),
  regex: z.string().optional().describe("Over title and body."),
};

const pollFields = {
  args: z.record(z.string(), z.unknown()).optional(),
  // @limit measured: a connector poll is due no sooner than the one poll loop's 60 s period (CONNECTOR_MIN_S, providers connection/descriptor.ts)
  interval_s: z.number().int().min(CONNECTOR_MIN_S),
  items_path: z
    .string()
    .optional()
    .describe("Dot path to the list; default the answer."),
  id_path: z.string().describe("Dot path to an item's id."),
  version_path: z
    .string()
    .describe("Dot path to its version, like updated_at."),
};

const ref = () => z.string().trim().min(1).describe("Its id.");

export const createEventRoutes = ({
  clock,
  connections,
  db,
  jevAccess,
  routines,
  taskTitle,
  trigger,
}: EventRoutesDeps) => {
  const store = db.ingress;

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    problem(404, {
      code: "ingress-project-unknown",
      detail: `The hub keeps no project ${projectId}.`,
    });

  /** The project `actor` may act in: its own, refused without one. */
  const scopeOf = (actor: IngressActor, projectId?: string | null) => {
    if (actor === "owner") {
      if (!projectId) {
        return problem(400, {
          code: "ingress-project-unnamed",
          detail: "Name the project.",
        });
      }
      const project = projectOf(projectId);
      return project instanceof ElysiaStatus ? project : project.id;
    }
    return (
      actor.projectId ??
      problem(403, {
        code: "ingress-no-project",
        detail: "This session is in no project, so it has no inbound events.",
      })
    );
  };

  /** Why `actor` may not touch a `what` of project `projectId`; nothing when it may. */
  const notYours = (actor: IngressActor, projectId: string, what: string) =>
    actor !== "owner" && actor.projectId !== projectId
      ? problem(403, {
          code: "ingress-not-yours",
          detail: `That ${what} is not one of this session's project's.`,
        })
      : undefined;

  // --- routing ---------------------------------------------------------------

  /** The routes whose every condition holds for `event`, oldest first: the matcher's filter. */
  const matching = (projectId: string, event: InboundEvent) =>
    store.routes(projectId, event.kind).filter((each) => {
      const routine = db.routines.get(each.routineId);
      if (!(each.enabled && routine?.enabled && routine.target)) {
        return false;
      }
      try {
        return matches(each, event);
      } catch (error) {
        console.warn(
          `[ingress] route ${each.id} did not run: ${wordsOf(error)}`
        );
        return false;
      }
    });

  /**
   * The routine an event goes to among the matching routes' (Event routing,
   * §5.9), or the project's conversation; undefined when Jev did not answer: the event stays
   * stored and unrouted.
   */
  const chosen = async (
    row: InboundEventRow,
    event: InboundEvent,
    routineIds: string[]
  ): Promise<string | undefined> => {
    const access = jevAccess();
    if (!access) {
      offLine(
        "routing",
        row.projectId,
        `${row.source} ${row.deliveryKey}: the matcher's oldest route, routine ${routineIds[0]}${routineIds.length > 1 ? ` (of ${routineIds.length} matching)` : ""}`
      );
      return routineIds[0];
    }
    try {
      return await jevRoute(
        access,
        row.projectId,
        event,
        routineIds.flatMap((id) => {
          const routine = db.routines.get(id);
          return routine
            ? [
                {
                  id,
                  name: routine.name,
                  prompt: routine.stop
                    ? `${routine.name}; it stops when ${routine.stop}`
                    : routine.name,
                },
              ]
            : [];
        })
      );
    } catch (error) {
      if (error instanceof JevFailed) {
        console.warn(
          `[ingress] ${row.source} ${row.deliveryKey} stays unrouted: ${error.message}`
        );
        return;
      }
      throw error;
    }
  };

  /** A routed event to its routine, delivered by the oldest matching route to it. */
  const toRoutine = (
    row: InboundEventRow,
    to: string,
    routes: readonly EventRouteRow[]
  ): void => {
    // Routed first: a queued run is handled when it starts (routines.ts
    // `drain`).
    store.setEvent(row.id, {
      routedTo: to,
      routeId: routes.find((each) => each.routineId === to)?.id ?? null,
    });
    const run = routines.runForEvent(to, row.id);
    if (run?.state !== "queued") {
      store.setEvent(row.id, { handledAt: new Date() });
    }
    console.log(
      `[routing] ${row.source} ${row.deliveryKey} → routine ${to}${run ? ` (run ${run.id}, ${run.state}${run.reason ? `: ${run.reason}` : ""})` : ""}`
    );
  };

  /**
   * The last of the door's subscribers (intake.ts): where a stored event
   * goes, a routine a route takes it to, else a trigger. One a routine or a
   * trigger already took (an event run again after a stop) goes nowhere
   * again.
   */
  const route = async (
    { event, row }: Arrived,
    routing: Routing
  ): Promise<void> => {
    if (
      routing.held ||
      row.handledAt !== null ||
      (row.routedTo !== null && row.routedTo !== TO_CONVERSATION)
    ) {
      return;
    }
    const routes = matching(row.projectId, event);
    const routineIds = [...new Set(routes.map((each) => each.routineId))];
    const to =
      routineIds.length > 0
        ? await chosen(row, event, routineIds)
        : TO_CONVERSATION;
    if (to === undefined) {
      return;
    }
    if (to !== TO_CONVERSATION) {
      toRoutine(row, to, routes);
      return;
    }
    if (routing.ours) {
      // CawCo's own write caused it (writes.ts): no one is woken by it.
      store.setEvent(row.id, { handledAt: new Date() });
      console.log(
        `[routing] ${row.source} ${row.deliveryKey}: CawCo's own write caused it, so no trigger`
      );
      return;
    }
    if (routing.lifecycle) {
      // Its task moved on the merge (dispatch.ts): nothing more to hear.
      store.setEvent(row.id, { handledAt: new Date() });
      console.log(
        `[routing] ${row.source} ${row.deliveryKey}: its task ${routing.taskId} moved on the merge, so no trigger`
      );
      return;
    }
    if (routing.synced && !SYNCED_TRIGGERS.has(event.kind)) {
      // The tracker sync moved or changed its task already (step 2).
      store.setEvent(row.id, { handledAt: new Date() });
      console.log(
        `[routing] ${row.source} ${row.deliveryKey}: the sync took it into ${routing.taskId ?? "its task"}, so no trigger`
      );
      return;
    }
    store.setEvent(row.id, { routedTo: TO_CONVERSATION });
    await toTrigger(row, event, routing.taskId);
  };

  /**
   * An event no route took, a trigger (triggers.ts): on the task that
   * links its item, so the task's own session hears it; else on its item's
   * URL, else the event itself, so a run of events on one item reaches one
   * session. Handled once a session took it or the project holds it (its
   * triggers off).
   */
  const toTrigger = async (
    row: InboundEventRow,
    event: InboundEvent,
    taskId: string | null
  ): Promise<void> => {
    const { url } = event;
    const from = sourceName(row.source);
    const title = taskId ? await taskTitle(row.projectId, taskId) : undefined;
    const thing: TriggerEvent["thing"] =
      taskId && title !== undefined
        ? {
            kind: "task",
            id: taskId,
            name: taskLink(row.projectId, taskId, title),
          }
        : {
            kind: "event",
            id: url ?? row.id,
            name: url ?? `${row.source} ${row.deliveryKey}`,
          };
    const on = thing.kind === "task" ? ` on ${thing.name}` : "";
    const routed = await trigger(row.projectId, {
      kind: "inbound-event",
      thing,
      what: `${from} sent ${row.kind}${on}${url ? ` (${url})` : ""}, and no route took it.`,
      delta: eventData(row),
      who: row.source,
      at: row.receivedAt,
    });
    console.log(
      `[routing] ${row.source} ${row.deliveryKey}: a trigger on ${thing.kind} ${thing.id} went to ${routed.to}`
    );
    if (routed.to !== "lost") {
      store.setEvent(row.id, { handledAt: new Date() });
      return;
    }
    console.warn(
      `[routing] ${row.source} ${row.deliveryKey} reached no session: ${routed.why}`
    );
  };

  // --- the view ------------------------------------------------------------------------

  const githubOf = (projectId: string) => {
    const project = projectOf(projectId);
    return project instanceof ElysiaStatus
      ? project
      : clock.githubView(projectId, project.links);
  };

  const view = (projectId: string, skip = 0) => {
    const github = githubOf(projectId);
    if (github instanceof ElysiaStatus) {
      return github;
    }
    const delivered = deliveredBy(store.deliveries(projectId));
    const events = store.events(projectId, EVENTS_SHOWN, skip);
    const project = db.project(projectId);
    const seen: IngressView = {
      github,
      forges: project ? clock.forgeViews(projectId, project.links) : [],
      routes: store.routes(projectId).map((row) => routeView(row, delivered)),
      connectorPolls: store.connectorPolls(projectId).map(pollView),
      events: events.map(eventView),
      eventsNext: skip + events.length,
      eventsMore: Math.max(
        store.eventCount(projectId) - skip - events.length,
        0
      ),
    };
    return seen;
  };

  // --- routes --------------------------------------------------------------------

  /** Refuses a route that cannot run as written. */
  const checkedRoute = (projectId: string, input: RouteInput) => {
    const routine = db.routines.get(input.routineId);
    if (!routine?.target || routine.projectId !== projectId) {
      return problem(404, {
        code: "ingress-routine-unknown",
        detail: `The project has no routine ${input.routineId}: name a task that starts on its own (task_create with on or target makes one).`,
      });
    }
    if (!input.source.trim()) {
      return problem(400, {
        code: "ingress-source-unfit",
        detail:
          "source is a source or a pattern, like github:* or conn:linear:*.",
      });
    }
    const misfit = input.regex ? regexProblem(input.regex) : undefined;
    return misfit
      ? problem(400, { code: "ingress-regex-unfit", detail: misfit })
      : undefined;
  };

  /** The event route `id` as `by` may touch it. */
  const routeFor = (id: string, by: IngressActor) => {
    const row = store.route(id);
    if (!row) {
      return problem(404, {
        code: "ingress-route-unknown",
        detail: `There is no event route ${id}.`,
      });
    }
    return notYours(by, row.projectId, "route") ?? row;
  };

  const createRoute = (
    input: RouteInput & { projectId?: string | null },
    by: IngressActor
  ) => {
    const projectId = scopeOf(by, input.projectId);
    if (projectId instanceof ElysiaStatus) {
      return projectId;
    }
    const unfit = checkedRoute(projectId, input);
    if (unfit) {
      return unfit;
    }
    const row = store.createRoute({
      id: crypto.randomUUID(),
      projectId,
      source: input.source.trim(),
      kinds: input.kinds ?? [],
      author: input.author?.trim() || null,
      label: input.label?.trim() || null,
      branch: input.branch?.trim() || null,
      regex: input.regex || null,
      routineId: input.routineId,
      enabled: input.enabled ?? true,
      mode: input.mode ?? null,
      createdBy: by === "owner" ? "owner" : by.id,
      createdAt: new Date(),
    });
    console.log(
      `[ingress] route ${row.id} (${row.source}) → routine ${row.routineId}, by ${row.createdBy}`
    );
    const made: EventRouteView = routeView(
      row,
      deliveredBy(store.deliveries(row.projectId))
    );
    return made;
  };

  /** A route's fields with `patch` laid over them. */
  const patched = (row: EventRouteRow, patch: Partial<RouteInput>) => ({
    source: patch.source ?? row.source,
    kinds: patch.kinds ?? row.kinds,
    author:
      patch.author === undefined ? row.author : patch.author?.trim() || null,
    label: patch.label === undefined ? row.label : patch.label?.trim() || null,
    branch:
      patch.branch === undefined ? row.branch : patch.branch?.trim() || null,
    regex: patch.regex === undefined ? row.regex : patch.regex || null,
    routineId: patch.routineId ?? row.routineId,
    enabled: patch.enabled ?? row.enabled,
    mode: patch.mode === undefined ? row.mode : patch.mode,
  });

  const updateRoute = (
    id: string,
    patch: Partial<RouteInput>,
    by: IngressActor
  ) => {
    const row = routeFor(id, by);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    const next = patched(row, patch);
    const unfit = checkedRoute(row.projectId, next);
    if (unfit) {
      return unfit;
    }
    const updated: EventRouteView = routeView(
      store.updateRoute(id, next) ?? row,
      deliveredBy(store.deliveries(row.projectId))
    );
    return updated;
  };

  const deleteRoute = (id: string, by: IngressActor) => {
    const row = routeFor(id, by);
    return row instanceof ElysiaStatus
      ? row
      : { deleted: store.deleteRoute(id) };
  };

  // --- connector polls ----------------------------------------------------------------

  /**
   * Refuses a connector poll that cannot run as written: a connection the
   * project (for a session) grants, a tool its server marks read-only (a
   * poll calls it every interval, so it may never act), an interval of a
   * minute or more, and the paths that find each item's id and version.
   */
  const checkedPoll = async (
    projectId: string,
    input: ConnectorPollInput,
    by: IngressActor
  ) => {
    if (
      by !== "owner" &&
      !db.connections.namesForProject(projectId).includes(input.connection)
    ) {
      return problem(403, {
        code: "ingress-connection-ungranted",
        detail: `The project does not grant the connection ${input.connection}; the owner adds it to the project first.`,
      });
    }
    if (
      !Number.isInteger(input.intervalS) ||
      input.intervalS < CONNECTOR_MIN_S
    ) {
      return problem(400, {
        code: "ingress-interval-unfit",
        detail: `interval_s is a whole number of seconds, ${CONNECTOR_MIN_S} or more.`,
      });
    }
    if (!(input.idPath.trim() && input.versionPath.trim())) {
      return problem(400, {
        code: "ingress-paths-unfit",
        detail:
          "id_path and version_path name where each item keeps its id and its version, like id and updated_at.",
      });
    }
    let tools: Awaited<ReturnType<Connections["listConnectionTools"]>>;
    try {
      tools = await connections.listConnectionTools(input.connection);
    } catch (error) {
      return problem(409, {
        code: "ingress-connection-unlisted",
        detail: wordsOf(error),
      });
    }
    const found = tools.find((each) => each.name === input.tool);
    if (!found) {
      return problem(404, {
        code: "ingress-tool-unknown",
        detail: `${input.connection} has no tool ${input.tool}.`,
      });
    }
    if (!readsOnly(found)) {
      return problem(400, {
        code: "ingress-tool-not-read-only",
        detail: `${input.connection}/${input.tool} is not marked read-only, and a poll calls it every interval: poll a read tool.`,
      });
    }
  };

  const pollOf = (id: string) =>
    store.connectorPoll(id) ??
    problem(404, {
      code: "ingress-poll-unknown",
      detail: `There is no connector poll ${id}.`,
    });

  /** The connector poll `id` as `by` may touch it. */
  const pollFor = (id: string, by: IngressActor) => {
    const row = pollOf(id);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    return notYours(by, row.projectId, "connector poll") ?? row;
  };

  const createPoll = async (
    input: ConnectorPollInput & { projectId?: string | null },
    by: IngressActor
  ) => {
    const projectId = scopeOf(by, input.projectId);
    if (projectId instanceof ElysiaStatus) {
      return projectId;
    }
    const unfit = await checkedPoll(projectId, input, by);
    if (unfit) {
      return unfit;
    }
    const row = store.createConnectorPoll({
      id: crypto.randomUUID(),
      projectId,
      connection: input.connection,
      tool: input.tool,
      args: input.args ?? {},
      intervalS: input.intervalS,
      itemsPath: input.itemsPath?.trim() ?? "",
      idPath: input.idPath.trim(),
      versionPath: input.versionPath.trim(),
      enabled: input.enabled ?? true,
      seenAt: null,
      reason: null,
      polledAt: null,
      createdBy: by === "owner" ? "owner" : by.id,
      createdAt: new Date(),
    });
    console.log(
      `[ingress] connector poll ${row.id}: ${row.connection}/${row.tool} every ${row.intervalS} s, by ${row.createdBy}`
    );
    const made: ConnectorPollView = pollView(row);
    return made;
  };

  /**
   * An edit of a poll: checked as the row stands with the patch on it, then
   * only the fields it changes written (db/ingress.ts `updateConnectorPoll`
   * takes a patch), so two edits of different fields both stand, whatever
   * order their checks end in. The check holds each field on its own and
   * the poll's connection and tool, which no edit changes, so no two edits
   * that each passed make a row neither would.
   */
  const updatePoll = async (
    id: string,
    patch: Partial<Omit<ConnectorPollInput, "connection" | "tool">>,
    by: IngressActor
  ) => {
    const row = pollFor(id, by);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    const changes = withoutUndefined({
      args: patch.args,
      intervalS: patch.intervalS,
      itemsPath: patch.itemsPath?.trim(),
      idPath: patch.idPath?.trim(),
      versionPath: patch.versionPath?.trim(),
      enabled: patch.enabled,
    });
    const next = {
      connection: row.connection,
      tool: row.tool,
      args: row.args,
      intervalS: row.intervalS,
      itemsPath: row.itemsPath,
      idPath: row.idPath,
      versionPath: row.versionPath,
      enabled: row.enabled,
      ...changes,
    };
    const unfit = await checkedPoll(row.projectId, next, by);
    if (unfit) {
      return unfit;
    }
    // What it lists or keys by moved: its next call only looks again.
    const relook = !Bun.deepEquals(
      [next.args, next.itemsPath, next.idPath, next.versionPath],
      [row.args, row.itemsPath, row.idPath, row.versionPath]
    );
    const edited: ConnectorPollView = pollView(
      store.updateConnectorPoll(id, {
        ...changes,
        ...(relook ? { seenAt: null } : {}),
      }) ?? row
    );
    return edited;
  };

  const deletePoll = (id: string, by: IngressActor) => {
    const row = pollFor(id, by);
    return row instanceof ElysiaStatus
      ? row
      : { deleted: store.deleteConnectorPoll(id) };
  };

  /** Calls a connector poll now. */
  const pollConnectorNow = async (id: string) => {
    const known = pollOf(id);
    if (known instanceof ElysiaStatus) {
      return known;
    }
    await clock.pollConnectorNow(id);
    const after = pollOf(id);
    return after instanceof ElysiaStatus ? after : pollView(after);
  };

  /** Polls a project's repositories now, unless GitHub's rate limit holds it: its view after. */
  const pollGitHubNow = async (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const refused = await clock.pollGitHubNow(projectId);
    return refused ?? view(projectId);
  };

  // --- tools -------------------------------------------------------------------------

  /** The ingress tools, bound to the calling session; with none, the same definitions for discovery. */
  const tools = (actor: InstanceRow | undefined) => {
    const me = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    /** The id of the caller's project's route `asked` names: its id or handle (handles.ts). */
    const routeNamed = (asked: string) => {
      const projectId = scopeOf(me());
      return projectId instanceof ElysiaStatus
        ? projectId
        : byHandle(
            asked,
            store.routes(projectId),
            {
              id: (one) => one.id,
              said: (one) => `${one.source} ${shortId(one.id)}`,
            },
            "event route"
          ).id;
    };
    /** The id of the caller's project's connector poll `asked` names. */
    const pollNamed = (asked: string) => {
      const projectId = scopeOf(me());
      return projectId instanceof ElysiaStatus
        ? projectId
        : byHandle(
            asked,
            store.connectorPolls(projectId),
            {
              id: (poll) => poll.id,
              said: (poll) =>
                `${poll.connection}:${poll.tool} ${shortId(poll.id)}`,
            },
            "connector poll"
          ).id;
    };
    /** The routine a route sends events to, named by its task (`tsk-12`); as written when it names none, which the route's check refuses. */
    const routineOfTask = (task: string): string => {
      const caller = me();
      const projectId = caller instanceof ElysiaStatus ? null : scopeOf(caller);
      const taskId = normaliseTaskRef(task) ?? task.trim();
      return typeof projectId === "string"
        ? (db.routines.byTask(projectId, taskId)?.id ?? taskId)
        : taskId;
    };
    return [
      EVENT_ROUTE_CREATE_DEFINITION.run(({ task, ...rest }) =>
        Promise.resolve(
          createRoute({ ...rest, routineId: routineOfTask(task) }, me())
        )
      ),
      EVENT_ROUTE_LIST_DEFINITION.run(({ skip }) => {
        const projectId = scopeOf(me());
        return Promise.resolve(
          projectId instanceof ElysiaStatus ? projectId : view(projectId, skip)
        );
      }),
      EVENT_ROUTE_UPDATE_DEFINITION.run(({ id, task, ...rest }) => {
        const named = routeNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus
            ? named
            : updateRoute(
                named,
                withoutUndefined({
                  ...rest,
                  routineId:
                    task === undefined ? undefined : routineOfTask(task),
                }),
                me()
              )
        );
      }),
      EVENT_ROUTE_DELETE_DEFINITION.run(({ id }) => {
        const named = routeNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus ? named : deleteRoute(named, me())
        );
      }),
      CONNECTOR_POLL_CREATE_DEFINITION.run(
        async (input) =>
          await createPoll(
            {
              connection: input.connection,
              tool: input.tool,
              intervalS: input.interval_s,
              idPath: input.id_path,
              versionPath: input.version_path,
              ...(input.args ? { args: input.args } : {}),
              ...(input.items_path === undefined
                ? {}
                : { itemsPath: input.items_path }),
            },
            me()
          )
      ),
      CONNECTOR_POLL_LIST_DEFINITION.run(() => {
        const projectId = scopeOf(me());
        return Promise.resolve(
          projectId instanceof ElysiaStatus
            ? projectId
            : store.connectorPolls(projectId).map(pollView)
        );
      }),
      CONNECTOR_POLL_UPDATE_DEFINITION.run(async (input) => {
        const named = pollNamed(input.id);
        return named instanceof ElysiaStatus
          ? named
          : await updatePoll(
              named,
              withoutUndefined({
                args: input.args,
                intervalS: input.interval_s,
                itemsPath: input.items_path,
                idPath: input.id_path,
                versionPath: input.version_path,
                enabled: input.enabled,
              }),
              me()
            );
      }),
      CONNECTOR_POLL_DELETE_DEFINITION.run(({ id }) => {
        const named = pollNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus ? named : deletePoll(named, me())
        );
      }),
    ];
  };

  return {
    /** Why project `projectId` cannot wait on a pull or merge request or run: no watch reads its forge; nothing when it can. */
    linkWaitRefusal(
      projectId: string,
      target: Extract<WaitTarget, { kind: "pr" | "run" }>
    ): string | undefined {
      const forge =
        target.kind === "pr"
          ? { provider: target.provider, host: target.host }
          : GITHUB;
      return store.forgeWatches(projectId, forge).length > 0
        ? undefined
        : taskLinkWords.noForge(externalItemWords.source[forge.provider]);
    },
    createPoll,
    createRoute,
    deletePoll,
    deleteRoute,
    pollConnectorNow,
    pollGitHubNow,
    route,
    tools,
    updatePoll,
    updateRoute,
    view,
  };
};

export type EventRoutes = ReturnType<typeof createEventRoutes>;

/** Every ingress tool, by name. */
export const INGRESS_TOOLS: ReadonlySet<string> = new Set([
  "event_route_create",
  "event_route_list",
  "event_route_update",
  "event_route_delete",
  "connector_poll_create",
  "connector_poll_list",
  "connector_poll_update",
  "connector_poll_delete",
]);

const ROUTE_FIELDS = {
  source: t.String(),
  kinds: t.Optional(t.Array(t.String())),
  author: t.Optional(t.Nullable(t.String())),
  label: t.Optional(t.Nullable(t.String())),
  branch: t.Optional(t.Nullable(t.String())),
  regex: t.Optional(t.Nullable(t.String())),
  routineId: t.String(),
  enabled: t.Optional(t.Boolean()),
  mode: t.Optional(t.Nullable(MODE)),
};

const POLL_FIELDS = {
  args: t.Optional(t.Record(t.String(), t.Unknown())),
  // @limit measured: a connector poll is due no sooner than the one poll loop's 60 s period (CONNECTOR_MIN_S, providers connection/descriptor.ts)
  intervalS: t.Integer({ minimum: CONNECTOR_MIN_S }),
  itemsPath: t.Optional(t.String()),
  idPath: t.String(),
  versionPath: t.String(),
  enabled: t.Optional(t.Boolean()),
};

/** The dashboard's routes for a project's ingress: its GitHub poller follows the connections that name the project, never a route of its own. */
export const ingressRoutes = (ingress: EventRoutes) =>
  new Elysia()
    .get("/api/projects/:id/ingress", ({ params }) => ingress.view(params.id))
    .post("/api/projects/:id/ingress/github/poll", ({ params }) =>
      ingress.pollGitHubNow(params.id)
    )
    .post(
      "/api/event-routes",
      { body: t.Object({ projectId: t.String(), ...ROUTE_FIELDS }) },
      ({ body }) => ingress.createRoute(body, "owner")
    )
    .patch(
      "/api/event-routes/:id",
      { body: t.Partial(t.Object(ROUTE_FIELDS)) },
      ({ params, body }) => ingress.updateRoute(params.id, body, "owner")
    )
    .delete("/api/event-routes/:id", ({ params }) =>
      ingress.deleteRoute(params.id, "owner")
    )
    .post(
      "/api/connector-polls",
      {
        body: t.Object({
          projectId: t.String(),
          connection: t.String(),
          tool: t.String(),
          ...POLL_FIELDS,
        }),
      },
      ({ body }) => ingress.createPoll(body, "owner")
    )
    .patch(
      "/api/connector-polls/:id",
      { body: t.Partial(t.Object(POLL_FIELDS)) },
      ({ params, body }) => ingress.updatePoll(params.id, body, "owner")
    )
    .delete("/api/connector-polls/:id", ({ params }) =>
      ingress.deletePoll(params.id, "owner")
    )
    .post("/api/connector-polls/:id/poll", ({ params }) =>
      ingress.pollConnectorNow(params.id)
    );

const EVENT_ROUTE_CREATE_DEFINITION = defineTool(
  "event_route_create",
  "Event routes: your project's inbound events that match (GitHub pull requests, issues, comments; connector poll items) sent to one of its routines as a run's input, the oldest matching route taking each event. Use it when a routine should run on an event rather than a schedule.",
  {
    ...conditions,
    task: z
      .string()
      .describe(
        "The routine's task, like tsk-12: a task that starts on its own."
      ),
    mode: z
      .enum(SESSION_CHOSEN_MODES)
      .optional()
      .describe("Its run's start mode; the routine's when left out."),
  },
  routeWords
);

const EVENT_ROUTE_LIST_DEFINITION = defineTool(
  "event_route_list",
  "Your project's event routes, whether its GitHub repository is polled and why not, its connector polls and its newest inbound events. Use it to see what reaches your routines, and why an event did not.",
  {
    skip: z.number().int().min(0).optional(),
  },
  ingressWords
);

const EVENT_ROUTE_UPDATE_DEFINITION = defineTool(
  "event_route_update",
  "Changes an event route's conditions, routine or mode, or pauses it. Use it on one of your project's routes.",
  {
    id: ref(),
    ...conditions,
    source: conditions.source.optional(),
    task: z.string().optional().describe("The routine's task, like tsk-12."),
    enabled: z.boolean().optional().describe("false pauses it."),
    mode: z.enum(SESSION_CHOSEN_MODES).nullable().optional(),
  },
  routeWords
);

const EVENT_ROUTE_DELETE_DEFINITION = defineTool(
  "event_route_delete",
  "Deletes an event route. Use it for a route no longer wanted; to stop one for a while, pause it with event_route_update.",
  { id: ref() },
  deletedWords("event route")
);

const CONNECTOR_POLL_CREATE_DEFINITION = defineTool(
  "connector_poll_create",
  "Connector polls: a read-only tool of a connection your project grants, called every interval, each new or changed item becoming an inbound event for your routes. Use it to bring a service without webhooks into your routines.",
  {
    connection: z.string(),
    tool: z
      .string()
      .describe("The tool's own name on the connection's server."),
    ...pollFields,
  },
  pollWords
);

const CONNECTOR_POLL_LIST_DEFINITION = defineTool(
  "connector_poll_list",
  "Your project's connector polls, each with what its last call saw or why it failed. Use it to check a poll is seeing items.",
  {},
  pollListWords
);

const CONNECTOR_POLL_UPDATE_DEFINITION = defineTool(
  "connector_poll_update",
  "Changes a connector poll's call or interval, or pauses it. Use it on one of your project's polls.",
  {
    id: ref(),
    args: pollFields.args,
    interval_s: pollFields.interval_s.optional(),
    items_path: pollFields.items_path,
    id_path: pollFields.id_path.optional(),
    version_path: pollFields.version_path.optional(),
    enabled: z.boolean().optional().describe("false pauses it."),
  },
  pollWords
);

const CONNECTOR_POLL_DELETE_DEFINITION = defineTool(
  "connector_poll_delete",
  "Deletes a connector poll. Use it for a poll no longer wanted; to stop one for a while, pause it with connector_poll_update.",
  { id: ref() },
  deletedWords("connector poll")
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const INGRESS_DEFINITIONS = [
  EVENT_ROUTE_CREATE_DEFINITION.listed(),
  EVENT_ROUTE_LIST_DEFINITION.listed(),
  EVENT_ROUTE_UPDATE_DEFINITION.listed(),
  EVENT_ROUTE_DELETE_DEFINITION.listed(),
  CONNECTOR_POLL_CREATE_DEFINITION.listed(),
  CONNECTOR_POLL_LIST_DEFINITION.listed(),
  CONNECTOR_POLL_UPDATE_DEFINITION.listed(),
  CONNECTOR_POLL_DELETE_DEFINITION.listed(),
];
