/**
 * The hand-off tools' shared logic, apart from any harness.
 *
 * A session hands work to another session through six tools — list the fleet,
 * hand a note to a peer, start a new session, delegate to a sub-session, and
 * stop or interrupt one of its own delegates — and their bodies are the same
 * whichever harness exposes them: the roster is read off the hub over HTTP, the
 * note is an envelope the daemon already knows how to send. Each harness wraps
 * these in its own tool mechanism (claude's in-process MCP server, pi's
 * `customTools`), and this file is the body they share.
 */

import type {
  DelegateType,
  Envelope,
  GeneratedImage,
  HarnessKind,
  ImageGenerationRequest,
  InstanceRow,
  LandsMode,
  PermissionMode,
  PermissionResult,
  SendPayload,
  SpawnPayload,
} from "@cawco/core";
import {
  delegateTypeProblem,
  handoffMarker,
  IMAGE_GENERATION_TIMEOUT_MS,
  machineCalled,
  machineLabel,
  machineLink,
  machinesCalled,
  pauseClock,
  QUESTION_DISMISSED,
  relaunchOf,
  type SessionChosenMode,
  sessionLink,
  withInputsLine,
  workWords,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import type { MachinePath } from "@cawco/core/machine-path";
import type { ForgeWrite } from "@cawco/core/upstream-post";
import type { WorkBudget, WorkItemSubmission } from "./db/schema";
import type { DelegateList, DelegateListQuery } from "./delegation-tree";
import { byId, handleId, isHandle, mentioned } from "./handles";
import { hubHttpUrl, selfFetch } from "./hub-self";
import { type KeepAliveRow, promptCacheExpiresAt } from "./keep-alive";
import { boardTitle, leafOf, sessionLabel } from "./labels";
import { handle as idHandle } from "./presenters/words";
import { resolveSpawnType, type Unlanded } from "./work-items";

// Every call this module makes is the hub calling its own routes, as itself
// (hub-self.ts): `selfFetch` refuses any other origin.
const fetch = selfFetch;

/**
 * The fleet's delegate types (`@cawco/core`'s `DelegateType`), read once
 * per session. There is no fleet sync path for them yet (unlike MCP servers
 * and skills) — a daemon fetches this directly from the hub it already knows
 * the address of, right before it builds the `delegate` tool's description,
 * and the caller freezes what comes back for the session's whole life.
 * Failures, and a hub that did not answer in time, are logged and thrown in
 * their own words: a valid empty catalog remains distinct from both.
 * Descriptions take a startup snapshot. Catalog reads and named dispatch fetch
 * again so saved routing changes apply to sessions already running.
 *
 * With `projectId`, the catalog a session of that project sees: the project's
 * own types (the `delegates/` files in its folder) shadowing fleet types of
 * the same name (project-delegate-types.ts).
 */
async function fetchDelegateTypes(projectId?: string): Promise<DelegateType[]> {
  const path = projectId
    ? `/api/projects/${encodeURIComponent(projectId)}/delegate-types`
    : "/api/delegate-types";
  let read: Bounded<DelegateType[]>;
  try {
    read = await readWithin(DELEGATE_TYPES_MS, async (signal) => {
      const res = await fetch(`${hubHttpUrl()}${path}`, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { types?: DelegateType[] } | null;
      if (
        !Array.isArray(body?.types) ||
        body.types.some((type) => !type || delegateTypeProblem(type))
      ) {
        throw new Error("Invalid delegate catalog response");
      }
      return body.types;
    });
  } catch (error) {
    const message = `Could not load delegate types: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[cawco] ${message}`);
    throw new Error(message, { cause: error });
  }
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered": {
      // Not answered is never an empty catalog.
      const message = `Could not load delegate types: the hub did not answer within ${Math.round(read.after / 1000)} s`;
      console.warn(`[cawco] ${message}`);
      throw new Error(message);
    }
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * What a type the caller named adds to a started session. Denied tools come
 * only with a named type: the default type picks what runs, but its deny
 * list is a delegate's (browser checks in chrome-devtools, through the
 * DevTools gate to the project's browser, never the owner's Chrome); a
 * started session is not a delegate and keeps Claude in Chrome. And its toolset (§5.3): the type's `role:`, kept on the row.
 */
const namedTypeSettings = (
  type: DelegateType | undefined,
  projectId: string | undefined
): Pick<SpawnPayload, "delegateType" | "denyTools" | "role"> => ({
  denyTools: type?.denyTools,
  // Kept on the row, so the type's word reads the same for every session.
  ...(type
    ? { delegateType: { name: type.name, ...(projectId ? { projectId } : {}) } }
    : {}),
  ...(type?.role ? { role: type.role } : {}),
});

interface Peer {
  /** Its launch directory, as a listing shows it (`sessionLabel`). */
  dir: string;
  host: string;
  label: string;
  name: string;
  row: InstanceRow;
  /** What the board calls it (`boardTitle`): its given title, else its first words, else its name. */
  title: string;
}

/** How long ago the row moved, for a reader choosing between identical names. */
const ageOf = (at: InstanceRow["updatedAt"]): string => {
  if (!at) {
    return "age unknown";
  }
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "age unknown";
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return "active now";
  }
  if (minutes < 60) {
    return `active ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24
    ? `active ${hours}h ago`
    : `active ${Math.round(hours / 24)}d ago`;
};

/** A machine of the fleet as the hub's registry has it (`GET /api/agents`). */
interface Machine {
  hostname: string;
  machineId: string;
  /** Paused by the owner until this time, epoch ms (machine-pause.ts); null or absent when not. */
  pausedUntil?: number | null;
  /** What its pause stopped as it began: "stopped 1 running merge check"; null or absent when nothing. */
  pauseStopped?: string | null;
  /** `online` while its daemon holds a socket to the hub. */
  status: string;
}

/**
 * The fleet as the hub reads it, in its own process: the board's rows (what
 * `GET /api/instances` answers) and its machines (`GET /api/agents`). These
 * were HTTP calls from the hub to itself, each under a 5 s deadline that ran
 * on the same thread the answer needed: a hub busy for five seconds failed
 * its own sessions' reads (2026-10-09).
 */
export interface Fleet {
  instances: () => InstanceRow[];
  machines: () => Machine[];
}

/** The machines work can start on now, by the names delegate and start_session take. */
const onlineNames = (machines: Machine[]): string =>
  machinesCalled(
    machines.filter((machine) => machine.status === "online"),
    machines
  );

/**
 * The one machine `target` names: its machineId, its hostname, or that
 * hostname as the fleet shows it (without `.local`), case aside. An unknown,
 * ambiguous or (unless `offline`) offline name is refused with the machines
 * online now.
 */
function resolveMachine(
  machines: Machine[],
  target: string,
  offline = false
): Machine {
  const needle = target.trim().toLowerCase();
  const matches = machines.filter(
    (machine) =>
      machine.machineId.toLowerCase() === needle ||
      machine.hostname.toLowerCase() === needle ||
      machineLabel(machine.hostname).toLowerCase() === needle
  );
  if (matches.length === 0) {
    throw new Error(
      `No machine in the fleet is named "${target}". Online now: ${onlineNames(machines)}.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `"${target}" names ${matches.length} machines: ${matches.map((machine) => `${machineLabel(machine.hostname)} (${machine.machineId})`).join(", ")}. Name one by its machineId.`
    );
  }
  const [found] = matches;
  if (!offline && found.status !== "online") {
    throw new Error(
      `${machineCalled(found.machineId, machines)} is offline. Online now: ${onlineNames(machines)}.`
    );
  }
  return found;
}

/** The raw rows behind the roster, before the running/starting narrowing. */
function fleetInstances(fleet: Fleet): {
  rows: InstanceRow[];
  hosts: Map<string, string>;
} {
  const hosts = new Map(
    fleet
      .machines()
      .map((machine) => [machine.machineId, machineLabel(machine.hostname)])
  );
  return { rows: fleet.instances(), hosts };
}

/**
 * The permission mode the calling session runs in, if it has one: the
 * fallback a session it starts takes when nothing else is named. The hub
 * settles it (`settleMode`): a harness with modes needs one, one without
 * takes none.
 */
const callerMode = (
  rows: InstanceRow[],
  instanceId: string
): PermissionMode | undefined =>
  (rows.find((row) => row.id === instanceId)?.permissionMode ?? undefined) as
    PermissionMode | undefined;

/** The calling session as its handoff marker names it: its row's label, or its folder before it has one. */
const senderName = (own: InstanceRow | undefined, cwd: string): string =>
  own ? sessionLabel(own).name : leafOf(cwd);

const toPeer = (row: InstanceRow, hosts: Map<string, string>): Peer => {
  const { dir, name, tag } = sessionLabel(row);
  return {
    row,
    dir,
    name,
    title: boardTitle(row),
    label: tag,
    host: hosts.get(row.machineId) ?? row.machineId,
  };
};

/**
 * The fleet, read from the hub rather than from this daemon's own sessions:
 * the whole point is reaching a session that is usually somewhere else.
 */
