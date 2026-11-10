/**
 * What waits on the person beside the sessions' asks: approved actions,
 * fleet watch's notices, the artifacts in Needs you and their notices, and
 * every system law the hub caught broken. Read on connect where the hub
 * has a read, then kept whole by each one's frame.
 */
import type { ApprovedActionView } from "@cawco/core/actions";
import type {
  ArtifactNeed,
  ArtifactNeedNotice,
} from "@cawco/core/artifact-needs";
import type { FleetWatchNotice } from "@cawco/core/fleet-watch";
import type { LawBroken } from "@cawco/core/invariant";
import { hub } from "#lib/platform/hub.js";
import { hubData, hubDone } from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { notices } from "../notices.svelte";

const needsState = $state<{
  /**
   * How many times a session closed one of its questions to the person
   * since this page connected (`questions.moved` frames): a session's
   * list of what it asked him (waiting/questions.svelte.ts) reads again
   * when it moves, as it does on each `artifact.needs` frame.
   */
  questionsMoved: number;

  /**
   * Approved actions waiting on the operator (proposed, or failed or of
   * unknown outcome until put away): read on connect, then kept whole by
   * `actions` frames.
   */
  actions: ApprovedActionView[];

  /**
   * Fleet watch's needs-you notices (core `FleetWatchNotice`), oldest first:
   * read as the dashboard connects, then kept whole by the hub's
   * `fleet_watch.notices` frames.
   */
  watchNotices: FleetWatchNotice[];

  /**
   * The artifacts waiting on the person, and their notices (core
   * artifact-needs.ts): read as the dashboard connects, in `/api/pending`'s
   * `artifact.needs` envelope, then kept whole by the hub's frames.
   */
  artifactNeeds: ArtifactNeed[];
  artifactNotices: ArtifactNeedNotice[];

  /**
   * Every system law the hub caught broken since it started (core
   * invariant.ts), whole on each `laws.broken` frame; none until one breaks.
   */
  lawsBroken: LawBroken[];
}>({
  questionsMoved: 0,
  actions: [],
  watchNotices: [],
  artifactNeeds: [],
  artifactNotices: [],
  lawsBroken: [],
});

export function takeActions(frame: FrameOf<"actions">): void {
  heardFrame("actions");
  needsState.actions = frame.actions;
}

export function takeWatchNotices(frame: FrameOf<"fleet_watch.notices">): void {
  heardFrame("fleet_watch.notices");
  needsState.watchNotices = frame.notices;
}

export function takeArtifactNeeds(frame: FrameOf<"artifact.needs">): void {
  needsState.artifactNeeds = frame.needs;
  needsState.artifactNotices = frame.notices;
}

export function takeLawsBroken(frame: FrameOf<"laws.broken">): void {
  needsState.lawsBroken = frame.broken;
}

export function takeQuestionsMoved(): void {
  needsState.questionsMoved += 1;
}

/** Fleet watch's needs-you notices, as the hub holds them now. */
export async function readWatchNotices(): Promise<void> {
  const mark = readLeaves();
  const read = await load(hubData(hub.api["fleet-watch"].notices.get()));
  if (read && !heardSince("fleet_watch.notices", mark)) {
    needsState.watchNotices = read.notices;
  }
}

/** The approved actions waiting on you, as the hub holds them now. */
export async function readWaitingActions(): Promise<void> {
  const mark = readLeaves();
  const read = await load(hubData(hub.api.actions.waiting.get()));
  if (read && !heardSince("actions", mark)) {
    needsState.actions = read.actions;
  }
}

/**
 * Your decision on an approved action: approve the exact call shown (named
 * by its arguments' hash, so the hub refuses any other), deny it, or put a
 * failed or unknown one away once you have read it. Nothing is optimistic: the
 * card leaves when the hub's `actions` frame says so. A refusal is thrown in
 * the hub's own sentence.
 */
export async function decideAction(
  action: Pick<ApprovedActionView, "argsHash" | "id">,
  decision: "approve" | "deny" | "checked"
): Promise<void> {
  const act = hub.api.actions({ id: action.id });
  if (decision === "approve") {
    await hubDone(act.approve.post({ argsHash: action.argsHash }));
  } else {
    await hubDone(decision === "deny" ? act.deny.post() : act.checked.post());
  }
}

/**
 * Needs you's artifacts as this page lists them: the hub's, less the ones
 * put away with Not now (the hub's `parked`, and here at once its
 * acknowledged id, before the hub's frame says so).
 */
const artifactNeedsOpen = $derived(
  needsState.artifactNeeds.filter(
    (need) => !(need.parked || notices.seen.has(need.notNow))
  )
);

/** What waits on the person beside the asks: actions, fleet watch's notices, artifacts, broken laws. */
export const needsStore = {
  /** Approved actions waiting on you: proposed, or failed or unknown until put away. */
  get actions(): ApprovedActionView[] {
    return needsState.actions;
  },
  /** Fleet watch's needs-you notices, oldest first. */
  get watchNotices(): FleetWatchNotice[] {
    return needsState.watchNotices;
  },
  /** The artifacts waiting on the person, longest wait first. */
  get artifactNeeds(): ArtifactNeed[] {
    return needsState.artifactNeeds;
  },
  /** Needs you's artifacts, less the ones put away with Not now: what Needs you lists, and a session's mark reads. */
  get artifactNeedsOpen(): ArtifactNeed[] {
    return artifactNeedsOpen;
  },
  /** The artifacts' notices, newest first. */
  get artifactNotices(): ArtifactNeedNotice[] {
    return needsState.artifactNotices;
  },
  /** Every system law the hub caught broken since it started. */
  get lawsBroken(): LawBroken[] {
    return needsState.lawsBroken;
  },
  /**
   * What says a session's questions to the person may have moved: Needs
   * you's artifacts (`artifact.needs`, an answer, a new ask, a session
   * ending) and the count of `questions.moved` frames (a take or a
   * withdrawal). An effect that calls it runs again on each.
   */
  questionsMoved: (): readonly [ArtifactNeed[], number] => [
    needsState.artifactNeeds,
    needsState.questionsMoved,
  ],
};
