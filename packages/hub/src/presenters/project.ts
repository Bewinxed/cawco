/**
 * A project's own things as an agent reads them: its folder,
 * its views, memory, routines, inbound routes and polls, approved actions
 * and relays. Each by its name and the handle its tools take back
 * (handles.ts), each time as how long ago or how far ahead.
 */

import type { ApprovedActionView } from "@cawco/core/actions";
import { routineLink, taskLink } from "@cawco/core/references";
import type { RelayView } from "@cawco/core/relays";
import type { RoutineRunView } from "@cawco/core/routine-kinds";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { routineToolWords } from "@cawco/core/words/routines";
import type {
  ConnectorPollView,
  EventRouteView,
  IngressView,
} from "../ingress-views";
import { PAYLOAD_MAX } from "../ingress-views";
import type { FolderFile, FolderListing } from "../project-folder";
import type { RelayCreated } from "../relay-created";
import { slotLabel } from "../routine-schedule";
import type { RoutineView } from "../routine-view";
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
} from "./words";

/** A list line's mark, which a single answer says as its kind. */
const LIST_MARK = /^- /u;

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
export const folderWrittenWords = (
  written:
    | { ok: boolean; path: string; sha: string }
    | { id: string; path: string; waiting: string }
): string =>
  "sha" in written
    ? `Committed ${written.path} (commit ${written.sha.slice(0, 8)}).`
    : `Proposed: ${valueWords(written, 600)}`;

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

/**
 * `memory_note`'s answer, by where the note goes: to the nightly run, or
 * nowhere, and why. A union, so no path is answered with another's words.
 */
export type Noted = { id: string } & (
  | { reaches: "run" }
  | { reaches: "nowhere"; verdict: "secret" }
  | { reaches: "nowhere"; verdict: "duplicate"; lesson: string }
);

/** `memory_note`. */
export const memoryNotedWords = (noted: Noted): string => {
  if (noted.reaches === "run") {
    return memoryRunWords.notedForRun(noted.id);
  }
  return noted.verdict === "secret"
    ? memoryRunWords.notedSecret(noted.id)
    : memoryRunWords.notedDuplicate(noted.id, noted.lesson);
};

/** `memory_withdraw`: the note withdrawn, and what it said. */
export const memoryWithdrawnWords = (gone: {
  text: string;
  withdrawn: string;
}): string => memoryRunWords.withdrawn(gone.withdrawn, quote(gone.text, 300));

/** `memory_apply`: one line per operation, what it committed or why it was refused. */
export const memoryAppliedWords = (applied: { lines: string[] }): string =>
  applied.lines.join("\n");