function roster(
  fleet: Fleet,
  exceptInstanceId: string
): {
  peers: Peer[];
  asleep: Peer[];
  own: InstanceRow | undefined;
  hosts: Map<string, string>;
  rows: InstanceRow[];
} {
  const { rows, hosts } = fleetInstances(fleet);
  const own = rows.find((row) => row.id === exceptInstanceId);
  const others = rows.filter((row) => row.id !== exceptInstanceId);
  // `unknown` is a live session whose machine is not connected right now —
  // an agent restart, the two seconds between its socket closing and its
  // register — and a send to it waits for that register at the hub.
  const peers = others
    .filter(
      (row) =>
        row.status === "running" ||
        row.status === "starting" ||
        row.status === "unknown"
    )
    .map((row) => toPeer(row, hosts));
  // What a send wakes (the hub's `wakesForSend`, by core `relaunchOf`): no
  // process, and a conversation to resume or none begun yet, so it starts
  // fresh under its id.
  const asleep = others
    .filter(
      (row) =>
        relaunchOf(row).kind !== "refused" &&
        (row.status === "sleeping" ||
          row.status === "error" ||
          row.status === "stopping" ||
          row.status === "stopped")
    )
    .map((row) => toPeer(row, hosts));
  return { peers, asleep, own, hosts, rows };
}

/**
 * The session a target names by one of its former ids (a session the hub
 * folded into its continuation, the hub's `instanceIdOf`): its id now, and
 * the id it was named by. By id as every tool reads one (handles.ts
 * `byId`), naming only it. Undefined when the target names no former id.
 */
function formerOf(
  formerIds: Record<string, string>,
  target: string
): { now: string; former: string } | undefined {
  const matches = byId(target, Object.keys(formerIds), (id) => id);
  const [former] = matches;
  return matches.length === 1 && former
    ? { now: formerIds[former], former }
    : undefined;
}

/**
 * The session a target names when a continuation took its work item on
 * (its row's `continuedInto`, the hub's `retireContinued`), followed to the
 * last: the id its work goes on in now, and the id it was named by. By id
 * as every tool reads one (handles.ts `byId`) among `rows`, else by its
 * whole id off the board. Undefined when the target names no continued
 * session: the old one never runs again, so nothing is handed to it.
 */
function continuedOf(
  rows: InstanceRow[],
  target: string,
  rowById: (id: string) => InstanceRow | undefined
): { now: string; former: string; continued: true } | undefined {
  const rowOf = (id: string) =>
    rows.find((row) => row.id === id) ?? rowById(id);
  const listed = byId(target, rows, (row) => row.id);
  const called = listed.length === 1 ? listed[0] : rowById(handleId(target));
  if (!called?.continuedInto) {
    return undefined;
  }
  const seen = new Set([called.id]);
  let now = called.continuedInto;
  for (;;) {
    seen.add(now);
    const next = rowOf(now)?.continuedInto;
    if (!next || seen.has(next)) {
      return { now, former: called.id, continued: true };
    }
    now = next;
  }
}

/** How a tool's answer names the former id a target was named by. */
const continuesWords = (
  followed: { former: string; continued?: true } | undefined
): string => {
  if (!followed) {
    return "";
  }
  const former = followed.former.slice(0, 8);
  return followed.continued
    ? ` (the continuation of ${former}, which never runs again)`
    : ` (once ${former})`;
};

/** "20:17": a moment as the hub's clock says it. */
const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * A continue_session answered while its job waits on its source's work in
 * flight: what it waits for, for how long that has run, and that it goes on
 * by itself, by the bound at the latest. Nothing to call again.
 */
const waitingAnswer = (
  source: string,
  target: string,
  waiting: { since: number | null; until: number; why: string }
): string => {
  const ran =
    waiting.since === null
      ? ""
      : `, running for ${Math.max(1, Math.round((Date.now() - waiting.since) / 60_000))} min`;
  return `Session ${source} holds work in flight that ending its process would lose (${waiting.why}${ran}), so its continuation waits for it. It goes on by itself in new session ${target} once that work ends, or at ${clockOf(waiting.until)} at the latest, ending it. Nothing to call again.`;
};

/** A thread's handle (`thread#1a2b3c4d`), as find and a chip carry it. */
const THREAD_HANDLE = /^thread#([0-9a-f-]{6,36})$/u;

/** What an id is made of, its dashes aside. */
const HEX = /^[0-9a-f]+$/u;

/**
 * The one session of `peers` the target names by id, as every tool reads
 * one (handles.ts `byId`: its full id, a short id of six or more
 * characters, a `name#` handle, a mention chip); undefined when it names
 * none by id (it may be a name). Several are refused, each listed.
 */
function resolveById(peers: Peer[], target: string): Peer | undefined {
  const found = byId(target, peers, (peer) => peer.row.id);
  if (found.length > 1) {
    throw ambiguous(target, found);
  }
  return found[0];
}

/**
 * The sessions a bare name picks out, by their folder's name or their title:
 * those it names exactly, else those whose name or title holds it.
 */
function named(peers: Peer[], target: string): Peer[] {
  const needle = mentioned(target);
  const exact = peers.filter(
    (peer) =>
      peer.name.toLowerCase() === needle || peer.title.toLowerCase() === needle
  );
  return exact.length
    ? exact
    : peers.filter(
        (peer) =>
          peer.name.toLowerCase().includes(needle) ||
          peer.title.toLowerCase().includes(needle)
      );
}

/**
 * How many sessions a refused name lists by id. A directory's name can match
 * hundreds of sessions that ever ran there; the rest are counted.
 */
const LISTED_AT_MOST = 12;

/** How a session with no process is listed: asleep on its conversation, or never started. */
const restingWords = (peer: Peer, asleep: ReadonlySet<Peer>): string => {
  if (!asleep.has(peer)) {
    return "";
  }
  return peer.row.sessionId ? "asleep, " : "never started, ";
};

/**
 * The refusal of a name more than one session answers to: the sessions by
 * id, in the order given, and how many more there are.
 */
function ambiguous(
  target: string,
  candidates: Peer[],
  asleep: ReadonlySet<Peer> = new Set()
): Error {
  const listed = candidates
    .slice(0, LISTED_AT_MOST)
    .map(
      (peer) =>
        `“${peer.title}” ${peer.label} on ${peer.host} (${restingWords(peer, asleep)}${ageOf(peer.row.updatedAt)})`
    )
    .join(", ");
  const more = candidates.length - LISTED_AT_MOST;
  return new Error(
    `"${target}" matches ${candidates.length} sessions: ${listed}${more > 0 ? `, and ${more} more, less recent` : ""}. ` +
      "Name one by its short id — and if you cannot tell them apart, ask rather than guess."
  );
}

/** No `what` answers to `target`: the refusal names every running session. */
const noneMatch = (peers: Peer[], target: string, what: string): Error =>
  new Error(
    `No ${what} matches "${target}". Running now: ${peers.map((peer) => peer.label).join(", ") || "none are running"}.`
  );

/** `body` from session `from` (called `name`) into session `to`. */
const peerSend = (
  to: string,
  from: string,
  name: string,
  body: string,
  extra: { shouldQuery?: false } = {}
): SendPayload => ({
  instanceId: to,
  message: {
    type: "user",
    uuid: crypto.randomUUID(),
    message: { role: "user", content: body },
    parent_tool_use_id: null,
    origin: { kind: "peer", from, name, fromSession: from },
    ...extra,
  },
});

/** When a row last moved, for ordering: the most recent first. */
const movedAt = (peer: Peer) =>
  peer.row.updatedAt ? new Date(peer.row.updatedAt).getTime() || 0 : 0;

/**
 * A hand-off's target, running or asleep (a never-started session counts as
 * asleep). An id — full, or a short id of six or more characters — names one
 * session. A bare name is looked up among both: the caller's own parent when
 * it answers to the name, else the one session that does. A name more than
 * one session answers to is refused with every one of them by id; it is never
 * guessed. The hub wakes a sleeping target to read it, and starts a
 * never-started one fresh under its id.
 */
function resolveHandoff(
  peers: Peer[],
  asleep: Peer[],
  target: string,
  own: InstanceRow | undefined
): Peer {
  const all = [...peers, ...asleep];
  const identified = resolveById(all, target);
  if (identified) {
    return identified;
  }
  const candidates = named(all, target);
  const parent = candidates.find(
    (peer) => peer.row.id === own?.parentInstanceId
  );
  if (parent) {
    return parent;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw noneMatch(peers, target, "session, running or asleep,");
  }
  const sleeping = new Set(asleep);
  throw ambiguous(
    target,
    candidates.toSorted(
      (a, b) =>
        Number(sleeping.has(a)) - Number(sleeping.has(b)) ||
        movedAt(b) - movedAt(a)
    ),
    sleeping
  );
}

/**
 * The thread a target names: `thread#<id>` always names a thread (refused
 * when none or several answer); a full id or a short one of six or more
 * characters names a thread when no session it could name has it.
 */
function threadOf(
  threads: HandoffThreads | undefined,
  target: string,
  sessions: Peer[]
): { id: string; title: string } | undefined {
  const needle = mentioned(target);
  const handle = THREAD_HANDLE.exec(needle)?.[1];
  const id = handle ?? needle;
  if (!handle) {
    const hex = id.replaceAll("-", "");
    const sessionHas = byId(target, sessions, (peer) => peer.row.id).length > 0;
    if (sessionHas || hex.length < 6 || !HEX.test(hex)) {
      return;
    }
  }
  const found = threads?.byId(id) ?? [];
  if (found.length === 1) {
    return found[0];
  }
  if (!handle) {
    return;
  }
  if (found.length === 0) {
    throw new Error(`No thread has the id ${id}. Nothing was handed.`);
  }
  throw new Error(
    `"${target}" matches ${found.length} threads: ${found
      .slice(0, LISTED_AT_MOST)
      .map((each) => `“${each.title}” (${each.id})`)
      .join(", ")}. Name one by its full id.`
  );
}

