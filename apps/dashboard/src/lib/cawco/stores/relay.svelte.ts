/**
 * The stream relay's journey: read on connect, then kept by each
 * `stream_relay.journey` frame, and moved by the person's acts on it.
 */

import { hubRequest } from "@cawco/core/hub-request";
import type {
  RelayAct,
  RelayAnswer,
  RelayJourneyView,
  RelayProofReport,
  RelayTry,
} from "@cawco/core/stream-relay";
import { hub } from "#lib/platform/hub.js";
import {
  hubData,
  hubJson,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";

const relayState = $state({
  /**
   * The stream relay's journey (`GET /api/stream-relay`, then each
   * `stream_relay.journey` frame): Needs you shows its row while it asks,
   * Settings › Browsers its card or its summary; undefined until read.
   */
  relayJourney: undefined as RelayJourneyView | undefined,
  /** The domain this page reached CawCo through, as the hub saw it (null by IP, the tailnet, a name of the hub's). */
  relayDomain: null as string | null,
  /** It went live and was proven from outside while this page stood: the row ticks until the next open. */
  relayTicked: false,
});

/** The journey as the hub has it now (none older than the one held), and whether it ticked while this page stood (asking, then done). */
export function keepRelayJourney(journey: RelayJourneyView): void {
  const before = relayState.relayJourney;
  if (before && journey.revision < before.revision) {
    return;
  }
  relayState.relayJourney = journey;
  if (before?.asks && !journey.asks && journey.done) {
    relayState.relayTicked = true;
  }
}

/** The stream relay's journey as the hub has it now, with this page's domain; a failed read throws its words. */
export async function readRelayJourney(): Promise<void> {
  const read = await hubData(hub.api["stream-relay"].get(), refusedOrUnreached);
  relayState.relayDomain = read.domain;
  keepRelayJourney(read.journey);
}

/** One act on the stream relay's journey: the hub's answer kept, its refusal thrown in its words. */
export async function actOnRelay(act: RelayAct): Promise<void> {
  const answered = await hubJson<RelayAnswer>(
    hubRequest("POST /api/stream-relay/act", { body: act }),
    { failure: refusedOrUnreached }
  );
  relayState.relayDomain = answered.domain;
  keepRelayJourney(answered.journey);
}

/** What this screen's proof found, told to the hub, and its answer kept. */
export async function reportRelayProof(
  report: RelayProofReport
): Promise<void> {
  const answered = await hubJson<RelayAnswer>(
    hubRequest("POST /api/stream-relay/proof", { body: report }),
    { failure: refusedOrUnreached }
  );
  keepRelayJourney(answered.journey);
}

/** A 60 s credential for this screen's proof of the relay. */
export function relayTry(): Promise<RelayTry> {
  return hubJson<RelayTry>(hubRequest("GET /api/stream-relay/try"), {
    failure: refusedOrUnreached,
  });
}

/** The stream relay's journey, the domain this page came through, and whether it just went live. */
export const relayStore = {
  /** The stream relay's journey, as the hub has it; undefined until read. */
  get relayJourney(): RelayJourneyView | undefined {
    return relayState.relayJourney;
  },
  /** The domain this page reached CawCo through, as the hub saw it; null by IP, the tailnet or a name of the hub's. */
  get relayDomain(): string | null {
    return relayState.relayDomain;
  },
  /** The relay went live and was proven from outside while this page stood: its row ticks. */
  get relayTicked(): boolean {
    return relayState.relayTicked;
  },
};
