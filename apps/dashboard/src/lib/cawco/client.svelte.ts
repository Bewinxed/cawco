/**
 * The browser end of the Envelope spine: one WebSocket to the hub, and each
 * session's transcript as the hub built it — a page fetched once, then the
 * changes its stream carries (NEW.md §6).
 */

import { ASK_USER_QUESTION, RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import type { SendAttachment } from "@cawco/core/attachments";
import { type Bounded, readWithin } from "@cawco/core/bounded";

import { detach } from "@cawco/core/detach";

import type { FramePayload } from "@cawco/core/frames";
import type { MachineHarnessReport } from "@cawco/core/harness";
import type {
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { hubRequest } from "@cawco/core/hub-request";

import type {
  ControlPayload,
  Envelope,
  InstanceRow,
  NamedSpawn,
  SendPayload,
  SpawnPayload,
  StopRequest,
} from "@cawco/core/protocol";

import { questionsOf } from "@cawco/core/question";
import { relaunchOf } from "@cawco/core/relaunch";

import type { PermissionResult } from "@cawco/core/session-messages";

import type { CommandKind, SessionStreamFrame } from "@cawco/core/stream";

import { HOUR_MS } from "@cawco/core/time";
import type { TranscriptBlock } from "@cawco/core/transcript-types";
import { unhandled } from "@cawco/core/unhandled";
import type { UsageLimitsResponse } from "@cawco/core/usage/types";

import { accountsWords } from "@cawco/core/words/accounts";

import { sidebarWords } from "@cawco/core/words/sidebar";

import { SvelteMap } from "svelte/reactivity";
import { CONTROL_TIMEOUT_MS, DISCARD_TIMEOUT_MS } from "#lib/config.js";
import {
  hubFetch,
  hubRefusal,
  failureWords as messageOf,
} from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";

import { currentClientId } from "./client-id";
import { readInstalls, takeInstallsFrame } from "./connect/installs.svelte";

import { devDebug } from "./dev-debug";
import { heardSince } from "./heard";

import {
  type BoardFrame,
  type FrameOf,
  hubOnly,
  onFrame,
  routeFrames,
  takeFrame,
} from "./hub/frames";
import { load } from "./hub/load";
import {
  ask,
  type BenchHub,
  connectionCount,
  connectionState,
  inflight,
  leaveHub,
  ModeUnchosen,
  openHub,
  rereadHub,
  send,
  settle,
  socketOpen,
  standingBench,
  standSocket,
  takeHubRestart,
  wireHub,
} from "./hub/socket.svelte";
import { takeAuthFrame } from "./hub-auth.svelte";
import { instanceForSession } from "./links";
import { notices } from "./notices.svelte";
import { unpickedMode } from "./permission-modes";
import { readPerson, showDeskAlert, takePerson } from "./person.svelte";
import { handlePlanMessage } from "./plan";
import { presenceAgain, presenceClientId } from "./presence";
import { type CommandRefusal, refusals } from "./refusals.svelte";

import { forgetSend, keepSend, keptSends, refuseSend } from "./send-store";
import { checkServedBuild } from "./served-build.svelte";

import { readAccounts } from "./stores/accounts.svelte";
import {
  adoptAskMachine,
  adoptPending,
  asksHeard,
  hearSettled,
  holdActivities,
  takePermissionRequest,
} from "./stores/asks.svelte";
import {
  adoptRows,
  boardState,
  holdMachines,
  instanceIndex,
  type Machine,
  machineConnected,
  patchBoardRows,
  pulses,
  takePulse,
} from "./stores/board.svelte";
import { takeBrowsers } from "./stores/browsers.svelte";
import { loadCatalog, refreshCatalogs } from "./stores/catalog.svelte";
import { takeBoardContinuations } from "./stores/continuations.svelte";
import { hearDelegateEvent, rereadDelegates } from "./stores/delegates.svelte";
import { watchedIds } from "./stores/follows.svelte";
import {
  commandRecord,
  latestCommandFor,
  plugLedger,
  sendFailureNotices,
  streamHost,
  streamState,
} from "./stores/ledger.svelte";
import {
  fleetFetchListeners,
  machineControl,
  takeFleetFetch,
} from "./stores/machines";
import { takeFleetMcp } from "./stores/mcp-servers.svelte";
import { takeBoardMoves, takeMoves } from "./stores/moves.svelte";
import {
  readWaitingActions,
  readWatchNotices,
  takeActions,
  takeArtifactNeeds,
  takeLawsBroken,
  takeQuestionsMoved,
  takeWatchNotices,
} from "./stores/needs.svelte";
import { readProjectOffers, takeProjectOffer } from "./stores/offers.svelte";
import { plansState } from "./stores/plans.svelte";
import {
  takeBoardPreviews,
  takePreview,
  takePreviewSettings,
} from "./stores/previews.svelte";
import {
  keepProjects,
  type ProjectRow,
  projectsLeave,
  projectsState,
  rereadProjects,
  takeProjectCap,
  takeProjectStop,
} from "./stores/projects.svelte";
import { keepRelayJourney, readRelayJourney } from "./stores/relay.svelte";
import { equal, patchRows } from "./stores/same";
import {
  detailsOpen,
  harnessCan,
  persistSettings,
} from "./stores/session-detail.svelte";
import {
  applyPulse,
  clearTurnPhase,
  hydrate,
  type SessionState,
  session,
  sessionsState,
  TOUCH_KINDS,
  touchSession,
  trackWorking,
} from "./stores/sessions.svelte";
import { rereadFollowed } from "./stores/subscriptions.svelte";
import { readTailnetHttps, takeTailnet } from "./stores/tailnet.svelte";
import {
  forgetStarters,
  takeBlocksChanged,
  takeDecisionsChanged,
  takeStarters,
  takeTasksChanged,
} from "./stores/tickers.svelte";
import {
  readBehind,
  readOlderPage,
  readTranscript,
} from "./stores/transcript-reads.svelte";
import {
  addNote,
  applyTranscript,
  place,
  take,
} from "./stores/transcripts.svelte";
import {
  adoptUsageLimits,
  readSpend,
  takeUsage,
  usageState,
} from "./stores/usage.svelte";
import {
  rereadTrays,
  takeWorkItem,
  workItemsState,
} from "./stores/work-items.svelte";
import type { CommandRecord, SettleStage, StreamEffects } from "./stream";
import {
  disarmCommandSweep,
  failLocally,
  handleStreamMessage,
  noteDisconnect,
  resumePendingSends,
  SETTLED_COMMAND_LIMIT,
  SETTLED_COMMAND_TTL_MS,
  submitCommand as submitTrackedCommand,
  subscribeSession,
  sweepCommands,
} from "./stream";
import {
  answeredNote,
  errorMessage,
  localUserMessage,
  withdrawnNote,
} from "./transcript/local";
import { routedToParent } from "./transcript/present";
import { speakerName } from "./transcript/speaker";
import type { Message } from "./types";
import { updates } from "./updates/updates.svelte";

/**
 * Spawns the hub has not answered yet: the request each waits on, by the
 * instance it asked for. The hub refuses one with an error frame under that
 * request, and takes one by opening its row ({@link spawnSession}).
 */
const opening = new Map<string, string>();

// Lets the store be asserted from the console while developing, and a
// bench stand its conversation in as one the hub holds running
// (`adoptInstances`, as a snapshot does) and at work (`frame`, a hub frame
// taken as the socket takes it: a session's pulse lives in the store's own
// `Pulse`s, which no bench can write into `state`).
if (import.meta.env.DEV) {
  devDebug({
    connectionState,
    projectsState,
    sessionsState,
    plansState,
    workItemsState,
    usageState,
    inflight,
    adoptInstances,
    frame: takeFrame,
    standHub,
    leaveHub,
  });
}

/** Stands the page on a bench's hub: the socket closed, the hub said reached (dev only). */
function standHub(answer: BenchHub): void {
  standSocket(answer);
  // What the bench stood in is the fleet as read, live and stored alike.
  boardState.fleetRead = true;
  boardState.liveRead = true;
}

/**
 * Takes the hub's word on what is running — whether it was asked for or pushed.
 * Views this browser opened for a session it did not spawn learn their machine
 * from it, so a snapshot is also how a bare `/session/[id]` fills itself in.
 */
function adoptInstances(rows: InstanceRow[]): void {
  const moved = adoptRows(rows);
  if (!moved) {
    return;
  }
  holdActivities(moved);
  for (const target of Object.values(sessionsState.sessions)) {
    hydrate(target);
  }
}

/**
 * Applies what moved since the hub's last publish: each changed row replaced
 * where it stands (or appended), each gone id dropped. Only the sessions whose
 * rows moved are re-hydrated, and the rows that did not move keep their
 * identity — so the rail, tabs and panes re-render the one row that changed
 * instead of all of them.
 */
function patchInstances(upserts: InstanceRow[], removed: string[]): void {
  const moved = patchBoardRows(upserts, removed);
  if (!moved) {
    return;
  }
  holdActivities(moved);
  for (const row of upserts) {
    const held = sessionsState.sessions[row.id];
    if (held) {
      hydrate(held);
    }
  }
}

/**
 * Registry reads: on connect and again after every reconnect. True once the
 * projects, the one read the board waits on, landed.
 *
 * The machines, sessions, hand-offs and continuations are never read here:
 * the socket's board snapshot carries them, it is the first frame the hub
 * sends every socket, and this runs only once it is applied (`hubReached`).
 * A read of them would be taken after that snapshot and could land after a
 * delta the hub sent later, putting back rows the delta had moved on; the
 * hub sends a row again only when it next changes, so nothing would correct it.
 */
async function refresh(): Promise<boolean> {
  // Same reason as the limits below: the frames that carry spend come once a
  // minute per machine, and a dashboard opened between them has none yet.
  readSpend();
  readAccounts();
  // Off the board's wait: an offer is a quiet card, not part of the fleet.
  readProjectOffers();
  // Approved actions waiting on you: frames keep them from here.
  readWaitingActions();
  // Fleet watch's notices to you: frames keep them from here.
  readWatchNotices();
  // The person's presence: the rail's dot, and Needs you's row for this browser.
  readPerson().catch(() => undefined);
  // HTTPS on the tailnet name: Needs you shows its step while one stands.
  readTailnetHttps();
  // The stream relay's journey: Needs you's row and Settings › Browsers.
  readRelayJourney().catch(() => undefined);
  // What the socket says about asks from here on is newer than the read.
  const readFrom = asksHeard();
  const asked = projectsLeave();
  const { mark } = asked;
  const [projects, pending, usage] = await Promise.all([
    load<ProjectRow[]>(hubRequest("GET /api/projects")),
    load<Envelope<FramePayload>[]>(hubRequest("GET /api/pending")),
    // Read on connect, not only broadcast on change: a dashboard opened
    // between reports has missed the frames.
    load<UsageLimitsResponse>(hubRequest("GET /api/usage/limits")),
  ]);

  if (projects) {
    keepProjects(projects, asked);
  }
  if (usage && !heardSince("usage", mark)) {
    adoptUsageLimits(usage);
  }
  if (pending) {
    adoptPending(pending, readFrom);
  }
  if (projects) {
    boardState.fleetRead = true;
    return true;
  }
  return false;
}

/** The pending re-read of `readFleet`; one chain per socket at most. */
let fleetRetry: ReturnType<typeof setTimeout> | undefined;
/** Bumped by every read and every cancel, so a read still in flight from an
 * older socket cannot schedule a second chain when it lands. */
let fleetChain = 0;

/** A socket that closed, or one about to be replaced, takes its re-read with it. */
function cancelFleetRead(): void {
  clearTimeout(fleetRetry);
  fleetRetry = undefined;
  fleetChain += 1;
}

/**
 * The connect-time read. A deploy restarts the hub and the dashboard together,
 * and the socket can reopen through the dashboard before the hub answers REST:
 * those reads fail, and nothing else would read again until the next reconnect.
 * So while the socket stays open it reads again — 1s, 2s, 4s, 8s, then every
 * 10s — until the board's reads land, and only then asks for the catalogs.
 */
function readFleet(delay = 1000): void {
  cancelFleetRead();
  const chain = fleetChain;
  detach(
    refresh().then((read) => {
      if (chain !== fleetChain) {
        return;
      }
      if (read) {
        refreshCatalogs();
        return;
      }
      if (!socketOpen()) {
        return;
      }
      fleetRetry = setTimeout(
        () => readFleet(Math.min(delay * 2, 10_000)),
        delay
      );
    }),
    "refresh"
  );
}

/**
 * The hub's word on the machines, pushed with every `instances` frame. A
 * machine that comes online after the connect-time read has its stored
 * sessions read now: `refreshCatalogs` only asks the machines that were online
 * when that read landed. A hub restart is the usual case — its daemons take a
 * few seconds to register again, so a dashboard that connects in that window
 * reads every machine offline, and the board's first-read gate
 * (`cawco.catalogsRead`) then waits on catalogs nobody ever asked for.
 */
function adoptMachines(incoming: Machine[]): void {
  const wasOnline = holdMachines(incoming);
  if (wasOnline === null) {
    return;
  }
  const next = boardState.machines;
  // A transcript whose read found its machine offline is read again once the
  // hub says it is online: across a hub restart this tab may never have seen
  // it go, so it is every online machine, not a change of one.
  for (const machine of next) {
    if (machine.status === "online") {
      readBehind(machine.machineId);
    }
  }
  // Before the first read the connect-time `refreshCatalogs` asks them all.
  if (!boardState.fleetRead) {
    return;
  }
  for (const machine of next) {
    if (machine.status === "online" && !wasOnline.has(machine.machineId)) {
      detach(loadCatalog(machine.machineId), "loadCatalog");
    }
  }
}

function takePermissionSettled(frame: FrameOf<"permission_settled">): void {
  // The hub's word that the ask is over, whoever settled it: the card goes,
  // and a read already on its way cannot bring it back.
  hearSettled(frame.requestId);
  const target = sessionsState.sessions[frame.instanceId];
  const parked = target?.pending.find((p) => p.requestId === frame.requestId);
  if (target && parked) {
    target.pending = target.pending.filter(
      (p) => p.requestId !== frame.requestId
    );
    trackWorking(target);
  }
  // Withdrawn, not answered: the composer folds back, and the transcript
  // says why the ask is gone. One the hub could not show anyone was never
  // parked here, and its reason is the only word of it.
  if (target && frame.outcome === "cancelled" && (parked || frame.reason)) {
    const question = parked
      ? questionsOf(parked.toolName, parked.input) !== null
      : frame.toolName === ASK_USER_QUESTION;
    addNote(target, withdrawnNote(frame.instanceId, question, frame.reason));
  }
  // Answered somewhere else while this tab held the card (another tab, the
  // app, a session, the harness): it says what won and where.
  // With an answer of this tab's still out, the winner may be that answer
  // or another device's: the line waits for the hub's word on ours, said
  // if it was refused (`streamEffectsFor`, `permission.answer`).
  if (target && parked && frame.outcome === "answered" && frame.answer) {
    const note = answeredNote(
      frame.instanceId,
      questionsOf(parked.toolName, parked.input) !== null,
      frame.answer,
      speakerName(target.harness)
    );
    if (answeredHere(frame.requestId)) {
      answeredWhileOurs.set(frame.requestId, note);
    } else {
      addNote(target, note);
    }
  }
}

/** The board, whole (`instances`) or as what moved (`instances_delta`), and what rides along with it. */
function takeBoard(frame: BoardFrame): void {
  takeBoardPreviews(frame);
  takeBoardMachines(frame);
  takeBoardContinuations(frame);
  takeBoardMoves(frame);
  takePreviewSettings(frame);
  takeBoardNotices(frame);
  takeBoardRows(frame);
  settleOpenings();
  takeBoardPulses(frame);
}

/**
 * The machines ride along so a daemon registering — the moment its auth
 * state is decided — reaches the rail without a re-fetch.
 */
function takeBoardMachines(frame: BoardFrame): void {
  if (frame.kind === "instances") {
    adoptMachines(frame.agents);
  } else if (frame.agents || frame.removedAgents) {
    adoptMachines(
      patchRows(
        boardState.machines,
        frame.agents ?? [],
        frame.removedAgents ?? [],
        (row) => row.machineId
      )
    );
  }
}

/** The notices acknowledged anywhere, and whether the hub's record of them is whole. */
function takeBoardNotices(frame: BoardFrame): void {
  // The notices acknowledged on any tab or device: one dismissed elsewhere leaves this tab now.
  if (frame.noticesSeen) {
    notices.adopt(frame.noticesSeen);
  }
  // The hub's notices record damaged (notices off), or whole again once reset.
  if (frame.noticesDamaged !== undefined) {
    notices.adoptDamaged(frame.noticesDamaged);
  }
}

/** The board's rows: the snapshot whole, a delta by what moved. */
function takeBoardRows(frame: BoardFrame): void {
  if (frame.kind === "instances") {
    adoptInstances(frame.instances);
    boardState.liveRead = true;
  } else {
    patchInstances(frame.upserts, frame.removed);
  }
}

/** A spawn the hub took is answered by the row it opened. */
function settleOpenings(): void {
  for (const [id, requestId] of opening) {
    if (instanceIndex.byId.has(id)) {
      opening.delete(id);
      settle(requestId, (waiter) => waiter.resolve(undefined));
    }
  }
}

/**
 * Every connection seeds now-state; subsequent changes arrive as pulses.
 * A merge, not a replace: a per-instance `pulse` frame is not ordered
 * against a snapshot the hub took moments before the `instances` frame
 * carrying it left, so whichever pulse actually happened later, by its
 * own `at`, is the one kept.
 */
function takeBoardPulses(frame: BoardFrame): void {
  if (frame.kind !== "instances") {
    return;
  }
  for (const [id, pulse] of Object.entries(frame.pulses)) {
    const held = pulses.get(id);
    if (!held || pulse.at >= held.at) {
      takePulse(id, pulse);
    }
  }
  for (const [id, pulse] of pulses) {
    const held = sessionsState.sessions[id];
    if (held) {
      applyPulse(held, pulse);
    }
  }
  if (!equal(boardState.hubBuild, frame.hubBuild)) {
    boardState.hubBuild = frame.hubBuild;
  }
}

function takePulseFrame(frame: FrameOf<"pulse">): void {
  const previous = pulses.get(frame.instanceId);
  if (previous && previous.at > frame.pulse.at) {
    return;
  }
  // The daemon's coarse now-state, broadcast — this is the whole of what the
  // rail knows about a session this browser has not subscribed to. Field
  // by field: a pulse inside a turn moves its row's time and tool, and
  // wakes no list that files the session by its activity.
  takePulse(frame.instanceId, frame.pulse);
  const held = sessionsState.sessions[frame.instanceId];
  if (held) {
    applyPulse(held, frame.pulse);
  }
}

function takeError(frame: FrameOf<"error">): void {
  const { instanceId, message, modeAsk } = frame;
  if (
    settle(frame.requestId, (waiter) =>
      waiter.reject(modeAsk ? new ModeUnchosen(modeAsk) : new Error(message))
    )
  ) {
    return;
  }
  if (instanceId) {
    const target = session(instanceId);
    // A relaunch that never came up has no init frame to end its wait.
    target.relaunching = false;
    addNote(target, errorMessage(instanceId, message));
  } else {
    console.error("[cawco] hub error:", message);
  }
}

function takeControlResult(frame: FrameOf<"control_result">): void {
  const answered = settle(frame.requestId, (waiter) =>
    frame.ok
      ? waiter.resolve(frame.result, {
          unanswered: frame.unanswered ?? [],
          failed: frame.failed ?? [],
        })
      : waiter.reject(
          new Error(
            frame.error ?? "The machine could not carry out that request."
          )
        )
  );
  if (answered) {
    return;
  }
  // Fire-and-forget controls (interrupt, permission replies) still report failure.
  if (!frame.ok && frame.instanceId) {
    addNote(
      session(frame.instanceId),
      errorMessage(
        frame.instanceId,
        frame.error ?? "The machine could not carry out that request."
      )
    );
  }
}

/** Every kind of frame the socket delivers, routed to what takes it. */
routeFrames([
  onFrame("fleet_mcp", takeFleetMcp),
  onFrame("permission_settled", takePermissionSettled),
  onFrame("preview", takePreview),
  onFrame("instances", takeBoard),
  onFrame("instances_delta", takeBoard),
  onFrame("usage", takeUsage),
  onFrame("work_item", takeWorkItem),
  onFrame("project.cap", takeProjectCap),
  onFrame("actions", takeActions),
  onFrame("hub_auth", takeAuthFrame),
  onFrame("installs", takeInstallsFrame),
  onFrame("fleet_watch.notices", takeWatchNotices),
  onFrame("artifact.needs", takeArtifactNeeds),
  onFrame("laws.broken", takeLawsBroken),
  onFrame("hub.restart", takeHubRestart),
  onFrame("project.stop", takeProjectStop),
  onFrame("projects.changed", rereadProjects),
  // The person's presence, and the machines that count toward it.
  onFrame("person", (frame) => takePerson(frame.person)),
  // Something that needs the person, shown on the desk tab they use.
  onFrame("desk_alert", (frame) => showDeskAlert(frame, instanceIndex)),
  onFrame("browser_list", takeBrowsers),
  // The stream relay's journey moved: every place that draws it follows.
  onFrame("stream_relay.journey", (frame) => keepRelayJourney(frame.journey)),
  onFrame("tailnet.https", takeTailnet),
  onFrame("fleet.fetch", takeFleetFetch),
  onFrame("questions.moved", takeQuestionsMoved),
  onFrame("tasks.changed", takeTasksChanged),
  onFrame("decisions.changed", takeDecisionsChanged),
  onFrame("blocks.changed", takeBlocksChanged),
  onFrame("starters.changed", takeStarters),
  onFrame("project_offer", takeProjectOffer),
  onFrame("pulse", takePulseFrame),
  onFrame("error", takeError),
  onFrame("control_result", takeControlResult),
  // The hub's own record of what a delegate asked and was answered: the reader
  // of this traffic is the parent's delegate card.
  onFrame("delegate_event", (frame) => hearDelegateEvent(frame.event)),
  onFrame("permission_request", takePermissionRequest),
  ...TOUCH_KINDS.map((kind) => onFrame(kind, touchSession)),
  onFrame("moves", takeMoves),
  // A move's progress travels machine → hub only, never as its own frame.
  ...hubOnly("move_progress"),
  // A command's slot wait travels machine → hub only; its item's status carries it.
  ...hubOnly("command_queue"),
  // A borrower's ask for a fresh sign-in travels machine → hub only.
  ...hubOnly("account_borrow"),
  // A stage's change travels machine → hub only; a sheet's pane reads it in the sheet's doc.
  ...hubOnly("stage"),
  // A machine's browsers travel machine → hub only; the hub's browser registry reads them.
  ...hubOnly("browsers"),
  // A take-over the daemon ended itself travels machine → hub only; the hub answers the ask.
  ...hubOnly("browser_handback"),
  // The stream relay's state travels machine → hub only; Settings › Browsers reads the hub's record.
  ...hubOnly("stream_relay"),
  // A place's stage clone travels machine → hub only; the hub files it as a workspace.
  ...hubOnly("stage-clone"),
  // A machine's fleet report and its items' converge travel machine → hub
  // only; screens read the hub's row.
  ...hubOnly("fleet_report", "fleet_converge"),
]);

wireHub({
  take: takeHubMessage,
  onConnect: [
    presenceAgain,
    forgetStarters,
    readFleet,
    () => detach(readInstalls(), "readInstalls"),
    rereadFollowed,
    () => {
      if (connectionCount() > 1) {
        rereadTrays();
        rereadDelegates();
      }
    },
    () => resumePendingSends(streamState, streamHost),
    () => detach(checkServedBuild(), "checkServedBuild"),
    () => detach(updates.loadPolicy(), "loadPolicy"),
  ],
  onClose: [
    cancelFleetRead,
    () => {
      for (const listener of fleetFetchListeners) {
        listener.dropped();
      }
    },
    // Subscriptions, resumes and unanswered commands all died with the socket,
    // and the next one reads every followed transcript again (`rereadFollowed`).
    // With the host, for the same reason the traffic sweep passes it: a socket
    // that dies mid-command must SAY so, not merely record it.
    () => noteDisconnect(streamState, Date.now(), streamHost),
  ],
  onTeardown: [
    // The ledger's ack timer is the one thing here that outlives the socket by
    // design, so it is the one thing a teardown has to cancel by hand — an HMR
    // reload that left it armed would fire a sweep into a module nobody renders.
    () => disarmCommandSweep(streamState, streamHost),
    cancelFleetRead,
  ],
  reread: refresh,
});

plugLedger({
  // A session's own changes arrive only here, sequenced: what the hub's builder
  // made of each frame, and its preview's state. Everything broadcast (the
  // board, pulses, permissions, replies) comes as an envelope (`bind`).
  applyFrame: (sessionId, frame) => {
    const payload = frame as SessionStreamFrame;
    if (payload.kind !== "transcript") {
      takeFrame(payload);
      return;
    }
    const target = session(sessionId);
    applyTranscript(target, payload.events);
    trackWorking(target);
    target.lastActivityAt = new Date();
  },
  follows: (sessionId) => watchedIds().includes(sessionId),
  // The newest page again, which resumes the stream from the `seq` it carries.
  rereadHistory: (sessionId, cause) => {
    detach(readTranscript(sessionId, cause), "readTranscript");
  },
  /**
   * The client half of the ledger's failure port: every command that ever
   * reaches `failed`, on either dialect, is heard exactly once here.
   *
   * The rule is "nothing goes unsaid, and nothing is said TWICE", and never
   * in a toast (DESIGN.md, The Work Outlives Its Surface Rule). A kind whose
   * own surface renders the failure inline claims it; everything else, and
   * every claim whose surface has since vanished, is said over the session's
   * composer ({@link commandFault}), in the error formula, with Try again
   * where a try can go. That way a command kind added next year is loud by
   * default rather than silent by default, which is the failure mode this
   * whole port exists to close.
   */
  noteFailure: (record) => {
    if (record.kind === "send") {
      // A send's failure is said over the composer it left (the session's
      // notice) and on its row — stamped rather than kept only on the command
      // record, which is swept after five minutes, where a message that never
      // sent must not fade back to looking sent. It is never a toast.
      announceSendFailure(record);
      markUnreached(record);
      return;
    }
    // A withdraw is a queued message's edit, and the composer it was edited
    // in says what became of it, over the field that holds the words again
    // (transcript/lift.svelte.ts).
    if (record.kind === "send.withdraw") {
      return;
    }
    // A parked permission card renders its own refusal (`Couldn't send that
    // answer.`) against the very command id it holds. It only does so while it
    // is still on screen: answering removes the request from `pending`, so an
    // answer that fails after the card has gone has no inline surface at all
    // and is said over the composer of the session the card was drawn in:
    // its own, or, for an ask parked under a proposal of its (a memory or
    // design proposal, `originInstanceId`), the session that proposed it.
    if (record.kind === "permission.answer") {
      const surface = answerSurfaces.get(record.commandId);
      if (answerCardStillParked(record)) {
        return;
      }
      sayCommandFault(record, surface?.origin ?? record.sessionId);
      return;
    }
    // Kept for its session (refusals.svelte.ts): a model, effort or mode
    // change is said on the details card's own line for it while that card
    // stands, and over the composer otherwise; anything else over the
    // composer. A reload says it again in the same place.
    sayCommandFault(record);
  },
});

/** The kinds the session's details card asks for, and says the failure of. */
const SETTINGS_KINDS: ReadonlySet<CommandKind> = new Set([
  "set-model",
  "set-effort",
  "set-permission-mode",
]);

/** A reason's closing stop, dropped so it sits inside the sentence. */
const REASON_STOP = /\.$/u;

/**
 * A failed command in the error formula (DESIGN.md, Voice): what did not happen, the
 * hub's why, what stands meanwhile; the way on (Try again, or the control
 * itself) stands beside it. The operator's terms, never the wire's.
 */
function failureNotice(record: CommandRecord): string {
  const why = (record.reason ?? "the hub didn't say why").replace(
    REASON_STOP,
    ""
  );
  switch (record.kind) {
    case "interrupt":
      return `The turn was not stopped: ${why}. It goes on.`;
    case "set-model":
      return `The model was not changed: ${why}. The session keeps the one it runs.`;
    case "set-effort":
      return `The effort was not changed: ${why}. The session keeps the one it runs.`;
    case "set-permission-mode":
      return `The permission mode was not changed: ${why}. The session keeps the one it runs.`;
    case "permission.answer":
      return `Your answer was not sent: ${why}. The ask has since closed, so nothing waits on it.`;
    case "send.withdraw":
      return `The message was not taken back: ${why}. It stays queued.`;
    case "send":
      return `Your message was not sent: ${why}.`;
    default:
      return `That didn't go through: ${why}. (${String(record.kind)})`;
  }
}

/** What a refused command asked, kept with its words, so Try again asks again after a reload. */
interface CommandAsked {
  /** The control's argument: the model, the effort, the mode. */
  arg?: unknown;
  /** When it was refused: the composer says the latest. */
  at: number;
  kind: CommandKind;
  machineId?: string;
}

/** Where a session's refused command of `kind` is kept. */
const commandKey = (sessionId: string, kind: CommandKind | "") =>
  `command:${sessionId}:${kind}`;

/**
 * The same command again, as it went: its kind, its machine and what it
 * asked. None for an answer, whose ask has gone, or for a command that
 * never got an envelope.
 */
function againOf(
  sessionId: string,
  asked: CommandAsked
): (() => void) | undefined {
  const { machineId, arg } = asked;
  if (!machineId) {
    return;
  }
  switch (asked.kind) {
    case "interrupt":
      return () => {
        submitCommand(sessionId, machineId, "interrupt", {});
      };
    case "set-model":
      return () => {
        submitCommand(sessionId, machineId, "set-model", {
          model: arg as string,
        });
      };
    case "set-effort":
      return () => {
        submitCommand(sessionId, machineId, "set-effort", {
          effort: arg as EffortLevel,
        });
      };
    case "set-permission-mode":
      return () => {
        submitCommand(sessionId, machineId, "set-permission-mode", {
          mode: arg as PermissionMode,
        });
      };
    // An answer's ask has gone; a send says itself on its row and composer.
    case "permission.answer":
    case "send.withdraw":
    case "send":
      return;
    default:
      unhandled("Try again command kind", asked.kind);
  }
}

/** A refused command's words and its Try again, where its session says it. */
export interface CommandFault {
  again?: () => void;
  kind: CommandKind;
  words: string;
}

const faultOf = (sessionId: string, said: CommandRefusal): CommandFault => {
  const asked = said.asked as CommandAsked;
  return {
    kind: asked.kind,
    words: said.reason,
    again: againOf(sessionId, asked),
  };
};

/**
 * What `instanceId`'s composer says of a refused command: the latest one
 * no details card is saying, over the field, with Try again, until the
 * next command of that session goes. Kept through a reload.
 */
export function commandFault(instanceId: string): CommandFault | null {
  const shown = detailsOpen.has(instanceId);
  const [latest] = refusals
    .under(commandKey(instanceId, ""))
    .filter(
      ([, said]) =>
        !(shown && SETTINGS_KINDS.has((said.asked as CommandAsked).kind))
    )
    .toSorted(
      ([, a], [, b]) =>
        (b.asked as CommandAsked).at - (a.asked as CommandAsked).at
    );
  return latest ? faultOf(instanceId, latest[1]) : null;
}

/** What a session's details card says of its refused `kind` change, under that control. */
export function settingFault(
  instanceId: string,
  kind: CommandKind
): CommandFault | null {
  const said = refusals.get(commandKey(instanceId, kind));
  return said ? faultOf(instanceId, said) : null;
}

/**
 * What each control command asked, by command id, from its submit: the
 * ledger lets a record's envelope go once it settles, before its failure
 * is noted, and Try again needs the machine and the argument.
 */
const controlAsks = new Map<string, { arg?: unknown; machineId: string }>();

/** Keeps what a control command asked, dropping what settled long ago. */
function rememberControlAsk(
  commandId: string,
  machineId: string,
  arg?: unknown
): void {
  for (const known of [...controlAsks.keys()]) {
    if (!streamState.commands[known]) {
      controlAsks.delete(known);
    }
  }
  controlAsks.set(commandId, { arg, machineId });
}

function sayCommandFault(
  record: CommandRecord,
  /** The session whose composer says it: the command's own, unless its card stood in another's. */
  sessionId = record.sessionId
): void {
  const asked = controlAsks.get(record.commandId);
  controlAsks.delete(record.commandId);
  refusals.set(commandKey(sessionId, record.kind), {
    reason: failureNotice(record),
    asked: {
      at: Date.now(),
      arg: asked?.arg,
      kind: record.kind,
      machineId:
        asked?.machineId ?? instanceIndex.byId.get(sessionId)?.machineId,
    } satisfies CommandAsked,
  });
}

/** A new command of the session answers what was said of its last ones. */
function clearCommandFaults(instanceId: string): void {
  for (const [key] of refusals.under(commandKey(instanceId, ""))) {
    refusals.delete(key);
  }
}

/**
 * A send whose command the hub never took — the socket was down, went down,
 * or no answer came: this tab's row for it did not go, with why, and offers
 * Try again and Edit. A send the hub has a record of is not this tab's to
 * say anything about (its row is the record's), and neither is a retry of a
 * failed send, which draws no row of its own until the hub takes it.
 */
function markUnreached(record: CommandRecord): void {
  const target = sessionsState.sessions[record.sessionId];
  const row = target?.local.find((message) => message.id === record.commandId);
  if (!(target && row)) {
    return;
  }
  row.state = "unreached";
  row.metadata = {
    ...row.metadata,
    sendFailed: record.reason ?? "The hub never took it.",
  };
  target.rev += 1;
}

/**
 * Whether the card that asked is still on screen to render its own refusal.
 * The link is kept here because the wire payload correlates on the PERMISSION's
 * request id while the ledger correlates on the COMMAND's — nothing else joins
 * the two.
 */
const answerSurfaces = new Map<
  string,
  {
    instanceId: string;
    /** The session a proposal's card is drawn in (`originInstanceId`), when it is not `instanceId`. */
    origin?: string;
    requestId: string;
  }
>();

/**
 * Kept only as long as the ledger keeps the record it belongs to: an answer
 * that succeeded is never asked about again, so its link would otherwise be a
 * slow leak on the busiest control path there is.
 */
function rememberAnswerSurface(
  commandId: string,
  instanceId: string,
  requestId: string
): void {
  for (const known of [...answerSurfaces.keys()]) {
    if (!streamState.commands[known]) {
      answerSurfaces.delete(known);
    }
  }
  for (const [asked, known] of [...answers]) {
    if (!streamState.commands[known]) {
      answers.delete(asked);
    }
  }
  const origin = sessionsState.sessions[instanceId]?.pending.find(
    (parked) => parked.requestId === requestId
  )?.originInstanceId;
  answerSurfaces.set(commandId, {
    instanceId,
    requestId,
    ...(origin ? { origin } : {}),
  });
}

/**
 * Whether a card holding this command is STILL RENDERED, re-derived from the
 * same predicate the pane renders by rather than from anything this file
 * wishes were true — `session.pending`, minus the delegate asks a parent's
 * queue filters out (`parked` in SessionPane; `routedToParent` in
 * transcript/present.ts).
 *
 * Checked against both dialects, because they answer it differently and both
 * answers are right:
 *
 * - LEGACY. The control dialect puts the answer on the wire and clears
 *   `pending` only afterwards, so a socket that throws leaves the card exactly
 *   where it was. The card renders "Couldn't send that answer." off the very
 *   record that failed — so this returns true and the composer stays quiet. That
 *   is the double report this rule exists to prevent, and it only works
 *   because the surface is now registered BEFORE the submit that can fail
 *   inside it; registered afterwards there was nothing here to find.
 * - STREAM. The answer's effect clears `pending` only once the hub has taken
 *   it, so a refused answer leaves the ask parked: the session's card and the
 *   Needs row (`answerFor`) both read the refusal off the record, and this
 *   returns true. It returns false only when the ask has gone some other way
 *   meanwhile, and then the composer's line is the report.
 */
function answerCardStillParked(record: CommandRecord): boolean {
  const surface = answerSurfaces.get(record.commandId);
  answerSurfaces.delete(record.commandId);
  if (!surface) {
    return false;
  }
  return (
    sessionsState.sessions[surface.instanceId]?.pending.some(
      (parked) =>
        parked.requestId === surface.requestId && !routedToParent(parked)
    ) ?? false
  );
}

/** The last command sweep, so a busy socket does not re-scan the tracker per frame. */
let lastSweep = 0;

/**
 * Ages the command tracker on inbound traffic rather than on a timer: a
 * connected dashboard receives a pulse about once a second, and a dashboard
 * receiving nothing at all is one whose disconnect has already called its
 * commands off.
 */
function sweepOnTraffic(): void {
  const now = Date.now();
  if (now - lastSweep < 1000) {
    return;
  }
  lastSweep = now;
  // With the host: a sweep without it fails records that
  // {@link StreamHost.noteFailure} never hears about — silence, by omission.
  sweepCommands(streamState, now, streamHost);
  // The outbox ages on the same beat as the ledger it shadows. Pruning only
  // when a NEW send arrives — which is what it did — meant a Try again could
  // outlive the payload behind it by however long the operator stayed quiet.
  pruneOutbox();
}

/**
 * The last answer sent to each parked ask, by the ask's request id: any
 * surface showing the ask (its session's card, its Needs row) reads that
 * answer's stage, whichever of them sent it. Kept as long as the ledger
 * keeps the record.
 */
const answers = new SvelteMap<string, string>();

/** The record of the last answer sent to the ask `requestId`, if the ledger still keeps it. */
export function answerFor(requestId: string): CommandRecord | null {
  const commandId = answers.get(requestId);
  return commandId ? commandRecord(commandId) : null;
}

/**
 * The "Already answered" line of an ask that settled while an answer of this
 * tab's to it was still out, by request id: said if the hub refuses ours (it
 * lost to another device), dropped once ours is the one applied.
 */
const answeredWhileOurs = new Map<string, Message>();

/** Whether this tab answered the ask `requestId` itself, with an answer the hub has not refused. */
function answeredHere(requestId: string): boolean {
  const record = answerFor(requestId);
  return record !== null && record.stage !== "failed";
}

/** What each command kind carries, in the shape the caller already has to hand. */
export interface CommandIntents {
  interrupt: Record<string, never>;
  "permission.answer": { requestId: string; result: PermissionResult };
  /** `replaces`: the failed send this one retries, which the hub then retires. */
  send: { text: string; extras?: SendExtras; replaces?: string };
  /**
   * Takes back a queued or failed send. `replace`: the words that go in its
   * place once it is withdrawn (a queued message's edit), under
   * `replacementId`, known before it goes so the words can fly into its row;
   * none, the message is removed (Remove from queue, a failed send's Remove).
   */
  "send.withdraw": {
    sendId: string;
    replace?: {
      extras: SendExtras;
      replacement: string;
      replacementId: string;
    };
  };
  "set-effort": { effort: EffortLevel };
  "set-model": { model: string };
  "set-permission-mode": { mode: PermissionMode };
}

/**
 * The wire payload for a kind: exactly what the hub's relay operation for it
 * takes. `requestId` is the command id — the correlation the control path
 * already has, reused rather than a second one invented alongside it.
 */
function wirePayload<K extends CommandKind>(
  kind: K,
  instanceId: string,
  commandId: string,
  intent: CommandIntents[K]
): SendPayload | ControlPayload | { sendId: string } {
  const controlPayload = (method: string, args: unknown[]): ControlPayload => ({
    instanceId,
    requestId: commandId,
    method,
    args,
  });
  switch (kind) {
    case "send.withdraw":
      return { sendId: (intent as CommandIntents["send.withdraw"]).sendId };
    case "send": {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      // The command's id is the message's: one identity from the press on. A
      // retry names the failed send it stands in for.
      return {
        instanceId,
        message: {
          ...userMessage(text, commandId),
          ...(replaces ? { replaces } : {}),
        },
        ...extras,
      };
    }
    case "permission.answer": {
      const { requestId, result } =
        intent as CommandIntents["permission.answer"];
      return {
        instanceId,
        requestId,
        method: RESOLVE_PERMISSION,
        args: [requestId, result],
      };
    }
    case "interrupt":
      return controlPayload("interrupt", []);
    case "set-model":
      return controlPayload("setModel", [
        (intent as CommandIntents["set-model"]).model,
      ]);
    case "set-permission-mode":
      return controlPayload("setPermissionMode", [
        (intent as CommandIntents["set-permission-mode"]).mode,
      ]);
    case "set-effort":
      return controlPayload("setEffort", [
        (intent as CommandIntents["set-effort"]).effort,
      ]);
    default:
      // A kind the contract grew and this map did not. Loud rather than
      // silently dispatched as whatever the last branch happened to be.
      throw new Error(`No wire payload for command kind ${String(kind)}.`);
  }
}

/**
 * Submits an operator action as an acknowledged transaction and returns the id
 * its stages are readable under ({@link commandRecord},
 * {@link latestCommandFor}). The envelope goes to the hub and the hub's acks
 * move the stages, so nothing local is fabricated on the way.
 */
export function submitCommand<K extends CommandKind>(
  instanceId: string,
  machineId: string,
  kind: K,
  intent: CommandIntents[K],
  /**
   * Minted by the caller when it has to know the id before the command goes
   * out — the composer, whose text flies into the row a send's id keys.
   * Otherwise minted here, FIRST, before anything that can throw, so there is
   * an id to fail under.
   */
  commandId = newId()
): string {
  // A bench's hub answers it in place of the wire (dev only).
  const bench = standingBench();
  if (import.meta.env.DEV && bench) {
    bench(instanceId, kind, intent);
    return commandId;
  }
  // Everything below either reaches the ledger or becomes a record in it;
  // nothing reaches the caller as an exception.
  const settlesAt = SETTLES_AT[kind];
  // A new command answers what was said of the last ones.
  clearCommandFaults(instanceId);
  if (SETTINGS_KINDS.has(kind) || kind === "interrupt") {
    const { model, effort, mode } = intent as Partial<
      CommandIntents["set-model"] &
        CommandIntents["set-effort"] &
        CommandIntents["set-permission-mode"]
    >;
    rememberControlAsk(commandId, machineId, model ?? effort ?? mode);
  }

  // REGISTERED BEFORE ANYTHING THAT CAN FAIL, and that ordering is the whole
  // point of these two lines being here rather than after the submit.
  //
  // `noteFailure` fires SYNCHRONOUSLY from inside the ledger — a refused
  // dispatch, a payload that could not be built —
  // so anything the failure reporter needs in order to know who owns the
  // failure has to already exist when the submit is called. Registered
  // afterwards, as these were, the reporter saw an empty registry on every
  // synchronous failure and announced a toast for a failure a card was
  // already rendering: one failure, two reports. And the outbox, written
  // afterwards, held nothing at all when the throw happened before the wire —
  // the operator got a toast and their typed words were gone, which is the
  // original defect wearing a different hat.
  if (kind === "send") {
    const { text, extras, replaces } = intent as CommandIntents["send"];
    rememberSend(commandId, instanceId, machineId, text, extras ?? {});
    // Kept past a reload too, until it settles (send-store.ts).
    keepSend({
      at: Date.now(),
      commandId,
      extras: extras ?? {},
      instanceId,
      machineId,
      text,
      ...(replaces ? { replaces } : {}),
    }).catch((error: unknown) =>
      console.warn(`[cawco] send ${commandId} not kept for a reload`, error)
    );
  }
  if (kind === "permission.answer") {
    const { requestId } = intent as CommandIntents["permission.answer"];
    rememberAnswerSurface(commandId, instanceId, requestId);
    answers.set(requestId, commandId);
  }

  let payload: object;
  let effects: StreamEffects | undefined;
  try {
    // `provenance` rides inside the payload rather than as a new envelope field —
    // CommandEnvelope.payload is already `unknown` on the wire, so this needs no
    // protocol change, and the hub's `command()` spreads it straight through to
    // `relaySend` untouched. No `viewId` here — it would just repeat the
    // envelope's own `instanceId`. `clientId` is this page's; `presenceId` is
    // the tab's presence (presence.ts), whose log says what it had in front,
    // so a send is read against what its own tab showed.
    const provenance = {
      clientId: currentClientId(),
      presenceId: presenceClientId(),
    };
    payload = {
      ...(wirePayload(kind, instanceId, commandId, intent) as object),
      provenance,
    };
    effects = streamEffectsFor(instanceId, kind, intent, commandId);
  } catch (error) {
    // THE CONTRACT THIS FUNCTION SHARES WITH THE LEDGER: it never throws.
    //
    // `submitCommand` in stream.ts documents "never throws: the stage IS the
    // report" — but the assembly above runs BEFORE that function is reached,
    // and a throw here escapes the ledger entirely. That is not hypothetical:
    // `currentClientId()` reached `crypto.randomUUID`, which does not exist on
    // a plain-http origin, so every operator action on a tailnet address threw
    // out of this line and vanished. Converting the throw into a failed record
    // makes the whole CLASS impossible — a bug in payload assembly is now a
    // failed command wearing its own exception, for all six kinds, instead of
    // a dead composer.
    //
    // The row goes in FIRST, and only here: on every other path the effects'
    // `submitted` draws it, and that did not run. Without it a
    // payload-assembly bug leaves the reason with no row to stamp, no Try
    // again, and no Edit — recoverable text
    // nobody can reach. It is wrapped because it is the one thing left that
    // could throw, and a throw from a catch block is the silence this whole
    // function exists to abolish.
    if (kind === "send") {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      try {
        noteSendSubmitted(instanceId, text, extras ?? {}, commandId, replaces);
      } catch {
        // The composer's notice is then the whole report, which is a worse
        // outcome than a failed ghost but an infinitely better one than nothing.
      }
    }
    return failLocally(
      streamState,
      streamHost,
      { commandId, sessionId: instanceId, kind, settlesAt },
      messageOf(error)
    );
  }

  const id = submitTrackedCommand(streamState, streamHost, {
    commandId,
    // NOTE: carries instanceId, not a harness session id.
    sessionId: instanceId,
    machineId,
    kind,
    settlesAt,
    payload,
    streamEffects: effects,
  });
  return id;
}

/**
 * Where each kind's protocol stops talking. Declared once, here, because the
 * question "what is this kind's last word?" has exactly one right answer per
 * kind and re-deriving it at each call site is how a delivered message gets
 * retro-declared a failure. See {@link SettleStage}: the hub answers a `send`
 * with `accepted` and never with `applied`; the control kinds get a second
 * word when their `control_result` comes back.
 */
const SETTLES_AT: Record<CommandKind, SettleStage> = {
  "send.withdraw": "applied",
  send: "accepted",
  "permission.answer": "applied",
  interrupt: "applied",
  "set-model": "applied",
  "set-permission-mode": "applied",
  "set-effort": "applied",
};

/* ---- the outbox: what makes a refused send recoverable ----------------- */

/** One unsent message, whole — the payload a retry needs and the echo cannot hold. */
interface OutboxEntry {
  at: number;
  extras: SendExtras;
  instanceId: string;
  machineId: string;
  text: string;
}

/**
 * Every send this tab has dispatched and not yet seen taken, with its FULL
 * payload.
 *
 * The transcript echo is not enough to resend from: `localUserMessage` keeps
 * attachments as name+length and images as display data URIs — a deliberate
 * thumbnail economy — so a retry built from the echo would quietly drop what
 * was attached. The bytes live here instead, and only here.
 *
 * Bounds are OUR CHOICE, deliberately aligned to the ledger's own
 * ({@link SETTLED_COMMAND_LIMIT} = 50, {@link SETTLED_COMMAND_TTL_MS} = 5min):
 * an entry whose record the sweep has already forgotten can no longer be
 * offered a Try again, so retaining it past that point is dead weight holding
 * base64 image data alive.
 */
const sendOutbox = new Map<string, OutboxEntry>();

/**
 * Bumped on every mutation of the Map above, and read by {@link canResend}.
 *
 * A plain Map is not reactive, and the affordance it backs has to DISAPPEAR
 * the moment the payload behind it is pruned. Rendered off the Map alone,
 * "Try again" and "Edit" were painted once — when the failure landed — and
 * then kept standing after the outbox had aged the payload out five minutes
 * later, so pressing either did nothing at all and said nothing about it.
 * A dead button is a silent failure with a cursor on it. This is the cheapest
 * honest fix: one number, rather than deep-proxying every base64 image in the
 * outbox through `$state` just to be told when a key was deleted.
 */
let outboxVersion = $state(0);

/**
 * Whether a failed send can still actually be re-sent or edited — i.e. whether
 * the full payload (attachments and image bytes included, which the transcript
 * echo does not keep) is still in hand. The row asks before offering the
 * affordance, so the answer is "no button" rather than "a button that lies".
 */
function canResend(commandId: string): boolean {
  // Reading the version is what subscribes the caller's `$derived` to the Map.
  return outboxVersion >= 0 && sendOutbox.has(commandId);
}

function rememberSend(
  commandId: string,
  instanceId: string,
  machineId: string,
  text: string,
  extras: SendExtras
): void {
  sendOutbox.set(commandId, {
    instanceId,
    machineId,
    text,
    extras,
    at: Date.now(),
  });
  outboxVersion += 1;
  pruneOutbox();
}

/**
 * Drops what can no longer be retried: anything the hub has taken custody of
 * (the daemon holds the real payload from `accepted` on), anything whose record
 * the ledger has already forgotten, and anything older or more numerous than
 * the ledger's own bounds. A `failed` entry is the one thing kept — that is the
 * entry Try again and Edit exist for.
 */
function pruneOutbox(): void {
  const before = sendOutbox.size;
  const now = Date.now();
  for (const [commandId, entry] of sendOutbox) {
    const record = streamState.commands[commandId];
    if (record?.stage === "submitted") {
      continue;
    }
    const stale = now - entry.at >= SETTLED_COMMAND_TTL_MS;
    // A MISSING record is not evidence of anything and must not be read as
    // custody. The entry is now written before the submit that creates the
    // record — it has to be, or a throw during payload assembly leaves nothing
    // to recover — so for one instant every fresh entry has no record, and
    // treating that as "the hub has it" deleted the payload the moment it was
    // stored. The absent-record case is covered by `stale` anyway: a record the
    // ledger has already forgotten is at least as old as the TTL below.
    const taken = record ? record.stage !== "failed" : false;
    if (stale || taken) {
      sendOutbox.delete(commandId);
    }
  }
  if (sendOutbox.size > SETTLED_COMMAND_LIMIT) {
    const oldest = [...sendOutbox.entries()]
      .filter(([id]) => streamState.commands[id]?.stage !== "submitted")
      .sort((a, b) => a[1].at - b[1].at);
    for (const [commandId] of oldest.slice(
      0,
      Math.max(0, oldest.length - SETTLED_COMMAND_LIMIT)
    )) {
      sendOutbox.delete(commandId);
    }
  }
  // Only when something actually went, so the common no-op sweep does not
  // invalidate every row's derivation once a second.
  if (sendOutbox.size !== before) {
    outboxVersion += 1;
  }
}

/** Removes the row a send that never reached the hub left behind. */
function dropSendEcho(instanceId: string, commandId: string): void {
  const target = sessionsState.sessions[instanceId];
  if (!target) {
    return;
  }
  target.local = target.local.filter((message) => message.id !== commandId);
  place(target);
}

/**
 * Sends again, from the outbox, a message that never reached the hub — under
 * its own uuid, on its own row, which goes back to sending where it stands.
 * The uuid is what makes it safe: a hub that did take the first one after
 * all has its record, answers with that, and hands the machine nothing twice.
 * No-op if the outbox entry has aged out. Never throws.
 */
export function retrySend(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  // Through `submitCommand`, not around it: a new command record under the
  // same id, whose stages the row reads.
  submitCommand(
    entry.instanceId,
    entry.machineId,
    "send",
    { text: entry.text, extras: entry.extras },
    commandId
  );
}

/**
 * The retry out for each failed send, by that send's uuid: the command its
 * row reads for whether the retry is still on its way, or did not go either.
 */
const retries = $state<Record<string, string>>({});

/** The command retrying the failed send `uuid`, while this tab knows of one. */
export function retryOf(uuid: string): CommandRecord | null {
  const commandId = retries[uuid];
  return commandId ? commandRecord(commandId) : null;
}

/**
 * What a sent row carried, as a send carries it again: its texts, and its
 * files by the hub's reference (a row drawn from the hub's record names
 * every file it carried by one).
 */
function resentAttachments(message: Message): SendPayload["attachments"] {
  return message.metadata?.attachments?.flatMap<SendAttachment>(
    (attachment) => {
      if (attachment.kind === "text") {
        return [attachment];
      }
      const { name, mediaType, size, ref } = attachment;
      return ref ? [{ kind: "file" as const, name, mediaType, size, ref }] : [];
    }
  );
}

/**
 * A failed send as a send carries it — its words, texts, files and pictures,
 * from its record — for sending it again or starting a session with it.
 */
export async function failedSendPayload(
  message: Message
): Promise<{ text: string; extras: SendExtras }> {
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  return {
    text: message.content,
    extras: { attachments: resentAttachments(message), images },
  };
}

/**
 * Sends again, as a new send that replaces it, a send the hub failed — from
 * any screen, after any reload: the words and pictures are the row's own,
 * from its record. The hub retires the failed one (`replaced`) as it takes
 * this one, and every screen folds the old row away as the new one arrives.
 */
export async function retryFailed(message: Message): Promise<void> {
  const { text, extras } = await failedSendPayload(message);
  retries[message.id as string] = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send",
    { text, extras, replaces: message.id }
  );
}

/** A picture's bytes as a send carries them: base64, with no `data:` prefix. */
async function imageBytes(
  src: string,
  mediaType: string
): Promise<{ mediaType: string; data: string }> {
  if (src.startsWith("data:")) {
    return { mediaType, data: src.slice(src.indexOf(",") + 1) };
  }
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return { mediaType, data: btoa(binary) };
}

/**
 * Hand a failed message's payload back to the composer for editing: drops the
 * failed echo, writes { text, extras } into the session's restore slot. The
 * pane consumes the slot in an $effect (binding `draft` and calling
 * Composer.restore(extras)) and clears it. No-op if the outbox entry is gone.
 * Never throws.
 */
export function restoreDraft(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  sendOutbox.delete(commandId);
  outboxVersion += 1;
  forgetSend(commandId).catch(() => undefined);
  dropSendEcho(entry.instanceId, commandId);
  restoreComposer(entry.instanceId, entry.text, entry.extras);
}

/**
 * The sends an earlier load of this page kept and the hub never took
 * (send-store.ts), sent again under their own ids, oldest first, as this
 * page starts: each draws its row again and waits, as any send does, for
 * the socket (`resumePendingSends`). The hub takes a repeat of an id as
 * the same send. One the hub refused is drawn refused again, in its words,
 * with Try again and Edit, and goes only when the person sends it; past
 * the time those stand (the ledger's own), it is let go.
 */
async function resumeKeptSends(): Promise<void> {
  for (const kept of await keptSends()) {
    if (streamState.commands[kept.commandId]) {
      continue;
    }
    if (kept.refused) {
      if (Date.now() - kept.refused.at >= SETTLED_COMMAND_TTL_MS) {
        forgetSend(kept.commandId).catch(() => undefined);
        continue;
      }
      rememberSend(
        kept.commandId,
        kept.instanceId,
        kept.machineId,
        kept.text,
        kept.extras
      );
      noteSendSubmitted(
        kept.instanceId,
        kept.text,
        kept.extras,
        kept.commandId,
        kept.replaces
      );
      failLocally(
        streamState,
        streamHost,
        {
          commandId: kept.commandId,
          sessionId: kept.instanceId,
          kind: "send",
          settlesAt: SETTLES_AT.send,
        },
        kept.refused.reason
      );
      continue;
    }
    submitCommand(
      kept.instanceId,
      kept.machineId,
      "send",
      {
        text: kept.text,
        extras: kept.extras,
        ...(kept.replaces ? { replaces: kept.replaces } : {}),
      },
      kept.commandId
    );
  }
}

function restoreComposer(
  instanceId: string,
  text: string,
  extras: SendExtras
): void {
  // Exactly one slot is ever waiting. A slot holds the whole payload — base64
  // image data included — and it is only ever emptied by the pane that mounts
  // to consume it, so an "Edit" pressed on a session the reader then closes
  // would otherwise pin those bytes for the life of the tab. Keeping only the
  // newest bounds it at one without needing anyone to come back and collect.
  for (const held of Object.keys(restoreSlots)) {
    if (held !== instanceId) {
      delete restoreSlots[held];
    }
  }
  restoreSlots[instanceId] = { text, extras };
}

/** A pending send can be taken back only from a harness that queues sends. */
export function canWithdraw(message: Message): boolean {
  return (
    message.state === "pending" &&
    traitsOf(sessionsState.sessions[message.instanceId]?.harness).queuesSends
  );
}

/**
 * Puts new words in place of a queued send: withdraws it, and once the hub
 * says it was withdrawn, sends the words with its pictures and files. Returns
 * the withdraw's command id, whose record says how it went (`applied` with
 * the outcome `withdrawn`, or the session read the send first), and the id
 * the replacement goes out under.
 */
export async function replaceQueued(
  message: Message,
  replacement: string
): Promise<{ withdraw: string; replacement: string }> {
  if (!canWithdraw(message)) {
    throw new Error("This message can no longer be edited in the queue.");
  }
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  const replacementId = newId();
  const withdraw = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send.withdraw",
    {
      sendId: message.id,
      replace: {
        extras: {
          attachments: resentAttachments(message),
          images,
        },
        replacement,
        replacementId,
      },
    }
  );
  return { withdraw, replacement: replacementId };
}

