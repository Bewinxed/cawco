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
      ({ params, body }) =>
        harnessConfigPut("claudeSettings", params.name, body)
    )
    .delete("/api/fleet/claude-settings/:name", hidden, ({ params }) =>
      harnessConfigDelete("claudeSettings", params.name)
    )
    .get("/api/fleet/opencode-plugins", hidden, () =>
      harnessConfigList("opencodePlugins")
    )
    .put(
      "/api/fleet/opencode-plugins/:name",
      { ...hidden, body: HARNESS_CONFIG_BODY },
      ({ params, body }) =>
        harnessConfigPut("opencodePlugins", params.name, body)
    )
    .delete("/api/fleet/opencode-plugins/:name", hidden, ({ params }) =>
      harnessConfigDelete("opencodePlugins", params.name)
    )
    .get("/api/fleet/pi-extensions", hidden, () =>
      harnessConfigList("piExtensions")
    )
    .put(
      "/api/fleet/pi-extensions/:name",
      { ...hidden, body: HARNESS_CONFIG_BODY },
      ({ params, body }) => harnessConfigPut("piExtensions", params.name, body)
    )
    .delete("/api/fleet/pi-extensions/:name", hidden, ({ params }) =>
      harnessConfigDelete("piExtensions", params.name)
    );
