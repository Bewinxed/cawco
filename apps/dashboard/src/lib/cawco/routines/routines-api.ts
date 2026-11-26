/**
 * A project's routines page as the hub holds it, read together: its
 * routines with their newest runs (routines.ts `RoutineView`), what fires
 * them (event-routes.ts: event routes and connector polls; clock.ts: the
 * repository's GitHub poll; relay.ts: its relays), and the actions its sessions
 * proposed (actions.ts). A row's actions are the hub's routine routes; a
 * refusal is thrown in the hub's own sentence.
 */

import type { ApprovedActionView } from "@cawco/core/actions";
import type { RelayView } from "@cawco/core/relays";
import type { RoutineRunView } from "@cawco/core/routine-kinds";
import { routinesWords } from "@cawco/core/words/routines";
import type { HubClient } from "@cawco/hub/client";
import type { Treaty } from "@elysia/eden";
import { hub } from "#lib/platform/hub.js";
import { hubData, refusedOrUnreached } from "#lib/platform/hub-read.js";

/** One run, as the hub answers it (times in ms). */
export type RoutineRun = RoutineRunView;

/** A routine, as the hub answers it (times in ms), with its newest runs. */
export type Routine = Treaty.Data<typeof hub.api.routines.get>[number];

/** What the page reads of `GET /api/projects/:id/ingress`. */
type IngressRead = Treaty.Data<
  ReturnType<typeof hub.api.projects>["ingress"]["get"]
>;

/** A route that sends a service's events to a routine (event-routes.ts `EventRouteView`), with the service its source is, as a provider mark names it (lower case). */
type EventRoute = IngressRead["routes"][number] & { service: string };

/** A source read on a schedule: a connector poll, or the repository's GitHub poller. */
export interface Poll {
  /** How often it is read, in seconds; null when the hub sets it. */
  everyS: number | null;
  /** Why its last read failed; null while it reads. */
  failure: string | null;
  id: string;
  polledAt: number | null;
  /** The service it reads, as a provider mark names it. */
  service: string;
  /** The tool it calls, for a connector poll; null for the GitHub poller. */
  tool: string | null;
  /** What it reads, in the owner's words: its connection's name, or the repository. */
  what: string;
}

export interface RoutinesPage {
  actions: ApprovedActionView[];
  /** How many older actions than `actions` lists the project has. */
  actionsMore: number;
  polls: Poll[];
  relays: RelayView[];
  routes: EventRoute[];
  routines: Routine[];
  /**
   * Caw suggests the unused skills and servers routine here: the person
   * never answered his suggestion in this project, and it has no such
   * routine (hub unused-trim.ts).
   */
  trimOffered: boolean;
}

/**
 * The project's routines page, each part read at once, through `client`:
 * the live hub, or a states file's stand-in (hub-seam.ts).
 */