/**
 * Takes a queued send out of the queue, or a failed send out of the
 * conversation, with nothing in its place. Returns the withdraw's command id,
 * whose record says how it went: `applied` with the outcome `withdrawn` (its
 * row folds away on every screen), or the session read it first.
 */
export function removeSend(message: Message): string {
  return submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send.withdraw",
    { sendId: message.id }
  );
}

/**
 * Lets go of a send that never reached the hub, from this tab's outbox and
 * its row: nothing of it was ever said. Never throws.
 */
export function discardUnreached(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (entry) {
    sendOutbox.delete(commandId);
    outboxVersion += 1;
    dropSendEcho(entry.instanceId, commandId);
  }
  forgetSend(commandId).catch(() => undefined);
}

/**
 * A failed send's words, texts, files and pictures back in its session's
 * composer to be written again, and the failed send taken out of the
 * conversation: the composer holds it now. Its pictures are read from the
 * hub first; one that can't be read throws, and nothing moves.
 */
export async function editFailed(message: Message): Promise<string> {
  const { text, extras } = await failedSendPayload(message);
  restoreComposer(message.instanceId, text, extras);
  return removeSend(message);
}

/** One action table for every surface that draws the reader's own turns. */
export function userTurnActions(message: Message): {
  edit: "queued" | "resend" | "restore" | null;
  fork: boolean;
  retry: boolean;
} {
  const target = sessionsState.sessions[message.instanceId];
  if (!target || message.type !== "user") {
    return { edit: null, fork: false, retry: false };
  }
  const delivered =
    message.type === "user" &&
    machineConnected(target.machineId) &&
    !!target.sessionId &&
    harnessCan(target, "rewind") &&
    rewindableTurns(target).has(message.id);
  const table = {
    pending: {
      edit: canWithdraw(message) ? ("queued" as const) : null,
      fork: false,
      retry: false,
    },
    sending: { edit: null, fork: false, retry: false },
    failed: { edit: null, fork: false, retry: true },
    unreached: {
      edit: canResend(message.id) ? ("restore" as const) : null,
      fork: false,
      retry: canResend(message.id),
    },
    cancelled: { edit: null, fork: false, retry: false },
    read: {
      edit:
        delivered && !target.busy && !target.relaunching
          ? ("resend" as const)
          : null,
      fork: delivered && harnessCan(target, "fork"),
      retry: false,
    },
  };
  return table[message.state ?? "read"];
}

