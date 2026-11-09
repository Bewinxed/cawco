/**
 * A store's read of the hub that may come back empty: the answer, or null
 * after saying on the console why there is none.
 */
import type { HubRequest } from "@cawco/core/hub-request";
import { hubFetch } from "#lib/platform/hub-read.js";

export async function load<T>(request: HubRequest): Promise<T | null> {
  try {
    const response = await hubFetch(request);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[cawco] ${request.path} failed:`, error);
    return null;
  }
}
