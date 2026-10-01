import { cawco } from "../client.svelte";

/**
 * Why a write cannot happen right now, or null when it can. Every section's
 * primary action, every Save and every Delete is disabled on it and carries
 * it as its title, so a hub that is down says the same sentence everywhere.
 * It is not printed on the page: the reconnect banner is the one place an
 * outage is said out loud, and a line that came and went with the socket
 * moved everything under it.
 */
export const hubDown = (): string | null =>
  cawco.status === "connected"
    ? null
    : "Can't save while the hub is unreachable";
