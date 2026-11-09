/**
 * The fleet's hooks and their versions.
 */

import { HOOK_TEMPLATES, type HookDraft, hookProblem } from "@cawco/core/hooks";
import { Elysia, t } from "elysia";
import { hashHookMaterial } from "../db/fleet-catalog";
import { undoable } from "../db/trash";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

/** A hook on one machine, as the routes that read or adopt its copy name it. */
const HOOK_ON_MACHINE = t.Object({ machineId: t.String(), id: t.String() });

export const fleetHookRoutes = ({
  boundProblem,
  db,
  fleetChanged,
  fleetSyncs,
  hookCopyOff,
  hookDraftOf,
  keepHookVersion,
  machineFleetItems,
  machineName,
  publishInstances,
  pushTarget,
  readMachineHookScript,
}: Pick<
  HubContext,
  | "boundProblem"
  | "db"
  | "fleetChanged"
  | "fleetSyncs"
  | "hookCopyOff"
  | "hookDraftOf"
  | "keepHookVersion"
  | "machineFleetItems"
  | "machineName"
  | "publishInstances"
  | "pushTarget"
  | "readMachineHookScript"
>) =>
  new Elysia()
    /**
     * Hooks (NEW.md §11): the one fleet row that is executable, so the gate
     * here is `hookProblem` — the same validator the editor refuses a save
     * with — rather than the loose shape checks a config blob gets elsewhere.
     * A hook that passed the editor's own test box and still fails here would
     * be a hub disagreeing with itself about what is safe to run.
     */
    .get("/api/fleet/hooks", () => ({
      hooks: db.listFleetHooks(),
      templates: HOOK_TEMPLATES,
    }))
    .put(
      "/api/fleet/hooks/:id",
      {
        // A partial update: every field is optional, a given one replaces the
        // stored value, `null` clears an optional one, and an absent one
        // keeps what is stored. The merged hook is what gets validated.
        body: t.Object({
          name: t.Optional(t.String()),
          enabled: t.Optional(t.Boolean()),
          event: t.Optional(t.String()),
          matcher: t.Optional(t.Nullable(t.String())),
          // Stored and written verbatim, so the schema only asks that it be an
          // object; `hookProblem` checks the fields that make it runnable.
          handler: t.Optional(t.Record(t.String(), t.Unknown())),
          script: t.Optional(t.Nullable(t.String())),
          scope: t.Optional(t.Nullable(t.String())),
          projectId: t.Optional(t.Nullable(t.String())),
          areaId: t.Optional(t.Nullable(t.String())),
          expectedHash: t.Optional(t.String()),
        }),
      },
      ({ params, body, status }) => {
        const { expectedHash, ...patch } = body;
        const current = db.getFleetHook(params.id);
        // The same conflict a memory document's save answers with: what the
        // writer had in front of them is stale, so the row really there comes
        // back rather than one editor's version winning by being last.
        if (
          expectedHash !== undefined &&
          current &&
          current.hash !== expectedHash
        ) {
          return status(409, current);
        }

        const draft = hookDraftOf(current, patch);
        if (typeof draft.enabled !== "boolean") {
          return status(400, "Say whether the hook is enabled.");
        }
        const [first] = [
          boundProblem(draft),
          ...Object.values(hookProblem(draft)),
        ].filter(Boolean);
        if (first) {
          return status(400, first);
        }

        if (current) {
          keepHookVersion(current);
        }

        const hook = db.putFleetHook({ ...draft, id: params.id });
        fleetChanged();
        return hook;
      }
    )
    .delete("/api/fleet/hooks/:id", ({ params, status }) => {
      const current = db.getFleetHook(params.id);
      if (!current) {
        return status(404, `the fleet keeps no hook ${params.id}`);
      }

      keepHookVersion(current);
      const trashed = db.trash.put(
        { kind: "hook", key: params.id },
        Date.now()
      );
      if (trashed === undefined) {
        return status(404, `the fleet keeps no hook ${params.id}`);
      }
      fleetChanged();
      return undoable(trashed);
    })
    // What one hook used to be, newest first, without the material. `?hookId=`
    // narrows to that hook's own history; nothing named lists every hook's,
    // for a fleet-wide undo panel.
    .get(
      "/api/fleet/hooks/history",
      { query: t.Object({ hookId: t.Optional(t.String()) }) },
      ({ query }) => db.listFleetHookHistory(query.hookId)
    )
    .get("/api/fleet/hooks/history/:id", hidden, ({ params, status }) => {
      const version = db.fleetHookVersion(Number(params.id));
      return version ?? status(404, `no hook version ${params.id}`);
    })
    // Undo, through the same door as a save: what restoring replaces is
    // itself kept first, so a restore of the wrong version is undone the
    // same way a bad edit is.
    .post(
      "/api/fleet/hooks/restore",
      { body: t.Object({ id: t.Number() }) },
      ({ body, status }) => {
        const version = db.fleetHookVersion(body.id);
        if (!version) {
          return status(404, `no hook version ${body.id}`);
        }

        const current = db.getFleetHook(version.hookId);
        if (current) {
          keepHookVersion(current);
        }

        const hook = db.putFleetHook({
          id: version.hookId,
          name: version.name,
          enabled: version.enabled,
          event: version.event,
          matcher: version.matcher,
          handler: version.handler,
          script: version.script,
          scope: version.scope,
          projectId: version.projectId,
        });
        fleetChanged();
        return hook;
      }
    )
    // One machine's copy of a hook's script, for the compare beside a drift.
    .post(
      "/api/fleet/hooks/peek",
      { body: HOOK_ON_MACHINE },
      async ({ body, set, status }) => {
        const read = await hookCopyOff(body, set, status);
        if ("refused" in read) {
          return read.refused;
        }
        // 204: the machine has no copy of this hook's script.
        return read.copy ?? status(204);
      }
    )
    // The other way to settle a drifted hook: the machine's edited script
    // becomes the fleet's, kept through the same door a save goes through so
    // what it replaces is in the history. Every other machine then gets it,
    // and the machine it came from finds its file already says so.
    .post(
      "/api/fleet/hooks/adopt",
      { body: HOOK_ON_MACHINE },
      async ({ body, set, status }) => {
        const read = await hookCopyOff(body, set, status);
        if ("refused" in read) {
          return read.refused;
        }
        const { current } = read;
        if (!read.copy) {
          return status(
            404,
            `${machineName(body.machineId)} has no script for ${current.name}`
          );
        }

        const draft: HookDraft = {
          name: current.name,
          enabled: current.enabled,
          event: current.event,
          matcher: current.matcher,
          handler: current.handler,
          script: read.copy.content,
          scope: current.scope,
          projectId: current.projectId,
        };
        const [first] = Object.values(hookProblem(draft));
        if (first) {
          return status(400, first);
        }

        keepHookVersion(current);
        const hook = db.putFleetHook({ ...draft, id: body.id });
        fleetChanged();
        return hook;
      }
    )
    // The click for a hook that drifted on one machine, or that a reader
    // wants there right now rather than at the next reconnect: `force: true`
    // on the one row named, or on every enabled one when none is.
    //
    // The machine is read first, as a memory push reads it: an edited script
    // an overwrite destroys exists nowhere else, so it goes into the hook's
    // history before it goes, and a machine that will not answer stops the
    // push.
    .post(
      "/api/fleet/hooks/push",
      {
        body: t.Object({ machineId: t.String(), id: t.Optional(t.String()) }),
      },
      async ({ body, set, status }) => {
        const target = pushTarget(body, status);
        if ("refused" in target) {
          return target.refused;
        }
        const { config } = target;
        if (config.hooks.length === 0) {
          return status(400, "the fleet keeps no hooks to push");
        }
        if (
          body.id !== undefined &&
          !config.hooks.some((hook) => hook.id === body.id)
        ) {
          return status(404, `the fleet keeps no hook ${body.id}`);
        }

        const forced = db
          .listFleetHooks()
          .filter((hook) =>
            body.id === undefined ? hook.enabled : hook.id === body.id
          );
        for (const hook of forced) {
          if (hook.script === undefined) {
            continue;
          }
          const read = await readMachineHookScript(
            body.machineId,
            hook.id,
            set
          );
          if (!read.ok) {
            return status(read.code, read.said);
          }
          if (read.copy && read.copy.content !== hook.script) {
            const theirs = { ...hook, script: read.copy.content };
            db.recordFleetHook({
              hookId: hook.id,
              name: hook.name,
              enabled: hook.enabled,
              event: hook.event,
              matcher: hook.matcher,
              handler: hook.handler,
              script: theirs.script,
              hash: hashHookMaterial(theirs),
              scope: hook.scope,
              projectId: hook.projectId,
              source: `machine:${body.machineId}`,
            });
          }
        }

        const ids = forced.map((hook) => hook.id);
        // Each hook's item: the fleet's own, or a project's, which the
        // machine writes at each of the project's places there.
        fleetSyncs.force(
          body.machineId,
          [...machineFleetItems(body.machineId).keys()].filter((item) =>
            ids.some(
              (id) =>
                item === `hook:${id}` ||
                (item.startsWith("project:") && item.endsWith(`/hook:${id}`))
            )
          )
        );
        fleetSyncs.changed(`an overwrite of hook(s) ${ids.join(", ")}`, {
          machineId: body.machineId,
        });
        publishInstances(body.machineId);
        return { ok: true };
      }
    );