/**
 * What a pane owes its composer, per session. A slot rather than a call
 * because the row that offers "Edit" is two components away from the state
 * that holds the draft — the store is the only channel they share, and
 * threading a prop through the transcript for this would make the transcript a
 * conduit for something it has no part in.
 */
const restoreSlots = $state<
  Record<string, { text: string; extras: SendExtras } | null>
>({});

/** The payload waiting to go back into this session's composer, if any. */
export function pendingRestore(
  instanceId: string
): { text: string; extras: SendExtras } | null {
  return restoreSlots[instanceId] ?? null;
}

/** Consumed exactly once by the pane that took it. */
export function clearRestore(instanceId: string): void {
  restoreSlots[instanceId] = null;
}

function announceSendFailure(record: CommandRecord): void {
  // A notice is a sentence about a session, so it dies with the session. These
  // are small, but "small and unbounded" is still unbounded on a board a
  // reader leaves open for a week.
  for (const held of Object.keys(sendFailureNotices)) {
    if (held !== record.sessionId && !sessionsState.sessions[held]) {
      delete sendFailureNotices[held];
    }
  }
  sendFailureNotices[record.sessionId] = record.reason
    ? `Message not sent: ${record.reason}`
    : "Message not sent.";
}

/**
 * The LOCAL half of each command kind — everything around the wire call. Only
 * the envelope goes out, and skipping the local half is how a sent message
 * ended up with no row until the hub answered, an answered permission stayed
 * on screen, and a stopped session kept reading "working". These closures are
 * that half, run by the tracker at the submit and settle transitions.
 *
 * Honest gap, carried to protocol v2: a command does not revive a dead
 * session — it fails with the hub's own reason instead. The revive belongs on
 * the hub side of the command, not in every client.
 */
