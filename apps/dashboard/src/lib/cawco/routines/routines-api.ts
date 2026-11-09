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
import type { RoutineRunView, RoutineTarget } from "@cawco/core/routine-kinds";
import { routinesWords } from "@cawco/core/words/routines";
import { type HubClient, hub } from "#lib/platform/hub.js";
import { type Refused, refusedOrUnreached } from "#lib/platform/hub-read.js";

/** One run, as the hub answers it (times in ms). */
export type RoutineRun = RoutineRunView;

/** A routine, as the hub answers it (times in ms), with its newest runs. */
export interface Routine {
  createdBy: string;
  cron: string;
  disabledReason: string | null;
  enabled: boolean;
  /** When an agent's routine turns itself off unless kept; null for the owner's. */
  expiresAt: number | null;
  id: string;
  keep: boolean;
  lastSlot: number | null;
  name: string;
  /** Its runs ahead, as the hub's scheduler will start them (hub `nextRunsOf`): the next week's, at most 288, epoch ms. */
  nextRuns: number[];
  nextSlot: number;
  projectId: string | null;
  prompt: string;
  runs: RoutineRun[];
  target: RoutineTarget;
  timeZone: string;
}

/** A route that sends a service's events to a routine (ingress.ts `EventRouteView`). */
interface EventRoute {
  author: string | null;
  branch: string | null;
  enabled: boolean;
  id: string;
  kinds: string[];
  label: string | null;
  /** When an event it fits last went to its routine; null when none has. */
  lastDeliveryAt: number | null;
  regex: string | null;
  routineId: string;
  /** The service its source is, as a provider mark names it (lower case). */
  service: string;
  source: string;
}

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
 * A read through Eden's client: its answer, or its refusal thrown as
 * {@link refusedOrUnreached} reads it.
 */
async function answered<T>(
  answer: Promise<
    | { data: T; error: null }
    | { data: null; error: Refused["error"]; response: Response }
  >
): Promise<T> {
  const read = await answer;
  if (read.error) {
    throw refusedOrUnreached(read);
  }
  return read.data;
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
      answered(client.api.routines.get({ query: { projectId } })),
      answered(project.ingress.get()),
      answered(project.relays.get()),
      answered(client.api.actions.get({ query: { projectId } })),
      answered(client.api.connections.get()),
      answered(project["trim-routine"].get()),
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
  create: async (projectId, draft) => {
    const answer = await hub.api.routines.post({
      projectId,
      target: draft.target,
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      cron: draft.cron.trim(),
      timeZone: draft.timeZone,
      delegateType: draft.delegateType,
    });
    if (answer.error) {
      throw refusedOrUnreached(answer);
    }
    return answer.data;
  },
  preview: async (cron, timeZone) => {
    const answer = await hub.api.routines.schedule.get({
      query: { cron: cron.trim(), timeZone },
    });
    if (answer.error) {
      throw refusedOrUnreached(answer);
    }
    return answer.data;
  },
  types: async (projectId) => {
    const answer = await hub.api
      .projects({ id: projectId })
      ["delegate-types"].get();
    if (answer.error) {
      throw refusedOrUnreached(answer);
    }
    const catalog = answer.data;
    return catalog.types.map(({ name, description }) => ({
      name,
      description,
    }));
  },
};

/** Pauses or resumes a routine, or keeps one past its days: the routine after. */
export const updateRoutine = async (
  routineId: string,
  change: { enabled?: boolean; keep?: boolean }
) => {
  const answer = await hub.api.routines({ id: routineId }).patch(change);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Runs a routine now, beside its schedule: the run the hub started. */
export const runRoutineNow = async (routineId: string) => {
  const answer = await hub.api.routines({ id: routineId }).run.post();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Deletes a routine; its past runs stay in the project's history. */
export const deleteRoutine = async (routineId: string) => {
  const answer = await hub.api.routines({ id: routineId }).delete();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/**
 * The person's answer to Caw's suggestion of the unused skills and servers
 * routine: `on` makes it, answered; `dismissed` waves the suggestion away.
 */
export const answerTrimOffer = async (
  projectId: string,
  answer: "on" | "dismissed"
) => {
  const sent = await hub.api
    .projects({ id: projectId })
    ["trim-routine"].post({ answer });
  if (sent.error) {
    throw refusedOrUnreached(sent);
  }
  return sent.data;
};

/** The fleet switch for the routine (Configure › Skills): whether it is on. */
export const readFleetTrim = async () => {
  const answer = await hub.api["trim-routine"].fleet.get();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Flips the fleet switch: on turns the routine on in every project. */
export const setFleetTrim = async (on: boolean) => {
  const answer = await hub.api["trim-routine"].fleet.put({ on });
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};
