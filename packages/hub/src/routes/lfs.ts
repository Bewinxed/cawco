/**
 * Where a project's large files live, answered to machines holding a place of it, and the refusals it reports back.
 */

import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import { addressOf } from "../hub-auth";
import type { HubContext } from "../hub-context";
import { machineName } from "../machine-name";

export const lfsRoutes = ({
  caw,
  connections,
  db,
  hubAuth,
  lfsMachineProject,
}: Pick<
  HubContext,
  "caw" | "connections" | "db" | "hubAuth" | "lfsMachineProject"
>) =>
  new Elysia()
    // Where a project's large files live, for a machine that holds a place
    // of it and runs git-lfs for it (agent host-lfs.ts): its declared LFS
    // endpoint and the connection's key as HTTP Basic, or null when it
    // declared none. Nothing but such a machine is answered.
    .get(
      "/api/lfs/projects/:id",
      { ...hidden, params: t.Object({ id: t.String() }) },
      ({ params, request, server, status }) => {
        const project = lfsMachineProject(
          params.id,
          hubAuth.callerOf(request, addressOf(server, request))
        );
        if ("refused" in project) {
          return status(project.status, project.refused);
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
          return status(
            409,
            `${project.row.name}'s large files live at ${lfsUrl}, but its connection can't sign in there: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
    // A repository's `.lfsconfig` named an LFS endpoint that is neither its
    // origin's nor the project's declared one (agent host-lfs.ts): its
    // large files stayed pointers. The project's conversation is told once per
    // endpoint, ever (`lfs_refusals`), with how to declare it.
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
      ({ body, params, request, server, status }) => {
        const caller = hubAuth.callerOf(request, addressOf(server, request));
        const project = lfsMachineProject(params.id, caller);
        if ("refused" in project) {
          return status(project.status, project.refused);
        }
        if (!db.lfsOffers.refused(params.id, body.endpoint)) {
          return { ok: true };
        }
        const machineId = project.machineId ?? body.machineId;
        caw.notice(params.id, {
          title: "Large files left as pointers: an undeclared LFS server",
          event: {
            kind: "repo",
            root: body.root,
            machineId,
            commit: null,
            lfsRefused: body.endpoint,
          },
          body: `The repository's \`.lfsconfig\` says its large files live at ${body.endpoint}, which is neither its origin's LFS nor where ${project.row.name} declared its large files live. CawCo fetches nothing from a server it was not told of, so in ${body.root} on ${machineName(db, machineId)} they are pointer files, not the files themselves.\n\nIf they belong there, declare it: Project details › Large files, set to ${body.endpoint} with the connection that signs in there. Workspaces cut after that fetch them.`,
        });
        return { ok: true };
      }
    );