function streamEffectsFor<K extends CommandKind>(
  instanceId: string,
  kind: K,
  intent: CommandIntents[K],
  commandId: string
): StreamEffects | undefined {
  const target = session(instanceId);
  switch (kind) {
    case "send.withdraw": {
      const { sendId, replace } = intent as CommandIntents["send.withdraw"];
      return {
        settled: (stage) => {
          if (
            stage === "applied" &&
            commandRecord(commandId)?.outcome === "withdrawn"
          ) {
            const block = target.messages.find(
              (message) => message.id === sendId
            );
            if (block) {
              take(target, block as TranscriptBlock, "removed");
              place(target);
            }
            if (replace) {
              submitCommand(
                instanceId,
                target.machineId,
                "send",
                {
                  text: replace.replacement,
                  extras: replace.extras,
                  replaces: sendId,
                },
                replace.replacementId
              );
            }
          }
        },
      };
    }
    case "send": {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      // The row is keyed by the id of the command it IS, which is the whole
      // join between a rendered message and the ledger's word on it.
      return {
        submitted: () =>
          noteSendSubmitted(
            instanceId,
            text,
            extras ?? {},
            commandId,
            replaces
          ),
        // Taken: no reload sends it again. Refused: kept with the hub's
        // words, so a reload draws it refused, Try again and Edit standing.
        settled: (stage, reason) => {
          (stage === "failed"
            ? refuseSend(commandId, reason ?? "The hub refused it.")
            : forgetSend(commandId)
          ).catch(() => undefined);
        },
      };
    }
    case "interrupt":
      return {
        submitted: () => {
          target.busy = false;
          clearTurnPhase(target);
          trackWorking(target);
        },
      };
    case "permission.answer": {
      const { requestId } = intent as CommandIntents["permission.answer"];
      // The ask stands, its pressed answer pending, until the hub has taken
      // the answer; refused, it stands still, the refusal under its buttons
      // (the session's card, the Needs row), and can be answered again.
      return {
        settled: (stage) => {
          const elsewhere = answeredWhileOurs.get(requestId);
          answeredWhileOurs.delete(requestId);
          if (stage === "failed") {
            // The hub refused ours after the ask settled: another device's
            // answer won, and the line says what won and where. A socket
            // that dropped with ours out leaves it unknown whose won, so
            // nothing is said of it.
            if (elsewhere && commandRecord(commandId)?.refusedByHub) {
              addNote(target, elsewhere);
            }
            return;
          }
          target.pending = target.pending.filter(
            (p) => p.requestId !== requestId
          );
          trackWorking(target);
        },
      };
    }
    case "set-model": {
      const { model } = intent as CommandIntents["set-model"];
      const previous = target.model;
      return {
        submitted: () => {
          target.model = model;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.model = previous;
          } else {
            detach(persistSettings(instanceId, { model }), "persistSettings");
          }
        },
      };
    }
    case "set-permission-mode": {
      const { mode } = intent as CommandIntents["set-permission-mode"];
      const previous = target.permissionMode;
      return {
        submitted: () => {
          target.permissionMode = mode;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.permissionMode = previous;
          } else {
            detach(
              persistSettings(instanceId, { permissionMode: mode }),
              "persistSettings"
            );
          }
        },
      };
    }
    case "set-effort": {
      const { effort } = intent as CommandIntents["set-effort"];
      const previous = target.effort;
      return {
        submitted: () => {
          target.effort = effort;
        },
        // A switch that lands is followed by the agent's reading of it, which
        // the hub writes on the row; only a refused one is undone here.
        settled: (stage) => {
          if (stage === "failed") {
            target.effort = previous;
          }
        },
      };
    }
    default:
      return undefined;
  }
}