/**
 * The sessions a short id names that the roster does not hold (the board
 * lists a stopped session for a day): read by the id's prefix, those that a
 * message can still wake, the caller itself never among them.
 */
function beyondBoard(
  lookup: ((prefix: string) => InstanceRow[]) | undefined,
  target: string,
  listed: Peer[],
  self: string
): InstanceRow[] {
  if (
    !(lookup && isHandle(target)) ||
    byId(target, listed, (peer) => peer.row.id).length > 0
  ) {
    return [];
  }
  return lookup(handleId(target)).filter(
    (row) => row.id !== self && relaunchOf(row).kind !== "refused"
  );
}

/** Resolves what the model typed to one session; ambiguity is reported, not guessed. */
function resolve(peers: Peer[], target: string): Peer {
  const identified = resolveById(peers, target);
  if (identified) {
    return identified;
  }
  const candidates = named(peers, target);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw noneMatch(peers, target, "running session");
  }
  throw ambiguous(target, candidates);
}

/**
 * Why the hub keeps a send queued instead of handing it to its session now
 * (server.ts `deliverSend`): its machine is installing an update, so the
 * session's start waits for it (`update`); its machine runs a build older
 * than its hub's, which cannot start sessions for it, so the session's start
 * waits until that machine installs the hub's build (`build`); its machine's
 * agent is restarting
 * (`agent`); the hub has just started and the machine has not reconnected
 * (`hub`); sends before it to the same session are still queued
 * (`behind`); the session has no process and this sender may not wake it
 * (`resting`: a stopped session is woken only by a person or its parent); or
 * its account is at its limit, where a turn would only be refused, and it
 * waits for the reset, a move, or its continuation from a summary (`limit`);
 * or Claude Code refused its account's credential and no other account can
 * take it, so it waits for a sign-in or a free account (`signin`); or it
 * moved accounts at its limit and files its open items and is compacted
 * there first, so it waits for that to end, or for a stop of its turn
 * (`compacting`); or the
 * owner paused its machine until a time (`paused`, machine-pause.ts); or its
 * work item is finishing (`finishing`: its landing gate runs, or the turn
 * that called `finish_item` is still ending, work-items.ts `finishingFor`),
 * so the send goes as its next turn and reopens the item if it landed; or an
 * interrupt holds its work item and only its parent, its lead or the person
 * wakes it (`held`); or its workspace retired once its work was over and the
 * hub is cutting its clone again at the same path (`recut`, work-items.ts
 * `recut`); or its start waits its turn among the hub's own launches on its
 * machine, which go one at a time (`starting`, server.ts `paceSpawn`); or
 * its work item is blocked, its delegate type, machine or
 * account missing, and it goes once that is back (`blocked`, work-items.ts
 * `blockIfMissing`).
 */
export type SendHold =
  | "agent"
  | "behind"
  | "blocked"
  | "build"
  | "compacting"
  | "finishing"
  | "held"
  | "hub"
  | "limit"
  | "paused"
  | "recut"
  | "resting"
  | "signin"
  | "starting"
  | "update";

/** What the hub did with a send, as `handoff` tells its sender. */
export interface SendDelivery {
  /** The session was mid-turn when the send reached it. */
  busy: boolean;
  /** Queued at the hub, and why; absent when the session has it. */
  hold?: SendHold;
  /** With `hold: "paused"`: "Omars-MacBook-Pro is paused until 00:57". */
  pause?: string;
  /**
   * It had no process, and the send started one (core `relaunchOf`): on its
   * conversation (`resume`), or fresh under its id because it never began
   * one (`fresh`). Absent when it had a process or the send is held.
   */
  woke?: "fresh" | "resume";
}

/** Each hold, in the words `handoff` answers with: queued at the hub, and until when. */
const HOLD_WORDS: Record<Exclude<SendHold, "paused">, string> = {
  blocked:
    "Its work item is blocked: its delegate type, its machine or its account is missing, and its session isn't started again without it. The message is kept at the hub and goes to it once that is back; Needs you says what is missing.",
  finishing:
    "It called finish_item, and its turn ends with that call, so the message is kept at the hub until the call answers: if the merge checks send the work back, the message joins the turn that goes on; if the work lands, it goes as the session's next turn once that turn is over, and reopens the item.",
  held: "An interrupt stopped it, and only its parent, its project's lead or the person wakes it, so the message is kept at the hub and goes to it when one of them next writes to it.",
  recut:
    "Its workspace retired once its work was over, so the hub is cutting its clone again at the same path, at the commit its clone was on when it retired, its own commits with it; the message is kept at the hub and goes to the same session, on its transcript, once the clone is there.",
  starting:
    "Its machine is starting the hub's own launches one at a time, a second or more apart, so the session's start waits its turn at the hub and the message goes right behind it.",
  update:
    "Its machine is installing an update and restarting, so the message is queued at the hub and goes to the session as soon as the update is done.",
  build:
    "Its machine runs a CawCo build older than its hub's, which cannot start sessions for this hub, so the session's start and the message are kept at the hub and go as soon as that machine installs the hub's build.",
  agent:
    "Its machine's agent is restarting, so the message is queued at the hub and goes to the session when the agent is back; it fails if the agent is not back within a minute.",
  hub: "The hub has just started and the session's machine has not reconnected yet, so the message is queued at the hub and goes to the session when it does; it fails if the machine is not back within a minute.",
  behind:
    "Messages sent to it earlier are still queued at the hub, so this one is queued behind them and goes right after them.",
  resting:
    "It is stopped, and only a person or its parent starts it again, so the message is kept at the hub and goes to it when one of them next writes to it.",
  limit:
    "Its account is at its usage limit, so the message is kept at the hub and goes to the session as soon as it can run again: at the reset, on another account, or once it goes on from a summary.",
  signin:
    "Its account's sign-in was refused and no other account can take it, so the message is kept at the hub and goes to the session once its account is signed in again or another account comes free.",
  compacting:
    "It moved to another account at its limit and is filing its open items, then compacting, as its first turns there, so the message is kept at the hub and goes to the session as soon as that ends; stopping its turn ends the compaction and sends it now.",
};

/** What the hub did with a hand-off, as its sender is told. */
const deliveryWords = (delivery: SendDelivery): string => {
  if (delivery.hold === "paused") {
    return `${delivery.pause ?? "Its machine is paused"}, so the message is queued at the hub and goes to the session when the pause ends.`;
  }
  if (delivery.hold) {
    return HOLD_WORDS[delivery.hold];
  }
  if (delivery.woke === "resume") {
    return "It was asleep; it is being woken to read it.";
  }
  if (delivery.woke === "fresh") {
    return "It never started; it is being started fresh under its id to read it.";
  }
  return delivery.busy
    ? "It is working, and reads it at its next step: a command it is running moves to the background and keeps going."
    : "It was idle, so it reads it now.";
};

export interface HandoffDeps {
  /** This invocation's session credential; never a tool argument or persisted metadata. */
  readonly authorization?: string;
  /**
   * The harness's id for this call (Claude Code's tool_use id, pi's
   * toolCallId, OpenCode's call id), when it names one: a machine_pause of
   * the caller's own machine cuts its turn once this call is answered.
   */
  readonly callId?: string;
  /**
   * Whether THIS session may spawn sessions of its own. `false` on a leaf
   * delegate (spawned with `can_delegate: false`); absent means allowed.
   */
  readonly canDelegate?: boolean;
  /** What it is working on, so the receiver knows who is calling. */
  readonly cwd: string;
  /** This session's own delegation tree, read by the hub (delegation-tree.ts). */
  readonly delegateList?: (query: DelegateListQuery) => Promise<DelegateList>;
  /**
   * Hands a send to the hub's one send path now, and answers what became of
   * it: refused sends throw with the hub's reason.
   */
  readonly deliver: (envelope: Envelope<SendPayload>) => Promise<SendDelivery>;
  /** Puts an envelope on the daemon's hub socket. */
  readonly emit: (envelope: Envelope) => void;
  /** The board and the machines, read in the hub's own process. */
  readonly fleet: Fleet;
  /**
   * The sessions this one was forked from, nearest first (server.ts
   * `forkLineage`); empty for a session that is no fork. Their delegates are
   * theirs: this session cannot hand off to, stop, interrupt or answer one.
   */
  readonly forkOrigins?: () => ForkOrigin[];
  /**
   * Every former id, by the id its session has now: sessions whose
   * continuations at their account's limit the hub folded into one (db
   * `formerIds`). A target named by one reaches its session.
   */
  readonly formerIds: () => Record<string, string>;
  readonly harness?: HarnessKind;
  /**
   * Whether this session has a parent (it was started by another session):
   * artifact_create then offers `to: "parent"`.
   */
  readonly hasParent?: boolean;
  /** Exact-id lookup includes ended/archived rows outside the live roster. */
  readonly instanceById: (id: string) => InstanceRow | undefined;
  /** The session doing the handing over. */
  readonly instanceId: string;
  /**
   * Sessions whose id starts with `prefix` (six or more characters), in any
   * state find holds: a mention of one the board no longer lists (stopped a
   * day ago) still reaches it.
   */
  readonly instancesByShortId?: (prefix: string) => InstanceRow[];
  /** Where this session's work item lands, which finish_item's description follows; `main` when unknown. */
  readonly lands?: ItemEnd;
  /** Whether this session leads the project of the work item a session runs: it may steer, answer and stop it. */
  readonly ledBy?: (instanceId: string) => boolean;
  /** The session's project: its delegate types shadow the fleet's. */
  readonly projectId?: string;
  /**
   * `send_to_user`'s push to the person's paired devices (push.ts
   * `userMessage`). The words and attachments themselves are the call's own
   * row in the session's transcript.
   */
  readonly sendToUser: (message: string) => void;
  /**
   * Why this session may not show the person one of `paths`: one in another
   * workspace's scratch dir or clone that is not its delegates'
   * (shown-files.ts); none when it may show them all.
   */
  readonly shownRefusal?: (
    tool: string,
    paths: readonly string[]
  ) => string | undefined;
  /**
   * Starts a session now and holds until its machine says it is in place
   * (server.ts `spawnSession`); answers the folder it runs in as the hub
   * settled it. A refused or failed start throws the hub's words.
   */
  readonly spawn: (
    envelope: Envelope<
      SpawnPayload & { fallbackPermissionMode?: PermissionMode }
    >
  ) => Promise<MachinePath>;
  /** Threads a mention may name, and the hand-off into one; absent where tools are only listed. */
  readonly threads?: HandoffThreads;
  /** Delegate role: the session runs a work item, so finish_item and wait_item are offered. */
  readonly workItem?: boolean;
}

