/**
 * The person's acts on a browser from its view in the panel (hub
 * browsers.ts routes): Take over unasked, Hand back, and a start for a
 * browser that is asleep or failed. Each answers null once the hub has it, else the hub's
 * sentence.
 */
import type { BrowserKey } from "@cawco/core/browser";
import { type HubRequest, hubRequest } from "@cawco/core/hub-request";
import { failureWords, hubFetch, hubRefusal } from "../hub-read";

const post = async (request: HubRequest): Promise<string | null> => {
  try {
    const response = await hubFetch(request);
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    await response.body?.cancel();
    return null;
  } catch (error) {
    return failureWords(error);
  }
};

/** Take over from session `instanceId`'s panel. */
export const takeOverFromPanel = (
  key: BrowserKey,
  at: { instanceId: string; machineId: string }
): Promise<string | null> =>
  post(
    hubRequest("POST /api/browsers/:key/takeover", {
      path: { key },
      body: { instanceId: at.instanceId, machineId: at.machineId },
    })
  );

export const handBackFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> =>
  post(
    hubRequest("POST /api/browsers/:key/handback", {
      path: { key },
      body: { machineId },
    })
  );

export const startFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> =>
  post(
    hubRequest("POST /api/browsers/:key/start", {
      path: { key },
      body: { machineId },
    })
  );
