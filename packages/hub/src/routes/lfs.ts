/**
 * Where a project's large files live, answered to machines holding a place of it, and the refusals it reports back.
 */

import { Elysia, problem, t } from "elysia";
import { hidden } from "../hidden";
import { addressOf } from "../hub-auth";
import type { HubContext } from "../hub-context";

export const lfsRoutes = ({
  connections,
  db,
  hubAuth,
  lfsMachineProject,
  offersWaiting,
}: Pick<
  HubContext,
  "connections" | "db" | "hubAuth" | "lfsMachineProject" | "offersWaiting"
>) =>
  new Elysia()
    // Where a project's large files live, for a machine that holds a place
    // of it and runs git-lfs for it (agent host-lfs.ts): its declared LFS
    // endpoint and the connection's key as HTTP Basic, or null when it
    // declared none. Nothing but such a machine is answered.
    .get(
      "/api/lfs/projects/:id",
      { ...hidden, params: t.Object({ id: t.String() }) },
      ({ params, request, server }) => {
        const project = lfsMachineProject(
          params.id,
          hubAuth.callerOf(request, addressOf(server, request))
        );
        if ("refused" in project) {
          return problem(project.status, {
            code: "lfs-refused",
            detail: project.refused,
          });
        }
        const { lfsUrl, lfsConnection } = project.row;
        if (!(lfsUrl && lfsConnection)) {
          return { declared: null };
        }
        try {
          return {
            declared: {
              endpoint: lfsUrl,
              basic: connections.lfsBasic(lfsConnection),
            },
          };
        } catch (error) {
          return problem(409, {
            code: "large-files-live-but",
            detail: `${project.row.name}'s large files live at ${lfsUrl}, but its connection can't sign in there: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    )
    // A repository's `.lfsconfig` named an LFS endpoint that is neither its
    // origin's nor the project's declared one (agent host-lfs.ts): its
    // large files stayed pointers. It stands in Needs you once per project
    // and endpoint, ever (`lfs_refusals`, offers-waiting.ts), with how to
    // declare it; never a line in the project's Caw chat.
    .post(
      "/api/lfs/projects/:id/refused",
      {
        ...hidden,
        params: t.Object({ id: t.String() }),
        body: t.Object({
          root: t.String({ minLength: 1, maxLength: 4096 }),
          endpoint: t.String({ minLength: 1, maxLength: 2000 }),
          // The asking machine's own word for itself, for a trusted hub's
          // caller, which proves none.
          machineId: t.String({ minLength: 1, maxLength: 200 }),
        }),
      },
      ({ body, params, request, server }) => {
        const caller = hubAuth.callerOf(request, addressOf(server, request));
        const project = lfsMachineProject(params.id, caller);
        if ("refused" in project) {
          return problem(project.status, {
            code: "lfs-refused",
            detail: project.refused,
          });
        }
        const machineId = project.machineId ?? body.machineId;
        if (
          db.lfsOffers.refused({
            projectId: params.id,
            endpoint: body.endpoint,
            machineId,
            root: body.root,
          })
        ) {
          offersWaiting.changed();
        }
        return { ok: true };
      }
    );