/** The threads a hand-off may name (`thread#1a2b3c4d`, a thread id), and the hand-off into one. */
export interface HandoffThreads {
  /** The threads whose id is `id`, or starts with it (six or more characters). */
  readonly byId: (id: string) => { id: string; title: string }[];
  /** Hands `message` to Caw in thread `threadId` (caw.ts `handed`); throws the hub's refusal. */
  readonly hand: (
    threadId: string,
    from: { instanceId: string; name: string },
    message: string
  ) => Promise<string>;
}

/** The three hand-off actions, each answering with the text the tool returns. */
export interface HandoffActions {
  /**
   * Answers a delegate's parked ask. `answers` is keyed by the exact question
   * text, each value the chosen option label; `deny` refuses it. Neither means
   * "allow with no changes" — the tool ask's own input stands.
   */
  answerDelegate: (
    target: string,
    requestId: string,
    answers?: Record<string, string>,
    deny?: boolean
  ) => string;
  /**
   * One of the session's artifact routes (artifacts/routes.ts), at `path`
   * under its `/artifacts`: the hub's JSON answer, or its refusal thrown.
   */
  readonly artifactCall: (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ) => Promise<unknown>;
  readonly continueSession: (input: {
    session: string;
    from?: "summary" | "asks";
    summarizer_harness?: HarnessKind;
    summarizer_model?: string;
    target_harness: HarnessKind;
    target_model: string;
    target_permission_mode?: SessionChosenMode;
    note?: string;
  }) => Promise<{
    summariserInstanceId: string | null;
    targetInstanceId: string;
    text: string;
  }>;
  /**
   * Starts a work item: a fresh session or a fork of this one in a new workspace, or the follow-up
   * in an existing one, on the session that workspace's last item ran. The
   * hub decides and files everything; this is its request.
   */
  delegate: (
    prompt: string,
    opts: {
      /** What the caller named the work: the item's and its session's title. */
      title: string;
      /** The repository a new workspace is cut from; this session's directory by default. */
      cwd?: string;
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
      harness?: HarnessKind;
      model?: string;
      /** The account it runs on, by label or id; placed by the hub when omitted. */
      account?: string;
      skills?: string[];
      /**
       * A named preset from the fleet's delegate types. Its harness/model/
       * effort/skills/denyTools apply first; an explicit `harness`/`model`/
       * `skills` above still overrides what the type says.
       */
      type?: string;
      /**
       * Whether the new delegate may itself delegate/start sessions; default
       * false — a delegate is a leaf unless granted.
       */
      canDelegate?: boolean;
      /** An existing workspace's id: the new item is its follow-up. */
      workspace?: string;
      /** A workspace of this session's delegates: the new workspace is cut at its branch's head. */
      from?: string;
      /** The item's session forks this conversation, in a new workspace. */
      fork?: boolean;
      /** What it is handed (core handed-input.ts), written into its `$TMPDIR/inputs/` before its brief. */
      inputs?: unknown[];
      /** Where its commits go once it passes the landing gate; `main` by default. */
      lands?: LandsMode;
      /** Runs on the machine itself with no clone or boundary, landing nothing (work-items.ts `startHost`). */
      host?: boolean;
      /** Files in its workspace the hub copies into the project's folder. */
      outputs?: string[];
      /** Its group under this session: one combined report once all have ended. */
      group?: string;
      /** Globs of the repository's files it owns. */
      owns?: string[];
      /** What it may spend before the hub stops it. */
      budget?: WorkBudget;
    }
  ) => Promise<DelegateResult>;
  /**
   * This session's delegation tree: its delegates, theirs nested; the
   * delegates still queued; and the tree's held workspaces, whose items
   * ended with work that is nowhere else (work-items.ts `settle`).
   */
  readonly delegateList: (query: DelegateListQuery) => Promise<DelegateList>;
  /**
   * Lets go of a workspace one of this session's delegates worked in: what
   * it holds that is nowhere else goes to a carry on its machine, then its
   * clone goes (hub work-items.ts `discardFor`). Answers what the hub did.
   */
  readonly discardWorkspace: (workspace: string) => Promise<string>;
  /**
   * Finishes this session's work item: the hub runs its landing gate and
   * lands it, or fails it as blocked. Answers what the hub says of it.
   */
  readonly finishItem: (request: WorkItemSubmission) => Promise<string>;
  /**
   * One write on a repository's forge, made on this session's machine with
   * its own sign-in there, under the project's choice on other people's
   * repositories (forge-posts.ts). Answers what came of it, in words.
   */
  readonly forgePost: (ask: {
    repo?: string;
    write: ForgeWrite;
  }) => Promise<string>;
  readonly generateImage: (
    request: ImageGenerationRequest
  ) => Promise<GeneratedImage>;
  /**
   * Sends `message` to another session; `inputs` (core handed-input.ts)
   * are written first into the `$TMPDIR/inputs/` of the target's work item,
   * one this session delegated or leads.
   */
  handoff: (
    target: string,
    message: string,
    inputs?: unknown[]
  ) => Promise<string>;
  interruptDelegate: (target: string) => string;
  readonly listDelegateTypes: () => Promise<{ types: DelegateType[] }>;
  listSessions: () => string;
  /**
   * Pauses the machine `machine` names for `minutes` (machine-pause.ts), or
   * ends its pause (`resume`). Answers what the hub did, in a sentence.
   */
  readonly machinePause: (
    machine: string,
    minutes?: number,
    resume?: boolean
  ) => Promise<string>;
  /**
   * Summarises another session with the chosen summariser through the hub's
   * own continuation: a new session starts seeded with the summary and that
   * session's open items, and takes over its delegates; that one is only
   * read. Never the calling session itself. `from: "asks"`: nothing is
   * summarised, and the new session opens on the messages it was asked
   * alone (the person's; a delegate's brief and hand-offs from its parent),
   * verbatim and in order, and the open items.
   */
  /** This session's Open items section, built by the hub from its records (open-items.ts). */
  readonly openItems: () => Promise<string>;
  /** Shows the person a note in the transcript and pushes it to their devices — no peer, no ask. */
  sendToUser: (message: string, attachments?: string[]) => Promise<string>;
  /** Names this session; refused, in the hub's words, once the owner has named it. */
  readonly setTitle: (title: string) => Promise<string>;
  /** `show_image`: what the transcript says it shows; throws when the session may not show it (shown-files.ts). */
  readonly showImage: (path: string) => string;
  startSession: (
    cwd: string,
    prompt: string,
    title: string,
    options: {
      spinOff?: boolean;
      /** A delegate type; `medium` (work-items' DEFAULT_DELEGATE_TYPE) when omitted. */
      type?: string;
      /** Overrides the type's model. */
      model?: string;
      /** The account it runs on, by label or id; placed by the hub when omitted. */
      account?: string;
      /** This session's own mode when omitted; never Full Send, which only the owner chooses. */
      permissionMode?: SessionChosenMode;
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
    }
  ) => Promise<HandoffResult>;
  stopDelegate: (target: string) => Promise<string>;
  readonly waitItem: (minutes: number, reason: string) => Promise<string>;
}

/**
 * How a work item's session ends its work, as its finish_item says: the
 * clone's landing (`LandsMode`), or `host`, a host-scope item with no clone,
 * whose report is all it hands in.
 */
export type ItemEnd = LandsMode | "host";

/** The structured result of startSession / delegate — the id, title, and the model-facing prose. */
export interface HandoffResult {
  id: string;
  text: string;
  title: string;
}

/**
 * A delegation's result (`POST /api/work-items`): started, its session and
 * the work item and workspace it runs in; or queued, waiting for files a
 * live item owns, with no session yet.
 */
export type DelegateResult =
  | {
      /** Its session. */
      instanceId: string;
      state: "started";
      text: string;
      title: string;
      workItemId: string;
      workspaceId: string;
      /** The workspace's scratch dir on its machine, the delegate's `TMPDIR`: where inputs for it are copied; absent when the machine named none. */
      workspaceTmp?: string;
    }
  | {
      /** The queued request's id. */
      queued: string;
      state: "queued";
      text: string;
      title: string;
    };

