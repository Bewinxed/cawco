/**
 * Relays (Projects spec §5.5 Relay): one public path, `/hooks/<id>`, through
 * Tailscale Funnel to the hub's receiver, for one project and one provider
 * (packages/hub/src/relay.ts). What the hub answers about one.
 */

/** Who signs a relay's deliveries, and how. */
export const RELAY_PROVIDERS = ["github", "stripe", "generic"] as const;
export type RelayProvider = (typeof RELAY_PROVIDERS)[number];

/**
 * Where a relay is: `wanted` (the hub is applying it, or Tailscale can't be
 * asked now), `live` (deliveries land), `needs-owner` (one step only you can
 * take, in `reason`), `off` (removed; its path answers 404).
 */
export const RELAY_STATES = ["wanted", "live", "needs-owner", "off"] as const;
export type RelayState = (typeof RELAY_STATES)[number];

/** One relay as the hub answers it (times in ms epoch). Never its secret. */
export interface RelayView {
  connection: string | null;
  createdAt: number;
  createdBy: string;
  /** Whether a secret is set, and who made it: never the secret. */
  hasSecret: boolean;
  /** The machine whose Tailscale serves it: the hub's. */
  host: string;
  id: string;
  /** How events reach the project while it is or isn't live, in a sentence. */
  inbound: string;
  lastDeliveryAt: number | null;
  projectId: string;
  provider: RelayProvider;
  /** The public URL, once Funnel says it is live. */
  publicUrl: string | null;
  /** The exact step or command when it isn't live; null when it is. */
  reason: string | null;
  /** Whether GitHub's webhook was registered by the hub (and is deleted with the relay). */
  registered: boolean;
  state: RelayState;
  /** When the provider's test delivery arrived. */
  testedAt: number | null;
}