/** One message off the hub's socket, taken into the stores. */
function takeHubMessage(message: unknown): void {
  // A session's own frames are sequenced; everything else — the board,
  // pulses, permissions, replies — is broadcast as an envelope.
  if (handleStreamMessage(streamState, streamHost, message)) {
    sweepOnTraffic();
    return;
  }
  if (
    handlePlanMessage(plansState.plans, message, (instanceId) =>
      streamHost.sendToHub({ type: "plan.resync", instanceId })
    )
  ) {
    return;
  }
  const envelope = message as Envelope<FramePayload>;
  if (envelope.verb !== "frames") {
    return;
  }
  const { payload } = envelope;
  adoptAskMachine(envelope);
  // The hub's own refusal names the request it answers on the envelope
  // alone: read from the payload only, it settled nothing, and whoever
  // asked waited out the timeout while the reason went to the console.
  takeFrame(
    payload.kind === "error" && !payload.requestId
      ? { ...payload, requestId: envelope.requestId }
      : payload
  );
  sweepOnTraffic();
}

/** The sends an earlier load kept were sent again: once per load of the page. */
let keptSendsResumed = false;

/** What routes call on mount: the socket, and the sends an earlier load kept sent again. */
export function ensureConnected(): void {
  if (!keptSendsResumed) {
    keptSendsResumed = true;
    resumeKeptSends().catch((error: unknown) =>
      console.warn("[cawco] kept sends could not be read", error)
    );
  }
  openHub();
}

