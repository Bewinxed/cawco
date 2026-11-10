/** What a machine's return does, one step each, listed in order by machineReturnStepsOf. */

import { detach } from "@cawco/core/detach";
import { traitsOf } from "@cawco/core/harness/traits";
import { TURN_UNRECORDED } from "../db/sends";
import type { HubContext } from "../hub-context";
import { outlivesSession } from "../pending";
import { UNREAD } from "../sends";
import type { MachineReturn } from "./machine-return";
import {
  heldProcesses,
  keptBuild,
  RESTORE_HORIZON_MS,
  RESTORE_MAX,
  reattachable,
  registerAck,
} from "./wire-reads";

export type MachineReturnContext = Pick<
  HubContext,
  | "SETTLED"
  | "advanceContinuation"
  | "agentProtocols"
  | "artifacts"
  | "binaryUpdateStates"
  | "browserStream"
  | "browsers"
  | "claudeSessionsOn"
  | "continuationsWhole"
  | "db"
  | "decideCustody"
  | "delegateWaits"
  | "dispatcher"
  | "endSession"
  | "escalateRoutedAsks"
  | "fleetSyncs"
  | "flushOwedStarts"
  | "foldersSeen"
  | "forgetPending"
  | "freshAccountReports"
  | "goneWithProcess"
  | "handAgain"
  | "heldSessions"
  | "homeStamps"
  | "hubGitOrigins"
  | "hubPreviewOrigins"
  | "hubStep"
  | "inCustody"
  | "isHubMachine"
  | "keepAliveScheduler"
  | "keepCustody"
  | "keepPrompt"
  | "keptOn"
  | "launchingOn"
  | "learnCheckout"
  | "lifecycle"
  | "locations"
  | "losePending"
  | "machineCredentials"
  | "machineFor"
  | "machineName"
  | "moves"
  | "nameStoredSessions"
  | "pending"
  | "previewService"
  | "publishInstances"
  | "pushAgents"
  | "readLaunchDirs"
  | "recordSessionAddress"
  | "recoverCompaction"
  | "registry"
  | "relayJourney"
  | "relayingPreviews"
  | "releaseHeld"
  | "resendHeld"
  | "restarts"
  | "restore"
  | "resumeCutTurn"
  | "sendFrame"
  | "settleLaunchesOn"
  | "settlePending"
  | "socketAddress"
  | "speaksContract"
  | "streamRelay"
  | "streams"
  | "tailnetHttps"
  | "takeUpMovesOn"
  | "toolReleases"
  | "transcripts"
  | "unknownAccountsOf"
  | "workItems"
>;

