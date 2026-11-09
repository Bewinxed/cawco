/**
 * HTTPS on the hub machine's tailnet name: read on connect, then kept by
 * each `tailnet.https` frame; its row ticks a moment once its step is taken.
 */

import type { TailnetHttps } from "@cawco/core/tailnet-https";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";

const tailnetState = $state({
  /**
   * HTTPS on the hub machine's tailnet name (`GET /api/tailnet-https`, then
   * each `tailnet.https` frame): Needs you shows its step while one needs
   * the person; undefined until read.
   */
  tailnetHttps: undefined as TailnetHttps | undefined,
  /** Its step was taken while this page stood: the row ticks for {@link TAILNET_TICK_MS}, then leaves. */
  tailnetTicked: false,
});

// HTTPS on the tailnet name changed: Needs you's step moves on, or ticks.
export function takeTailnet(frame: FrameOf<"tailnet.https">): void {
  heardFrame("tailnet.https");
  const ticked =
    tailnetState.tailnetHttps?.state === "needs" &&
    frame.tailnet.state === "serving";
  tailnetState.tailnetHttps = frame.tailnet;
  tailnetState.tailnetTicked = ticked;
  if (ticked) {
    setTimeout(() => {
      tailnetState.tailnetTicked = false;
    }, TAILNET_TICK_MS);
  }
}

/** How long HTTPS's onboarding row stands ticked once its step is taken. Our choice: long enough to read and press its Open. */
const TAILNET_TICK_MS = 12_000;

/** HTTPS on the hub machine's tailnet name, as the hub has it now. */
export async function readTailnetHttps(): Promise<void> {
  const mark = readLeaves();
  const read = await load(hubData(hub.api["tailnet-https"].get()));
  if (read && !heardSince("tailnet.https", mark)) {
    tailnetState.tailnetHttps = read;
  }
}

/** HTTPS on the hub machine's tailnet name, and whether its step was just taken. */
export const tailnetStore = {
  /** HTTPS on the hub machine's tailnet name; undefined until read. */
  get tailnetHttps(): TailnetHttps | undefined {
    return tailnetState.tailnetHttps;
  },
  /** Its step was taken while this page stood, a moment ago: the row ticks. */
  get tailnetTicked(): boolean {
    return tailnetState.tailnetTicked;
  },
};