function userMessage(text: string, uuid: string): SendPayload["message"] {
  return {
    type: "user",
    uuid,
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Stamped, not implied. The SDK treats an unstamped message as
    // unattributed and fails it closed at the gates that ask whether a human
    // said this — so a typed sentence has to say that it was typed.
    origin: { kind: "human" },
  };
}

/**
 * Settles once `ready` reads true, read again whenever what it reads changes
 * (an effect, never a timer), or `unanswered` past `ms`.
 */
function whenTrue(ready: () => boolean, ms: number): Promise<Bounded<void>> {
  return readWithin(
    ms,
    (signal) =>
      new Promise<void>((resolve) => {
        const stop = $effect.root(() => {
          $effect(() => {
            if (ready()) {
              resolve();
              // Not from inside the effect it ends.
              queueMicrotask(() => stop());
            }
          });
        });
        signal.addEventListener("abort", () => stop(), { once: true });
      })
  );
}

/**
 * What `machineId` reports of `harness`, its permission modes among it. Which
 * modes a machine takes is its report's, so a start waits for the report (the
 * first fleet read, a machine whose report is on its way) up to {@link
 * CONTROL_TIMEOUT_MS}; one still missing then is the machine's own word.
 */
async function reportOf(
  machineId: string,
  harness: HarnessKind
): Promise<MachineHarnessReport | undefined> {
  await whenTrue(
    () =>
      boardState.fleetRead &&
      boardState.machines.find((row) => row.machineId === machineId)
        ?.harnesses !== undefined,
    CONTROL_TIMEOUT_MS
  );
  return boardState.machines
    .find((row) => row.machineId === machineId)
    ?.harnesses?.find((entry) => entry.harness === harness);
}

/**
 * A spawn as it leaves this dashboard: a model only when one was picked (none
 * runs on the harness's own default, never an empty string), and a permission
 * mode only when its harness has modes. What the path says stands: the New
 * Session form's choice, or the session's own on a revive, relaunch, rewind
 * or fork. A path that names none sends none, and the hub settles it
 * (`settleMode`): a session it has a row for runs on its own mode, else the
 * one last chosen for its harness on its machine, and anything else is
 * refused with why. Every new session's mode is chosen in the form (a start
 * with no form of its own opens it, a fork with none to carry too).
 */
async function explicit(
  machineId: string,
  payload: NamedSpawn
): Promise<NamedSpawn> {
  const report = await reportOf(machineId, payload.harness);
  const { permissionMode, model, ...rest } = payload;
  // A harness with no permission modes (pi) is sent none, whatever the
  // path carried (a stored row's).
  const mode =
    report?.capabilities.permissionModes.length === 0
      ? undefined
      : permissionMode;
  return {
    ...rest,
    ...(model ? { model } : {}),
    ...(mode ? { permissionMode: mode } : {}),
  };
}

/**
 * Sends a spawn and returns the view it streams into once the hub has taken
 * it: its row is open. A spawn the hub refuses throws the hub's reason, and
 * nothing of it is kept here: no view, and no id for a caller to navigate to.
 * A spawn the hub did not answer in time is `unanswered`: whether it started
 * is not known, and nothing of it is kept here either.
 * Every session this dashboard starts, resumes or forks goes through here.
 */
async function start({
  machineId,
  instanceId = newId(),
  ...spawn
}: Omit<NamedSpawn, "instanceId"> & {
  machineId: string;
  /** The id it is asked under; one is minted when none is named. */
  instanceId?: string;
}): Promise<Bounded<SessionState>> {
  const requestId = newId();
  const payload = await explicit(machineId, { instanceId, ...spawn });
  let taken: Bounded<void>;
  try {
    taken = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () => {
      opening.set(instanceId, requestId);
      send({ verb: "spawn", machineId, instanceId, requestId, payload });
    });
  } finally {
    opening.delete(instanceId);
  }
  switch (taken.kind) {
    case "unanswered":
      return taken;
    case "answered":
      break;
    default:
      unhandled("read", taken);
  }
  const created = session(instanceId);
  created.machineId = machineId;
  created.cwd = payload.cwd;
  created.harness = payload.harness;
  created.permissionMode = payload.permissionMode ?? null;
  // What was sent, so the header shows it during the wait for the first
  // init — which then corrects it to whatever the harness resolved it to.
  created.model = payload.model ?? null;
  created.scratch = Boolean(payload.scratch);
  return { kind: "answered", value: created };
}

/**
 * Starts a session on `machineId` and returns the id its route lives at, once
 * the hub has taken the spawn ({@link start}). A spawn the hub refuses throws
 * the hub's reason, and its first prompt is never sent.
 */
