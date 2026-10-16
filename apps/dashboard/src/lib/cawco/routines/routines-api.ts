/**
 * A project's routines page as the hub holds it, read together: its
 * routines with their newest runs (routines.ts `RoutineView`), what fires
 * them (ingress.ts: event routes, connector polls and the repository's
 * GitHub poller; relay.ts: its relays), and the actions its sessions
 * proposed (actions.ts). A row's actions are the hub's routine routes; a
 * refusal is thrown in the hub's own sentence.
 */
import type {
  ApprovedActionView,
  ConnectionView,
  RelayView,
} from "@cawco/core";
import { json, send } from "#lib/cawco/project-tasks.js";

/** How a run ended (routines.ts `RoutineOutcome`). */
export type RoutineOutcome = "silent" | "delivered" | "failed" | "cancelled";
/** Where a run is (routines.ts `RoutineRunState`). */
export type RoutineRunState =
  "queued" | "starting" | "running" | "ended" | "skipped";

/** One run, as the hub answers it (times in ms). */
export interface RoutineRun {
  attempt: number;
  endedAt: number | null;
  id: string;
  /** A lead run's Caw session; null for a delegate run. */
  leadInstanceId: string | null;
  outcome: RoutineOutcome | null;
  output: string | null;
  reason: string | null;
  slot: string;
  startedAt: number;
  state: RoutineRunState;
  /** A lead run's thread; null for a delegate run. */
  threadId: string | null;
  workItemId: string | null;
}

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
  nextSlot: number;
  projectId: string | null;
  prompt: string;
  runs: RoutineRun[];
  target: "delegate" | "lead" | "curator";
  threadId: string | null;
  timeZone: string;
}

/** A route that sends a service's events to a routine (ingress.ts `EventRouteView`). */
export interface EventRoute {
  author: string | null;
  branch: string | null;
  enabled: boolean;
  id: string;
  kinds: string[];
  label: string | null;
  regex: string | null;
  routineId: string;
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
}

/** What the page reads of `GET /api/projects/:id/ingress`. */
interface IngressRead {
  connectorPolls: {
    connection: string;
    enabled: boolean;
    id: string;
    intervalS: number;
    polledAt: number | null;
    reason: string | null;
    tool: string;
  }[];
  github: {
    connection: string | null;
    polled: boolean;
    polledAt: number | null;
    repo: string | null;
    state: string;
  };
  routes: EventRoute[];
}

const project = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;
const routinePath = (routineId: string) =>
  `/api/routines/${encodeURIComponent(routineId)}`;

/** The project's routines page, each part read at once. */
export async function readRoutinesPage(
  projectId: string
): Promise<RoutinesPage> {
  const id = encodeURIComponent(projectId);
  const [routines, ingress, relays, actions, connections] = await Promise.all([
    send<Routine[]>(`/api/routines?projectId=${id}`),
    send<IngressRead>(`${project(projectId)}/ingress`),
    send<RelayView[]>(`${project(projectId)}/relays`),
    send<{ actions: ApprovedActionView[] }>(`/api/actions?projectId=${id}`),
    send<{ connections: ConnectionView[] }>("/api/connections"),
  ]);
  const connectionOf = new Map(
    connections.connections.map((each) => [each.id, each])
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
  const { github } = ingress;
  if (github.connection !== null) {
    polls.unshift({
      id: "github",
      service: "github",
      tool: null,
      what: github.repo ?? "The repository",
      everyS: null,
      polledAt: github.polledAt,
      failure: github.polled ? null : github.state,
    });
  }
  return {
    routines,
    routes: ingress.routes.filter((route) => route.enabled),
    polls,
    relays,
    actions: actions.actions,
  };
}

/** Pauses or resumes a routine, or keeps one past its days: the routine after. */
export const updateRoutine = (
  routineId: string,
  change: { enabled?: boolean; keep?: boolean }
): Promise<Routine> => send(routinePath(routineId), json("PATCH", change));

/** Runs a routine now, beside its schedule: the run the hub started. */
export const runRoutineNow = (routineId: string): Promise<RoutineRun> =>
  send(`${routinePath(routineId)}/run`, { method: "POST" });

/** Deletes a routine; its past runs stay in the project's history. */
export const deleteRoutine = (
  routineId: string
): Promise<{ deleted: boolean }> =>
  send(routinePath(routineId), { method: "DELETE" });
