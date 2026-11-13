/**
 * The browser end of the Envelope spine (NEW.md §6): the stores (stores/),
 * each owning its state, its frames and its reads, wired to the hub's one
 * socket (hub/socket.svelte.ts). Here every frame kind is routed to the
 * store that takes it, what the stores do as the hub is reached or lost is
 * listed in order, the ledger's ports are plugged into the stores, and the
 * fleet's read on connect is made and made again until the board's reads
 * land. Nothing reads this module but the app's layout (`ensureConnected`).
 */

import { detach } from "@cawco/core/detach";
import type { FramePayload } from "@cawco/core/frames";
import type { Envelope, InstanceRow } from "@cawco/core/protocol";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
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
  type BenchControl,
  type BenchHub,
  type BenchSpawn,
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
import { accountsState, readAccounts } from "./stores/accounts.svelte";
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
} from "./stores/board.svelte";
import { takeBrowsers } from "./stores/browsers.svelte";
import {
  noteCommandFailure,
  resumeKeptSends,
  sweepOnTraffic,
  takePermissionSettled,
} from "./stores/commands.svelte";
import { takeBoardContinuations } from "./stores/continuations.svelte";
import { hearDelegateEvent, rereadDelegates } from "./stores/delegates.svelte";
import { plugLedger, streamHost, streamState } from "./stores/ledger.svelte";
import { dropFleetFetches, takeFleetFetch } from "./stores/machines";
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
  previewsState,
  takeBoardPreviews,
  takePreview,
  takePreviewSettings,
} from "./stores/previews.svelte";
import {
  keepProjects,
  projectsLeave,
  projectsState,
  rereadProjects,
  takeProjectCap,
  takeProjectStop,
} from "./stores/projects.svelte";
import { keepRelayJourney, readRelayJourney } from "./stores/relay.svelte";
import { patchRows } from "./stores/same";
import { settleOpenings } from "./stores/session-start.svelte";
import {
  hydrate,
  session,
  sessionsState,
  TOUCH_KINDS,
  takeBoardPulses,
  takePulseFrame,
  touchSession,
  trackWorking,
} from "./stores/sessions.svelte";
import { holdStored, takeStored } from "./stores/stored.svelte";
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
    boardState,
    accountsState,
    projectsState,
    previewsState,
    sessionsState,
    plansState,
    workItemsState,
    usageState,
    inflight,
    adoptInstances,
    frame: takeFrame,
    standHub,
    leaveHub,
    standStored: holdStored,
  });
}

/** Stands the page on a bench's hub: the socket closed, the hub said reached (dev only). */
function standHub(
  answer: BenchHub,
  spawn: BenchSpawn | null = null,
  control: BenchControl | null = null
): void {
  standSocket({ hub: answer, spawn, control });
  // What the bench stood in is the fleet as read, live and stored alike.
  boardState.fleetRead = true;
  boardState.liveRead = true;
  projectsState.projectsRead = true;
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
    load(hubData(hub.api.projects.get())),
    load(hubData(hub.api.pending.get())),
    // Read on connect, not only broadcast on change: a dashboard opened
    // between reports has missed the frames.
    load(hubData(hub.api.usage.limits.get())),
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
 * 10s — until the board's reads land.
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

/** The hub's word on the machines, pushed with every `instances` frame. */
function adoptMachines(incoming: Machine[]): void {
  if (!holdMachines(incoming)) {
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
  // A machine's passkey relay capability travels machine → hub only.
  ...hubOnly("passkey_relay"),
  // A passkey QR travels machine → hub → dashboard; the takeover view reads it, not session state.
  ...hubOnly("passkey_qr"),
  // A take-over the daemon ended itself travels machine → hub only; the hub answers the ask.
  ...hubOnly("browser_handback"),
  // The stream relay's state travels machine → hub only; Settings › Browsers reads the hub's record.
  ...hubOnly("stream_relay"),
  // A place's stage clone travels machine → hub only; the hub files it as a workspace.
  ...hubOnly("stage-clone"),
  // A machine's fleet report and its items' converge travel machine → hub
  // only; screens read the hub's row.
  ...hubOnly("fleet_report", "fleet_converge"),
  // Recent's stored transcripts, whole, as the hub keeps them.
  onFrame("stored", takeStored),
  // A machine's word that its transcripts moved travels machine → hub only.
  ...hubOnly("catalog_moved"),
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
    dropFleetFetches,
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
  applyFrame: (sessionId, payload) => {
    if (payload.kind !== "transcript") {
      takeFrame(payload);
      return;
    }
    const target = session(sessionId);
    applyTranscript(target, payload.events);
    trackWorking(target);
    target.lastActivityAt = new Date();
  },
  // The newest page again, which resumes the stream from the `seq` it carries.
  rereadHistory: (sessionId, cause) => {
    detach(readTranscript(sessionId, cause), "readTranscript");
  },
  noteFailure: noteCommandFailure,
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
