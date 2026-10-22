/**
 * A project's own things as an agent reads them: Caw's threads and folder,
 * its views, memory, routines, inbound routes and polls, approved actions
 * and relays. Each by its name and the handle its tools take back
 * (handles.ts), each time as how long ago or how far ahead.
 */
import type {
  ApprovedActionView,
  RelayView,
  ThreadMessage,
  ThreadRead,
  ThreadSummary,
} from "@cawco/core";
import type {
  ConnectorPollView,
  EventRouteView,
  IngressView,
} from "../ingress";
import type { FolderFile, FolderListing } from "../project-folder";
import type { RelayCreated } from "../relay";
import { type RoutineRunView, type RoutineView, slotLabel } from "../routines";
import {
  ago,
  ahead,
  count,
  handle,
  lasted,
  lines,
  listed,
  quote,
  valueWords,
  verbatim,
} from "./words";

/** A list line's mark, which a single answer says as its kind. */
const LIST_MARK = /^- /;

/** One thread of Caw's, a line. */
const threadLine = (
  thread: ThreadSummary & { last?: string | null },
  now: number
): string =>
  `- ${quote(thread.title, 120)} ${handle(thread.id)} · ${thread.status}${thread.setup ? " · setup" : ""}${thread.hearing ? " · you heard it and have not answered" : ""} · last ${ago(thread.lastAt, now)}${thread.last ? `: ${quote(thread.last, 240)}` : ""}`;

/** One message of a thread, a line. */
const messageLine = (message: ThreadMessage, now: number): string => {
  switch (message.author) {
    case "you":
      return `- the person, ${ago(message.createdAt, now)}: ${verbatim(message.body)}${message.attachments?.length ? ` (attached ${count(message.attachments.length, "file")})` : ""}${message.question ? " (asked a question)" : ""}`;
    case "caw":
      return `- you, ${ago(message.createdAt, now)}: ${quote(message.body, 1200)}${message.tasks?.length ? ` (tasks ${listed(message.tasks)})` : ""}${message.files?.length ? ` (files ${listed(message.files)})` : ""}`;
    case "event":
      return `- event, ${ago(message.createdAt, now)}: ${message.noteTitle}${message.body ? `: ${quote(message.body, 600)}` : ""}`;
    default: {
      const unhandled: never = message;
      return String(unhandled);
    }
  }
};

/** `thread_read`: every thread, newest first, or one thread's messages. */
export const threadReadWords = (
  read: (ThreadSummary & { last?: string | null })[] | ThreadRead
): string => {
  const now = Date.now();
  if (Array.isArray(read)) {
    return read.length === 0
      ? "No threads with the person."
      : lines(
          `${count(read.length, "thread")}, newest first; thread takes the handle:`,
          read.map((thread) => threadLine(thread, now))
        );
  }
  return lines(
    threadLine(read.thread, now),
    read.messages.length === 0
      ? "No messages yet."
      : read.messages.map((message) => messageLine(message, now))
  );
};

/** `thread_reply`. */
export const threadRepliedWords = (): string => "Answered in the thread.";

/** `folder_read`: a file's words, or a folder's entries. */
export const folderReadWords = (read: FolderFile | FolderListing): string => {
  if ("entries" in read) {
    return lines(
      read.entries.length === 0
        ? `${read.path || "The folder's root"} is empty.`
        : `${read.path || "The folder's root"}:`,
      read.entries.map(
        (entry) =>
          `- ${entry.path}${entry.kind === "folder" ? "/" : ""}${entry.size === undefined ? "" : ` (${entry.size} bytes)`}`
      ),
      read.truncated &&
        "The listing stopped at its cap: list a folder under it."
    );
  }
  return lines(`${read.path} (${read.size} bytes):`, read.content);
};

/** `folder_write`: committed, or proposed for the person. */
export const folderWrittenWords = (written: unknown): string => {
  const done = written as { path?: string; sha?: string };
  return done.sha
    ? `Committed ${done.path} (commit ${done.sha.slice(0, 8)}).`
    : `Proposed: ${valueWords(written, 600)}`;
};

