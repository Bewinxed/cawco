import { whiffle } from "../client.svelte";

/**
 * Why a write cannot happen right now, or null when it can. Every section's
 * primary action and every Delete reads this, so a hub that is down disables
 * them with the same sentence everywhere.
 */
export const hubDown = (): string | null =>
  whiffle.status === "connected"
    ? null
    : "The hub is not connected, so nothing here can be saved until it is.";

/**
 * The same sentence, to print: only once the hub is known to be down. A
 * cold load passes through connecting, which is never a fault (HubState);
 * writes are blocked then all the same, but the page does not print a line
 * it takes back a moment later, moving everything under it twice.
 */
export const hubDownNote = (): string | null =>
  whiffle.hub === "unreachable" ? hubDown() : null;