export async function spawnSession({
  instanceId,
  machineId,
  cwd,
  prompt,
  harness,
  permissionMode,
  model,
  effort,
  scratch,
  clean,
  bootstrap,
  projectId,
  account,
  extras = {},
  firstCommandId,
}: {
  /**
   * The id the session is asked for under, minted by the caller before it
   * asks, so a page reloaded while the hub answers finds it on the board
   * (spawn/parked); one is minted here when none is named.
   */
  instanceId?: string;
  machineId: string;
  cwd: string;
  prompt?: string;
  /** What rides the first message besides its words: its attachments and images, as a send carries them. */
  extras?: SendExtras;
  harness: HarnessKind;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  scratch?: SpawnPayload["scratch"];
  /** Start it clean, with no instruction context (core `SpawnPayload.clean`). */
  clean?: true;
  bootstrap?: SpawnPayload["bootstrap"];
  projectId?: string;
  /** The account picked for this session; absent: the hub places it. */
  account?: string;
  /** The id its first prompt goes under, drawn already ({@link drawFirstPrompt}). */
  firstCommandId?: string;
}): Promise<Bounded<string>> {
  const started = await start({
    ...(instanceId ? { instanceId } : {}),
    machineId,
    cwd,
    harness,
    permissionMode,
    model,
    effort,
    scratch,
    ...(clean ? { clean } : {}),
    bootstrap,
    projectId,
    ...(account ? { account } : {}),
  });
  switch (started.kind) {
    case "unanswered":
      // Whether it started is not known: no first prompt goes to a session nobody confirmed.
      return started;
    case "answered":
      break;
    default:
      unhandled("read", started);
  }
  sendFirstPrompt(
    started.value.instanceId,
    machineId,
    prompt,
    extras,
    firstCommandId
  );
  detach(rereadHub(), "rereadHub");
  return { kind: "answered", value: started.value.instanceId };
}

/**
 * A new session's first message, when it has words or files: sent once the
 * hub has taken the start, or once a page reloaded while it answered finds
 * the session on the board (spawn/parked).
 */
export function sendFirstPrompt(
  instanceId: string,
  machineId: string,
  prompt: string | undefined,
  extras: SendExtras,
  /** The row it goes as, drawn before its session was asked for ({@link drawFirstPrompt}). */
  commandId?: string
): void {
  const first = prompt?.trim() ?? "";
  if (first || extras.images?.length || extras.attachments?.length) {
    // Followed before its first message goes, on the socket that carries it:
    // that send's record is among the first frames the session's stream
    // carries, and a tab that joined after it would never hear it.
    subscribeSession(streamState, streamHost, instanceId);
    submitCommand(
      instanceId,
      machineId,
      "send",
      { text: first, extras },
      commandId
    );
  }
  // What the person sent while its start was still making it, after it, in
  // the order written, each under the row it was drawn as.
  const held = heldForStart.get(instanceId) ?? [];
  heldForStart.delete(instanceId);
  if (held.length > 0) {
    subscribeSession(streamState, streamHost, instanceId);
  }
  for (const one of held) {
    submitCommand(
      instanceId,
      machineId,
      "send",
      { text: one.text, extras: one.extras },
      one.commandId
    );
  }
}

/** A send written to a session its start is still making ({@link holdForStart}). */
export interface HeldSend {
  commandId: string;
  extras: SendExtras;
  text: string;
}

/**
 * The sends written to each session a start is still making, oldest first:
 * drawn as theirs, held in this tab, and sent after its first prompt once
 * its spawn has answered ({@link sendFirstPrompt}). The hub has no row to
 * hold them against yet, and refuses a send to an id it does not list.
 */
const heldForStart = new Map<string, HeldSend[]>();

/**
 * A new session's first message, drawn in its conversation before the
 * session is asked for (a project conversation's start, project/conversation.ts):
 * the person's words stand as theirs at once, the session at work after
 * them, as a send's own row stands (`noteSendSubmitted`). The send that
 * follows the spawn goes under `commandId` and takes this row; a start that
 * fails takes it back ({@link withdrawFirstPrompt}).
 */
export function drawFirstPrompt(
  instanceId: string,
  commandId: string,
  text: string,
  extras: SendExtras,
  /** Where it starts: its conversation can be written to before its row is listed. */
  where: { cwd: string; harness: HarnessKind; machineId: string }
): void {
  const target = session(instanceId);
  target.machineId ||= where.machineId;
  target.cwd ||= where.cwd;
  target.harness = where.harness;
  noteSendSubmitted(instanceId, text, extras, commandId);
}

/**
 * A send the person writes to a session its start is still making (its
 * pane `unborn`): drawn as theirs at once, as every send is, and held here
 * until its start answers, when it goes after the first prompt under the
 * same row ({@link sendFirstPrompt}). Never sent to an id the hub does not
 * list, which it would refuse.
 */
export function holdForStart(
  instanceId: string,
  text: string,
  extras: SendExtras,
  commandId: string
): string {
  noteSendSubmitted(instanceId, text, extras, commandId);
  heldForStart.set(instanceId, [
    ...(heldForStart.get(instanceId) ?? []),
    { commandId, text, extras },
  ]);
  return commandId;
}

/**
 * A start that failed, its words taken back: the first message drawn for
 * it and whatever was written to it while it started. Nothing of them went;
 * the held ones are answered, oldest first, for the caller to put back.
 */
export function withdrawFirstPrompt(
  instanceId: string,
  commandId: string
): HeldSend[] {
  const held = heldForStart.get(instanceId) ?? [];
  heldForStart.delete(instanceId);
  for (const drawn of [commandId, ...held.map((one) => one.commandId)]) {
    dropSendEcho(instanceId, drawn);
  }
  const target = sessionsState.sessions[instanceId];
  if (target) {
    target.busy = false;
  }
  return held;
}

/** Where a fork branches from: the conversation, its machine, folder and harness, and the answer it branches at. */
export interface ForkSource {
  at?: string;
  cwd: string;
  harness: HarnessKind;
  machineId: string;
  sessionId: string;
}

/**
 * Branches a spin-off off a session (NEW.md §1): the same context carried into
 * a new SDK session, kept apart from mainline work until it is kept or
 * discarded. The hub reads the conversation it branches into the new view's
 * transcript. A fork the hub refuses throws the hub's reason ({@link start}).
 *
 * It runs on what its source runs on: the hub's row for the conversation
 * says what that is. A mode, model or effort given (the New Session form's
 * picks) stands over the source's. With no mode to run in (the source's row
 * records none) on a harness that has modes, nothing is sent and the answer
 * is `unchosen`: the New Session form opens on the fork, and Start waits for
 * a mode (spawn/new-session `startFork`).
 */
export async function forkSession({
  machineId,
  cwd,
  sessionId,
  harness,
  at,
  permissionMode,
  model,
  effort,
  prompt,
  extras = {},
}: ForkSource & {
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  prompt?: string;
  extras?: SendExtras;
}): Promise<Bounded<string> | { kind: "unchosen" }> {
  const source = instanceForSession(instanceIndex, sessionId, {
    machineId,
    cwd,
  });
  // A branch is a new session nobody picked a mode for, so a Full Send
  // source branches on Bypass (`unpickedMode`): Full Send is only ever a
  // confirmed choice, the form's.
  const mode =
    permissionMode ??
    (source?.permissionMode
      ? unpickedMode(source.permissionMode as PermissionMode)
      : undefined);
  if (!mode) {
    const report = await reportOf(machineId, harness);
    if (report?.capabilities.permissionModes.length !== 0) {
      return { kind: "unchosen" };
    }
  }
  const named = model || source?.model;
  const level = effort ?? source?.chosenEffort;
  const started = await start({
    machineId,
    cwd,
    harness,
    resume: {
      sessionKey: sessionId,
      fork: true,
      ...(at ? { atMessage: at } : {}),
    },
    scratch: {},
    ...(named ? { model: named } : {}),
    ...(mode ? { permissionMode: mode } : {}),
    ...(level ? { effort: level } : {}),
  });
  switch (started.kind) {
    case "unanswered":
      return started;
    case "answered":
      sendFirstPrompt(started.value.instanceId, machineId, prompt, extras);
      detach(rereadHub(), "rereadHub");
      return { kind: "answered", value: started.value.instanceId };
    default:
      unhandled("read", started);
  }
}

/** What a turn carries besides its typed text — pastes turned into chips, images. */
export type SendExtras = Pick<SendPayload, "attachments" | "images">;

/**
 * What a send does to the LOCAL store: the row it draws under the message's
 * own uuid (`sending`, at the end, until the hub's record for it lands on the
 * same row), the busy flip, the working clock.
 */
function noteSendSubmitted(
  instanceId: string,
  text: string,
  extras: SendExtras,
  commandId: string,
  /**
   * The failed send this one retries. It draws no row until the hub takes
   * it: then its record's row arrives as the failed one folds away.
   */
  replaces?: string
): void {
  const target = session(instanceId);
  const drawn = target.local.find((message) => message.id === commandId);
  if (drawn) {
    // Try again on a send that never reached the hub: the same row, on its
    // way again.
    const { sendFailed: _failed, ...kept } = drawn.metadata ?? {};
    drawn.state = "sending";
    drawn.metadata = kept;
  } else if (
    replaces === undefined &&
    // A send the hub already placed is drawn by the hub's row for it.
    !target.messages.some((message) => message.id === commandId)
  ) {
    target.local.push(localUserMessage(instanceId, commandId, text, extras));
    place(target);
  }
  // A new attempt replaces the last one's announcement rather than stacking on
  // it: the live region says what is true now, not what was true before.
  sendFailureNotices[instanceId] = "";
  target.busy = true;
  // Before any frame: the whole point of the clock is the wait for the first one.
  trackWorking(target);
}

/**
 * The other half of durability: a message to a dead session revives it first.
 * The daemon respawns the same instance with `resume`, then the text goes
 * through as usual — the reader never has to know the process died.
 */
/**
 * Brings a dead-but-resumable session back before anything is asked of it.
 * A process can die between one action and the next — a daemon restart, a
 * crash — and the reader should not have to know which of their actions
 * happens to revive it. Returns once the session can take work again.
 */
/**
 * The harness key a spawn resumes an instance under. The hub row is the one
 * authority: it holds what the daemon recorded when the session named itself,
 * and a view id — a CawCo instance id — is never a key, whatever shape it
 * has. A row without a key has nothing to resume by, and this says so rather
 * than guessing: two opencode sessions were lost to a resume that sent the
 * instance id in the key's place. Only an id the hub does not hold at all — a
 * stored transcript browsed under its own key — answers from the store, which
 * by then carries what the transcript read's header or the catalog entry named.
 */
function resumeKeyFor(instanceId: string): string | null {
  const row = instanceIndex.byId.get(instanceId);
  if (row) {
    return row.sessionId ?? null;
  }
  return sessionsState.sessions[instanceId]?.sessionId ?? null;
}

/** The harness a session's conversation is one of: its row's, else its view's; a throw while neither has said. */
function harnessOfSession(instanceId: string): HarnessKind {
  const harness =
    instanceIndex.byId.get(instanceId)?.harness ??
    sessionsState.sessions[instanceId]?.harness;
  if (!harness) {
    throw new Error(
      "This session has not said what runs it yet. Try again in a moment."
    );
  }
  return harness;
}

/**
 * Stops a running session. Nothing about it changes here until its machine
 * answers: then it is stopped (its turn, tool and parked asks settle), and a
 * refusal is thrown in the machine's words for the row that asked to say. A
 * stop nobody answered in time is `unanswered`: the session is left as it is.
 */
export async function stopSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, requestId };
  try {
    const stopped = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (stopped.kind) {
      case "answered":
        settleStopped(instanceId);
        return stopped;
      case "unanswered":
        return stopped;
      default:
        unhandled("read", stopped);
    }
  } finally {
    detach(rereadHub(), "rereadHub");
  }
}

/**
 * Throws a spin-off away: the session stops and the agent tears down whatever
 * the spawn created for it. Resolves once the agent confirms the teardown, so a
 * worktree that could not be removed is reported rather than silently left.
 */
