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
  ImageGenerationRequest,
  InstanceRow,
  LandsMode,
  PermissionMode,
  PermissionResult,
  SendPayload,
  SpawnPayload,
  WorkflowAction,
} from "@cawco/core";
import {
  delegateTypeProblem,
  handoffMarker,
  IMAGE_GENERATION_TIMEOUT_MS,
  machineLabel,
  namedAmong,
  namesAmong,
  pauseClock,
  QUESTION_DISMISSED,
  relaunchOf,
  withInputsLine,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import type { MachinePath } from "@cawco/core/machine-path";
import type { WorkBudget, WorkItemSubmission } from "./db/schema";
import type { DelegateListInclude, DelegateNode } from "./delegation-tree";
import { hubHttpUrl, selfFetch } from "./hub-self";
import { type KeepAliveRow, promptCacheExpiresAt } from "./keep-alive";
import { boardTitle, leafOf, sessionLabel } from "./labels";
import {
  type HeldWork,
  type QueuedDelegate,
  resolveSpawnType,
  type Unlanded,
} from "./work-items";

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
export async function fetchDelegateTypes(
  projectId?: string
): Promise<DelegateType[]> {
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
 * list is a delegate's (browser checks in isolated chrome-devtools, not the
 * owner's Chrome); a started session is not a delegate and keeps Claude in
 * Chrome. And its toolset (§5.3): the type's `role:`, kept on the row.
 */
const namedTypeSettings = (
  type: DelegateType | undefined,
  projectId: string | undefined
): Pick<
  SpawnPayload,
  "cawcoTodos" | "delegateType" | "denyTools" | "role"
> => ({
  denyTools: type?.denyTools,
  // Kept on the row, so the type's word reads the same for every session.
  ...(type
    ? { delegateType: { name: type.name, ...(projectId ? { projectId } : {}) } }
    : {}),
  ...(type?.cawcoTodos ? { cawcoTodos: true } : {}),
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
export interface Machine {
  hostname: string;
  machineId: string;
  /** Paused by the owner until this time, epoch ms (machine-pause.ts); null or absent when not. */
  pausedUntil?: number | null;
  /** What its pause stopped as it began: "stopped 1 running landing gate step"; null or absent when nothing. */
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
  namesAmong(
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
      `${namedAmong(found, machines)} is offline. Online now: ${onlineNames(machines)}.`
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
  return { peers, asleep, own, hosts };
}

/**
 * The session a target names by one of its former ids (a session whose
 * continuations at its account's limit the hub folded into one, the hub's
 * `instanceIdOf`): its id now, and the id it was named by. By the full id,
 * or a short id of six or more characters that names only it. Undefined
 * when the target names no former id.
 */
function formerOf(
  formerIds: Record<string, string>,
  target: string
): { now: string; former: string } | undefined {
  const needle = needleOf(target);
  const idPart = needle.includes("#")
    ? (needle.split("#").pop() ?? "")
    : needle;
  const matches = Object.keys(formerIds).filter(
    (id) => id === needle || (idPart.length >= 6 && id.startsWith(idPart))
  );
  const [former] = matches;
  return matches.length === 1 && former
    ? { now: formerIds[former], former }
    : undefined;
}

/** How a tool's answer names the former id a target was named by. */
const continuesWords = (followed: { former: string } | undefined): string =>
  followed ? ` (once ${followed.former.slice(0, 8)})` : "";

/** An `@` prefix on a target name, optional. */
const AT_PREFIX = /^@/;

/**
 * A mention as a composer's chip serialises it (find.ts, the options doc's
 * shared ground 9): the title in the person's words, then the handle the hub
 * resolves, in angle brackets: `@Orchestrate cockpit fleet <cockpit#5a167bde>`.
 * The handle alone names the target; the title is for the reader.
 */
const CHIP = /<([^<>]+)>\s*$/;

/** What a target names: a chip's handle, else the words given; lowercased, without `@`. */
const needleOf = (target: string): string => {
  const handle = CHIP.exec(target.trim())?.[1];
  return (handle ?? target).trim().toLowerCase().replace(AT_PREFIX, "");
};

/** A thread's handle (`thread#1a2b3c4d`), as find and a chip carry it. */
const THREAD_HANDLE = /^thread#([0-9a-f-]{6,36})$/;

/** What an id is made of, its dashes aside. */
const HEX = /^[0-9a-f]+$/;

/** The one session a full id, or a short id of six or more characters, names. */
function resolveById(peers: Peer[], target: string): Peer | undefined {
  const needle = needleOf(target);
  const byId = peers.find((peer) => peer.row.id === needle);
  if (byId) {
    return byId;
  }
  const idPart = needle.includes("#")
    ? (needle.split("#").pop() ?? "")
    : needle;
  if (idPart.length < 6) {
    return;
  }
  const byShortId = peers.filter((peer) => peer.row.id.startsWith(idPart));
  return byShortId.length === 1 ? byShortId[0] : undefined;
}

/**
 * The sessions a bare name picks out, by their folder's name or their title:
 * those it names exactly, else those whose name or title holds it.
 */
function named(peers: Peer[], target: string): Peer[] {
  const needle = needleOf(target);
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
  const byId = resolveById(all, target);
  if (byId) {
    return byId;
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
    const known =
      peers.map((peer) => peer.label).join(", ") || "none are running";
    throw new Error(
      `No session, running or asleep, matches "${target}". Running now: ${known}.`
    );
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
  const needle = needleOf(target);
  const handle = THREAD_HANDLE.exec(needle)?.[1];
  const id = handle ?? needle;
  if (!handle) {
    const hex = id.replaceAll("-", "");
    const sessionHas = sessions.some((peer) => peer.row.id.startsWith(id));
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
  const needle = needleOf(target);
  const idPart = needle.includes("#")
    ? (needle.split("#").pop() ?? "")
    : needle;
  if (
    !lookup ||
    idPart.length < 6 ||
    listed.some((peer) => peer.row.id.startsWith(idPart))
  ) {
    return [];
  }
  return lookup(idPart).filter(
    (row) => row.id !== self && relaunchOf(row).kind !== "refused"
  );
}

/** Resolves what the model typed to one session; ambiguity is reported, not guessed. */
function resolve(peers: Peer[], target: string): Peer {
  const byId = resolveById(peers, target);
  if (byId) {
    return byId;
  }
  const candidates = named(peers, target);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    const known =
      peers.map((peer) => peer.label).join(", ") || "none are running";
    throw new Error(
      `No running session matches "${target}". Running now: ${known}.`
    );
  }
  throw ambiguous(target, candidates);
}

/**
 * The tools a leaf delegate (`canDelegate === false`) never gets: everything
 * that spawns, steers a spawn or reads its spawns. One set for the claude and pi toolsets (the
 * opencode plugin refuses at call time instead, having no per-session
 * toolset). Fixed for the session's life, so the prompt cache is unaffected.
 */
export const SPAWNING_TOOLS: ReadonlySet<string> = new Set([
  "workflow_run",
  "workflow_steer",
  "workflow_read",
  "workflow_list",
  "workflow_create",
  "workflow_update",
  "start_session",
  "continue_session",
  "delegate",
  "delegate_list",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  // It stops every turn on a machine: an orchestrator's, never a leaf's.
  "machine_pause",
]);

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
 * take it, so it waits for a sign-in or a free account (`signin`); or the
 * owner paused its machine until a time (`paused`, machine-pause.ts); or an
 * interrupt holds its work item and only its parent, its lead or the person
 * wakes it (`held`); or its workspace retired when its work landed and the
 * hub is cutting its clone again at the same path (`recut`, work-items.ts
 * `recut`).
 */
export type SendHold =
  | "agent"
  | "behind"
  | "build"
  | "held"
  | "hub"
  | "limit"
  | "paused"
  | "recut"
  | "resting"
  | "signin"
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
  held: "An interrupt stopped it, and only its parent, its project's lead or the person wakes it, so the message is kept at the hub and goes to it when one of them next writes to it.",
  recut:
    "Its workspace retired when its work landed, so the hub is cutting its clone again at the same path, at the commit it landed; the message is kept at the hub and goes to the same session, on its transcript, once the clone is there.",
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
   * Whether THIS session may spawn sessions of its own. `false` on a leaf
   * delegate (spawned with `can_delegate: false`); absent means allowed.
   */
  readonly canDelegate?: boolean;
  /** What it is working on, so the receiver knows who is calling. */
  readonly cwd: string;
  /** This session's own delegation tree, read by the hub (delegation-tree.ts). */
  readonly delegateList?: (
    include: DelegateListInclude
  ) => Promise<DelegateNode[]>;
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
  readonly harness?: "claude" | "opencode" | "pi";
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
  readonly lands?: LandsMode;
  /** Whether this session leads the project of the work item a session runs: it may steer, answer and stop it. */
  readonly ledBy?: (instanceId: string) => boolean;
  /** The session's project: its delegate types shadow the fleet's. */
  readonly projectId?: string;
  /**
   * `send_to_user`'s delivery, awaited: what did not reach the owner's
   * Telegram and why, one line each; empty when everything did.
   */
  readonly sendToUser?: (
    message: string,
    attachments: string[]
  ) => Promise<string[]>;
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
  readonly workflowRunId?: string;
  readonly workflowStepId?: string;
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
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  answerDelegate(
    target: string,
    requestId: string,
    answers?: Record<string, string>,
    deny?: boolean
  ): string;
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
    summarizer_harness?: "claude" | "opencode" | "pi";
    summarizer_model?: string;
    target_harness: "claude" | "opencode" | "pi";
    target_model: string;
    note?: string;
  }) => Promise<{
    summariserInstanceId: string | null;
    targetInstanceId: string;
    text: string;
  }>;
  readonly createWorkflow: (name: string, program: string) => Promise<unknown>;
  /**
   * Starts a work item: a fresh session or a fork of this one in a new workspace, or the follow-up
   * in an existing one, on the session that workspace's last item ran. The
   * hub decides and files everything; this is its request.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  delegate(
    prompt: string,
    opts: {
      /** What the caller named the work: the item's and its session's title. */
      title: string;
      /** The repository a new workspace is cut from; this session's directory by default. */
      cwd?: string;
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
      harness?: "claude" | "opencode" | "pi";
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
      /** Files on this session's machine copied into its `$TMPDIR/inputs/` before its brief. */
      inputs?: string[];
      /** Where its commits go once it passes the landing gate; `main` by default. */
      lands?: LandsMode;
      /** Files in its workspace the hub copies into the project's folder. */
      outputs?: string[];
      /** Its group under this session: one combined report once all have ended. */
      group?: string;
      /** Globs of the repository's files it owns. */
      owns?: string[];
      /** What it may spend before the hub stops it. */
      budget?: WorkBudget;
    }
  ): Promise<DelegateResult>;
  /**
   * This session's delegation tree: its delegates, theirs nested; the
   * delegates still queued; and the fleet's held workspaces, whose items
   * ended with work that is nowhere else (work-items.ts `settle`).
   */
  readonly delegateList: (include: DelegateListInclude) => Promise<{
    delegates: DelegateNode[];
    held: HeldWork[];
    queued: QueuedDelegate[];
  }>;
  /**
   * Finishes this session's work item: the hub runs its landing gate and
   * lands it, or fails it as blocked. Answers what the hub says of it.
   */
  readonly finishItem: (request: WorkItemSubmission) => Promise<string>;
  readonly generateImage: (
    request: ImageGenerationRequest
  ) => Promise<GeneratedImage>;
  /**
   * Sends `message` to another session; `inputs`, files on this session's
   * machine, are copied first into the `$TMPDIR/inputs/` of the target's
   * work item, one this session delegated or leads.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  handoff(target: string, message: string, inputs?: string[]): Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  interruptDelegate(target: string): string;
  readonly listDelegateTypes: () => Promise<{ types: DelegateType[] }>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  listSessions(): string;
  readonly listWorkflows: () => Promise<unknown>;
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
   * summarised, and the new session opens on the person's own messages
   * alone, verbatim and in order, and the open items.
   */
  /** This session's Open items section, built by the hub from its records (open-items.ts). */
  readonly openItems: () => Promise<string>;
  /** A window into one result of a run this session supervises. */
  readonly readWorkflow: (
    runId: string,
    request: {
      ref: number | "result";
      path?: string;
      offset?: number;
      limit?: number;
    }
  ) => Promise<string>;
  readonly readWorkflowState: (name: string) => Promise<{ value: unknown }>;
  readonly runWorkflow: (
    name: string,
    inputs: Record<string, unknown>,
    options?: { workspace?: { path: string; machineId: string } }
  ) => Promise<{ runId: string }>;
  /** Pushes a note to the owner's Telegram — no peer, no ask, fire-and-forget. */
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  sendToUser(message: string, attachments?: string[]): Promise<string>;
  /** Names this session; refused, in the hub's words, once the owner has named it. */
  readonly setTitle: (title: string) => Promise<string>;
  /** `show_image`: what the transcript says it shows; throws when the session may not show it (shown-files.ts). */
  readonly showImage: (path: string) => string;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  startSession(
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
      /** This session's own mode when omitted. */
      permissionMode?: PermissionMode;
      /** The machine it runs on, by hostname or machineId; the caller's by default. */
      machine?: string;
    }
  ): Promise<HandoffResult>;
  /** A supervisor's action on its run; answers one line saying what it did. */
  readonly steerWorkflow: (
    runId: string,
    action: WorkflowAction
  ) => Promise<string>;
  // biome-ignore lint/style/useConsistentMethodSignatures: implemented below; property-style would change parameter variance against that implementation
  stopDelegate(target: string): Promise<string>;
  readonly submitResult: (result: unknown) => Promise<string>;
  readonly updateWorkflow: (name: string, program: string) => Promise<unknown>;
  readonly waitItem: (minutes: number, reason: string) => Promise<string>;
  readonly writeWorkflowState: (
    name: string,
    value: unknown
  ) => Promise<string>;
}