/** A work item as the hub answers for it (`GET /api/work-items/:id`). */
interface WorkItemView {
  id: string;
  state: string;
  title: string;
  workspaceId: string;
}

/** A session a fork branched from, as its refusals name it. */
export interface ForkOrigin {
  id: string;
  title: string;
}

/**
 * The session a fork's target belongs to: one of the sessions it was forked
 * from, when the target is that one's delegate. Never the fork's own parent,
 * nor one of its origins itself, which it may write to as to anyone.
 */
const forkOwner = (
  origins: ForkOrigin[],
  row: InstanceRow,
  own: InstanceRow | undefined
): ForkOrigin | undefined =>
  row.id === own?.parentInstanceId ||
  origins.some((origin) => origin.id === row.id)
    ? undefined
    : origins.find((origin) => origin.id === row.parentInstanceId);

/** Why a fork may not act on its origin's delegate. */
const forkOwnedWords = (peer: Peer, owner: ForkOrigin): string =>
  `${peer.label} (“${peer.title}”) is a delegate of “${owner.title}” (${idHandle(owner.id)}), the session this one was forked from. It stays that session's: its reports and asks go there, and only that session hands it work, stops, interrupts or answers it. Nothing was done. Delegate the work yourself if this session needs it.`;

/**
 * Resolves a target among the caller's own delegates, and the work items of
 * a project it leads (`ledBy`); anything else is refused, a delegate of a
 * session the caller was forked from saying whose it is.
 */
function resolveDelegate(
  peers: Peer[],
  target: string,
  instanceId: string,
  ledBy?: (instanceId: string) => boolean,
  origins: ForkOrigin[] = []
): Peer {
  const mine = peers.filter(
    (peer) =>
      peer.row.parentInstanceId === instanceId || ledBy?.(peer.row.id) === true
  );
  try {
    return resolve(mine, target);
  } catch (error) {
    let outside: Peer | undefined;
    try {
      outside = resolve(peers, target);
    } catch {
      outside = undefined;
    }
    const owner = outside && forkOwner(origins, outside.row, undefined);
    if (outside && owner) {
      throw new Error(forkOwnedWords(outside, owner), { cause: error });
    }
    if (outside) {
      throw new Error(
        `"${target}" is not your delegate — you can only stop or interrupt your own delegates.`,
        { cause: error }
      );
    }
    throw error;
  }
}

/** A JSON POST to the hub's own API at `path`, with the caller's authorization when it has one. */
const postToHub = (
  path: string,
  body: unknown,
  authorization: string | undefined,
  init: Parameters<typeof fetch>[1] = {}
): Promise<Response> =>
  fetch(`${hubHttpUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
    ...init,
  });

/** The words a hub route answered; its refusal is thrown in its words. */
const hubText = async (response: Response): Promise<string> => {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return ((await response.json()) as { text: string }).text;
};

/**
 * A handoff's inputs, through the hub (work-items.ts `handInputs`): paths
 * admitted on `from`'s machine and what the hub holds by name, written into
 * the `$TMPDIR/inputs/` of `target`'s work item. Answers each one's name and
 * where it came from; the hub's refusal is thrown in its words.
 */
async function handInputs(
  authorization: string | undefined,
  from: string,
  target: string,
  inputs: unknown[]
): Promise<{ from: string; name: string }[]> {
  const response = await postToHub(
    "/api/work-items/inputs",
    { from, instanceId: target, inputs },
    authorization,
    {
      // Up to 64 MiB copied on one machine, or read on one and written on another.
      timeout: false,
    }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (
    (await response.json()) as { inputs: { from: string; name: string }[] }
  ).inputs;
}

const coldRefusals = new Map<string, string>();

/** The cold check waits for Jev's answer when the hub asks it: its 20 s, and the hub's own read. */
const FOLLOWUP_STATE_MS = 30_000;
/** A cold refusal's context-size read: short, as it cannot hold the refusal on an offline machine. */
const CONTEXT_SIZE_MS = 3000;
/** The delegate catalog, read from the hub. */
const DELEGATE_TYPES_MS = 5000;

/**
 * Whether a session's prompt cache is warm now (mid-turn, unmeasured, or
 * unexpired); a warm one forgets the cold refusals given about it.
 */
function warmNow(
  row: KeepAliveRow,
  midTurn: boolean,
  lastTurnAt: string | null
): boolean {
  const expires = promptCacheExpiresAt(row, lastTurnAt);
  if (!(midTurn || expires === null || expires > Date.now())) {
    return false;
  }
  const prefix = `${row.id}:`;
  for (const key of coldRefusals.keys()) {
    if (key.startsWith(prefix)) {
      coldRefusals.delete(key);
    }
  }
  return true;
}

/**
 * Jev's answer about a cold session stands: attach delivers (returns), fresh
 * refuses, and a Jev that did not answer refuses saying so; none of them is
 * handed back to the caller to repeat.
 */
function jevVerdict(
  row: KeepAliveRow,
  jev: { attach: boolean; noul: number } | { error: string }
): void {
  const title = row.title ?? row.derivedTitle ?? sessionLabel(row).dir;
  if ("error" in jev) {
    throw new Error(
      `Refused: "${title}" (${idHandle(row.id)}) is cold, and ${jev.error} Nothing was sent.`
    );
  }
  if (!jev.attach) {
    throw new Error(
      `Refused: "${title}" (${idHandle(row.id)}) is cold, and Jev judged that this message does not need its history (${jev.noul.toFixed(2)}): a fresh delegate with a tight brief fits. Nothing was sent. Start one with delegate and no workspace.`
    );
  }
}

/**
 * Whether `caller`'s call about cold `row` is the repeat of one refused
 * since that session's last turn: true once, and the refusal is spent;
 * otherwise this refusal is recorded for the repeat to find.
 */
function repeatOfRefused(
  row: KeepAliveRow,
  caller: string,
  lastTurnAt: string | null
): boolean {
  const key = `${row.id}:${caller}`;
  const turn = `${row.lastRequestAt?.getTime() ?? ""}:${lastTurnAt ?? ""}`;
  if (coldRefusals.get(key) === turn) {
    coldRefusals.delete(key);
    return true;
  }
  // Bound warnings in memory; a newer turn also invalidates an unused repeat.
  if (coldRefusals.size >= 256) {
    coldRefusals.delete(coldRefusals.keys().next().value as string);
  }
  coldRefusals.set(key, turn);
  return false;
}

/**
 * What `stop_delegate` answers about the stopped item's workspace, from what
 * it holds on no remote as the stop is made (work-items.ts `unlandedOf`):
 * held, with what it holds and its two ways out (continue it, or discard it
 * to a carry), the hold being its stopper's to decide (work-items.ts
 * `carriesOff`); or retiring, holding nothing that is nowhere else, with a
 * handoff cutting it again. A read that failed says so, and that a hold is
 * told as it comes (work-items.ts `heldNotice`).
 */
function stoppedHoldWords(
  workspaceId: string,
  unlanded: Unlanded | { error: string } | null
): string {
  const ws = idHandle(workspaceId);
  if (!unlanded) {
    return workWords.stopGone(ws);
  }
  if ("error" in unlanded) {
    return `${workWords.stopUnread(ws, unlanded.error)} ${workWords.holdWays(ws)}`;
  }
  const held = [
    unlanded.ahead > 0 &&
      `${unlanded.ahead} commit${unlanded.ahead === 1 ? "" : "s"} on no remote`,
    unlanded.changed > 0 &&
      `${unlanded.changed} changed file${unlanded.changed === 1 ? "" : "s"} or stash${unlanded.changed === 1 ? "" : "es"}`,
  ].filter(Boolean);
  return held.length > 0
    ? `${workWords.stopHolds(ws, held.join(" and "))} ${workWords.holdWays(ws)}`
    : workWords.stopRetires(ws);
}

/** The refusal for a cold session whose clean workspace holds commits on no remote: `from` reaches them for a brief's price. */
function fromRefusalText(row: KeepAliveRow, unlanded: Unlanded): string {
  const title = row.title ?? row.derivedTitle ?? sessionLabel(row).dir;
  const commits = `${unlanded.ahead} commit${unlanded.ahead === 1 ? "" : "s"}`;
  const stop = unlanded.live ? "stop its item with stop_delegate, then " : "";
  return `Refused: "${title}" (${idHandle(row.id)}) is cold, and its workspace ${idHandle(unlanded.workspaceId)} holds ${commits} on no remote with a clean tree. Waking it re-reads its whole transcript at full price; a fresh delegate cut from that workspace's branch starts with those commits for the price of a brief. Nothing was sent.\n\nTo finish that work, ${stop}delegate with from: "${idHandle(unlanded.workspaceId)}" and a brief that says what is left to do. If the work needs this session's own history, make the same call again and it will be delivered.`;
}

/**
 * Attach or fresh (§5.9) with a caller: a message to a session whose
 * prompt cache has expired. What its workspace holds on no remote decides
 * first: uncommitted changes, which only its clone reaches, attach; commits
 * with a clean tree are refused once naming `delegate` with `from`, and the
 * same call again is delivered. A workspace holding none of that: Jev on,
 * the hub asks Jev whether that session's history matters to `message`, and
 * its answer stands (a Jev that does not answer refuses, saying so); Jev
 * off, the first call is refused with the cost, and the same call again is
 * delivered.
 */
async function checkCold(
  instanceId: string | undefined,
  workspace: string | undefined,
  caller: string,
  message: string
): Promise<void> {
  const { row, midTurn, hasTurns, lastTurnAt, activityBound, unlanded, jev } =
    await readFollowupState(instanceId, workspace, message);
  if (!row) {
    return;
  }
  row.lastRequestAt = row.lastRequestAt ? new Date(row.lastRequestAt) : null;
  if (warmNow(row, midTurn, lastTurnAt)) {
    return;
  }
  if (unlanded) {
    const decided = unlandedVerdict(row, caller, lastTurnAt, unlanded);
    if (decided) {
      return;
    }
  }
  if (jev) {
    jevVerdict(row, jev);
    return;
  }
  if (repeatOfRefused(row, caller, lastTurnAt)) {
    return;
  }
  if (row.contextTokens === null) {
    row.contextTokens = await measuredContext(row.id);
  }
  throw new Error(
    coldRefusalText(row, lastTurnAt as string, activityBound, hasTurns)
  );
}

/**
 * What a cold session's workspace holds on no remote decides first: true
 * when it delivers (uncommitted changes, which only that clone reaches, or
 * the repeat of a `from` refusal); thrown when it refuses (commits with a
 * clean tree, naming `from`; a read that failed); false when it holds
 * neither, and Jev or the caller decides.
 */
function unlandedVerdict(
  row: KeepAliveRow,
  caller: string,
  lastTurnAt: string | null,
  unlanded: Unlanded | { error: string }
): boolean {
  if ("error" in unlanded) {
    const title = row.title ?? row.derivedTitle ?? sessionLabel(row).dir;
    throw new Error(
      `Refused: "${title}" (${idHandle(row.id)}) is cold, and what its workspace holds on no remote could not be read: ${unlanded.error} Nothing was sent. Retry once its machine answers.`
    );
  }
  if (unlanded.changed > 0) {
    return true;
  }
  if (unlanded.ahead === 0) {
    return false;
  }
  if (repeatOfRefused(row, caller, lastTurnAt)) {
    return true;
  }
  throw new Error(fromRefusalText(row, unlanded));
}

/** A session's context size, read once for a cold refusal; null when its machine does not say in time. */
async function measuredContext(id: string): Promise<number | null> {
  try {
    const measured = await readWithin(CONTEXT_SIZE_MS, async (signal) => {
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(id)}/context-size`,
        { method: "POST", signal }
      );
      return response.ok
        ? ((await response.json()) as { tokens?: number | null })
        : undefined;
    });
    switch (measured.kind) {
      case "answered":
        return measured.value?.tokens ?? null;
      case "unanswered":
        // The size stays unknown; the refusal says so as it always has.
        return null;
      default: {
        const unhandled: never = measured;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  } catch {
    // A context read cannot keep a cold-session refusal waiting on an offline machine.
    return null;
  }
}