/** `view_draft`. */
export const viewDraftedWords = (drafted: {
  dropped?: string[];
  note?: string;
  proposed?: { page: string; position: number | null };
  view: string;
}): string =>
  lines(
    `Drafted view ${drafted.view} for the person to keep or discard${drafted.proposed ? `, as a block on ${drafted.proposed.page}` : ""}.`,
    drafted.note
  );

/** `view_query`: the data a view's Query reads, as the view would. */
export const viewQueryWords = (data: unknown): string => JSON.stringify(data);

/** `memory_note`: kept in the inbox. */
export const memoryNotedWords = (noted: {
  id: string;
  path: string;
  verdict?: unknown;
}): string =>
  `Noted in the inbox as ${noted.id}${noted.verdict ? `; ${valueWords(noted.verdict, 300)}` : ""}. The person decides what is kept.`;

/** `memory_propose`: committed, or waiting for the person. */
export const memoryProposedWords = (proposed: {
  committed?: boolean;
  paths?: string[];
  path?: string;
  sha?: string;
  waiting?: string;
}): string =>
  proposed.committed
    ? `Committed ${listed(proposed.paths ?? [])} (commit ${proposed.sha?.slice(0, 8)}).`
    : `Proposed ${listed(proposed.paths ?? (proposed.path ? [proposed.path] : []))}: ${proposed.waiting ?? "waiting for the person"}.`;

/** `memory_classify`. */
export const memoryClassifiedWords = (classified: {
  archived: string[];
}): string => `Archived ${listed(classified.archived)}.`;

/** `memory_read`: the inbox and knowledge/, or one file. */
export const memoryReadWords = (read: unknown): string => {
  if (typeof read === "object" && read !== null && "inbox" in read) {
    const shelf = read as {
      inbox: {
        from: string;
        id: string;
        since?: string;
        text: string;
        verdict?: unknown;
      }[];
      knowledge: string[];
      prose: string[];
      unreadable: string[];
    };
    return lines(
      shelf.inbox.length === 0
        ? "The inbox is empty."
        : `${count(shelf.inbox.length, "note")} waiting:`,
      shelf.inbox.map(
        (note) =>
          `- ${note.id} from ${note.from}${note.since ? ` (since ${note.since})` : ""}: ${quote(note.text, 600)}`
      ),
      shelf.knowledge.length > 0
        ? `knowledge/: ${listed(shelf.knowledge)}.`
        : "knowledge/ holds no file.",
      shelf.prose.length > 0 && `Prose, not facts: ${listed(shelf.prose)}.`,
      shelf.unreadable.length > 0 &&
        `Lines that read as no fact: ${shelf.unreadable.join("; ")}`
    );
  }
  return folderReadWords(read as FolderFile);
};

/** What a run came to: its outcome once it has one, else its state. */
const runState = (run: RoutineRunView, now: number): string => {
  const took = run.endedAt
    ? `, after ${lasted(run.endedAt - run.startedAt)}`
    : "";
  return `${run.outcome ?? run.state}, started ${ago(run.startedAt, now)}${took}`;
};

/** A routine's run, a line: its slot as the dashboard says it (`09:00`, test, by-hand). */
const runLine = (run: RoutineRunView, timeZone: string, now: number): string =>
  `  - ${slotLabel(run.slot, timeZone)} run ${handle(run.id)}: ${runState(run, now)}${run.usd === null ? "" : `, $${run.usd.toFixed(2)}`}${run.reason ? `; ${run.reason}` : ""}${run.output ? `: ${quote(run.output, 300)}` : ""}`;

/** Whether a routine is kept past its week, or when it turns itself off. */
const keptWords = (routine: RoutineView, now: number): string => {
  if (routine.keep) {
    return " · kept";
  }
  return routine.expiresAt === null
    ? ""
    : ` · turns off ${ahead(routine.expiresAt, now)} unless kept`;
};

