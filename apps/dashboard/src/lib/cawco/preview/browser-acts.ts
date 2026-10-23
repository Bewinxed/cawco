/**
 * The person's acts on a browser from its view in the panel (hub
 * browsers.ts routes): Take over unasked, the view's neko session named so
 * the shield gives it control, Hand back, and a start for a browser that is
 * asleep or failed. Each answers null once the hub has it, else the hub's
 * sentence.
 */
import type { BrowserKey } from "@cawco/core/browser";
import { failureWords, hubRefusal } from "../hub-read";

const post = async (
  key: BrowserKey,
  act: "takeover" | "handback" | "start",
  body: Record<string, string>
): Promise<string | null> => {
  try {
    const response = await fetch(
      `/api/browsers/${encodeURIComponent(key)}/${act}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    await response.body?.cancel();
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
  post(key, "takeover", {
    instanceId: at.instanceId,
    machineId: at.machineId,
    ...(at.viewer ? { viewer: at.viewer } : {}),
  });

export const handBackFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> => post(key, "handback", { machineId });

export const startFromPanel = (
  key: BrowserKey,
  machineId: string
): Promise<string | null> => post(key, "start", { machineId });