export async function readRoutinesPage(
  projectId: string,
  client: HubClient = hub
): Promise<RoutinesPage> {
  const project = client.api.projects({ id: projectId });
  const [routines, ingress, relays, actions, connections, trim] =
    await Promise.all([
      hubData(
        client.api.routines.get({ query: { projectId } }),
        refusedOrUnreached
      ),
      hubData(project.ingress.get(), refusedOrUnreached),
      hubData(project.relays.get(), refusedOrUnreached),
      hubData(
        client.api.actions.get({ query: { projectId } }),
        refusedOrUnreached
      ),
      hubData(client.api.connections.get(), refusedOrUnreached),
      hubData(project["trim-routine"].get(), refusedOrUnreached),
    ]);
  /** Each connection by its name: what polls and `conn:` sources name it by. */
  const connectionOf = new Map(
    connections.connections.map((each) => [each.name, each])
  );
  const polls: Poll[] = ingress.connectorPolls
    .filter((poll) => poll.enabled)
    .map((poll) => ({
      id: poll.id,
      service: connectionOf.get(poll.connection)?.service ?? poll.connection,
      tool: poll.tool,
      what: connectionOf.get(poll.connection)?.name ?? poll.connection,
      everyS: poll.intervalS,
      polledAt: poll.polledAt,
      failure: poll.reason,
    }));
  /** A route's source (`github:<repo>`, `conn:<connection>:<tool>`) as its service. */
  const serviceOfSource = (source: string): string => {
    const [kind = "", name = ""] = source.split(":");
    return (
      kind === "conn" ? (connectionOf.get(name)?.service ?? name) : kind
    ).toLowerCase();
  };
  const { github } = ingress;
  // Each GitLab and Gitea the project polls, after GitHub, as GitHub's line.
  polls.unshift(
    ...ingress.forges
      .filter((forge) => forge.connection !== null)
      .map((forge) => ({
        id: `${forge.provider}:${forge.host}`,
        service: forge.provider,
        tool: null,
        what: forge.repos.join(", ") || routinesWords.theRepository,
        everyS: null,
        polledAt: forge.polledAt,
        failure: forge.polled ? null : forge.state,
      }))
  );
  if (github.connection !== null) {
    polls.unshift({
      id: "github",
      service: "github",
      tool: null,
      what: github.repos.join(", ") || routinesWords.theRepository,
      everyS: null,
      polledAt: github.polledAt,
      failure: github.polled ? null : github.state,
    });
  }
  return {
    routines,
    routes: ingress.routes
      .filter((route) => route.enabled)
      .map((route) => ({ ...route, service: serviceOfSource(route.source) })),
    polls,
    relays,
    actions: actions.actions,
    actionsMore: actions.more,
    trimOffered: trim.offered,
  };
}

/** A condition a task may wait on: what its wait writes, its statement, and its routine's name. */
export interface ConditionChoice {
  handle: string;
  name: string;
  statement: string;
}

/** The project's routines that have a condition not met yet: what a task's Waits on offers. */
export const readConditions = async (
  projectId: string
): Promise<ConditionChoice[]> => {
  const routines = await hubData(
    hub.api.routines.get({ query: { projectId } }),
    refusedOrUnreached
  );
  return routines.flatMap(({ condition, name }) =>
    condition && condition.state !== "met"
      ? [{ handle: condition.handle, name, statement: condition.statement }]
      : []
  );
};

/** A page of a routine's runs after `skip` of them, newest first. */
export const readRoutineRuns = (
  routineId: string,
  skip: number,
  client: HubClient = hub
) =>
  hubData(
    client.api.routines({ id: routineId }).runs.get({ query: { skip } }),
    refusedOrUnreached
  );

/** A page of the project's actions after `skip` of them, newest first. */
export const readActions = (
  projectId: string,
  skip: number,
  client: HubClient = hub
) =>
  hubData(
    client.api.actions.get({ query: { projectId, skip } }),
    refusedOrUnreached
  );

/** What a routine made by hand is: `POST /api/routines`'s fields the form sets. */
export interface RoutineDraft {
  /** A statement true once met, which makes it a check tasks wait on; blank: none. */
  condition: string;
  cron: string;
  /** When its condition's checks stop unmet, epoch ms; null: never. */
  deadline: number | null;
  /** null: each run's type is the hub's pick. */
  delegateType: string | null;
  name: string;
  prompt: string;
  /** What each run starts: a delegate, or an orchestrator that delegates (hub routines.ts `fireOrchestrator`). */
  target: "delegate" | "orchestrator";
  timeZone: string;
}

/** A schedule read back by the hub before it is kept (hub routines.ts `SchedulePreview`). */
export interface SchedulePreview {
  /** Its runs ahead, as the scheduler would start them, epoch ms. */
  nextRuns: number[];
  /** The runs stop before the week's end: the schedule runs more than they tell. */
  nextRunsCut: boolean;
  /** The cron in words, in its zone (cronstrue). */
  words: string;
}

