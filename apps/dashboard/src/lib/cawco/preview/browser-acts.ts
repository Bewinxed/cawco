/**
 * The person's acts on a browser from its view in the panel (hub
 * browsers.ts routes): Take over unasked, the view's neko session named so
 * the shield gives it control, Hand back, and a start for a browser that is
 * asleep or failed. Each answers null once the hub has it, else the hub's
 * sentence.
 */
import type { BrowserKey } from "@cawco/core/browser";
import { hub } from "#lib/platform/hub.js";
import {
  failureWords,
  type HubAnswer,
  hubDone,
} from "#lib/platform/hub-read.js";

const post = async (
  call: Promise<HubAnswer<unknown>>
): Promise<string | null> => {
  try {
    await hubDone(call);
    return null;
  } catch (error) {
    return failureWords(error);
  }
};

/** Take over from session `instanceId`'s panel; with `viewer`, control goes to that neko session. */
export const takeOverFromPanel = (
  key: BrowserKey,
  at: { instanceId: string; machineId: string; viewer?: string | null }
): Promise<string | null> =>
  post(
    hub.api.browsers({ key }).takeover.post({
      instanceId: at.instanceId,
      machineId: at.machineId,
      ...(at.viewer ? { viewer: at.viewer } : {}),
    })
  );

export const handBackFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> =>
  post(hub.api.browsers({ key }).handback.post({ machineId }));

export const startFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> =>
  post(hub.api.browsers({ key }).start.post({ machineId }));