export const machineReturnStepsOf = (ctx: MachineReturnContext) => {
  // What a machine's return does, in this order (agent-socket/machine-return.ts).
  const backRegistered = (ret: MachineReturn): void => {
    const { ws, message, agentFrame } = ret;
    ctx.lifecycle.disconnect(message.machineId);
    for (const claim of agentFrame.sessionAddresses) {
      ctx.recordSessionAddress(ws, message.machineId, claim);
    }
    for (const [id, held] of ctx.heldSessions) {
      if (held.machineId === message.machineId) {
        ctx.releaseHeld(id);
      }
    }
  };

  const registryEntered = (ret: MachineReturn): void => {
    const { ws, message } = ret;
    // Named as the hub names it: through an SSH add's forward, the
    // address the person gave the add (`socketAddress`).
    const from = ctx.socketAddress(ws);
    ctx.registry.registerAgent(message.machineId, ws, from ?? undefined);
    console.info(
      `[hub] machine ${message.machineId} registered from ${from ?? "an unknown address"}`
    );
  };

  const toolReleasesTold = (ret: MachineReturn): void => {
    const { message } = ret;
    // A copy an update left older is sent it once more: the agent
    // may be a new process, which remembers no failure of the old
    // one's (tool-releases.ts `connected`).
    ctx.toolReleases.connected(message.machineId);
  };

  const artifactsBack = (ret: MachineReturn): void => {
    const { message } = ret;
    // Its canvases' stages are reachable again: no doc says otherwise.
    ctx.artifacts.machineBack(message.machineId);
  };

  const foldersRead = (ret: MachineReturn): void => {
    const { message } = ret;
    // Its folder previews' folders read, never started.
    ctx.foldersSeen(message.machineId);
  };

  const workResumed = (ret: MachineReturn): void => {
    const { message } = ret;
    ctx.workItems.discardUnfiled(message.machineId);
    // Landings a stopped hub left running on this machine run again
    // the moment it can run commands — waiting on nothing else the
    // register asks of the agent.
    ctx.workItems.resumeLandings(message.machineId);
    // A checkout coming online can be where a ready task's
    // workspace is cut.
    ctx.dispatcher.machineOnline(message.machineId);
    // A delegate that waited for owned files may start on it now.
    ctx.workItems.resumeQueued();
  };

  const checkoutsLearned = (ret: MachineReturn): void => {
    const { message } = ret;
    // Each checkout's repository is linked to its project from
    // its origin here, now that the machine can run git.
    Promise.all(
      ctx.db
        .checkoutsOn(message.machineId)
        .map((checkout) =>
          ctx.learnCheckout({ ...checkout, machineId: message.machineId })
        )
    ).catch((error: unknown) =>
      console.warn(
        `[hub] reading ${message.machineId}'s project remotes failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  const previewsReconciled = (ret: MachineReturn): void => {
    const { ws, message, agentFrame } = ret;
    ctx.previewService.reconcile(
      message.machineId,
      ws.remoteAddress,
      agentFrame.previews
    );
  };

  const homeStampsReset = (ret: MachineReturn): void => {
    const { message } = ret;
    // Each connection moves what the machine's own stores hold
    // once its first report says how they stand.
    ctx.homeStamps.delete(message.machineId);
  };

  const negativeLocationsForgotten = (_ret: MachineReturn): void => {
    // A machine arriving can turn a remembered "nobody holds this"
    // into an answer, so the negatives go. The hits stay: a
    // conversation does not move between machines.
    for (const [id, where] of ctx.locations) {
      if (where === null) {
        ctx.locations.delete(id);
      }
    }
  };

  const catalogKept = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // Its catalog, as this register reads it: what it keeps while
    // it is away. A register that could not read it keeps the last.
    const { resumable } = agentFrame;
    if (resumable) {
      ctx.keptOn.set(message.machineId, new Set(resumable));
    }
  };

  const agentFiled = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // An agent that speaks this hub's contract is online once it has
    // written the fleet's policy its welcome carries (READY,
    // fleet-sync.ts); one older is online as it registers, its
    // starts held until it installs this hub's build (`startHold`).
    const speaks = ctx.speaksContract(agentFrame.build?.protocol);
    ctx.db.upsertAgent({
      machineId: message.machineId,
      hostname: agentFrame.hostname ?? message.machineId,
      os: agentFrame.os ?? "unknown",
      build: keptBuild(agentFrame.build),
      home: agentFrame.home,
      online: !speaks,
    });
    // Its welcome first, before anything the register starts
    // there: the policy it carries is what a start reads.
    if (speaks) {
      ctx.fleetSyncs.gone(message.machineId);
      ctx.fleetSyncs.welcome(message.machineId, agentFrame.fleetHeld);
    }
  };

  const binaryUpdateKept = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // A register from a daemon with nothing to say leaves standing what
    // the beats said — the same tolerance `build` gets on the row.
    const { binaryUpdate: registered } = agentFrame;
    if (registered) {
      ctx.binaryUpdateStates.set(message.machineId, registered);
      ctx.restarts.note(registered);
    }
  };

  const protocolKept = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // The contract this connection's agent speaks, read before any
    // start goes to it ({@link startHold}).
    ctx.agentProtocols.set(message.machineId, agentFrame.build?.protocol);
    ctx.flushOwedStarts(message.machineId);
  };

  const relayConnected = (ret: MachineReturn): void => {
    const { message } = ret;
    // The relay's machine back: a relay that should run starts again
    // (kept as it is when its container runs).
    ctx.streamRelay.connected(message.machineId);
  };

  const browsersConnected = (ret: MachineReturn): void => {
    const { message } = ret;
    // Its browsers read from it whole: every row, take-overs
    // included, is what the machine holds now.
    const unread = (why: string) =>
      console.warn(
        `[browser] ${ctx.machineName(message.machineId)}'s browsers were not read as it registered: ${why}`
      );
    ctx.browsers.connected(message.machineId).then(
      (refused) => {
        if (refused) {
          unread(refused.response.detail);
        }
      },
      (error: unknown) =>
        unread(error instanceof Error ? error.message : String(error))
    );
    ctx.browserStream.connected(message.machineId);
    ctx.relayJourney.connected(message.machineId);
  };

  const sessionsSettled = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // A question parked by a process that is gone cannot be answered:
    // the reply would arrive at a daemon with no such session. Drop them
    // with the sessions they belonged to, or they replay to every
    // dashboard that connects and fail on click.
    const { custody: registrationCustody } = agentFrame;
    const returningRemoved = new Set(
      ctx.db.removedOn(message.machineId).map((row) => row.id)
    );
    ctx.db.restoreRemovedSessions(
      message.machineId,
      [
        ...agentFrame.instances,
        ...(registrationCustody.state === "available"
          ? registrationCustody.instances
          : []),
      ],
      registrationCustody.state === "available"
    );
    for (const id of returningRemoved) {
      ctx.lifecycle.preserveUnattached(id);
    }
    // A launch its agent still has stays the session's one; one it
    // does not have is over, and the restore below starts it anew.
    ctx.settleLaunchesOn(
      message.machineId,
      agentFrame.instances,
      registrationCustody,
      0
    );
    const settled = ctx.db.settleInstances(
      message.machineId,
      agentFrame.instances,
      [
        ...heldProcesses(registrationCustody),
        ...ctx.launchingOn(message.machineId),
      ],
      agentFrame.resumable,
      agentFrame.resumableAt
    );
    // What this machine runs is built now, so opening any of it is
    // a page off what is built rather than a read of its machine;
    // what an agent on another commit read is read again.
    ctx.transcripts
      .machineRegistered(message.machineId, agentFrame.instances)
      .catch((error: unknown) =>
        console.warn(
          `[hub] building ${message.machineId}'s transcripts failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    const { custody } = agentFrame;
    ctx.keepCustody(message.machineId, custody);
    const heldIds = new Set(
      custody.state === "available" ? custody.instances : []
    );
    const heldOpencode = custody.state === "available" && custody.opencode;
    // Whose process outlived the agent: a child sessiond kept alive,
    // or the one opencode server, which keeps every session it holds.
    const outlived = ({ row }: (typeof settled)[number]): boolean =>
      heldIds.has(row.id) ||
      (heldOpencode &&
        traitsOf(row.harness).custody === "server" &&
        row.sessionId !== null);
    const registeredAt = Date.now();
    for (const orphan of settled) {
      // A process that outlived the agent holds what reached it and
      // has not been read, and nothing else: whatever the agent that
      // went away had not handed it yet went with that agent, and is
      // owed to it again. What it holds is decided once its harness
      // has said (`decideCustody`). A send its harness has taken up
      // is read either way — a read that happened while no agent was
      // reading is not framed again. One whose process is gone runs
      // again on its conversation, restored now or woken later, and
      // is owed what its process never read.
      const kept = custody.state === "unavailable" || outlived(orphan);
      if (kept) {
        ctx.forgetPending(orphan.row.id, UNREAD.ended, true);
      } else {
        ctx.losePending(orphan.row.id, orphan.resumes);
      }
      if (kept) {
        ctx.inCustody.set(orphan.row.id, {
          machineId: message.machineId,
          since: registeredAt,
          told: traitsOf(orphan.row.harness).custody === "server",
        });
        ctx.decideCustody(orphan.row.id);
      }
      ctx.escalateRoutedAsks(orphan.row.id);
    }
    Object.assign(ret, {
      custody,
      settled,
      heldIds,
      heldOpencode,
      outlived,
      returningRemoved,
    });
  };

  const parkedSwept = (ret: MachineReturn): void => {
    const { message, custody, heldIds, heldOpencode } = ret;
    // Catalog reconciliation can also retire an already failed row,
    // and stopped rows are deliberately outside the orphan list.
    for (const parked of ctx.pending.list()) {
      const [owner] = ctx.db.getInstancesByIds([parked.instanceId ?? ""]);
      if (
        !outlivesSession(parked) &&
        parked.machineId === message.machineId &&
        custody.state === "available" &&
        !(owner && ["running", "starting", "unknown"].includes(owner.status)) &&
        !heldIds.has(parked.instanceId ?? "") &&
        !(heldOpencode && traitsOf(owner?.harness).custody === "server") &&
        // A prompt is kept while its session may run again.
        !ctx.keepPrompt(parked)
      ) {
        ctx.goneWithProcess([parked]);
      }
    }
  };

  const readsHandedBack = (ret: MachineReturn): void => {
    const { agentFrame } = ret;
    // Sessions that ran on while this hub was away: a read that
    // happened meanwhile was framed to nobody, and the transcript
    // says it happened. The rest goes again behind the ack
    // ({@link handAgain}).
    for (const instanceId of agentFrame.instances) {
      ctx.settlePending(instanceId, UNREAD.ended, "wait");
    }
  };

  const restoresChosen = (ret: MachineReturn): void => {
    const {
      message,
      agentFrame,
      settled,
      custody,
      heldIds,
      outlived,
      returningRemoved,
    } = ret;
    // The daemon went away and came back. A session whose turn it
    // cut is not finished — it lost its process mid-turn, which is
    // this hub's problem to fix rather than the user's to notice. Put
    // it back exactly as it was: same directory, same model, same
    // permission mode, resumed onto the same session, and its turn
    // handed back. One that was between turns is asleep, not lost.
    //
    // And *bounded*, which it was not. Every resumable orphan was
    // respawned unconditionally on every register, which is how a
    // machine that had been away for a day and a half came back and was
    // handed its entire history as a work queue: 178 rows, spawned
    // fire-and-forget and each one written `running` before a single
    // process was confirmed. So: newest first, nothing older than
    // {@link RESTORE_HORIZON_MS}, and never more than
    // {@link RESTORE_MAX}. `settleInstances` has already written every
    // one of these `sleeping`, so the ones this skips are not lost —
    // they are asleep, listed, and one wake away.
    const cutoff = Date.now() - RESTORE_HORIZON_MS;
    // A surviving child is not a fresh spawn. OpenCode's one held
    // server owns its sessions; the adapter verifies each key with
    // session.get before publishing an init frame and subscribing.
    //
    // A row filed asleep or failed whose process the machine still
    // holds is one too. A register this hub did not live to finish
    // settles its rows `sleeping` and dies before the restores go
    // out; its successor then found nothing to settle, named none
    // of them, and their processes ran on with nobody attached
    // (sixteen of them, 2026-10-04). Whatever sessiond holds that a
    // row here could run again is named in this register's
    // restores; whatever custody cannot attach is listed by the agent.
    const justSettled = new Set(settled.map(({ row }) => row.id));
    const listedLive = new Set(agentFrame.instances);
    const filedAway = ctx.db
      .ownedByIds(message.machineId, [...heldIds])
      .filter(
        (row) =>
          heldIds.has(row.id) &&
          row.machineId === message.machineId &&
          !row.endIntent &&
          !justSettled.has(row.id) &&
          !listedLive.has(row.id) &&
          (row.status === "sleeping" || row.status === "error")
      )
      .map((row) => ({ row, resumes: true }));
    const held = [...settled.filter(outlived), ...filedAway];
    const heldRows = new Set(held.map(({ row }) => row.id));
    // Only a turn the restart cut starts a process again, to hand
    // that turn back once (`resumeCutTurn`): a session between
    // turns, its process gone, is filed asleep and stays so until
    // a person, its parent or its own wait wakes it. A reboot of
    // obelisk (2026-10-23) restored every row marked running
    // whatever it was doing.
    const fresh = settled
      .filter(() => custody.state === "available")
      .filter(({ row }) => !heldRows.has(row.id))
      .filter((orphan) => orphan.resumes && orphan.row.sessionId)
      .filter(
        ({ row }) =>
          row.turnOpenAt !== null && row.turnOpenAt !== TURN_UNRECORDED
      )
      // `row` is the pre-settle snapshot, so this reads when the session
      // last moved, not when the settle just now touched it.
      .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime())
      .filter((orphan) => orphan.row.updatedAt.getTime() >= cutoff)
      .slice(0, RESTORE_MAX);
    // A summariser is never brought back: a continuation that still
    // needs one reads it or replaces it itself (advanceContinuation,
    // below). One still running that no unsettled continuation
    // names is nobody's, and is stopped.
    const revivable = [...held, ...fresh].filter(
      ({ row }) =>
        !row.endIntent &&
        row.kind !== "summariser" &&
        !returningRemoved.has(row.id)
    );
    Object.assign(ret, { cutoff, heldRows, revivable });
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the restores: which row goes back how, and the turns it yields between them, are one sequence.
  const restoresSent = async (ret: MachineReturn): Promise<void> => {
    const {
      ws,
      message,
      agentFrame,
      settled,

      heldIds,
      heldOpencode,
      returningRemoved,
      cutoff,
      heldRows,
      revivable,
    } = ret;
    // A turn between the settle and the restores: a register of a
    // machine holding thousands of rows held the hub's thread for
    // 640 ms in one piece on a copy of the live database
    // (2026-10-24).
    await new Promise<void>((resolve) => setImmediate(resolve));
    await ctx.readLaunchDirs(message.machineId);
    let restoreBatch = 0;
    for (const orphan of revivable) {
      ctx.restore(ws, orphan.row, heldRows.has(orphan.row.id));
      restoreBatch += 1;
      if (restoreBatch % 8 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    const restoredIds = new Set(revivable.map(({ row }) => row.id));
    const named = new Set(
      ctx.db
        .continuationSlips()
        .filter((job) => !ctx.SETTLED.has(job.stage))
        .map((job) => job.summariserInstanceId)
    );
    const toEnd = ctx.db
      .ownedByIds(
        message.machineId,
        reattachable([...heldIds], agentFrame.instances)
      )
      .filter(
        (row) =>
          row.machineId === message.machineId &&
          row.kind === "summariser" &&
          !named.has(row.id)
      );
    // Rows still live at disconnect (now settled above) retain custody.
    // A previously sleeping row only recovers within the fresh-spawn
    // horizon: an older held tool may apply a stale patch to a tree
    // since rewritten. Inspect those without attaching or replaying asks.
    // Discarded/stopped rows are never even sent to the server to probe.
    if (heldOpencode) {
      for (const row of ctx.db.listInstancesOn(message.machineId)) {
        if (
          row.machineId === message.machineId &&
          !restoredIds.has(row.id) &&
          !returningRemoved.has(row.id) &&
          row.kind !== "summariser" &&
          traitsOf(row.harness).custody === "server" &&
          row.sessionId &&
          (row.status === "sleeping" || row.status === "error")
        ) {
          ctx.restore(
            ws,
            row,
            row.updatedAt.getTime() >= cutoff ? "busy" : "inspect"
          );
          restoreBatch += 1;
          if (restoreBatch % 8 === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }
      }
    }
    if (settled.length > revivable.length) {
      console.log(
        `[hub] ${message.machineId}: restoring ${revivable.length} of ${settled.length} orphaned session(s); the rest are sleeping`
      );
    }
    Object.assign(ret, { toEnd });
  };

  const boardPublished = (ret: MachineReturn): void => {
    const { message } = ret;
    ctx.publishInstances(message.machineId);
    detach(ctx.pushAgents(message.machineId), "agent push");
    // And what its stored conversations are called, for the ones nobody
    // has ever named — off the catalog the daemon just read anyway.
    detach(ctx.nameStoredSessions(message.machineId), "stored session names");
  };

  const ackSent = async (ret: MachineReturn): Promise<void> => {
    const { ws, message, agentFrame, revivable } = ret;
    // The ledger the returning agent reattaches against: what this hub
    // has already ingested of each session the daemon is about to hold.
    // Computed AFTER `settleInstances` and after the restores above, so
    // it names exactly the sessions a reattach can act on — see
    // {@link reattachable} for why the restores have to be in it.
    const reattaching = reattachable(
      agentFrame.instances,
      revivable.map((orphan) => orphan.row.id)
    );
    ctx.freshAccountReports(message.machineId);
    // Whether this connection's workspaces reach the hub's preview
    // origins through their relays (agent proxy-relay.ts).
    if (agentFrame.relaysHubPreviews) {
      ctx.relayingPreviews.add(message.machineId);
    } else {
      ctx.relayingPreviews.delete(message.machineId);
    }
    ctx.sendFrame(
      ws,
      registerAck(
        message,
        ctx.streams.ingestedFor(reattaching),
        // What this hub took of each session the agent holds: it
        // sends again what it kept past each mark.
        ctx.streams.deliveredFor(agentFrame.instances),
        ctx.unknownAccountsOf(message.machineId, message.payload),
        ctx.claudeSessionsOn(message.machineId),
        // Every session this hub has on the machine: what it kept
        // for any other goes.
        ctx.db.sessionIdsOn(message.machineId),
        // This connection's credential for the hub's git remote;
        // the one its last connection held stops working.
        ctx.machineCredentials.mint(message.machineId),
        ctx.db.sessionLimits(),
        // Its machine id is this hub's own: the same computer.
        await ctx.isHubMachine(message.machineId),
        // Which of the credentials its redaction store holds the
        // hub has revoked since: those leave the store.
        ctx.db.revokedAmong(agentFrame.credentialHashes),
        ctx.hubGitOrigins(),
        ctx.hubPreviewOrigins(),
        ctx.tailnetHttps.serving()
      )
    );
  };

  const heldResent = (ret: MachineReturn): void => {
    const { message, agentFrame } = ret;
    // Behind its ack, which it waits for to take requests: what
    // was held for it while it was away goes again.
    ctx.resendHeld(message.machineId);
    ctx.handAgain(message.machineId, agentFrame.instances);
  };

  const summarisersEnded = (ret: MachineReturn): void => {
    const { toEnd } = ret;
    for (const row of toEnd) {
      ctx.endSession(row.id, "stop", {
        kind: "hub",
        why: "no summary job needs this summariser any more",
      });
    }
  };

  const reconciled = (ret: MachineReturn): void => {
    const { message, agentFrame, custody } = ret;
    ctx.lifecycle.reconcile(
      message.machineId,
      {
        custody,
        attached: agentFrame.instances,
      },
      false
    );
  };

  const windowEnded = async (ret: MachineReturn): Promise<void> => {
    const { message } = ret;
    // Behind the restores and the ack, so the agent reads each send
    // after the spawn it waits on: the register ends its window and
    // hands over what was held for it (core handover.ts). A turn
    // first: handing over a hundred kept sends is 200 ms of its own,
    // and a send to one of their sessions that arrives meanwhile is
    // owed behind them (`sendWaits`).
    await new Promise<void>((resolve) => setImmediate(resolve));
    ctx.hubStep({
      kind: "agent-register",
      machineId: message.machineId,
      now: Date.now(),
    });
  };

  const movesTakenUp = (ret: MachineReturn): void => {
    const { message } = ret;
    // Moves that waited for it go now, ahead of any start.
    ctx.takeUpMovesOn(message.machineId);
  };

  const cutTurnsResumed = (ret: MachineReturn): void => {
    const { agentFrame } = ret;
    // Behind what it was owed, which is its next turn when it has
    // any: a process a hub restored and then died before it handed
    // the cut turn back is up now, and hears of it here.
    for (const id of agentFrame.instances) {
      ctx.resumeCutTurn(id);
    }
  };

  const delegateWaitsAsked = (_ret: MachineReturn): void => {
    // Its sessions answer again: each wait their delegates hold
    // that a parent could not take as it parked is handed or told
    // now, each once (delegate-waits.ts).
    for (const parked of ctx.pending.list()) {
      ctx.delegateWaits.asked(parked);
    }
  };

  const keepAliveWake = (_ret: MachineReturn): void => {
    // Reconnect retries overdue stored schedules right after the register ACK.
    detach(ctx.keepAliveScheduler.wake(), "keepalive wake");
  };

  const continuationsGoOn = (ret: MachineReturn): void => {
    const { message } = ret;
    // Continuations waiting on this machine — for their summary, or
    // for their new session — go on from where their record says.
    for (const job of ctx.continuationsWhole(false)) {
      if (ctx.machineFor(job) === message.machineId) {
        detach(ctx.advanceContinuation(job.id), "continuation");
      }
    }
  };

  const compactionsRecovered = (ret: MachineReturn): void => {
    const { message } = ret;
    // Compactions after a move on it: a step its turn ended while
    // it or the hub was away, or one never sent, goes on now.
    for (const plan of ctx.db.atLimit.compactions()) {
      const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
      if (row?.machineId === message.machineId) {
        detach(ctx.recoverCompaction(plan.instanceId), "compaction recovery");
      }
    }
  };

  const movesBack = (ret: MachineReturn): void => {
    const { message } = ret;
    // And project moves waiting on it, likewise (moves.ts).
    ctx.moves.machineBack(message.machineId);
  };

  return [
    backRegistered,
    registryEntered,
    toolReleasesTold,
    artifactsBack,
    foldersRead,
    workResumed,
    checkoutsLearned,
    previewsReconciled,
    homeStampsReset,
    negativeLocationsForgotten,
    catalogKept,
    agentFiled,
    binaryUpdateKept,
    protocolKept,
    relayConnected,
    browsersConnected,
    sessionsSettled,
    parkedSwept,
    readsHandedBack,
    restoresChosen,
    restoresSent,
    boardPublished,
    ackSent,
    heldResent,
    summarisersEnded,
    reconciled,
    windowEnded,
    movesTakenUp,
    cutTurnsResumed,
    delegateWaitsAsked,
    keepAliveWake,
    continuationsGoOn,
    compactionsRecovered,
    movesBack,
  ];
};
