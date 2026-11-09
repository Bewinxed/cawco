/**
 * What the hub says of itself: its build, its dashboard and its names on the network.
 */

import { hostname as osHostname } from "node:os";
import { readTrial } from "@cawco/core/binary-installation";
import { Elysia } from "elysia";
import { DASHBOARD_PORT, HUB_VERSION } from "../config";
import { dashboardUrl, secureDashboardUrl } from "../dashboard-url";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { hubId } from "../hub-id";
import { localNameOf } from "../local-name";
import { localHubName } from "../mdns";

export const hubInfoRoutes = ({
  hubBuild,
  registry,
  tailnetHttps,
}: Pick<HubContext, "hubBuild" | "registry" | "tailnetHttps">) =>
  new Elysia()
    // The hub's own build rides along (NEW.md §12), so a machine's can be read
    // against something rather than taken on faith. `dashboard` is where the
    // web dashboard is reached: the app takes a person there for what it
    // has no screen of its own for yet. `secureDashboard` is its https
    // address, or null: where the app's OpenRouter sign-in returns
    // (dashboard-url.ts `secureDashboardUrl`).
    .get("/health", hidden, async () => ({
      ok: true,
      version: HUB_VERSION,
      build: hubBuild,
      // Which hub this is, whatever address answered (hub-id.ts).
      hubId: hubId(),
      dashboard: dashboardUrl(registry),
      secureDashboard: secureDashboardUrl(registry),
      // The `.local` name it holds on its networks (mdns.ts), or null:
      // what the app keeps for a hub it found on this network.
      localName: localHubName() ?? null,
      // An update of the hub's own machine is on trial (core
      // binary-installation.ts `readTrial`): the build answering here may
      // yet be rolled back, so a machine waiting for it (agent
      // binary-update.ts `hubWaitFor`) goes on only once it is confirmed.
      trial: (await readTrial()) !== undefined,
    }))
    // HTTPS on the machine's tailnet name (tailnet-https.ts): where it
    // stands, the step that needs the person while one does. Every change
    // after it comes as a `tailnet.https` frame.
    .get("/api/tailnet-https", () => tailnetHttps.state())
    // The hub's `.local` name (mdns.ts) and the dashboard's address at
    // it, with its port; none while the hub holds no name.
    .get("/api/local-name", () =>
      localNameOf(osHostname(), DASHBOARD_PORT, localHubName())
    );
