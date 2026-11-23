/**
 * The offers a session's conversation carries: "make this a project" (read
 * on connect, then kept by `project_offer` frames), with the project an offer
 * answered here joined; and the answers to the hub's offers Needs you lists
 * (a project's design system, an undeclared LFS server put away).
 */
import type {
  ProjectOfferAccepted,
  ProjectOfferSummary,
} from "@cawco/core/frames";
import type { DesignOfferState } from "@cawco/core/project-conversation";
import { offerWords } from "@cawco/core/words/offers";
import { hub } from "#lib/platform/hub.js";
import {
  hubData,
  hubDone,
  hubRefusal,
  type Refused,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { rereadHub } from "../hub/socket.svelte";

const offersState = $state<{
  /**
   * "Make this a project" offers standing on plain sessions, by session id:
   * read on connect, then kept by `project_offer` frames.
   */
  projectOffers: Record<string, ProjectOfferSummary>;

  /**
   * An offer this tab answered by joining a project that already was: the
   * card stays where the offer stood, saying what it joined, until put away.
   */
  projectJoins: Record<string, ProjectOfferAccepted>;
}>({
  projectOffers: {},
  projectJoins: {},
});

export function takeProjectOffer(frame: FrameOf<"project_offer">): void {
  heardFrame(`project_offer:${frame.instanceId}`);
  if (frame.offer) {
    offersState.projectOffers[frame.instanceId] = frame.offer;
  } else {
    delete offersState.projectOffers[frame.instanceId];
  }
}

/**
 * The standing "make this a project" offers, as the hub holds them now: each
 * session's as the read answered it, or as a `project_offer` frame since left it.
 */
export async function readProjectOffers(): Promise<void> {
  const mark = readLeaves();
  const offers = await load(hubData(hub.api["project-offers"].get()));
  if (!offers) {
    return;
  }
  const framed = (instanceId: string) =>
    heardSince(`project_offer:${instanceId}`, mark);
  offersState.projectOffers = Object.fromEntries([
    ...offers
      .filter((offer) => !framed(offer.instanceId))
      .map((offer) => [offer.instanceId, offer] as const),
    ...Object.entries(offersState.projectOffers).filter(([instanceId]) =>
      framed(instanceId)
    ),
  ]);
}

/**
 * Answers a session's offer. "Create project" makes (or joins, by remote) the
 * project from the session's folder and moves the session and its delegates
 * into it; "Not now" is recorded, and the session is never offered again.
 */
export async function answerProjectOffer(
  instanceId: string,
  answer: "accept" | "dismiss"
): Promise<ProjectOfferAccepted | null> {
  const mark = readLeaves();
  const offer = hub.api["project-offers"]({ instanceId });
  const refusal = (refused: Refused) =>
    hubRefusal(refused, offerWords.nothingChangedThen);
  const offerGone = () => {
    if (!heardSince(`project_offer:${instanceId}`, mark)) {
      delete offersState.projectOffers[instanceId];
    }
  };
  if (answer === "dismiss") {
    await hubDone(offer.dismiss.post(), refusal);
    offerGone();
    return null;
  }
  const accepted = await hubData(offer.accept.post(), refusal);
  if (!accepted.conversation) {
    // In the same change as the offer leaving: its card turns, never blinks.
    offersState.projectJoins[instanceId] = accepted;
  }
  offerGone();
  await rereadHub();
  return accepted;
}

/** Puts away the card that said what an offer joined. */
export function dismissProjectJoin(instanceId: string): void {
  delete offersState.projectJoins[instanceId];
}

/** Answers it: Build files the task, Not now records it; the offer as it stands after. */
export const answerDesignOffer = (
  projectId: string,
  answer: "build" | "dismiss"
): Promise<DesignOfferState> =>
  hubData(
    answer === "build"
      ? hub.api.projects({ id: projectId })["design-offer"].build.post()
      : hub.api.projects({ id: projectId })["design-offer"].dismiss.post(),
    refusedOrUnreached
  );

/** Puts an undeclared LFS server's refusal away from Needs you. */
export const dismissLfsRefusal = (projectId: string, endpoint: string) =>
  hubDone(
    hub.api["lfs-refusals"].dismiss.post({ projectId, endpoint }),
    refusedOrUnreached
  );

/** The offers standing on sessions, and the joins answered here. */
export const offersStore = {
  /** The "make this a project" offer standing on a session, if one does. */
  projectOfferOf: (instanceId: string): ProjectOfferSummary | undefined =>
    offersState.projectOffers[instanceId],
  /** The project an offer on this session joined, while its card stands. */
  projectJoinOf: (instanceId: string): ProjectOfferAccepted | undefined =>
    offersState.projectJoins[instanceId],
};