/** A delegate type the project's runs may take: its name and what it is for. */
export interface TypeChoice {
  description: string;
  name: string;
}

/** The hub's routes the routine form asks: a seam its states file fills. */
export interface RoutineFormHub {
  create: (projectId: string, draft: RoutineDraft) => Promise<Routine>;
  preview: (cron: string, timeZone: string) => Promise<SchedulePreview>;
  types: (projectId: string) => Promise<TypeChoice[]>;
}

/**
 * The hub's: a routine made as Caw's are (the same route, files and
 * budgets), a delegate run each time, run once at once as a test; a
 * schedule parsed by the hub's own cron (refused in its words); the
 * project's delegate type catalog.
 */
export const routineFormHub: RoutineFormHub = {
  create: (projectId, draft) =>
    hubData(
      hub.api.routines.post({
        projectId,
        target: draft.target,
        name: draft.name.trim(),
        prompt: draft.prompt.trim(),
        cron: draft.cron.trim(),
        timeZone: draft.timeZone,
        delegateType: draft.delegateType,
        ...(draft.condition.trim()
          ? { condition: draft.condition.trim(), deadline: draft.deadline }
          : {}),
      }),
      refusedOrUnreached
    ),
  preview: (cron, timeZone) =>
    hubData(
      hub.api.routines.schedule.get({
        query: { cron: cron.trim(), timeZone },
      }),
      refusedOrUnreached
    ),
  types: async (projectId) => {
    const catalog = await hubData(
      hub.api.projects({ id: projectId })["delegate-types"].get(),
      refusedOrUnreached
    );
    return catalog.types.map(({ name, description }) => ({
      name,
      description,
    }));
  },
};

/** Pauses or resumes a routine, or keeps one past its days: the routine after. */
export const updateRoutine = (
  routineId: string,
  change: { enabled?: boolean; keep?: boolean }
) =>
  hubData(
    hub.api.routines({ id: routineId }).patch(change),
    refusedOrUnreached
  );

/**
 * Mark met: the routine's condition counts as met, so every task and plan
 * step waiting on it goes ahead and its check stops; the routine after.
 */
export const markConditionMet = (routineId: string) =>
  hubData(hub.api.routines({ id: routineId }).met.post(), refusedOrUnreached);

/**
 * Check again: the routine's condition un-met and checked now and from now
 * on, until `deadline` when given (epoch ms; null: until met); the routine
 * after.
 */
export const checkConditionAgain = (
  routineId: string,
  deadline?: number | null
) =>
  hubData(
    hub.api
      .routines({ id: routineId })
      .recheck.post(deadline === undefined ? {} : { deadline }),
    refusedOrUnreached
  );

/** Runs a routine now, beside its schedule: the run the hub started. */
export const runRoutineNow = (routineId: string) =>
  hubData(hub.api.routines({ id: routineId }).run.post(), refusedOrUnreached);

/** Deletes a routine; its past runs stay in the project's history. */
export const deleteRoutine = (routineId: string) =>
  hubData(hub.api.routines({ id: routineId }).delete(), refusedOrUnreached);

/**
 * The person's answer to Caw's suggestion of the unused skills and servers
 * routine: `on` makes it, answered; `dismissed` waves the suggestion away.
 */
export const answerTrimOffer = (
  projectId: string,
  answer: "on" | "dismissed"
) =>
  hubData(
    hub.api.projects({ id: projectId })["trim-routine"].post({ answer }),
    refusedOrUnreached
  );

/** The fleet switch for the routine (Configure › Skills): whether it is on. */
export const readFleetTrim = () =>
  hubData(hub.api["trim-routine"].fleet.get(), refusedOrUnreached);

/** Flips the fleet switch: on turns the routine on in every project. */
export const setFleetTrim = (on: boolean) =>
  hubData(hub.api["trim-routine"].fleet.put({ on }), refusedOrUnreached);