/** One routine, its schedule and newest runs. */
const routineLines = (routine: RoutineView, now: number): string[] => [
  `- ${routine.name} ${handle(routine.id)} · ${routine.enabled ? "on" : `off${routine.disabledReason ? `: ${routine.disabledReason}` : ""}`} · ${routine.schedule.words}${routine.schedule.nextAt === null ? "" : `, next ${ahead(routine.schedule.nextAt, now)}`} · ${routine.target === "lead" ? "messages Caw" : `a delegate${routine.delegateType ? ` of type ${routine.delegateType}` : ""}, lands ${routine.lands}`}${keptWords(routine, now)}${routine.dailyCapUsd === null ? "" : ` · $${routine.dailyCapUsd} a day`}${routine.budget ? ` · each run ${valueWords(routine.budget)}` : ""}`,
  `  Prompt: ${quote(routine.prompt, 400)}`,
  ...(routine.runs.length > 0
    ? routine.runs.map((run) => runLine(run, routine.timeZone, now))
    : ["  No runs yet."]),
];

/** `routine_list`. */
export const routineListWords = (routines: RoutineView[]): string => {
  const now = Date.now();
  return routines.length === 0
    ? "No routines."
    : lines(
        `${count(routines.length, "routine")}; routine_update, routine_delete and routine_run_now take the handle:`,
        routines.flatMap((routine) => routineLines(routine, now))
      );
};

/** `routine_create` and `routine_update`: the routine as it stands. */
export const routineWords = (routine: RoutineView): string =>
  lines(routineLines(routine, Date.now()));

/** `routine_delete`, `event_route_delete`, `connector_poll_delete`. */
export const deletedWords =
  (what: string) =>
  (done: { deleted: boolean }): string =>
    done.deleted
      ? `Deleted the ${what}.`
      : `There was no such ${what} to delete.`;

/** `routine_run_now` and `routine_result`: the run. */
export const routineRunWords = (run: RoutineRunView): string =>
  `Run ${handle(run.id)}: ${runState(run, Date.now())}${run.reason ? `; ${run.reason}` : ""}.`;

const routeLine = (route: EventRouteView, now: number): string =>
  `- ${handle(route.id)} · ${route.enabled ? "on" : "off"} · ${route.source}${route.kinds.length > 0 ? ` ${listed(route.kinds)}` : " any kind"}${route.author ? ` by ${route.author}` : ""}${route.label ? ` labelled ${route.label}` : ""}${route.branch ? ` on ${route.branch}` : ""}${route.regex ? ` matching /${route.regex}/` : ""} → routine ${handle(route.routineId)} · ${route.lastDeliveryAt === null ? "nothing delivered yet" : `last delivered ${ago(route.lastDeliveryAt, now)}`}`;

const pollLine = (poll: ConnectorPollView, now: number): string =>
  `- ${handle(poll.id)} · ${poll.enabled ? "on" : "off"} · ${poll.connection}:${poll.tool} every ${poll.intervalS} s · ${poll.polledAt === null ? "not called yet" : `called ${ago(poll.polledAt, now)}${poll.seen === null ? "" : `, ${count(poll.seen, "item")} seen`}`}${poll.reason ? ` · ${poll.reason}` : ""}`;

/** `event_route_list`: GitHub polling, the routes, the polls, the newest events. */
export const ingressWords = (view: IngressView): string => {
  const now = Date.now();
  return lines(
    `GitHub: ${view.github.state}${view.github.polledAt === null ? "" : ` Polled ${ago(view.github.polledAt, now)}.`}`,
    view.routes.length === 0
      ? "No event routes."
      : lines(
          `${count(view.routes.length, "route")}:`,
          view.routes.map((route) => routeLine(route, now))
        ),
    view.connectorPolls.length === 0
      ? "No connector polls."
      : lines(
          `${count(view.connectorPolls.length, "connector poll")}:`,
          view.connectorPolls.map((poll) => pollLine(poll, now))
        ),
    view.events.length === 0
      ? "No inbound events yet."
      : lines(
          "Newest inbound events:",
          view.events.map(
            (event) =>
              `- ${event.kind} from ${event.source} ${ago(event.receivedAt, now)} · ${event.routedTo ? `to routine ${handle(event.routedTo)}` : "routed to no routine"}${event.handledAt === null ? ", not handled yet" : ""}`
          )
        )
  );
};

