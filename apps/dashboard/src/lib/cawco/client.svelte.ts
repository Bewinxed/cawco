/**
 * The browser end of the Envelope spine: one WebSocket to the hub, and each
 * session's transcript as the hub built it — a page fetched once, then the
 * changes its stream carries (NEW.md §6).
 */

import { detach } from "@cawco/core/detach";

import type { FramePayload } from "@cawco/core/frames";

import { hubRequest } from "@cawco/core/hub-request";

import type { Envelope, InstanceRow } from "@cawco/core/protocol";

import type { SessionStreamFrame } from "@cawco/core/stream";

import type { UsageLimitsResponse } from "@cawco/core/usage/types";

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
  type BenchHub,
  connectionCount,
  connectionState,
  inflight,
  leaveHub,
  ModeUnchosen,
  openHub,
  settle,
  socketOpen,
  standSocket,
  takeHubRestart,
  wireHub,
} from "./hub/socket.svelte";
import { takeAuthFrame } from "./hub-auth.svelte";

import { notices } from "./notices.svelte";

import { readPerson, showDeskAlert, takePerson } from "./person.svelte";
import { handlePlanMessage } from "./plan";
import { presenceAgain } from "./presence";

import { checkServedBuild } from "./served-build.svelte";

import { readAccounts } from "./stores/accounts.svelte";
import {
  adoptAskMachine,
  adoptPending,
  asksHeard,
  holdActivities,
  takePermissionRequest,
} from "./stores/asks.svelte";
import {
  adoptRows,
  boardState,
  holdMachines,
  instanceIndex,
  type Machine,
  patchBoardRows,
  pulses,
  takePulse,
} from "./stores/board.svelte";
import { takeBrowsers } from "./stores/browsers.svelte";
import { loadCatalog, refreshCatalogs } from "./stores/catalog.svelte";
import {
  announceSendFailure,
  answerCardStillParked,
  answerSurfaces,
  markUnreached,
  resumeKeptSends,
  sayCommandFault,
  sweepOnTraffic,
  takePermissionSettled,
} from "./stores/commands.svelte";
import { takeBoardContinuations } from "./stores/continuations.svelte";
import { hearDelegateEvent, rereadDelegates } from "./stores/delegates.svelte";
import { watchedIds } from "./stores/follows.svelte";
import { plugLedger, streamHost, streamState } from "./stores/ledger.svelte";
import { fleetFetchListeners, takeFleetFetch } from "./stores/machines";
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

import { settleOpenings } from "./stores/session-start.svelte";
import {
  applyPulse,
  hydrate,
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
import { readBehind, readTranscript } from "./stores/transcript-reads.svelte";
import { addNote, applyTranscript } from "./stores/transcripts.svelte";
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
import {
  disarmCommandSweep,
  handleStreamMessage,
  noteDisconnect,
  resumePendingSends,
} from "./stream";
import { errorMessage } from "./transcript/local";

import { updates } from "./updates/updates.svelte";

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
 * (`catalogStore.catalogsRead`) then waits on catalogs nobody ever asked for.
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
