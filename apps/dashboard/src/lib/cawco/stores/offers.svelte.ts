/**
 * The offers a session's conversation carries: "make this a project" (read
 * on connect, then kept by `project_offer` frames), with the project an offer
 * answered here joined, and a project's design and large-files offers.
 */
import type {
  ProjectOfferAccepted,
  ProjectOfferSummary,
} from "@cawco/core/frames";
import { hubRequest } from "@cawco/core/hub-request";
import type {
  DesignOfferState,
  LfsOfferState,
} from "@cawco/core/project-conversation";
import { offerWords } from "@cawco/core/words/offers";
import {
  hubFetch,
  hubJson,
  hubRefusal,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { rereadHub } from "../hub/socket.svelte";

const offersState = $state({
  /**
   * "Make this a project" offers standing on plain sessions, by session id:
   * read on connect, then kept by `project_offer` frames.
   */
  projectOffers: {} as Record<string, ProjectOfferSummary>,
  /**
   * An offer this tab answered by joining a project that already was: the
   * card stays where the offer stood, saying what it joined, until put away.
   */
  projectJoins: {} as Record<string, ProjectOfferAccepted>,
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
  const offers = await load<ProjectOfferSummary[]>(
    hubRequest("GET /api/project-offers")
  );
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
  const response = await hubFetch(
    hubRequest(
      answer === "accept"
        ? "POST /api/project-offers/:instanceId/accept"
        : "POST /api/project-offers/:instanceId/dismiss",
      { path: { instanceId } }
    )
  );
  if (!response.ok) {
    throw await hubRefusal(response, offerWords.nothingChangedThen);
  }
  const offerGone = () => {
    if (!heardSince(`project_offer:${instanceId}`, mark)) {
      delete offersState.projectOffers[instanceId];
    }
  };
  if (answer === "dismiss") {
    offerGone();
    return null;
  }
  const accepted = (await response.json()) as ProjectOfferAccepted;
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

/** Where a project's design-system offer stands (hub design-offers.ts). */
export const readDesignOffer = (projectId: string): Promise<DesignOfferState> =>
  hubJson(
    hubRequest("GET /api/projects/:id/design-offer", {
      path: { id: projectId },
    }),
    { failure: refusedOrUnreached }
  );

/** Answers it: Build files the task, Not now records it; the offer as it stands after. */
export const answerDesignOffer = (
  projectId: string,
  answer: "build" | "dismiss"
): Promise<DesignOfferState> =>
  hubJson(
    hubRequest(
      answer === "build"
        ? "POST /api/projects/:id/design-offer/build"
        : "POST /api/projects/:id/design-offer/dismiss",
      { path: { id: projectId } }
    ),
    { failure: refusedOrUnreached }
  );

/** Where an offer of Git LFS for a place's left-out large files stands (hub lfs-offers.ts). */
export const readLfsOffer = (id: string): Promise<LfsOfferState> =>
  hubJson(hubRequest("GET /api/lfs-offers/:id", { path: { id } }), {
    failure: refusedOrUnreached,
  });

/** Answers it: Track commits the files through LFS, Not now records it; the offer as it stands after. */
export const answerLfsOffer = (
  id: string,
  answer: "track" | "dismiss"
): Promise<LfsOfferState> =>
  hubJson(
    hubRequest(
      answer === "track"
        ? "POST /api/lfs-offers/:id/track"
        : "POST /api/lfs-offers/:id/dismiss",
      { path: { id } }
    ),
    { failure: refusedOrUnreached }
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