/** `event_route_create` and `_update`. */
export const routeWords = (route: EventRouteView): string =>
  routeLine(route, Date.now()).replace(LIST_MARK, "Route ");

/** `connector_poll_list`. */
export const pollListWords = (polls: ConnectorPollView[]): string => {
  const now = Date.now();
  return polls.length === 0
    ? "No connector polls."
    : lines(
        `${count(polls.length, "connector poll")}:`,
        polls.map((poll) => pollLine(poll, now))
      );
};

/** `connector_poll_create` and `_update`. */
export const pollWords = (poll: ConnectorPollView): string =>
  pollLine(poll, Date.now()).replace(LIST_MARK, "Poll ");

const actionLine = (action: ApprovedActionView, now: number): string =>
  `- ${handle(action.id)} · ${action.state} · ${action.connection}:${action.tool} ${action.args.length > 200 ? `${action.args.slice(0, 199)}…` : action.args} · ${quote(action.reason, 160)}${action.runAt === null ? "" : ` · runs ${ahead(action.runAt, now)}`}${action.taskId ? ` · for ${action.taskId}${action.thenStage ? `, then ${action.thenStage}` : ""}` : ""}${action.error ? ` · ${action.error}` : ""}${action.result ? ` · result ${quote(action.result, 240)}` : ""} · proposed ${ago(action.createdAt, now)}`;

/** `action_list`. */
export const actionListWords = (actions: ApprovedActionView[]): string => {
  const now = Date.now();
  return actions.length === 0
    ? "No approved actions."
    : lines(
        `${count(actions.length, "action")}, newest first; action_cancel takes the handle:`,
        actions.map((action) => actionLine(action, now))
      );
};

/** `action_propose`. */
export const actionProposedWords = (proposed: {
  id: string;
  said: string;
  state: string;
}): string => `Proposed ${handle(proposed.id)}: ${proposed.said}`;

/** `action_cancel`. */
export const actionWords = (action: ApprovedActionView): string =>
  actionLine(action, Date.now()).replace(LIST_MARK, "Action ");

const relayLine = (relay: RelayView, now: number): string =>
  `- ${handle(relay.id)} · ${relay.provider} · ${relay.state}${relay.reason ? `: ${relay.reason}` : ""} · ${relay.publicUrl ?? "no public URL yet"}${relay.registered ? " · registered" : ""} · ${relay.lastDeliveryAt === null ? "nothing delivered yet" : `last delivered ${ago(relay.lastDeliveryAt, now)}`}`;

/** `relay_list`. */
export const relayListWords = (relays: RelayView[]): string => {
  const now = Date.now();
  return relays.length === 0
    ? "No relays."
    : lines(
        `${count(relays.length, "relay")}; relay_remove takes the handle:`,
        relays.map((relay) => relayLine(relay, now))
      );
};

/** `relay_create`: the relay, and the routes to propose for it. */
export const relayCreatedWords = (created: RelayCreated): string =>
  lines(
    relayLine(created.relay, Date.now()).replace(LIST_MARK, "Relay "),
    created.suggestedRoutes.routines.length > 0
      ? `${created.suggestedRoutes.note} Routes to propose (event_route_create) for ${created.suggestedRoutes.source}: ${listed(created.suggestedRoutes.routines.map((routine) => `${routine.name} ${handle(routine.id)}`))}.`
      : created.suggestedRoutes.note
  );

/** `relay_remove`: the relay as it stands, and what came of its GitHub webhook. */
export const relayRemovedWords = (removed: {
  github: string;
  relay: RelayView;
}): string =>
  lines(
    relayLine(removed.relay, Date.now()).replace(LIST_MARK, "Relay "),
    removed.github
  );