export async function discardSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, discard: true, requestId };
  try {
    const discarded = await ask<void>(requestId, DISCARD_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (discarded.kind) {
      case "answered":
        // Gone on the machine's word, not before: a refused discard, or one
        // nobody answered, leaves the session as it was.
        settleStopped(instanceId);
        delete sessionsState.sessions[instanceId];
        return discarded;
      case "unanswered":
        return discarded;
      default:
        unhandled("read", discarded);
    }
  } finally {
    await rereadHub();
  }
}

/**
 * Moves a session whole to another account of its provider
 * (`POST /api/instances/:id/account`): now when it is at rest, else at its
 * next turn boundary. A refusal is thrown in the hub's own sentence; an
 * answer that is not a sentence (a route's JSON) is named by its status.
 */
export async function moveInstanceAccount(
  instanceId: string,
  accountId: string
): Promise<void> {
  const response = await hubFetch(
    hubRequest("POST /api/instances/:id/account", {
      path: { id: instanceId },
      body: { accountId },
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, accountsWords.notMovedThen);
  }
}

/**
 * The owner's name for a session the hub keeps. It outranks the name the
 * session gives itself (`set_title`), which the hub refuses from then on;
 * the new name reaches every dashboard through the instance-update frame.
 */
export async function renameInstance(
  instanceId: string,
  title: string
): Promise<void> {
  const response = await hubFetch(
    hubRequest("PATCH /api/instances/:id", {
      path: { id: instanceId },
      body: { title },
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, sidebarWords.notRenamedThen);
  }
}

/**
 * Promotes a spin-off to mainline work: the UI stops setting it apart, and
 * the tag that kept its transcript out of the machine's catalog comes off, so
 * the session joins the history it was being hidden from. `unanswered` when
 * the hub kept it and its machine did not answer for the tag in time.
 */
export async function keepSession(instanceId: string): Promise<Bounded<void>> {
  const target = session(instanceId);
  const response = await hubFetch(
    hubRequest("PATCH /api/instances/:id", {
      path: { id: instanceId },
      body: { kind: "mainline" },
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, sidebarWords.notKeptThen);
  }

  target.scratch = false;
  if (target.sessionId && target.machineId) {
    // `null` is how the harness clears a tag; the catalog is re-read for the
    // entry that has just stopped being hidden.
    const untagged = await machineControl<void>(
      target.machineId,
      "tagSession",
      [target.sessionId, null, { dir: target.cwd || undefined }],
      CONTROL_TIMEOUT_MS,
      harnessOfSession(instanceId)
    );
    await loadCatalog(target.machineId);
    return untagged;
  }
  return { kind: "answered", value: undefined };
}

/** The view state a session leaves behind once it is no longer running. */
function settleStopped(instanceId: string): void {
  const target = session(instanceId);
  target.busy = false;
  target.currentTool = null;
  clearTurnPhase(target);
  // Its parked asks leave on the hub's word (`permission_settled`): the hub
  // settles a stopped process's asks, and keeps a relaunch's own.
  trackWorking(target);
}

/**
 * How long a start again asked during a turn waits for its answer: the
 * machine gives it once that turn has ended and the session runs again, and
 * a turn may run long.
 */
const RELAUNCH_AT_TURN_END_MS = HOUR_MS;

/**
 * `bypassPermissions` is a launch decision — the SDK refuses to switch a running
 * session into it — and so is `fullSend`, which runs the CLI in bypass. A
 * session that wants either from another mode is started again in place:
 * same instance id, same hub row, its own SDK session resumed, so the new
 * process reads the whole conversation back, once the turn it is in has
 * ended. A spin-off relaunches the same way; the agent keeps it in the
 * checkout it was already working in.
 */
export async function relaunchSession(
  instanceId: string,
  machineId: string,
  permissionMode: PermissionMode
): Promise<Bounded<void>> {
  const target = session(instanceId);
  // The one rule for starting a session again (core `relaunchOf`): on its
  // conversation when it has one, fresh under its id when its harness never
  // began one (a session switched before its first message), and not at all
  // when its conversation is gone.
  const plan = relaunchOf({
    sessionId: resumeKeyFor(instanceId),
    lastErrorKind: instanceIndex.byId.get(instanceId)?.lastErrorKind ?? null,
  });
  if (plan.kind === "refused") {
    throw new Error(plan.reason);
  }

  const requestId = newId();
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    ...(plan.kind === "resume"
      ? { resume: { sessionKey: plan.sessionKey } }
      : {}),
    // The process is replaced, on its own conversation: without this, a
    // resume for a session its machine runs is a recovery of that process,
    // which its machine keeps, and the new mode never reached it.
    relaunch: true,
    // A relaunch is a spawn like any other, so it has to say what it is: a spin-off
    // that stayed silent about it would come back as mainline work, untagged.
    scratch: target.scratch ? {} : undefined,
    permissionMode,
    // Only the mode is being changed, so the model the session was answering on
    // carries over, and the hub starts it at the effort chosen for it.
    model: target.model ?? undefined,
    requestId,
  });

  const previous = target.permissionMode;
  // A turn is never cut for it: its machine starts it again once the turn
  // running now has ended (agent session.ts `#turnEnded`), and answers then.
  const inTurn = target.busy || target.pending.length > 0;
  target.permissionMode = permissionMode;
  target.relaunching = true;
  try {
    const relaunched = await ask<void>(
      requestId,
      inTurn ? RELAUNCH_AT_TURN_END_MS : CONTROL_TIMEOUT_MS,
      () => send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (relaunched.kind) {
      case "unanswered":
        // Not known to run on the new mode: the view shows the last confirmed one.
        target.permissionMode = previous;
        return relaunched;
      case "answered":
        return relaunched;
      default:
        unhandled("read", relaunched);
    }
  } catch (error) {
    target.permissionMode = previous;
    throw error;
  } finally {
    target.relaunching = false;
    detach(rereadHub(), "rereadHub");
  }
}

/**
 * Where a rewind lands: the assistant frame `resumeSessionAt` names.
 *
 * The SDK resumes "up to and including" an `SDKAssistantMessage.uuid`, so the
 * anchor has to be an assistant frame — and one that ended in words. A frame
 * whose blocks include a tool call would resume into a `tool_use` with no
 * result behind it, which the API refuses outright, so the search walks past
 * those to the last turn that closed.
 */
function rewindPoint(target: SessionState, id: string): string | null {
  const edited = target.messages.findIndex((message) => message.id === id);
  if (edited < 0) {
    return null;
  }
  const calls = toolFrames(target.messages);
  for (let index = edited - 1; index >= 0; index -= 1) {
    const { type, sdkUuid: uuid } = target.messages[index];
    if (type !== "assistant" || !uuid || calls.has(uuid)) {
      continue;
    }
    return uuid;
  }
  return null;
}

/**
 * Where a rewind lands, read back to when the rows held do not reach it. A
 * view holds the newest page and what its reader scrolled up to, so the
 * answered turn before one of its first messages can be on a page not read
 * yet: the pages before are read, one at a time, until one holds it. Null
 * only once the conversation's start is in hand, or a page could not be read.
 */
async function rewindPointBehind(
  target: SessionState,
  id: string
): Promise<string | null> {
  let point = rewindPoint(target, id);
  while (!point && target.cursor && !target.loading) {
    const { cursor } = target;
    await readOlderPage(target.instanceId);
    point = rewindPoint(target, id);
    // The cursor did not move: the page failed, or its answer was dropped.
    if (target.cursor === cursor) {
      break;
    }
  }
  return point;
}

/** The uuids of assistant frames that asked for a tool — never a rewind anchor. */
function toolFrames(messages: Message[]): Set<string | undefined> {
  return new Set(
    messages
      .filter(
        (message) =>
          message.type === "tool.use" || message.type === "tool.handoff"
      )
      .map((message) => message.sdkUuid)
  );
}

/**
 * Each session's rewindable turns as last read, by the revision they were
 * read at (`SessionState.rev`, which moves with every change to its
 * messages). Every reader's turn asks as its row mounts, and read afresh
 * each time, a wheel bringing in a few of them walked the whole session for
 * each (1ms of a wheel's task, transcript-holds' steady wheel, profiled).
 */
const rewindable = new WeakMap<
  SessionState,
  { cursor: string | null; length: number; rev: number; turns: Set<string> }
>();

function rewindableTurns(target: SessionState): Set<string> {
  const { cursor, rev } = target;
  const { length } = target.messages;
  const kept = rewindable.get(target);
  if (
    kept &&
    kept.rev === rev &&
    kept.cursor === cursor &&
    kept.length === length
  ) {
    return kept.turns;
  }
  const turns = readRewindable(target);
  rewindable.set(target, { cursor, length, rev, turns });
  return turns;
}

function readRewindable(target: SessionState): Set<string> {
  const turns = new Set<string>();
  const calls = toolFrames(target.messages);
  // An anchor on an older page is resolved by rewindPointBehind on demand.
  let anchored = target.cursor !== null;
  for (const message of target.messages) {
    if (
      message.type === "user" &&
      anchored &&
      message.state !== "sending" &&
      message.state !== "pending" &&
      message.state !== "failed" &&
      message.state !== "unreached"
    ) {
      turns.add(message.id);
    }
    if (
      message.type === "assistant" &&
      message.sdkUuid &&
      !calls.has(message.sdkUuid)
    ) {
      anchored = true;
    }
  }
  return turns;
}

/** Where a fork from message `id` of `instanceId` branches: at the answer behind it (spawn/new-session `startFork` starts it). */
export async function forkPointOf(
  instanceId: string,
  id: string
): Promise<ForkSource> {
  const target = session(instanceId);
  const sessionKey = resumeKeyFor(instanceId);
  if (!(target.machineId && sessionKey)) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const point = await rewindPointBehind(target, id);
  if (!point) {
    throw new Error(
      "There is no answered turn behind this message to branch from."
    );
  }
  return {
    machineId: target.machineId,
    cwd: target.cwd,
    sessionId: sessionKey,
    harness: harnessOfSession(instanceId),
    at: point,
  };
}

/**
 * Says a turn again, differently. The session is started back up in place at
 * the answer before the edited message — same instance id, same SDK session,
 * `resumeSessionAt` cutting the conversation there — and the new wording goes
 * through as an ordinary turn, so everything the old one led to is gone from
 * both the screen and the session the next process reads back.
 */
export async function editAndResend(
  instanceId: string,
  id: string,
  content: string
): Promise<Bounded<void>> {
  const target = session(instanceId);
  const { machineId } = target;
  if (!machineId) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const sessionKey = resumeKeyFor(instanceId);
  if (!sessionKey) {
    throw new Error(
      `no session key on record for ${instanceId}; cannot resume`
    );
  }
  // OpenCode reverts the selected user turn; Claude resumes through the
  // preceding completed assistant frame.
  const point =
    traitsOf(target.harness).rewindAnchor === "user-turn"
      ? target.messages.find((message) => message.id === id)?.sdkUuid
      : await rewindPointBehind(target, id);
  if (!point) {
    throw new Error("This message has no stored rewind point.");
  }

  const requestId = newId();
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    resume: { sessionKey, atMessage: point },
    // What a relaunch carries: a rewind changes what the session has said, not
    // what it is. Its effort is the one chosen for it, which the hub supplies.
    scratch: target.scratch ? {} : undefined,
    permissionMode: target.permissionMode ?? undefined,
    model: target.model ?? undefined,
    requestId,
  });

  // The hub cuts the transcript back to the answer the rewind lands on as it
  // starts the process, and puts it back whole if the spawn never lands; every
  // screen reads the cut from it.
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  target.relaunching = true;
  try {
    const rewound = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (rewound.kind) {
      case "unanswered":
        // Not known to have restarted at the rewind point: the new wording is not sent.
        return rewound;
      case "answered":
        submitCommand(instanceId, machineId, "send", { text: content });
        return rewound;
      default:
        unhandled("read", rewound);
    }
  } finally {
    target.relaunching = false;
    detach(rereadHub(), "rereadHub");
  }
}