/** What the hub reads of a session a message is about to reach (`/api/followup-state`); unknown is refused. */
async function readFollowupState(
  instanceId: string | undefined,
  workspace: string | undefined,
  message: string
) {
  const read = await readWithin(FOLLOWUP_STATE_MS, async (signal) => {
    const response = await fetch(`${hubHttpUrl()}/api/followup-state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId, workspace, message }),
      signal,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as {
      row: KeepAliveRow | null;
      midTurn: boolean;
      hasTurns: boolean;
      lastTurnAt: string | null;
      activityBound: boolean;
      /** What a cold session's workspace holds on no remote, or why that could not be read. */
      unlanded?: Unlanded | { error: string };
      /** Jev's answer, when Jev is on and the hub found the session cold with nothing unlanded. */
      jev?: { attach: boolean; noul: number } | { error: string };
    };
  });
  switch (read.kind) {
    case "answered":
      break;
    case "unanswered":
      // Its state is unknown: never read as cold or warm.
      throw new Error(
        `The hub did not answer within ${Math.round(read.after / 1000)} s whether that session's cache is warm, so nothing was sent. Retry.`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  return read.value;
}

function coldRefusalText(
  row: KeepAliveRow,
  lastTurnAt: string,
  activityBound: boolean,
  hasTurns: boolean,
  now = Date.now()
): string {
  const title = row.title ?? row.derivedTitle ?? sessionLabel(row).dir;
  const measured = !!(row.cacheTtl && row.lastRequestAt);
  const idle = Math.floor(
    (now -
      (
        (measured ? row.lastRequestAt : new Date(lastTurnAt as string)) as Date
      ).getTime()) /
      60_000
  );
  const lifetime = row.cacheTtl === "1h" ? "1 hour" : "5 minutes";
  let age = `Its last recorded turn ended ${idle} minutes ago`;
  if (activityBound) {
    age = `Its last model activity was at least ${idle} minutes ago`;
  }
  if (!hasTurns) {
    age = `Its last recorded activity was ${Math.floor((now - new Date(row.updatedAt).getTime()) / 60_000)} minutes ago`;
  }
  if (measured) {
    age = `Its last request was ${idle} minutes ago`;
  }
  const cache = measured ? lifetime : "not measured, at most 1 hour";
  const size =
    row.contextTokens === null
      ? "size not recorded"
      : `about ${(Math.round(row.contextTokens / 1000) * 1000).toLocaleString("en-US")} tokens as of its last request`;
  return `Refused: "${title}" (${idHandle(row.id)}) is cold. ${age} and its prompt cache (${cache}) has expired, so the next message makes it re-read its whole transcript (${size}) at full price. Nothing was sent.\n\nCheck first:\n1. Does this task need context that session already holds, which a brief could not carry?\n2. Would a fresh delegate with a tight brief cost less than that transcript?\n3. Is the message still needed at all, or was it meant for a session that has moved on?\n\nThen: if a fresh delegate fits, start one with delegate and no workspace. If no message is needed, stop. If this session is the right one, make the same call again and it will be delivered.`;
}

type ContinueSessionInput = Parameters<HandoffActions["continueSession"]>[0];

/** The summariser as `continue_session` names it: `harness/model`. */
const summariserOf = (input: ContinueSessionInput): string =>
  `${input.summarizer_harness}/${input.summarizer_model}`;

/**
 * What a continuation goes on from, as the hub's continue route takes it:
 * its asks alone, or a summary by the summariser named. Refused
 * when neither is asked.
 */
const continuedFrom = (
  input: ContinueSessionInput
): { asksOnly: true } | { summarizer: { harness: string; model: string } } => {
  if (input.from === "asks") {
    return { asksOnly: true };
  }
  if (!(input.summarizer_harness && input.summarizer_model)) {
    throw new Error(
      'Name summarizer_harness and summarizer_model, or continue with from: "asks", which summarises nothing.'
    );
  }
  return {
    summarizer: {
      harness: input.summarizer_harness,
      model: input.summarizer_model,
    },
  };
};

/** What a continuation in a new session opened on, as its report says. */
const openedOnWords = (
  input: ContinueSessionInput,
  summariserInstanceId: string | null
): string => {
  if (input.from === "asks") {
    return "It opened on the messages it was asked alone (a delegate's: its brief and its parent's hand-offs); nothing was summarised. ";
  }
  return summariserInstanceId
    ? `${summariserOf(input)} summarised it. `
    : "It was short enough that no summary was needed. ";
};

export const handoffActions = ({
  instanceId,
  instanceById,
  formerIds,
  cwd,
  deliver,
  emit,
  spawn,
  authorization,
  callId,
  projectId,
  ledBy,
  forkOrigins = () => [],
  delegateList,
  sendToUser,
  shownRefusal,
  fleet,
  instancesByShortId,
  threads,
}: HandoffDeps): HandoffActions => {
  /** A running delegate of the caller's that `target` names, through any continuation it was followed by. */
  const runningDelegate = (target: string) => {
    const { peers } = roster(fleet, instanceId);
    const followed = formerOf(formerIds(), target);
    const peer = resolveDelegate(
      peers,
      followed?.now ?? target,
      instanceId,
      ledBy,
      forkOrigins()
    );
    return { peer, followed };
  };
  return {
    async delegateList(query) {
      if (!delegateList) {
        throw new Error(
          "delegate_list is read by the hub, which is not wired here."
        );
      }
      return await delegateList(query);
    },
    async openItems() {
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/open-items`
      );
      return await hubText(response);
    },
    async continueSession(input) {
      const { rows, hosts } = fleetInstances(fleet);
      const target = formerOf(formerIds(), input.session)?.now ?? input.session;
      const source = resolve(
        rows.map((row) => toPeer(row, hosts)),
        target
      ).row.id;
      if (source === instanceId) {
        throw new Error(
          "continue_session continues another session, never this one. If your context is too big, say so in one line: the person compacts it with Claude Code's own /compact."
        );
      }
      // The new session answers permissions as the caller does, where its
      // harness has modes; the hub settles it, never the machine's default.
      const fallbackPermissionMode = callerMode(rows, instanceId);
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(source)}/continue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...continuedFrom(input),
            target: {
              harness: input.target_harness,
              model: input.target_model,
              ...(input.target_permission_mode
                ? { permissionMode: input.target_permission_mode }
                : {}),
              ...(fallbackPermissionMode ? { fallbackPermissionMode } : {}),
            },
            askedBy: instanceId,
            ...(input.note ? { note: input.note } : {}),
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const { continuationId, targetInstanceId, waiting } =
        (await response.json()) as {
          continuationId: string;
          targetInstanceId: string;
          waiting?: { since: number | null; until: number; why: string };
        };
      // Its source holds work in flight that ending it would lose: the job
      // waits for that and goes on by itself, which the caller hears now.
      if (waiting) {
        return {
          summariserInstanceId: null,
          targetInstanceId,
          text: waitingAnswer(source, targetInstanceId, waiting),
        };
      }
      // The hub runs the continuation as its own job; this waits for its report.
      const outcome = await fetch(
        `${hubHttpUrl()}/api/continuations/${encodeURIComponent(continuationId)}/outcome`
      );
      if (!outcome.ok) {
        throw new Error(await outcome.text());
      }
      const done = (await outcome.json()) as {
        summariserInstanceId: string | null;
        targetInstanceId: string;
        opening: string;
      };
      return {
        summariserInstanceId: done.summariserInstanceId,
        targetInstanceId: done.targetInstanceId,
        text:
          `Continued session ${source} in a new ${input.target_harness} session ` +
          `${done.targetInstanceId} on ${input.target_model}. ` +
          openedOnWords(input, done.summariserInstanceId) +
          `It is the same session from here, under ${done.targetInstanceId}: the source's process is ended, its work item and delegates go on in the new one, and what is sent to the source's id reaches it. ` +
          `The new session opened with:\n\n${done.opening}`,
      };
    },
    async generateImage(request) {
      const read = await readWithin(
        IMAGE_GENERATION_TIMEOUT_MS + 60_000,
        async (signal) => {
          const response = await fetch(
            `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/generate-image`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(request),
              signal,
            }
          );
          if (!response.ok) {
            throw new Error(await response.text());
          }
          return (await response.json()) as GeneratedImage;
        }
      );
      switch (read.kind) {
        case "answered":
          return read.value;
        case "unanswered":
          throw new Error(
            `The hub did not answer within ${Math.round(read.after / 1000)} s with the image.`
          );
        default: {
          const unhandled: never = read;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    },
    async forgePost(ask) {
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/forge-post`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ask),
        }
      );
      const text = (await response.text()).trim();
      if (!response.ok) {
        throw new Error(text);
      }
      return text;
    },
    async artifactCall(method, path, body) {
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/artifacts${path}`,
        {
          method,
          ...(body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }),
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    async listDelegateTypes() {
      const types = await fetchDelegateTypes(projectId);
      return { types };
    },
    listSessions(): string {
      const { peers, own } = roster(fleet, instanceId);
      const machines = fleet.machines();
      /** "paused until 00:57" for a paused machine, by id. */
      const pauses = new Map(
        machines.flatMap((machine) =>
          machine.pausedUntil
            ? [
                [
                  machine.machineId,
                  `paused until ${pauseClock(machine.pausedUntil)}`,
                ] as const,
              ]
            : []
        )
      );
      const paused = machines
        .filter((machine) => pauses.has(machine.machineId))
        .map(
          (machine) =>
            `${machineCalled(machine.machineId, machines)} is ${pauses.get(machine.machineId)}: nothing starts there until then, and work for it waits.`
        );
      const online = machines.filter((machine) => machine.status === "online");
      const where = [
        `Machines online (\`machine\` on delegate and start_session): ${onlineNames(machines)}.`,
        ...(online.length > 0
          ? [
              `To name one to the person: ${online.map((machine) => machineLink(machine.machineId, machineCalled(machine.machineId, machines))).join(", ")}.`,
            ]
          : []),
        ...paused,
      ].join(" ");
      if (peers.length === 0) {
        return `No other sessions are running.\n\n${where}`;
      }
      const listed = peers
        .map((peer) => {
          const facts = [
            peer.host,
            peer.row.model ?? "default model",
            ageOf(peer.row.updatedAt),
            ...(peer.row.kind === "scratch" ? ["spin-off"] : []),
            ...(pauses.has(peer.row.machineId)
              ? [pauses.get(peer.row.machineId) as string]
              : []),
            ...(peer.row.parentInstanceId === instanceId
              ? [peer.row.workItemId ? "your delegate" : "you started it"]
              : []),
            ...(own?.parentInstanceId && own.parentInstanceId === peer.row.id
              ? ["your parent session"]
              : []),
          ];
          return `- ${sessionLink(peer.row.id, peer.title)} (${peer.label}) — ${peer.dir} · ${facts.join(" · ")}`;
        })
        .join("\n");
      return `${listed}\n\n${where}`;
    },

    async handoff(
      target: string,
      message: string,
      inputs?: unknown[]
    ): Promise<string> {
      const { peers, asleep, own, hosts, rows } = roster(fleet, instanceId);
      // A thread (`thread#1a2b3c4d`, or its id): Caw is handed it there.
      const thread = threadOf(threads, target, [...peers, ...asleep]);
      if (thread) {
        if (!threads) {
          throw new Error(
            "Threads are not reachable from here; nothing was handed."
          );
        }
        return threads.hand(
          thread.id,
          { instanceId, name: senderName(own, cwd) },
          message
        );
      }
      // A session named by a former id is reached by its id now; one a
      // continuation took the work item of, by its continuation's.
      const followed =
        formerOf(formerIds(), target) ??
        continuedOf(rows, target, instanceById);
      const addressed = followed?.now ?? target;
      const unlisted =
        followed && ![...peers, ...asleep].some((p) => p.row.id === addressed)
          ? instanceById(addressed)
          : undefined;
      // A short id the board no longer lists (a session stopped a day ago):
      // still the session it names, woken to read it like any asleep one.
      const beyond = beyondBoard(
        instancesByShortId,
        addressed,
        [...peers, ...asleep],
        instanceId
      );
      const sleeping = [
        ...asleep,
        ...(unlisted ? [toPeer(unlisted, hosts)] : []),
        ...beyond.map((row) => toPeer(row, hosts)),
      ];
      const peer = resolveHandoff(peers, sleeping, addressed, own);
      // A fork's copied history names its origin's delegates; they are not its.
      const owner = forkOwner(forkOrigins(), peer.row, own);
      if (owner) {
        throw new Error(forkOwnedWords(peer, owner));
      }
      if (peer.row.id !== own?.parentInstanceId) {
        await checkCold(peer.row.id, undefined, instanceId, message);
      }
      const whose =
        peer.row.id === own?.parentInstanceId ? ", your parent session" : "";
      const from = senderName(own, cwd);
      // In its $TMPDIR before the message that names them reaches it.
      const landed = inputs?.length
        ? await handInputs(authorization, instanceId, peer.row.id, inputs)
        : [];
      const body = withInputsLine(
        `${handoffMarker(from, instanceId)}${message}`,
        landed
      );
      const payload = peerSend(peer.row.id, instanceId, from, body, {
        shouldQuery: false,
      });
      // Delivered now, so the answer says what the hub did with it, not what
      // the roster suggested before it went.
      const delivery = await deliver({
        verb: "send",
        machineId: peer.row.machineId,
        instanceId: peer.row.id,
        payload,
      });
      const continues = continuesWords(followed);
      const handed = `Handed to ${sessionLink(peer.row.id, peer.title)}, ${peer.label}${continues} (${peer.dir} on ${peer.host}${whose}).`;
      return `${handed} ${deliveryWords(delivery)}`;
    },

    async startSession(
      workdir: string,
      prompt: string,
      title: string,
      { spinOff = false, type: typeName, model: modelName, machine, ...opts }
    ): Promise<HandoffResult> {
      // Named: that machine, which must be online. Unnamed: "" is the caller's
      // own, which the hub's forwarder fills in.
      const target = machine
        ? resolveMachine(fleet.machines(), machine)
        : undefined;
      const machineId = target?.machineId ?? "";
      // Nothing is left to the machine's defaults: the type (or `medium`) says
      // what runs, and the caller's own mode is how it answers permissions.
      // The caller's project's catalog: its own types shadow the fleet's.
      const types = await fetchDelegateTypes(projectId);
      const { rows } = fleetInstances(fleet);
      const { type, harness, model } = resolveSpawnType(types, {
        type: typeName,
        model: modelName,
      });
      const id = crypto.randomUUID();
      const from = senderName(
        rows.find((row) => row.id === instanceId),
        cwd
      );
      // The mode asked for, if any, and the caller's own to fall back on; the
      // hub settles them by the harness's modes (none at all for pi).
      const payload: SpawnPayload & {
        fallbackPermissionMode?: PermissionMode;
      } = {
        instanceId: id,
        cwd: workdir,
        title,
        harness,
        model,
        account: opts.account,
        permissionMode: opts.permissionMode,
        fallbackPermissionMode: callerMode(rows, instanceId),
        ...(type?.effort ? { effort: type.effort } : {}),
        ...(type?.skills?.length ? { skills: type.skills } : {}),
        ...(typeName ? namedTypeSettings(type, projectId) : {}),
        ...(spinOff ? { scratch: { baseCwd: workdir } } : {}),
        // Its starter: it nests under this session in every rail, as all
        // work another session started does; it is no work item, so it
        // reports nothing back.
        parent: { instanceId },
        // The machine answers it once the session is in place, or with why it
        // is not; the hub holds the relay until then, so a failed spawn is this
        // tool's error rather than a "Started" for a session that never was.
        requestId: crypto.randomUUID(),
      };
      // Held until the session is in place; answers the folder it runs in, as
      // the hub settled it (`~` resolved, normalised), not the words typed.
      const settled = await spawn({
        verb: "spawn",
        machineId,
        instanceId: id,
        payload,
      });
      // The marker prefix survives SDK storage (which strips `origin`) so that
      // the transcript builder (`sentRow`, @cawco/core) can still detect the
      // opening prompt as a peer message and render it as `user.peer` instead of
      // the reader's own words — the same marker `handoff()` already uses.
      const body = `${handoffMarker(from, instanceId)}${prompt}`;
      const opening = peerSend(id, instanceId, from, body);
      emit({ verb: "send", machineId, instanceId: id, payload: opening });
      const on = target
        ? ` on ${machineCalled(target.machineId, fleet.machines())}`
        : "";
      return {
        id,
        title,
        text:
          `Started ${sessionLink(id, title)} (${leafOf(settled)})${spinOff ? " as a spin-off" : ""}${on} in ${settled}, ` +
          `on ${harness} ${model}${type?.effort ? ` at ${type.effort} effort` : ""}${type ? ` (type '${type.name}')` : ""}, ` +
          `in ${opts.permissionMode ?? "this session's own"} permission mode where its harness has modes. ` +
          "It is in the sidebar now, under this session, and the user can open its transcript. " +
          `Hand it more work later with handoff("${leafOf(settled)}#${id.slice(0, 8)}", ...).`,
      };
    },

    async delegate(prompt, opts) {
      const { machine, ...request } = opts;
      const target = machine
        ? resolveMachine(fleet.machines(), machine)
        : undefined;
      if (opts.workspace) {
        await checkCold(undefined, opts.workspace, instanceId, prompt);
      }
      const response = await postToHub(
        "/api/work-items",
        {
          ...request,
          machineId: target?.machineId,
          parentInstanceId: instanceId,
          prompt,
        },
        authorization,
        {
          // A fresh remote fetch and, on failure, its acknowledged discard take minutes.
          timeout: false,
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const started = (await response.json()) as DelegateResult;
      return target
        ? {
            ...started,
            text: `${started.text} It runs on ${machineCalled(target.machineId, fleet.machines())}.`,
          }
        : started;
    },

    async finishItem(request) {
      const response = await postToHub(
        "/api/work-items/finish",
        { ...request, instanceId },
        authorization,
        {
          // The landing gate may run for an hour (an iOS build behind others); Bun's fetch would drop a
          // response silent for five minutes.
          timeout: false,
        }
      );
      return await hubText(response);
    },

    async waitItem(minutes, reason) {
      return hubText(
        await postToHub(
          "/api/work-items/wait",
          { instanceId, minutes, reason },
          authorization
        )
      );
    },

    async discardWorkspace(workspace: string): Promise<string> {
      return hubText(
        await postToHub(
          `/api/workspaces/${encodeURIComponent(workspace.trim())}/discard`,
          { from: instanceId },
          authorization
        )
      );
    },

    async stopDelegate(asked: string): Promise<string> {
      // A queued delegate has no session yet: it is withdrawn from the queue.
      const withdrawn = await postToHub(
        "/api/work-items/queued/withdraw",
        { from: instanceId, target: asked },
        authorization
      );
      if (withdrawn.ok) {
        return ((await withdrawn.json()) as { text: string }).text;
      }
      if (withdrawn.status !== 404) {
        throw new Error(await withdrawn.text());
      }
      const { peers } = roster(fleet, instanceId);
      const followed = formerOf(formerIds(), asked);
      const target = followed?.now ?? asked;
      // An id, full or short, names a session in any state: asleep, failed,
      // its conversation gone. Only a name is looked up among the running.
      const { rows, hosts } = fleetInstances(fleet);
      const ended =
        instanceById(handleId(target)) ??
        resolveById(
          rows
            .filter((row) => row.id !== instanceId)
            .map((row) => toPeer(row, hosts)),
          target
        )?.row;
      const peer = resolveDelegate(
        ended ? [toPeer(ended, new Map())] : peers,
        target,
        instanceId,
        ledBy,
        forkOrigins()
      );
      // The hub walks its tree (tree-stops.ts): what is under it ends first.
      const response = await postToHub(
        "/api/work-items/stop",
        { from: instanceId, instanceId: peer.row.id },
        authorization
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const { under } = (await response.json()) as { under: number };
      const stopping = workWords.stopAsked(
        `${peer.label}${continuesWords(followed)}`,
        under
      );
      if (!peer.row.workItemId) {
        return stopping;
      }
      const read = await fetch(
        `${hubHttpUrl()}/api/work-items/${encodeURIComponent(peer.row.workItemId)}/unlanded`
      );
      const unlanded = read.ok
        ? (
            (await read.json()) as {
              unlanded: Unlanded | { error: string } | null;
            }
          ).unlanded
        : { error: await read.text() };
      const item = await fetch(
        `${hubHttpUrl()}/api/work-items/${encodeURIComponent(peer.row.workItemId)}`
      );
      if (!item.ok) {
        throw new Error(await item.text());
      }
      const { workspaceId } = (await item.json()) as WorkItemView;
      return `${stopping} ${stoppedHoldWords(workspaceId, unlanded)}`;
    },

    interruptDelegate(target: string): string {
      const { peer, followed } = runningDelegate(target);
      emit({
        verb: "control",
        machineId: peer.row.machineId,
        instanceId: peer.row.id,
        payload: {
          instanceId: peer.row.id,
          requestId: crypto.randomUUID(),
          method: "interrupt",
          args: [],
          from: instanceId,
        },
      });
      return (
        `Interrupted your delegate ${peer.label}${continuesWords(followed)}. Its current turn stopped; it keeps all state, ` +
        `and stays idle: no reminder, wait or merge check outcome wakes it. Resume or redirect it with handoff("${peer.row.id}", ...).`
      );
    },

    async machinePause(machine, minutes, resume = false) {
      const machines = fleet.machines();
      const found = resolveMachine(machines, machine, true);
      const name = machineCalled(found.machineId, machines);
      if (resume === (minutes !== undefined)) {
        throw new Error(
          "Pass minutes to pause the machine, or resume: true to end its pause."
        );
      }
      const path = `/api/machines/${encodeURIComponent(found.machineId)}/${resume ? "resume" : "pause"}`;
      const response = await postToHub(
        path,
        resume
          ? {}
          : {
              until: new Date(
                Date.now() + (minutes ?? 0) * 60_000
              ).toISOString(),
              // Its own turn, when the machine is its own, is cut once this
              // call is answered, never under it (hub machine-pause.ts
              // `PauseCaller`).
              ...(callId ? { call: callId } : {}),
            },
        authorization
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const row = (await response.json()) as {
        pausedUntil: number | null;
        pauseStopped: string | null;
      };
      return row.pausedUntil === null
        ? `${name} is not paused: what was kept for it goes now.`
        : `Paused ${name} until ${pauseClock(row.pausedUntil)}: its running turns were stopped${row.pauseStopped ? `, it ${row.pauseStopped}` : ""}, and nothing starts there until then. Work for it waits and runs when the pause ends.`;
    },

    answerDelegate(
      target: string,
      requestId: string,
      answers?: Record<string, string>,
      deny = false
    ): string {
      const { peer, followed } = runningDelegate(target);
      // The answers alone are all this side has: the delegate's tool call never
      // came here, only the question text and its options did. A question's
      // `updatedInput` has to carry the whole call back or the harness refuses it
      // for the `questions` it is missing, so the harness that parked the ask
      // folds these into the input it kept (settledQuestionResult in
      // @cawco/core, mirroring the dashboard's questionAnswer). A denial says so
      // in words for the same reason: the model is told why, not merely that.
      let result: PermissionResult;
      if (deny) {
        result = { behavior: "deny", message: QUESTION_DISMISSED };
      } else if (answers) {
        result = { behavior: "allow", updatedInput: { answers } };
      } else {
        result = { behavior: "allow" };
      }
      emit({
        verb: "control",
        machineId: peer.row.machineId,
        instanceId: peer.row.id,
        requestId,
        payload: {
          instanceId: peer.row.id,
          requestId,
          method: "resolvePermission",
          args: [requestId, result],
          from: instanceId,
        },
      });
      return deny
        ? `Denied your delegate ${peer.label}${continuesWords(followed)}'s ask (${requestId}).`
        : `Answered your delegate ${peer.label}${continuesWords(followed)}'s ask (${requestId}).`;
    },

    // biome-ignore lint/suspicious/useAwait: the declared Promise return type is what the tool awaits; a refusal throws, which the async body turns into a rejection
    async sendToUser(message: string, attachments?: string[]): Promise<string> {
      const refusal = shownRefusal?.("send_to_user", attachments ?? []);
      if (refusal) {
        throw new Error(`${refusal} Nothing was sent.`);
      }
      sendToUser(message);
      const shown = attachments?.length
        ? `Shown to the user in this session's transcript, with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
        : "Shown to the user in this session's transcript";
      return `${shown}; their paired devices get a push unless they have this session open.`;
    },

    showImage(path) {
      const refusal = shownRefusal?.("show_image", [path]);
      if (refusal) {
        throw new Error(refusal);
      }
      return `Shown in the transcript: ${path}. If the file is missing or later moves, the user sees that instead.`;
    },

    async setTitle(title) {
      const response = await fetch(
        `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/title`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      return text;
    },
  };
};
