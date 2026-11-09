/**
 * The fleet's harness configuration rows: Claude Code settings, OpenCode plugins and pi extensions.
 */

import { Elysia } from "elysia";
import { HARNESS_CONFIG_BODY } from "../harness-config-body";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

export const fleetHarnessConfigRoutes = ({
  harnessConfigDelete,
  harnessConfigList,
  harnessConfigPut,
}: Pick<
  HubContext,
  "harnessConfigDelete" | "harnessConfigList" | "harnessConfigPut"
>) =>
  new Elysia()
    /**
     * The fleet's Claude Code settings, OpenCode plugins and pi extensions
     * (core harness-config.ts), each kind at its own routes beside the
     * hooks': a list, a partial put by name, a delete the trash keeps for
     * its undo. Only the admin tools call them (admin-tools.ts).
     */
    .get("/api/fleet/claude-settings", hidden, () =>
      harnessConfigList("claudeSettings")
    )
    .put(
      "/api/fleet/claude-settings/:name",
      { ...hidden, body: HARNESS_CONFIG_BODY },
      ({ params, body, status }) =>
        harnessConfigPut("claudeSettings", params.name, body, status)
    )
    .delete("/api/fleet/claude-settings/:name", hidden, ({ params, status }) =>
      harnessConfigDelete("claudeSettings", params.name, status)
    )
    .get("/api/fleet/opencode-plugins", hidden, () =>
      harnessConfigList("opencodePlugins")
    )
    .put(
      "/api/fleet/opencode-plugins/:name",
      { ...hidden, body: HARNESS_CONFIG_BODY },
      ({ params, body, status }) =>
        harnessConfigPut("opencodePlugins", params.name, body, status)
    )
    .delete("/api/fleet/opencode-plugins/:name", hidden, ({ params, status }) =>
      harnessConfigDelete("opencodePlugins", params.name, status)
    )
    .get("/api/fleet/pi-extensions", hidden, () =>
      harnessConfigList("piExtensions")
    )
    .put(
      "/api/fleet/pi-extensions/:name",
      { ...hidden, body: HARNESS_CONFIG_BODY },
      ({ params, body, status }) =>
        harnessConfigPut("piExtensions", params.name, body, status)
    )
    .delete("/api/fleet/pi-extensions/:name", hidden, ({ params, status }) =>
      harnessConfigDelete("piExtensions", params.name, status)
    );
