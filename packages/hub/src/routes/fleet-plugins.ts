/**
 * The fleet's plugins.
 */

import { detach } from "@cawco/core/detach";
import { Elysia, problem, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";

/**
 * What the fleet's plugins are changed with: the routes answer them, and the
 * admin tools call them directly.
 */
export const fleetPluginCalls = ({
  db,
  fanOutFetched,
  fetchPlugins,
  fleetChanged,
  fleetSyncs,
  pluginRow,
}: Pick<
  HubContext,
  | "db"
  | "fanOutFetched"
  | "fetchPlugins"
  | "fleetChanged"
  | "fleetSyncs"
  | "pluginRow"
>) => ({
  put: (id: string, body: { enabled?: boolean | undefined }) => {
    const plugin = db.putPlugin({ id, enabled: body.enabled });
    // Fetched before the machines are told about it, so the first sync that
    // reaches them already carries the files rather than a name to go and
    // resolve. A fetch that fails leaves its sentence on the row and the
    // fan-out still happens — the fleet is not held up by one plugin.
    // The route answers now, the row marked `fetching`; the outcome is
    // a `fleet.fetch` frame (`fetchPlugins`).
    detach(
      fetchPlugins([id]).finally(() => fleetChanged()),
      "plugin resolve"
    );
    const row = db.listPlugins().find((one) => one.id === id);
    return pluginRow(row ?? plugin);
  },
  /**
   * On or off: the stored row's flag, its fetched bytes as they are. Nothing
   * is fetched; every machine is told, and a machine uninstalls a disabled
   * plugin and installs an enabled one from the stored bytes. Installing (a
   * row not stored yet) is {@link put}, which fetches.
   */
  setEnabled: (id: string, enabled: boolean) => {
    if (!db.listPlugins().some((one) => one.id === id)) {
      return problem(404, {
        code: "no-plugin-fleet",
        detail: `no plugin ${id} in this fleet`,
      });
    }
    db.putPlugin({ id, enabled });
    fleetChanged();
    const row = db.listPlugins().find((one) => one.id === id);
    return row
      ? pluginRow(row)
      : problem(404, {
          code: "no-plugin-fleet",
          detail: `no plugin ${id} in this fleet`,
        });
  },
  /**
   * Re-fetch one plugin's bytes. The same verb a skill has, and the way a
   * fleet takes a new version of something upstream moved: nothing else
   * re-resolves on its own, because a plugin that resolved once is a plugin
   * every machine already agrees on. Answers at once, the row marked
   * `fetching`, as {@link put} does.
   */
  refresh: (id: string) => {
    const row = db.listPlugins().find((one) => one.id === id);
    if (!row) {
      return problem(404, {
        code: "no-plugin-fleet",
        detail: `no plugin ${id} in this fleet`,
      });
    }
    // A copy that changed goes to the machines as the item it moved; one
    // that came back the same is sent forced, so every machine online
    // converges its plugins again all the same: a refresh is the person's
    // way to have them do it.
    detach(
      fetchPlugins([id]).then((changed) => {
        if (changed) {
          fanOutFetched(`plugin ${id}`);
          return;
        }
        fleetSyncs.forceReady([`plugin:${id}`]);
        fleetChanged(`a refresh of plugin ${id}, its copy the same`);
      }),
      "plugin refresh"
    );
    return pluginRow(row);
  },
  remove: (id: string) => {
    const trashed = db.trash.put({ kind: "plugin", key: id }, Date.now());
    if (trashed === undefined) {
      return problem(404, {
        code: "no-plugin",
        detail: `the fleet installs no plugin ${id}`,
      });
    }
    fleetChanged();
    return undoable(trashed);
  },
});

export const fleetPluginRoutes = (
  ctx: Parameters<typeof fleetPluginCalls>[0]
) => {
  const calls = fleetPluginCalls(ctx);
  return new Elysia()
    .put(
      "/api/fleet/plugins/:id",
      { body: t.Object({ enabled: t.Optional(t.Boolean()) }) },
      ({ params, body }) => calls.put(params.id, body)
    )
    .patch(
      "/api/fleet/plugins/:id",
      { body: t.Object({ enabled: t.Boolean() }) },
      ({ params, body }) => calls.setEnabled(params.id, body.enabled)
    )
    .post("/api/fleet/plugins/:id/refresh", ({ params }) =>
      calls.refresh(params.id)
    )
    .delete("/api/fleet/plugins/:id", ({ params }) => calls.remove(params.id));
};
