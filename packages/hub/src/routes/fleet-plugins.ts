/**
 * The fleet's plugins.
 */

import { detach } from "@cawco/core/detach";
import { Elysia, problem, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";

export const fleetPluginRoutes = ({
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
>) =>
  new Elysia()
    .put(
      "/api/fleet/plugins/:id",
      { body: t.Object({ enabled: t.Optional(t.Boolean()) }) },
      ({ params, body }) => {
        const plugin = db.putPlugin({ id: params.id, enabled: body.enabled });
        // Fetched before the machines are told about it, so the first sync that
        // reaches them already carries the files rather than a name to go and
        // resolve. A fetch that fails leaves its sentence on the row and the
        // fan-out still happens — the fleet is not held up by one plugin.
        // The route answers now, the row marked `fetching`; the outcome is
        // a `fleet.fetch` frame (`fetchPlugins`).
        detach(
          fetchPlugins([params.id]).finally(() => fleetChanged()),
          "plugin resolve"
        );
        const row = db.listPlugins().find(({ id }) => id === params.id);
        return pluginRow(row ?? plugin);
      }
    )
    // On or off: the stored row's flag, its fetched bytes as they are.
    // Nothing is fetched; every machine is told, and a machine uninstalls a
    // disabled plugin and installs an enabled one from the stored bytes.
    // Installing (a row not stored yet) is the PUT above, which fetches.
    .patch(
      "/api/fleet/plugins/:id",
      { body: t.Object({ enabled: t.Boolean() }) },
      ({ params, body }) => {
        if (!db.listPlugins().some(({ id }) => id === params.id)) {
          return problem(404, {
            code: "no-plugin-fleet",
            detail: `no plugin ${params.id} in this fleet`,
          });
        }
        db.putPlugin({ id: params.id, enabled: body.enabled });
        fleetChanged();
        const row = db.listPlugins().find(({ id }) => id === params.id);
        return row
          ? pluginRow(row)
          : problem(404, {
              code: "no-plugin-fleet",
              detail: `no plugin ${params.id} in this fleet`,
            });
      }
    )
    // Re-fetch one plugin's bytes. The same verb a skill has, and the way a
    // fleet takes a new version of something upstream moved: nothing else
    // re-resolves on its own, because a plugin that resolved once is a plugin
    // every machine already agrees on. Answers at once, the row marked
    // `fetching`, as the PUT does.
    .post("/api/fleet/plugins/:id/refresh", ({ params }) => {
      const row = db.listPlugins().find(({ id }) => id === params.id);
      if (!row) {
        return problem(404, {
          code: "no-plugin-fleet",
          detail: `no plugin ${params.id} in this fleet`,
        });
      }
      // A copy that changed goes to the machines as the item it moved; one
      // that came back the same is sent forced, so every machine online
      // converges its plugins again all the same: a refresh is the person's
      // way to have them do it.
      detach(
        fetchPlugins([params.id]).then((changed) => {
          if (changed) {
            fanOutFetched(`plugin ${params.id}`);
            return;
          }
          fleetSyncs.forceReady([`plugin:${params.id}`]);
          fleetChanged(`a refresh of plugin ${params.id}, its copy the same`);
        }),
        "plugin refresh"
      );
      return pluginRow(row);
    })
    .delete("/api/fleet/plugins/:id", ({ params }) => {
      const trashed = db.trash.put(
        { kind: "plugin", key: params.id },
        Date.now()
      );
      if (trashed === undefined) {
        return problem(404, {
          code: "no-plugin",
          detail: `the fleet installs no plugin ${params.id}`,
        });
      }
      fleetChanged();
      return undoable(trashed);
    });
