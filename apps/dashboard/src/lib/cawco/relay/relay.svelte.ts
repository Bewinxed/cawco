/**
 * The stream relay's journey on this screen (core stream-relay.ts, hub
 * relay-journey.ts): what every place that draws its card shares.
 *
 * - **This screen's proof** (`proveRelayHere`): a 60 s credential, then one
 *   `RTCPeerConnection` per relay URL with `iceTransportPolicy: "relay"`
 *   ("Only ICE candidates whose IP addresses are being relayed, such as
 *   those being passed through a TURN server, will be considered",
 *   developer.mozilla.org RTCPeerConnection), each waiting 8 s for a
 *   candidate whose `type` is `relay`; a 401 in `onicecandidateerror` is a
 *   refused credential, not an unreachable relay. One more, through the
 *   relay's STUN, reads the public address the relay sees this screen at (its
 *   server-reflexive candidate), so the hub tells inside from outside
 *   wherever this screen reached it from. It runs by itself once per page
 *   the moment the start ticks, and again on Check again.
 * - **Acts** (`actOnRelayCard`): Check again is this screen's own proof;
 *   every other act is the hub's.
 * - **The take-over's entry** ({@link relayEntry}, {@link setUpRelay}): the
 *   later item that draws the stream's place reads whether this page came
 *   through a domain while no relay is live, and opens the journey there.
 */
import type {
  RelayAct,
  RelayJourneyView,
  RelayStep,
} from "@cawco/core/stream-relay";
import {
  actOnRelay,
  cawco,
  relayTry,
  reportRelayProof,
} from "#lib/cawco/client.svelte.js";

/** A TURN URL's scheme and its query, as the STUN URL through its host drops them. */
const TURN_SCHEME = /^turns?:/;
const QUERY = /\?.*$/;
/** How long a relay candidate has to come, per URL (the journey design's 8 s). */
const PROVE_MS = 8000;
/** A TURN server's refusal of a credential (RFC 8656 401 Unauthorized). */
const UNAUTHORIZED = 401;

type Outcome = "answered" | "refused" | "unreachable";

/** One URL through the relay: a relay candidate within {@link PROVE_MS}, a refused credential, or neither. */
const probe = (
  url: string,
  username: string,
  credential: string
): Promise<Outcome> =>
  new Promise((resolve) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: url, username, credential }],
      iceTransportPolicy: "relay",
    });
    let refused = false;
    let settled = false;
    const done = (outcome: Outcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      peer.close();
      resolve(outcome);
    };
    const timer = setTimeout(
      () => done(refused ? "refused" : "unreachable"),
      PROVE_MS
    );
    peer.onicecandidate = (event) => {
      if (event.candidate?.type === "relay") {
        done("answered");
      } else if (event.candidate === null) {
        done(refused ? "refused" : "unreachable");
      }
    };
    peer.onicecandidateerror = (event) => {
      if (
        (event as RTCPeerConnectionIceErrorEvent).errorCode === UNAUTHORIZED
      ) {
        refused = true;
      }
    };
    peer.createDataChannel("cawco-relay-proof");
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .catch(() => done("unreachable"));
  });

/** The public address the relay's STUN answer sees this screen at, through `turnUrl`'s host on UDP; null when none answered. */
const seenBy = (turnUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const stun = turnUrl.replace(TURN_SCHEME, "stun:").replace(QUERY, "");
    const peer = new RTCPeerConnection({ iceServers: [{ urls: stun }] });
    let settled = false;
    const done = (address: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      peer.close();
      resolve(address);
    };
    const timer = setTimeout(() => done(null), PROVE_MS);
    peer.onicecandidate = (event) => {
      if (event.candidate?.type === "srflx" && event.candidate.address) {
        done(event.candidate.address);
      } else if (event.candidate === null) {
        done(null);
      }
    };
    peer.createDataChannel("cawco-relay-seen");
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .catch(() => done(null));
  });

/** This screen's proof running now: the card draws its step as checking. */
export const relayProof = $state({
  running: false,
  refusal: null as string | null,
});

/** The URLs this page proved by itself, so the start's tick proves once per page. */
let provedFor: string | null = null;

/** This screen's proof of the relay, told to the hub: each URL at once, and the screen's own public address. */
export async function proveRelayHere(): Promise<void> {
  if (relayProof.running) {
    return;
  }
  relayProof.running = true;
  relayProof.refusal = null;
  try {
    const given = await relayTry();
    provedFor = given.urls.join(" ");
    const [outcomes, seenAs] = await Promise.all([
      Promise.all(
        given.urls.map((url) => probe(url, given.username, given.credential))
      ),
      given.urls[0] ? seenBy(given.urls[0]) : Promise.resolve(null),
    ]);
    await reportRelayProof({
      answered: given.urls.filter((_, at) => outcomes[at] === "answered"),
      refused: given.urls.filter((_, at) => outcomes[at] === "refused"),
      seenAs,
    });
  } catch (error) {
    relayProof.refusal = error instanceof Error ? error.message : String(error);
  } finally {
    relayProof.running = false;
  }
}

/** Whether the journey's start has ticked and nobody has proven it from outside yet. */
const unproven = (journey: RelayJourneyView): boolean =>
  journey.steps.some(
    (step) => step.step === "start" && step.state === "done"
  ) &&
  !journey.steps.some((step) => step.step === "prove" && step.state === "done");

/**
 * The start's tick proves the relay from here, once per page and relay:
 * every place that draws the card calls this in its own effect, and the
 * first to see the tick runs it.
 */
export function proveOnStart(journey: RelayJourneyView | undefined): void {
  if (
    journey &&
    journey.urls.length > 0 &&
    unproven(journey) &&
    provedFor !== journey.urls.join(" ") &&
    !relayProof.running
  ) {
    provedFor = journey.urls.join(" ");
    proveRelayHere();
  }
}

/** The steps as this screen draws them: the proof's step checking while it runs here. */
export const stepsHere = (steps: RelayStep[]): RelayStep[] =>
  relayProof.running
    ? steps.map((step) =>
        step.step === "prove" && step.state !== "done"
          ? { step: "prove", state: "checking" }
          : step
      )
    : steps;

/** What the person pressed on the card: Check again proves from here; the rest is the hub's. */
export async function actOnRelayCard(act: RelayAct): Promise<void> {
  if (act.act === "check-again") {
    await proveRelayHere();
    return;
  }
  await actOnRelay(act);
}

/**
 * The take-over's stream place (a later item draws it): whether to show the
 * journey's entry there, because this page came through a domain, which
 * carries pages and not streams, while no relay is live; and that domain.
 */
export const relayEntry = (): { show: boolean; domain: string | null } => {
  const domain = cawco.relayDomain;
  const live = cawco.relayJourney?.summary?.state === "live";
  return { show: domain !== null && !live, domain };
};

/** The entry's Set up the stream relay: the journey opened, its row in Needs you, the card in place. */
export const setUpRelay = (): Promise<void> => actOnRelay({ act: "set-up" });