/** The structured result of startSession / delegate — the id, title, and the model-facing prose. */
export interface HandoffResult {
  id: string;
  text: string;
  title: string;
}

/**
 * A delegation's result: its session, and the work item and workspace it
 * runs in; all three null while it waits, queued, for files a live item owns.
 */
export interface DelegateResult {
  id: string | null;
  /** The queued request's id, while it waits for owned files. */
  queued: string | null;
  text: string;
  title: string;
  workItemId: string | null;
  workspaceId: string | null;
  /** The workspace's scratch dir on its machine, the delegate's `TMPDIR`: where inputs for it are copied. */
  workspaceTmp: string | null;
}

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
  `${peer.label} (“${peer.title}”) is a delegate of “${owner.title}” (${owner.id}), the session this one was forked from. It stays that session's: its reports and asks go there, and only that session hands it work, stops, interrupts or answers it. Nothing was done. Delegate the work yourself if this session needs it.`;

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

/**
 * A handoff's inputs, through the hub (work-items.ts `handInputs`): read on
 * `from`'s machine, copied into the `$TMPDIR/inputs/` of `target`'s work
 * item. Answers each one's name and where it was read; the hub's refusal is
 * thrown in its words.
 */
async function handInputs(
  authorization: string | undefined,
  from: string,
  target: string,
  inputs: string[]
): Promise<{ from: string; name: string }[]> {
  const response = await fetch(`${hubHttpUrl()}/api/work-items/inputs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({ from, instanceId: target, inputs }),
    // Up to 64 MiB read on one machine and written on another.
    timeout: false,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (
    (await response.json()) as { inputs: { from: string; name: string }[] }
  ).inputs;
}

async function saveWorkflowProgram(
  method: string,
  path: string,
  body: { name?: string; program: string }
): Promise<unknown> {
  const response = await fetch(`${hubHttpUrl()}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.headers.get("content-type")?.includes("application/json")) {
      const refused = JSON.parse(text) as { problems?: { message: string }[] };
      if (refused.problems) {
        throw new Error(
          refused.problems.map((problem) => problem.message).join("\n")
        );
      }
    }
    throw new Error(text);
  }
  return response.json();
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
      `Refused: "${title}" (${row.id}) is cold, and ${jev.error} Nothing was sent.`
    );
  }
  if (!jev.attach) {
    throw new Error(
      `Refused: "${title}" (${row.id}) is cold, and Jev judged that this message does not need its history (${jev.noul.toFixed(2)}): a fresh delegate with a tight brief fits. Nothing was sent. Start one with delegate and no workspace.`
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

/** The refusal for a cold session whose clean workspace holds commits on no remote: `from` reaches them for a brief's price. */
export function fromRefusalText(row: KeepAliveRow, unlanded: Unlanded): string {
  const title = row.title ?? row.derivedTitle ?? sessionLabel(row).dir;
  const commits = `${unlanded.ahead} commit${unlanded.ahead === 1 ? "" : "s"}`;
  const stop = unlanded.live ? "stop its item with stop_delegate, then " : "";
  return `Refused: "${title}" (${row.id}) is cold, and its workspace ${unlanded.workspaceId} holds ${commits} on no remote with a clean tree. Waking it re-reads its whole transcript at full price; a fresh delegate cut from that workspace's branch starts with those commits for the price of a brief. Nothing was sent.\n\nTo finish that work, ${stop}delegate with from: "${unlanded.workspaceId}" and a brief that says what is left to do. If the work needs this session's own history, make the same call again and it will be delivered.`;
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
      `Refused: "${title}" (${row.id}) is cold, and what its workspace holds on no remote could not be read: ${unlanded.error} Nothing was sent. Retry once its machine answers.`
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

export function coldRefusalText(
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
  return `Refused: "${title}" (${row.id}) is cold. ${age} and its prompt cache (${cache}) has expired, so the next message makes it re-read its whole transcript (${size}) at full price. Nothing was sent.\n\nCheck first:\n1. Does this task need context that session already holds, which a brief could not carry?\n2. Would a fresh delegate with a tight brief cost less than that transcript?\n3. Is the message still needed at all, or was it meant for a session that has moved on?\n\nThen: if a fresh delegate fits, start one with delegate and no workspace. If no message is needed, stop. If this session is the right one, make the same call again and it will be delivered.`;
}

type ContinueSessionInput = Parameters<HandoffActions["continueSession"]>[0];

/** The summariser as `continue_session` names it: `harness/model`. */
const summariserOf = (input: ContinueSessionInput): string =>
  `${input.summarizer_harness}/${input.summarizer_model}`;

/**
 * What a continuation goes on from, as the hub's continue route takes it:
 * the person's asks alone, or a summary by the summariser named. Refused
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
    return "It opened on the person's own messages alone; nothing was summarised. ";
  }
  return summariserInstanceId
    ? `${summariserOf(input)} summarised it. `
    : "It was short enough that no summary was needed. ";
};

export const handoffActions = ({
  instanceId,
  instanceById,
  formerIds,
  workflowRunId,
  workflowStepId,
  cwd,
  deliver,
  emit,
  spawn,
  authorization,
  projectId,
  ledBy,
  forkOrigins = () => [],
  delegateList,
  sendToUser,
  shownRefusal,
  fleet,
  instancesByShortId,
  threads,
}: HandoffDeps): HandoffActions => ({
  async delegateList(include) {
    if (!delegateList) {
      throw new Error(
        "delegate_list is read by the hub, which is not wired here."
      );
    }
    const [delegates, waiting, spent] = await Promise.all([
      delegateList(include),
      fetch(
        `${hubHttpUrl()}/api/work-items/queued?for=${encodeURIComponent(instanceId)}`
      ),
      fetch(`${hubHttpUrl()}/api/workspaces/held`),
    ]);
    const refused = [waiting, spent].find((answer) => !answer.ok);
    if (refused) {
      throw new Error(await refused.text());
    }
    const { queued } = (await waiting.json()) as { queued: QueuedDelegate[] };
    const { held } = (await spent.json()) as { held: HeldWork[] };
    return { delegates, held, queued };
  },
  async openItems() {
    const response = await fetch(
      `${hubHttpUrl()}/api/instances/${encodeURIComponent(instanceId)}/open-items`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
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
    const { continuationId } = (await response.json()) as {
      continuationId: string;
    };
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
        `The source session was not touched. The new session opened with:\n\n${done.opening}`,
    };
  },
  createWorkflow(name, program) {
    return saveWorkflowProgram("POST", "/api/workflows", { name, program });
  },
  updateWorkflow(name, program) {
    return saveWorkflowProgram(
      "PUT",
      `/api/workflows/${encodeURIComponent(name)}`,
      { program }
    );
  },
  async readWorkflowState(name) {
    if (!(workflowStepId && workflowRunId)) {
      throw new Error("Workflow state is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(workflowRunId)}/state/${encodeURIComponent(name)}?instanceId=${encodeURIComponent(instanceId)}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as { value: unknown };
  },
  async writeWorkflowState(name, value) {
    if (!(workflowStepId && workflowRunId)) {
      throw new Error("Workflow state is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(workflowRunId)}/state/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, value }),
      }
    );
    return response.text();
  },
  async submitResult(result) {
    if (!workflowStepId) {
      throw new Error("submit_result is available only to workflow steps.");
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-steps/${encodeURIComponent(workflowStepId)}/result`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, result }),
      }
    );
    return response.text();
  },
  async runWorkflow(name, inputs, options) {
    const response = await fetch(
      `${hubHttpUrl()}/api/workflows/${encodeURIComponent(name)}/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId,
          inputs,
          workspace: options?.workspace,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as { runId: string };
  },
  async readWorkflow(runId, { ref, path, offset, limit }) {
    const query = new URLSearchParams({ instanceId, ref: String(ref) });
    if (path) {
      query.set("path", path);
    }
    if (offset !== undefined) {
      query.set("offset", String(offset));
    }
    if (limit !== undefined) {
      query.set("limit", String(limit));
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(runId)}/read?${query}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.text();
  },
  async steerWorkflow(runId, action) {
    const response = await fetch(
      `${hubHttpUrl()}/api/workflow-runs/${encodeURIComponent(runId)}/steer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId, action }),
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { message: string }).message;
  },
  async listWorkflows() {
    const response = await fetch(`${hubHttpUrl()}/api/workflows`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
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
          `${namedAmong(machine, machines)} is ${pauses.get(machine.machineId)}: nothing starts there until then, and work for it waits.`
      );
    const where = [
      `Machines online (\`machine\` on delegate and start_session): ${onlineNames(machines)}.`,
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
        return `- ${peer.label} — ${peer.dir} · ${facts.join(" · ")}`;
      })
      .join("\n");
    return `${listed}\n\n${where}`;
  },

  async handoff(
    target: string,
    message: string,
    inputs?: string[]
  ): Promise<string> {
    const { peers, asleep, own, hosts } = roster(fleet, instanceId);
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
    // A session named by a former id is reached by its id now.
    const followed = formerOf(formerIds(), target);
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
    const payload: SendPayload = {
      instanceId: peer.row.id,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: body },
        parent_tool_use_id: null,
        origin: {
          kind: "peer",
          from: instanceId,
          name: from,
          fromSession: instanceId,
        },
        shouldQuery: false,
      },
    };
    // Delivered now, so the answer says what the hub did with it, not what
    // the roster suggested before it went.
    const delivery = await deliver({
      verb: "send",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      payload,
    });
    const continues = continuesWords(followed);
    const handed = `Handed to ${peer.label}${continues} (${peer.dir} on ${peer.host}${whose}).`;
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
    const payload: SpawnPayload & { fallbackPermissionMode?: PermissionMode } =
      {
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
    const opening: SendPayload = {
      instanceId: id,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: body },
        parent_tool_use_id: null,
        origin: {
          kind: "peer",
          from: instanceId,
          name: from,
          fromSession: instanceId,
        },
      },
    };
    emit({ verb: "send", machineId, instanceId: id, payload: opening });
    const on = target ? ` on ${namedAmong(target, fleet.machines())}` : "";
    return {
      id,
      title,
      text:
        `Started "${title}" (${leafOf(settled)})${spinOff ? " as a spin-off" : ""}${on} in ${settled}, ` +
        `on ${harness} ${model}${type?.effort ? ` at ${type.effort} effort` : ""}${type ? ` (type '${type.name}')` : ""}, ` +
        `in ${opts.permissionMode ?? "this session's own"} permission mode where its harness has modes. ` +
        "It is in the sidebar now, under this session, and the user can open its transcript. " +
        `Hand it more work later with handoff("${id}", ...).`,
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
    const response = await fetch(`${hubHttpUrl()}/api/work-items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        ...request,
        machineId: target?.machineId,
        parentInstanceId: instanceId,
        prompt,
      }),
      // A fresh remote fetch and, on failure, its acknowledged discard take minutes.
      timeout: false,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const started = (await response.json()) as {
      instanceId: string | null;
      queued: string | null;
      text: string;
      title: string;
      workItemId: string | null;
      workspaceId: string | null;
      workspaceTmp: string | null;
    };
    return {
      id: started.instanceId,
      queued: started.queued,
      title: started.title,
      text: target
        ? `${started.text} It runs on ${namedAmong(target, fleet.machines())}.`
        : started.text,
      workItemId: started.workItemId,
      workspaceId: started.workspaceId,
      workspaceTmp: started.workspaceTmp,
    };
  },

  async finishItem(request) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items/finish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ ...request, instanceId }),
      // The landing gate may run for an hour (an iOS build behind others); Bun's fetch would drop a
      // response silent for five minutes.
      timeout: false,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
  },

  async waitItem(minutes, reason) {
    const response = await fetch(`${hubHttpUrl()}/api/work-items/wait`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ instanceId, minutes, reason }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { text: string }).text;
  },

  async stopDelegate(asked: string): Promise<string> {
    // A queued delegate has no session yet: it is withdrawn from the queue.
    const withdrawn = await fetch(
      `${hubHttpUrl()}/api/work-items/queued/withdraw`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({ from: instanceId, target: asked }),
      }
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
      instanceById(needleOf(target)) ??
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
    emit({
      verb: "stop",
      machineId: peer.row.machineId,
      instanceId: peer.row.id,
      payload: { instanceId: peer.row.id, from: instanceId },
    });
    if (!peer.row.workItemId) {
      return `Stopped your delegate ${peer.label}${continuesWords(followed)}.`;
    }
    const response = await fetch(
      `${hubHttpUrl()}/api/work-items/${encodeURIComponent(peer.row.workItemId)}`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const item = (await response.json()) as WorkItemView;
    const live = item.state === "starting" || item.state === "running";
    return (
      `Stopped your delegate ${peer.label}${continuesWords(followed)}. Its work item ${item.id} ` +
      (live ? "is cancelled" : `was already ${item.state}`) +
      `, and its workspace ${item.workspaceId} keeps the checkout. To carry the work on, handoff to it, ` +
      `or delegate(..., workspace: "${item.workspaceId}"): either continues its own session.`
    );
  },

  interruptDelegate(target: string): string {
    const { peers } = roster(fleet, instanceId);
    const followed = formerOf(formerIds(), target);
    const peer = resolveDelegate(
      peers,
      followed?.now ?? target,
      instanceId,
      ledBy,
      forkOrigins()
    );
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
      `and stays idle: no reminder, wait or landing gate outcome wakes it. Resume or redirect it with handoff("${peer.row.id}", ...).`
    );
  },

  async machinePause(machine, minutes, resume = false) {
    const machines = fleet.machines();
    const found = resolveMachine(machines, machine, true);
    const name = namedAmong(found, machines);
    if (resume === (minutes !== undefined)) {
      throw new Error(
        "Pass minutes to pause the machine, or resume: true to end its pause."
      );
    }
    const path = `${hubHttpUrl()}/api/machines/${encodeURIComponent(found.machineId)}/${resume ? "resume" : "pause"}`;
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(
        resume
          ? {}
          : {
              until: new Date(
                Date.now() + (minutes ?? 0) * 60_000
              ).toISOString(),
            }
      ),
    });
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
    const { peers } = roster(fleet, instanceId);
    const followed = formerOf(formerIds(), target);
    const peer = resolveDelegate(
      peers,
      followed?.now ?? target,
      instanceId,
      ledBy,
      forkOrigins()
    );
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

  async sendToUser(message: string, attachments?: string[]): Promise<string> {
    if (!sendToUser) {
      throw new Error(
        "Not sent: this hub has no Telegram bridge (CAWCO_TELEGRAM_TOKEN is unset)."
      );
    }
    const refusal = shownRefusal?.("send_to_user", attachments ?? []);
    if (refusal) {
      throw new Error(`${refusal} Nothing was sent.`);
    }
    const problems = await sendToUser(message, attachments ?? []);
    if (problems.length > 0) {
      throw new Error(
        `Not everything reached the user's Telegram. Not sent:\n${problems.map((line) => `- ${line}`).join("\n")}`
      );
    }
    return attachments?.length
      ? `Sent to the user's Telegram, with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`
      : "Sent to the user's Telegram.";
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
});
