/**
 * Projects: making, editing, stopping, deleting them, and their places.
 */

import { STAGES_TEMPLATES } from "@cawco/core/views";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { projectOrigin } from "../db/previews";
import type { HubContext } from "../hub-context";
import { placeOut } from "../project-out";
import { placesChanged } from "../project-placements";
import { schemaRefusal } from "../refusal";
import { LANDS } from "../tasks";

/** The projects, each as the app's client types it: the routes answer it, and the admin tools list them directly. */
export const projectsListed = ({
  caps,
  db,
  projectOut,
}: Pick<HubContext, "caps" | "db" | "projectOut">) => {
  const live = db.listProjects();
  return live.map((project) => ({
    ...projectOut(project, live),
    cap: caps.capOf(project),
  }));
};

export const projectRoutes = ({
  addProjectPlace,
  askedProjectName,
  askerOf,
  caps,
  createOrJoinProject,
  db,
  deletedProjects,
  forgottenProjects,
  presenceSaid,
  previewListeners,
  projectEdits,
  projectMoved,
  projectOut,
  projectStops,
  stopProjectBrowsers,
  tasks,
}: Pick<
  HubContext,
  | "addProjectPlace"
  | "askedProjectName"
  | "askerOf"
  | "caps"
  | "createOrJoinProject"
  | "db"
  | "deletedProjects"
  | "forgottenProjects"
  | "presenceSaid"
  | "previewListeners"
  | "projectEdits"
  | "projectMoved"
  | "projectOut"
  | "projectStops"
  | "stopProjectBrowsers"
  | "tasks"
>) =>
  new Elysia()
    // Each row spread into a fresh object, not the named `ProjectRow`: the
    // native app's client types a project by this route's own schema
    // (`GetApiProjects200Payload`), which a named row would rename.
    .get("/api/projects", () => projectsListed({ caps, db, projectOut }))
    // One repository is one project: a folder whose remote a project
    // already has joins it as a checkout place (`placeAdded`), and the
    // answer is that project, not a second one. `place` is the folder asked
    // about. With no folder (New project: its checkout is picked once it is
    // set up) its one place is its folder on the hub. `template` is the one
    // tapped, kept as tapped and written by nothing until the setup page is
    // sent; made with Caw, its conversation starts with `prompt`, the
    // person's words alone, and carries on starting after the answer. A
    // project made from a prompt with no `name` takes the placeholder Caw
    // names it from.
    .post(
      "/api/projects",
      {
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          machineId: t.Optional(t.String({ minLength: 1 })),
          cwd: t.Optional(t.String({ minLength: 1 })),
          // Made with Caw: its Caw starts on. A folder that joins a project
          // leaves that project's setting as it is.
          caw: t.Optional(t.Boolean()),
          template: t.Optional(t.UnionEnum(STAGES_TEMPLATES)),
          prompt: t.Optional(t.String({ maxLength: 20_000 })),
          promptId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        }),
      },
      async ({ body }) => {
        if ((body.machineId === undefined) !== (body.cwd === undefined)) {
          return problem(400, {
            code: "checkout-machine-folder-send",
            detail:
              "A checkout is a machine and a folder: send both machineId and cwd, or neither.",
          });
        }
        const name = askedProjectName(body);
        if (!name) {
          return problem(400, {
            code: "project-needs-name",
            detail: "A project needs a name.",
          });
        }
        // A folder that is no absolute path on its machine is refused in
        // the hub's words (db `placePathOn`).
        const made = await createOrJoinProject({
          name,
          ...(body.machineId && body.cwd
            ? { checkout: { machineId: body.machineId, cwd: body.cwd } }
            : {}),
          ...(body.caw === undefined ? {} : { caw: body.caw }),
          ...(body.template ? { tapped: body.template } : {}),
          ...(body.prompt?.trim()
            ? {
                setup: {
                  prompt: body.prompt,
                  ...(body.promptId ? { promptId: body.promptId } : {}),
                },
              }
            : {}),
        });
        if ("response" in made) {
          return problem(made.status, {
            code: "project-not-made",
            detail: made.response.detail,
          });
        }
        return {
          ...projectOut(made.project),
          place: placeOut(made.place),
          placeAdded: made.placeAdded,
          // Read by nothing and never sent: the conversation a create with
          // `prompt` started, before his start carried on past the answer.
          // Kept in the shipped apps' schema (wire-compat.ts); it goes
          // with the next WIRE_PROTOCOL.
          conversation: undefined as string | undefined,
        };
      }
    )
    // The project's running sessions, each top session followed by its delegates:
    // what a forget stops first (project-stops.ts).
    .get("/api/projects/:id/running", ({ params }) => {
      if (!db.project(params.id)) {
        return problem(404, {
          code: "project-no-longer-recorded",
          detail: "This project is no longer recorded. Refresh.",
        });
      }
      return { sessions: projectStops.running(params.id) };
    })
    // Stops the named sessions of the project in one request. Each one's
    // end is reported by a `project.stop` frame as its machine confirms it,
    // or as it fails, never at the ask.
    .post(
      "/api/projects/:id/stop",
      {
        body: t.Object({
          instanceIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
        }),
      },
      ({ params, body }) => {
        if (!db.project(params.id)) {
          return problem(404, {
            code: "project-no-longer-recorded",
            detail: "This project is no longer recorded. Refresh.",
          });
        }
        try {
          projectStops.stop(params.id, body.instanceIds);
        } catch (error) {
          return problem(400, {
            code: "project-not-edited",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return { ok: true };
      }
    )
    // The person's own edit of a project: its name, whether it reviews
    // before done, where its work lands, its large files and the account
    // its sessions start on (project-edit.ts). Every dashboard and the app hear
    // it at once (`projects.changed`; a review change, `tasks.changed` too).
    .patch(
      "/api/projects/:id",
      {
        body: t.Object(
          {
            name: t.Optional(t.String({ maxLength: 2000 })),
            review: t.Optional(t.Boolean()),
            lands: t.Optional(LANDS),
            // The account its sessions start on, by id, nickname or email;
            // null: the fleet's routing.
            account: t.Optional(
              t.Union([t.String({ maxLength: 320 }), t.Null()])
            ),
            // What its sessions on that account do at its limit.
            accountAtLimit: t.Optional(
              t.Union([t.Literal("wait"), t.Literal("move")])
            ),
            // Where its large files live; null: each origin's own LFS.
            lfs: t.Optional(
              t.Union([
                t.Object({
                  url: t.String({ maxLength: 2000 }),
                  connection: t.String({ maxLength: 200 }),
                }),
                t.Null(),
              ])
            ),
          },
          {
            // Something to change: an empty edit names nothing.
            minProperties: 1,
            error: schemaRefusal(
              "Name what changes: the project's name, whether it reviews before done, where its work lands, where its large files live, the account its sessions start on, or what they do at its limit."
            ),
          }
        ),
      },
      async ({ params, body }) => {
        const edited = await projectEdits.edit(params.id, body);
        if (edited instanceof ElysiaStatus) {
          return edited;
        }
        const { project } = edited;
        return { ...projectOut(project), cap: caps.capOf(project) };
      }
    )
    // Every project forgotten that the trash can bring back, newest
    // first, with what each brings (project-trash.ts).
    .get("/api/projects/forgotten", () => forgottenProjects.forgotten())
    .delete("/api/projects/:id", async ({ params, request }) => {
      const asked = askerOf(request);
      const said = (outcome: string) =>
        console.log(
          `${projectTrashWords.forgetLine(params.id)} ${asked} outcome=${outcome}`
        );
      // Never orphaned: a project is forgotten only once nothing of it runs.
      const project = db.project(params.id);
      const still = project ? projectStops.stillRunning(params.id) : 0;
      if (project && still > 0) {
        said(`refused running=${still}`);
        return problem(409, {
          code: "sessions-still-run",
          detail:
            still === 1
              ? `1 session still runs in ${project.name}; stop it first.`
              : `${still} sessions still run in ${project.name}; stop them first.`,
        });
      }
      // Its browsers stop first, their profiles (its sign-ins) kept: one
      // that can't be stopped keeps the project, in the hub's words.
      const running = project
        ? await stopProjectBrowsers(params.id)
        : undefined;
      if (running) {
        said("refused browsers");
        return problem(409, { code: "sessions-still-run", detail: running });
      }
      const machines = new Set(
        db.project(params.id)?.places.map((place) => place.machineId)
      );
      // What its delete takes is kept in the trash beside its folder, for
      // a restore (project-trash.ts).
      const forgot = await forgottenProjects.forget(
        params.id,
        presenceSaid(request)
      );
      if (!forgot) {
        said("none");
        return { ok: true };
      }
      said(
        `forgotten name=${JSON.stringify(forgot.name)} trash=${forgot.entry} rows=${forgot.rows} sessions=${forgot.sessions} browsers=${forgot.browsers} folder=${forgot.folder ? "moved" : "none"}`
      );
      // Its pages' origin goes with it (its port's row went in the
      // delete); each machine preview its pages showed keeps its own,
      // which ends with that artifact.
      previewListeners.release(projectOrigin(params.id));
      // Its hooks leave every place it had.
      projectMoved(params.id, machines, forgot.folder !== undefined);
      return { ok: true };
    })
    // A project deleted for good, live or forgotten (project-delete.ts):
    // nothing CawCo holds of it remains; `fromDisk`, its places on disk
    // and its sessions' transcripts go too. Refused, in the hub's words,
    // while a session of it runs, a place it would remove from disk is
    // another live project's, or a machine holding part of it is away.
    .post(
      "/api/projects/:id/discard",
      {
        body: t.Optional(t.Object({ fromDisk: t.Optional(t.Boolean()) })),
      },
      async ({ params, body, request }) => {
        const fromDisk = body?.fromDisk === true;
        const head = `${projectTrashWords.deleteLine(params.id)} ${askerOf(request)} fromDisk=${fromDisk}`;
        const machines =
          db.project(params.id)?.places.map((place) => place.machineId) ?? [];
        const deleted = await deletedProjects.delete(params.id, { fromDisk });
        if (deleted instanceof ElysiaStatus) {
          console.log(
            `${head} outcome=refused status=${deleted.status}: ${deleted.response.detail}`
          );
          return deleted;
        }
        console.log(
          `${head} outcome=deleted name=${JSON.stringify(deleted.name)} hub=rows:${deleted.hub.rows},folder:${deleted.hub.folder},trash:${deleted.hub.trash}${Object.entries(
            deleted.machines
          )
            .map(
              ([machine, counts]) =>
                ` ${JSON.stringify(machine)}=${Object.entries(counts)
                  .map(([what, n]) => `${what}:${n}`)
                  .join(",")}`
            )
            .join("")}`
        );
        // Its pages' origin goes with it, as a forget's does.
        previewListeners.release(projectOrigin(params.id));
        projectMoved(params.id, machines, deleted.hub.folder);
        return deleted;
      }
    )
    // A forgotten project brought back from the trash, as it was when it
    // was forgotten (project-trash.ts): its newest entry, or the one
    // forgotten at `forgottenAt`; `name` names one forgotten before the hub
    // kept its name. Refused, in the hub's words, while a live project
    // holds its id, a place of it or its folder's place.
    .post(
      "/api/projects/:id/restore",
      {
        body: t.Optional(
          t.Object({
            name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
            forgottenAt: t.Optional(t.Number()),
          })
        ),
      },
      async ({ params, body, request }) => {
        const asked = askerOf(request);
        const refused = (status: number, detail: string) =>
          console.log(
            `${projectTrashWords.restoreLine(params.id)} ${asked} outcome=refused status=${status}: ${detail}`
          );
        const restored = await forgottenProjects.restore(params.id, body ?? {});
        if (restored instanceof ElysiaStatus) {
          refused(restored.status, restored.response.detail);
          return restored;
        }
        // Its folder's task files, read into the index again.
        const caught = await tasks.catchUp(params.id);
        if (caught) {
          refused(caught.status, caught.response.detail);
          return caught;
        }
        console.log(
          `${projectTrashWords.restoreLine(params.id)} ${asked} outcome=restored name=${JSON.stringify(restored.name)} rows=${restored.brought.rows} sessions=${restored.brought.sessions} left=${JSON.stringify(restored.left)}`
        );
        // Its hooks go back to every place it has.
        projectMoved(
          params.id,
          db.project(params.id)?.places.map((place) => place.machineId) ?? [],
          restored.brought.folder
        );
        return restored;
      }
    )
    // Another checkout of the project's repository, named by hand.
    .post(
      "/api/projects/:id/places",
      { body: t.Object({ machineId: t.String(), path: t.String() }) },
      ({ params, body }) =>
        addProjectPlace(params.id, body.machineId, body.path)
    )
    // The accounts the project's sessions may run on; null: every account.
    .put(
      "/api/projects/:id/accounts",
      {
        body: t.Object({
          accounts: t.Union([t.Array(t.String()), t.Null()]),
        }),
      },
      ({ params, body }) => {
        const project = db.project(params.id);
        if (!project) {
          return problem(404, {
            code: "no-project",
            detail: `There is no project ${params.id}.`,
          });
        }
        const unknown = (body.accounts ?? []).filter(
          (id) => !db.accounts.get(id)
        );
        if (unknown.length > 0) {
          return problem(400, {
            code: "no-account",
            detail: `There is no account ${unknown.join(", ")}.`,
          });
        }
        db.setProjectAccounts(project.id, body.accounts);
        return projectOut(db.project(project.id) ?? project);
      }
    )
    .delete("/api/projects/:id/places/:placeId", ({ params }) => {
      const leaving = db
        .project(params.id)
        ?.places.find((place) => place.id === params.placeId);
      const removed = db.removePlace(params.id, params.placeId);
      if (removed === "removed" && leaving) {
        placesChanged(leaving.machineId, params.id);
      }
      if (removed === "missing") {
        return problem(404, {
          code: "no-place-id-project",
          detail: "No place with that id in this project.",
        });
      }
      if (removed === "primary") {
        return problem(409, {
          code: "projects-folder-hub-goes",
          detail:
            leaving?.kind === "hub"
              ? "This is the project's folder on the hub; it goes when the project does. Forget the project to remove it."
              : "This is the project's primary checkout. Forget the project to remove it.",
        });
      }
      return { ok: true };
    });