/** `memory_read`: the inbox and the memory files, or one file. */
export const memoryReadWords = (
  read:
    | {
        files: string[];
        inbox: { from: string; id: string; since?: string; text: string }[];
      }
    | FolderFile
): string => {
  if ("inbox" in read) {
    return lines(
      read.inbox.length === 0
        ? "The inbox is empty."
        : `${count(read.inbox.length, "note")} waiting:`,
      read.inbox.map(
        (note) =>
          `- ${note.id} from ${note.from}${note.since ? ` (since ${note.since})` : ""}: ${quote(note.text, 600)}`
      ),
      read.files.length > 0
        ? `Memory files: ${listed(read.files)}.`
        : "The project keeps no memory file yet."
    );
  }
  return folderReadWords(read);
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
  `  - ${slotLabel(run.slot, timeZone)} run ${handle(run.id)}: ${runState(run, now)}${run.verdict ? `, condition ${run.verdict}` : ""}${run.usd === null ? "" : `, $${run.usd.toFixed(2)}`}${run.reason ? `; ${run.reason}` : ""}${run.output ? `: ${quote(run.output, 300)}` : ""}`;

/** Whether a routine is kept past its week, or when it turns itself off. */
const keptWords = (routine: RoutineView, now: number): string => {
  if (routine.keep) {
    return " · kept";
  }
  return routine.expiresAt === null
    ? ""
    : ` · turns off ${ahead(routine.expiresAt, now)} unless kept`;
};

/** What a routine's run starts, in words. */
const targetWords = (routine: RoutineView): string => {
  const typed = routine.delegateType ? ` of type ${routine.delegateType}` : "";
  switch (routine.target) {
    case "conversation":
      return "messages Caw, the project's conversation";
    case "orchestrator":
      return `an orchestrator${typed} in the project's checkout, which delegates its work`;
    case "delegate":
    case "curator":
    case "trim":
      return `a delegate${typed}, lands ${routine.lands}`;
    case "command":
      return `the command \`${routine.prompt}\` in a sandboxed copy of the project, no model`;
  }
};

/** A condition, a line: its statement, where it stands, its deadline, and what waits on it. */
const conditionLine = (
  condition: NonNullable<RoutineView["condition"]>,
  now: number
): string => {
  const waits = [
    condition.waitedBy.length > 0 ? `tasks ${listed(condition.waitedBy)}` : "",
    condition.steps > 0 ? count(condition.steps, "plan step") : "",
  ].filter(Boolean);
  return `  Condition: ${quote(condition.statement, 300)} · ${condition.state}${condition.state === "met" && condition.evidence ? `: ${quote(condition.evidence, 300)}` : ""}${condition.markedMet ? " (marked met by the owner)" : ""}${condition.state !== "met" && condition.reason ? `; last: ${quote(condition.reason, 300)}` : ""} · ${condition.deadline === null ? "no deadline" : `deadline ${ahead(condition.deadline, now)}`} · ${waits.length > 0 ? `waited on by ${waits.join(" and ")}` : "nothing waits on it, so its slots pass unchecked"} · wait on it with ${condition.handle}`;
};

/** One routine, its schedule and newest runs; its name its link, which the person's dashboard draws as its chip. */
const routineLines = (routine: RoutineView, now: number): string[] => [
  `- ${routineLink(routine.id, routine.name)} ${handle(routine.id)} · ${routine.enabled ? "on" : `off${routine.disabledReason ? `: ${routine.disabledReason}` : ""}`} · ${routine.schedule.words}${routine.schedule.nextAt === null ? "" : `, next ${ahead(routine.schedule.nextAt, now)}`} · ${targetWords(routine)}${keptWords(routine, now)}${routine.dailyCapUsd === null ? "" : ` · $${routine.dailyCapUsd} a day`}${routine.budget ? ` · each run ${valueWords(routine.budget)}` : ""}`,
  ...(routine.condition ? [conditionLine(routine.condition, now)] : []),
  `  Prompt: ${quote(routine.prompt, 400)}`,
  ...(routine.runs.length > 0
    ? routine.runs.map((run) => runLine(run, routine.timeZone, now))
    : ["  No runs yet."]),
];

/** `routine_list`: the project's routines, and the hub's trim routine while the project has none (`off`, its name). */
export const routineListWords = ({
  routines,
  off,
}: {
  routines: RoutineView[];
  off: string | null;
}): string => {
  const now = Date.now();
  return lines(
    routines.length === 0
      ? "No routines."
      : lines(
          `${count(routines.length, "routine")}; routine_update, routine_delete and routine_run_now take the handle:`,
          routines.flatMap((routine) => routineLines(routine, now))
        ),
    off !== null && routineToolWords.trimOff(off)
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
  `- ${handle(route.id)} · ${route.enabled ? "on" : "off"} · ${route.source}${route.kinds.length > 0 ? ` ${listed(route.kinds)}` : " any kind"}${route.author ? ` by ${route.author}` : ""}${route.label ? ` labelled ${route.label}` : ""}${route.branch ? ` on ${route.branch}` : ""}${route.regex ? ` matching /${route.regex}/ ${routineToolWords.regexReads(PAYLOAD_MAX / 1024)}` : ""} → routine ${handle(route.routineId)} · ${route.lastDeliveryAt === null ? "nothing delivered yet" : `last delivered ${ago(route.lastDeliveryAt, now)}`}`;

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
          view.eventsMore > 0
            ? routineToolWords.eventsCut(view.eventsMore, view.eventsNext)
            : "Newest inbound events:",
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
  `- ${handle(action.id)} · ${action.state} · ${action.connection}:${action.tool} ${action.args.length > 200 ? `${action.args.slice(0, 199)}…` : action.args} · ${quote(action.reason, 160)}${action.runAt === null ? "" : ` · runs ${ahead(action.runAt, now)}`}${action.taskId ? ` · for ${action.taskTitle === null ? action.taskId : taskLink(action.projectId, action.taskId, action.taskTitle)}${action.thenStage ? `, then ${action.thenStage}` : ""}` : ""}${action.error ? ` · ${action.error}` : ""}${action.result ? ` · result ${quote(action.result, 240)}` : ""} · proposed ${ago(action.createdAt, now)}`;

/** `action_list`. */
export const actionListWords = ({
  actions,
  more,
  next,
}: {
  actions: ApprovedActionView[];
  more: number;
  next: number;
}): string => {
  const now = Date.now();
  return actions.length === 0
    ? "No approved actions."
    : lines(
        more > 0
          ? routineToolWords.actionsCut(more, next)
          : `${count(actions.length, "action")}, newest first; action_cancel takes the handle:`,
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
  `- ${handle(relay.id)} · ${relay.provider}${relay.repo ? ` ${relay.repo}` : ""} · ${relay.state}${relay.reason ? `: ${relay.reason}` : ""} · ${relay.publicUrl ?? "no public URL yet"}${relay.registered ? " · registered" : ""} · ${relay.lastDeliveryAt === null ? "nothing delivered yet" : `last delivered ${ago(relay.lastDeliveryAt, now)}`}`;

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
