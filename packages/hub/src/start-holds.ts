import type { Envelope, SpawnPayload } from "@cawco/core/protocol";
import type { HubContext } from "./hub-context";
import type { HubTimer } from "./lifetime";

/** Each machine's paced launches: when the last went, those waiting their turn (each kept on its row, `db.oweSpawn`), and the timer that sends the next. */
interface Pacing {
  last: number;
  queue: string[];
  timer: HubTimer | undefined;
}

export type StartHoldsContext = Pick<
  HubContext,
  | "accountStartRefusal"
  | "agentProtocols"
  | "binaryUpdateStates"
  | "bounded"
  | "db"
  | "launches"
  | "lifetime"
  | "machineName"
  | "machinePause"
  | "machinePresence"
  | "processFailed"
  | "registry"
  | "releaseOwed"
  | "sendFrame"
  | "sessionName"
  | "speaksContract"
  | "startsFreed"
>;

export const createStartHolds = (ctx: StartHoldsContext) => {
  /**
   * Why a machine takes no new session start now, or nothing when it does.
   * One the owner paused: nothing starts there until its pause ends
   * (machine-pause.ts). One installing an update: its agent is about to
   * restart, and a start held there would go with it. One whose agent does not speak this hub's
   * contract ({@link protocolRange}): a launch there would ask for no
   * credential, and its agent would stop it before its first turn. That
   * machine is offered this hub's build, and registers on it once installed.
   * One whose link dropped and is inside the window its agent gets to come
   * back (core handover.ts `presenceOf`): a start asked then was refused as
   * the machine offline, and made no row (source-burst, 2026-10-20).
   * The hub keeps the start instead, on the instance row already written for
   * it, and sends it when the machine can take it ({@link flushOwedStarts}),
   * on its register for a machine that was away.
   */
  const startHold = (
    machineId: string
  ):
    | { kind: "paused" | "update" | "build" | "away"; words: string }
    | undefined => {
    if (
      !ctx.registry.agent(machineId) &&
      ctx.machinePresence(machineId).kind === "reconnecting"
    ) {
      return {
        kind: "away",
        words: `${ctx.machineName(machineId)} is reconnecting to the hub`,
      };
    }
    const paused = ctx.machinePause.words(machineId);
    if (paused) {
      return { kind: "paused", words: paused };
    }
    if (ctx.binaryUpdateStates.get(machineId)?.phase === "installing") {
      return {
        kind: "update",
        words: `${ctx.machineName(machineId)} is installing an update`,
      };
    }
    if (!ctx.speaksContract(ctx.agentProtocols.get(machineId))) {
      return {
        kind: "build",
        words: `${ctx.machineName(machineId)} runs a CawCo build older than its hub's, which cannot start sessions for this hub until it installs the hub's build`,
      };
    }
    return undefined;
  };
  const holdingStarts = (machineId: string): boolean =>
    startHold(machineId) !== undefined;
  /**
   * Why `instanceId`'s start is kept on its row at the hub ({@link sendSpawn}),
   * in {@link startHold}'s words; nothing once it went, or while it only
   * waits its turn among the hub's own launches ({@link paceSpawn}). It goes
   * by itself when the hold ends ({@link flushOwedStarts}).
   */
  const startHeldWords = (instanceId: string): string | undefined => {
    if (!ctx.db.owesSpawn(instanceId)) {
      return undefined;
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    return row ? startHold(row.machineId)?.words : undefined;
  };

  /**
   * Sends a start as it was asked (`envelope`), bound now ({@link bounded}:
   * its workspace, its generation, in flight from here); or, while its
   * machine takes no start ({@link startHold}), keeps it on its row as
   * asked, and binds it when it goes ({@link flushOwedStarts}). Either way
   * its credential and account are the hub's as of its start
   * ({@link grantLaunch}). A dashboard's start ({@link sendDashboardStart})
   * and a continuation's ({@link spawnFromHub}) meet the same hold.
   */
  const sendSpawn = (
    agent: ReturnType<typeof ctx.registry.agent>,
    machineId: string,
    envelope: Envelope<SpawnPayload>,
    /** The hub's own launch (a restore, a relaunch): it goes in its turn ({@link paceSpawn}). */
    paced = false
  ): Envelope | undefined => {
    if (holdingStarts(machineId) && envelope.instanceId) {
      ctx.db.oweSpawn(envelope.instanceId, envelope, Date.now());
      return;
    }
    // No link and no hold: the caller found the machine offline first.
    if (!agent) {
      return;
    }
    if (paced && envelope.instanceId && paceSpawn(machineId)) {
      ctx.db.oweSpawn(envelope.instanceId, envelope, Date.now());
      queueStart(machineId, envelope.instanceId);
      return;
    }
    const frame = { ...envelope, payload: ctx.bounded(envelope.payload) };
    ctx.sendFrame(agent, frame);
    // What waited for this start goes right behind it, in the order taken.
    if (envelope.instanceId) {
      ctx.releaseOwed({ instanceId: envelope.instanceId });
    }
    return frame;
  };

  /**
   * How far apart the hub's own launches on one machine go: a register's
   * restores, a relaunch onto another account, the starts a machine was
   * owed while it took none. obelisk's boot of 2026-10-23 started 19
   * relaunches in one second, about 240 Claude Code processes with what else
   * woke, load around 143; one launch at a time keeps a boot's handful of
   * cut turns from landing on the machine at once.
   */
  const SPAWN_PACE_MS = 1500;
  const pacings = new Map<string, Pacing>();
  const pacingOf = (machineId: string): Pacing => {
    const known = pacings.get(machineId);
    if (known) {
      return known;
    }
    const fresh: Pacing = { last: 0, queue: [], timer: undefined };
    pacings.set(machineId, fresh);
    return fresh;
  };

  /**
   * Whether the hub's own launch on `machineId` waits its turn now: one
   * went within {@link SPAWN_PACE_MS}, or others wait before it. A launch
   * that need not wait is counted as it goes.
   */
  const paceSpawn = (machineId: string): boolean => {
    const pacing = pacingOf(machineId);
    if (pacing.queue.length > 0 || Date.now() - pacing.last < SPAWN_PACE_MS) {
      return true;
    }
    pacing.last = Date.now();
    return false;
  };

  /** `instanceId`'s start, kept on its row, waits its turn on `machineId`. */
  const queueStart = (machineId: string, instanceId: string): void => {
    const pacing = pacingOf(machineId);
    if (!pacing.queue.includes(instanceId)) {
      pacing.queue.push(instanceId);
    }
    armPace(machineId);
  };

  /** Arms the send of `machineId`'s next start in its turn. */
  const armPace = (machineId: string): void => {
    const pacing = pacingOf(machineId);
    if (pacing.timer || pacing.queue.length === 0 || ctx.lifetime.closed()) {
      return;
    }
    pacing.timer = ctx.lifetime.after(
      Math.max(0, pacing.last + SPAWN_PACE_MS - Date.now()),
      () => {
        pacing.timer = undefined;
        sendNextStart(machineId);
        armPace(machineId);
      }
    );
  };

  /**
   * Sends the next start `machineId` is owed, exactly once: the row's claim
   * is taken before the send. While the machine is away or takes no start,
   * its line empties and each start stays on its row for its next flush
   * ({@link flushOwedStarts}). A start the person has since stopped is
   * dropped; one taken already, or dropped, gives its turn to the next.
   *
   * Each is bound as it goes ({@link bounded}), on the account its row runs
   * on now, and its machine asks for its credential as it starts it
   * ({@link grantLaunch}). One that may not go (its account was signed out
   * there while the machine updated, or its launch is refused) fails once
   * with the reason: the row and its work item say so, and what it was sent
   * stays owed.
   */
  const sendNextStart = (machineId: string): void => {
    const pacing = pacingOf(machineId);
    const agent = ctx.registry.agent(machineId);
    if (!agent || holdingStarts(machineId)) {
      pacing.queue = [];
      return;
    }
    const id = pacing.queue.shift();
    const owed = ctx.db.owedSpawns(machineId).find((one) => one.id === id);
    if (!(owed && ctx.db.takeOwedSpawn(owed.id))) {
      return;
    }
    // Taken off its row: it is in flight below only if it goes.
    ctx.launches.delete(owed.id);
    const row = ctx.db.ownedInstance(owed.id, machineId);
    if (
      !row ||
      row.endIntent ||
      ["stopped", "discarded"].includes(row.status)
    ) {
      return;
    }
    const asked = owed.envelope;
    const launch = boundOwed(machineId, owed.id, asked.payload);
    if (!launch) {
      return;
    }
    pacing.last = Date.now();
    // To the id the machine has now: it may have re-joined under a new one
    // since the start was owed (`takeFormerId`).
    ctx.sendFrame(agent, { ...asked, machineId, payload: launch });
    // What it was sent while its start was held goes right behind it.
    ctx.releaseOwed({ instanceId: owed.id });
  };

  /**
   * Every start a machine is owed goes, in the order they were asked for,
   * one at a time ({@link sendNextStart}, {@link SPAWN_PACE_MS} apart). Runs
   * when the machine registers and when its update state changes, and does
   * nothing while it still takes no start ({@link startHold}).
   */
  const flushOwedStarts = (machineId: string): void => {
    if (!ctx.registry.agent(machineId) || holdingStarts(machineId)) {
      return;
    }
    for (const owed of ctx.db.owedSpawns(machineId)) {
      queueStart(machineId, owed.id);
    }
    ctx.startsFreed(machineId);
  };

  /**
   * A kept start bound as it goes ({@link flushOwedStarts}), or, when it may
   * not go, failed once with the reason ({@link processFailed}).
   */
  const boundOwed = (
    machineId: string,
    instanceId: string,
    asked: SpawnPayload
  ): SpawnPayload | undefined => {
    try {
      // Its account may have been signed out there while the machine updated.
      const [stored] = ctx.db.getInstancesByIds([instanceId]);
      const refused =
        stored &&
        ctx.accountStartRefusal(machineId, stored, ctx.sessionName(stored));
      if (refused) {
        throw new Error(refused);
      }
      // In flight from here ({@link launchGoes}).
      return ctx.bounded(asked);
    } catch (problem) {
      const reason =
        problem instanceof Error ? problem.message : String(problem);
      console.warn(`[hub] not starting ${instanceId}: ${reason}`);
      ctx.processFailed(machineId, instanceId, reason);
      return undefined;
    }
  };

  return {
    startHold,
    holdingStarts,
    startHeldWords,
    sendSpawn,
    flushOwedStarts,
  };
};
