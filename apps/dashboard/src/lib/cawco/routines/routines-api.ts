/**
 * A project's routines page as the hub holds it, read together: its
 * routines with their newest runs (routines.ts `RoutineView`), what fires
 * them (ingress.ts: event routes, connector polls and the repository's
 * GitHub poller; relay.ts: its relays), and the actions its sessions
 * proposed (actions.ts). A row's actions are the hub's routine routes; a
 * refusal is thrown in the hub's own sentence.
 */

import type { ApprovedActionView } from "@cawco/core/actions";
import type { RelayView } from "@cawco/core/relays";
import type { RoutineRunView } from "@cawco/core/routine-kinds";
import { routinesWords } from "@cawco/core/words/routines";
import type { Treaty } from "@elysia/eden";
import { type HubClient, hub } from "#lib/platform/hub.js";
import { hubData, refusedOrUnreached } from "#lib/platform/hub-read.js";

/** One run, as the hub answers it (times in ms). */
export type RoutineRun = RoutineRunView;

/** A routine, as the hub answers it (times in ms), with its newest runs. */
export type Routine = Treaty.Data<typeof hub.api.routines.get>[number];

/** What the page reads of `GET /api/projects/:id/ingress`. */
type IngressRead = Treaty.Data<
  ReturnType<typeof hub.api.projects>["ingress"]["get"]
>;

/** A route that sends a service's events to a routine (ingress.ts `EventRouteView`), with the service its source is, as a provider mark names it (lower case). */
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
    trimOffered: trim.offered,
  };
}

/** What a routine made by hand is: `POST /api/routines`'s fields the form sets. */
export interface RoutineDraft {
  cron: string;
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
