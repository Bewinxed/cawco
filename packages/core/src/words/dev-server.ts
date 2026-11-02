/**
 * The dashboard's vite servers' (`vite dev`, `vite preview`) own words: the
 * answer to a request that needs the hub when the server was started
 * without `CAWCO_DEV_HUB_URL` (apps/dashboard vite.config.ts says why it
 * has no default). Read by developers and agents, never shown in the app.
 */
export const devServerWords = {
  /** A request that needs the hub, on a vite server named none. */
  devHubUnset:
    "This request needs a hub, and this vite server was started without one. Start it with CAWCO_DEV_HUB_URL set (CAWCO_DEV_HUB_URL=http://localhost:4456 bun run dev); CAWCO_HUB_URL is not read.",
};
