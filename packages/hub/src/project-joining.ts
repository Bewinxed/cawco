import { failureOf } from "@cawco/core/detach";
import { makeJoin } from "@cawco/core/effect/join";
import { type MachinePath, MachinePathRefused } from "@cawco/core/machine-path";
import { projectWords } from "@cawco/core/words/project";
import { Effect, Fiber } from "effect";
import { ElysiaStatus, problem } from "elysia";
import type { PlaceRow, ProjectRow } from "./db/projects";
import { checkoutOf } from "./db/projects";
import type { HubContext } from "./hub-context";
import { createLeadHome } from "./lead-home";
import { projectName } from "./project-edit";
import { projectRoot } from "./project-folder";
import type {
  CreateOrJoinProject,
  NewProject,
  NewProjectBody,
  ProjectAsk,
  ProjectMade,
  ProjectMakeProblem,
} from "./project-making";
import { scratchPlaceRefusal } from "./project-place-scratch";
import { placesChanged } from "./project-placements";
import { NOTHING_READ, readCheckout } from "./projects";
import type { WorkAsk, WorkPlace } from "./work-place";
import { workPlace } from "./work-place";

export type ProjectJoiningContext = Pick<
  HubContext,
  | "caw"
  | "db"
  | "learnCheckout"
  | "lifetime"
  | "machineName"
  | "machinePause"
  | "onlineMachines"
  | "ownMachineId"
  | "ownMachineIdRead"
  | "projectStarters"
  | "projectsChanged"
  | "registry"
  | "routines"
  | "runOnMachine"
>;

/**
 * The name `POST /api/projects` makes a project under: the one asked, else
 * for New project's words the placeholder Caw names it from (caw.ts
 * `project_name`); none when neither was sent.
 */
const askedProjectName = (body: {
  name?: string;
  prompt?: string;
}): string | undefined =>
  body.name ?? (body.prompt?.trim() ? projectWords.placeholderName : undefined);

/** The name a project is asked under, kept as a rename keeps it, or why the ask is refused before anything is read. */
const nameAsked = (body: NewProjectBody) => {
  if ((body.machineId === undefined) !== (body.cwd === undefined)) {
    return problem(400, {
      code: "checkout-machine-folder-send",
      detail:
        "A checkout is a machine and a folder: send both machineId and cwd, or neither.",
    });
  }
  const asked = askedProjectName(body);
  if (asked === undefined) {
    return problem(400, {
      code: "project-needs-name",
      detail: "A project needs a name.",
    });
  }
  const name = projectName(asked);
  // Said as every refusal of a project's making is, the shape the shipped
  // apps read (wire-compat.ts).
  return typeof name === "string"
    ? name
    : problem(400, {
        code: "project-not-made",
        detail: name.response.detail,
      });
};

/** `POST /api/projects`' body as the ask {@link createProjectJoining}'s `createOrJoinProject` takes, under `name`. */
const projectAsk = (body: NewProjectBody, name: string): ProjectAsk => ({
  name,
  ...(body.machineId && body.cwd
    ? { checkout: { machineId: body.machineId, cwd: body.cwd } }
    : {}),
  ...(body.caw === undefined ? {} : { caw: body.caw }),
  ...(body.template ? { tapped: body.template } : {}),
  ...(body.newOnly ? { newOnly: body.newOnly } : {}),
  ...(body.prompt?.trim()
    ? {
        setup: {
          prompt: body.prompt,
          ...(body.promptId ? { promptId: body.promptId } : {}),
        },
      }
    : {}),
});

export const createProjectJoining = (ctx: ProjectJoiningContext) => {
  /** Where a project's Caw starts before any checkout of it is online (lead-home.ts). */
  const leadHome = createLeadHome(ctx);

  /**
   * Where a project's work runs now (work-place.ts): one rule for a task's
   * attempt, a routine's run, a delegate moved to its project's account and
   * the project's conversation's checkout.
   */
  const workPlaceOf = (project: ProjectRow, ask?: WorkAsk): WorkPlace =>
    workPlace(
      project,
      {
        hubFolder: projectRoot,
        hubMachine: ctx.ownMachineIdRead,
        machines: ctx.db.machineFacts(),
        online: (machineId) => Boolean(ctx.registry.agent(machineId)),
        signins: ctx.db.accounts.signins(),
      },
      ask
    );

  /**
   * One repository is one project: a folder whose remote a project already
   * has joins it as a checkout place (`placeAdded`), and the answer is that
   * project, not a second one. Else a new project, its places its folder on
   * the hub and the checkout it was made from, its primary. With no checkout
   * (New project: its place is picked once it is set up) its one place is
   * its folder on the hub. Nothing is written into a new project here: the
   * template tapped on New project is kept as `tapped`, and its setup page's
   * Send applies the shape picked (setup.ts `setupPicksOf`). Given `setup`
   * (your prompt), its conversation starts with it and sets it up, on or off
   * (caw.ts `setup`). The dashboard's "New project", an accepted project
   * offer and a session's `project_create` come here.
   */
  /** A paused machine's folder is read nothing: the person is told now (project-machine-paused), not kept waiting for the pause's end. */
  const folderUnread = (machineId: string | undefined) => {
    const paused = machineId && ctx.machinePause.words(machineId);
    return paused
      ? problem(409, {
          code: "project-machine-paused",
          detail: `${paused}, so its folder is not read until then. Add it after the pause, or resume the machine first.`,
        })
      : undefined;
  };

  /** Each project being made now, by the id its prompt went as ({@link createOrJoinProject}). */
  const projectsMaking = makeJoin<
    string,
    ProjectMade | ProjectMakeProblem,
    unknown
  >();

  /** The place a project was made from: its checkout, else its folder on the hub. */
  const madeFrom = (project: ProjectRow): PlaceRow =>
    checkoutOf(project) ??
    project.places.find((each) => each.kind === "hub") ??
    project.places[0];

  /**
   * A project made, or a folder joined to the one it belongs to. The same
   * prompt again under the id it went as while the first is being made (a
   * device sending again after its answer was lost) answers both: nothing
   * is made twice. Refused in the hub's words: a folder that is no
   * absolute path on its machine, one in its scratch root
   * (project-place-scratch.ts), or a paused machine's.
   */
  const createOrJoinProject: CreateOrJoinProject = (asked) => {
    const promptId = asked.setup?.promptId;
    if (!promptId) {
      return makeOrJoinProject(asked);
    }
    return ctx.lifetime.run(
      projectsMaking.run(
        promptId,
        Effect.tryPromise({
          try: () => makeOrJoinProject(asked),
          catch: (error) => error,
        })
      )
    );
  };

  /**
   * Whether the folder of a checkout just filed stands, read on its machine
   * (machine-commands.ts `learnCheckout`), so one there is never made again
   * by a start once it goes. One not there yet is the project's new folder,
   * which its first session makes.
   */
  const lookFor = (place: PlaceRow | undefined): void => {
    if (place) {
      ctx.lifetime.fork(
        "read a checkout's folder",
        Effect.tryPromise({
          try: () => ctx.learnCheckout(place),
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() =>
              console.warn(
                `[read ${place.path}'s folder] failed: ${failureOf(error)}`
              )
            )
          )
        )
      );
    }
  };

  /** A new project only ({@link ProjectAsk.newOnly}): a folder `holder` holds already, by place or by its repository's remote, refused. */
  const folderHeld = (
    holder: ProjectRow,
    checkout: { machineId: string; path: MachinePath },
    remote?: string | null
  ) =>
    problem(409, {
      code: "project-folder-held",
      detail: `${checkout.path} on ${ctx.machineName(checkout.machineId)} belongs to the project “${holder.name}” already${remote ? `, which has its repository ${remote}` : ""}: one folder or repository is one project. Work in that project, or name another folder.`,
    });

  /** A folder of a repository `known` links joins it as a checkout, its root commit kept. */
  const joinProject = (
    known: ProjectRow,
    checkout: { machineId: string; path: MachinePath; root: string | null }
  ): ProjectMade => {
    const { place, added } = ctx.db.addPlace({
      projectId: known.id,
      machineId: checkout.machineId,
      path: checkout.path,
      kind: "checkout",
    });
    if (checkout.root) {
      ctx.db.setPlaceRoot(place.id, checkout.root);
    }
    if (added) {
      placesChanged(checkout.machineId, known.id);
      lookFor(place);
    }
    return {
      project: ctx.db.project(known.id) ?? known,
      place,
      placeAdded: added,
      joined: true,
    };
  };

  /**
   * The folder a project is asked at, as a place on its machine: none when
   * none was asked, else refused for a path that is no absolute one there,
   * one in its scratch root, a paused machine's, or, for a new project only,
   * one a project holds as a place.
   */
  const checkoutAsked = (asked: ProjectAsk) => {
    if (!asked.checkout) {
      return;
    }
    const { machineId } = asked.checkout;
    const path = ctx.db.machinePathOn(machineId, asked.checkout.cwd);
    if (path instanceof MachinePathRefused) {
      return problem(400, {
        code: "project-checkout-path-unfit",
        detail: path.message,
      });
    }
    const refused =
      scratchPlaceRefusal(ctx.db.machineHome(machineId), path) ??
      folderUnread(machineId);
    if (refused) {
      return refused;
    }
    const placed = asked.newOnly
      ? ctx.db.projectHolding(machineId, path)
      : undefined;
    const holder = placed ? ctx.db.project(placed) : undefined;
    return holder
      ? folderHeld(holder, { machineId, path })
      : { machineId, path };
  };

  const makeOrJoinProject = async (
    asked: ProjectAsk
  ): Promise<ProjectMade | ProjectMakeProblem> => {
    const checkout = checkoutAsked(asked);
    if (checkout instanceof ElysiaStatus) {
      return checkout;
    }
    const { remote, root } = checkout
      ? await readCheckout(ctx.runOnMachine, checkout.machineId, checkout.path)
      : NOTHING_READ;
    const known = remote ? ctx.db.projectByRemote(remote) : undefined;
    if (known && checkout) {
      return asked.newOnly
        ? folderHeld(known, checkout, remote)
        : joinProject(known, { ...checkout, root });
    }
    const created = ctx.db.createProject({
      id: crypto.randomUUID(),
      name: asked.name,
      ...(checkout ? { checkout: { ...checkout, root } } : {}),
      remote,
      caw: asked.caw ?? false,
      tapped: asked.tapped ?? null,
    });
    ctx.projectsChanged();
    ctx.projectStarters.touched(created.id, "project created");
    const conversation = startProject(created, asked);
    const made: ProjectMade = {
      project: created,
      place: madeFrom(created),
      placeAdded: false,
      joined: false,
      ...(conversation === undefined ? {} : { conversation }),
    };
    lookFor(checkoutOf(created));
    return made;
  };

  /**
   * A new project's conversation set to set it up when it is made with
   * your prompt, started as the project is answered and carrying on after:
   * the person's press answers once the project is made, and its page shows
   * Caw starting (his view's `starting`, his session's row) and why he
   * could not (his view's `problem`, caw.ts `startProblems`). Your prompt
   * sets the project up whether its Caw is on or off. Answers the
   * conversation's session id as it starts (undefined when it did not),
   * for a caller that waits on it; none without a prompt.
   */
  const startProject = (
    created: ProjectRow,
    asked: ProjectAsk
  ): Promise<string | undefined> | undefined => {
    const { setup } = asked;
    if (!setup) {
      return;
    }
    // Let go on the hub's lifetime; a caller that waits on it reads its
    // session id, or undefined when it did not start (its failure said here).
    const conversation = ctx.lifetime.fork(
      "set up a project with Caw",
      Effect.tryPromise({
        try: () => ctx.caw.setup(created.id, setup),
        catch: (error) => error,
      }).pipe(
        Effect.flatMap((set) =>
          Effect.sync((): string | undefined => {
            if (set instanceof ElysiaStatus) {
              console.warn(
                `[project-joining] ${created.id}: Caw did not set it up: ${set.response.detail}`
              );
              return undefined;
            }
            return typeof set === "string" ? set : undefined;
          })
        ),
        Effect.catch((error) =>
          Effect.sync((): undefined => {
            console.warn(
              `[set up ${created.id} with Caw] failed: ${failureOf(error)}`
            );
          })
        )
      )
    );
    return ctx.lifetime.run(Fiber.join(conversation));
  };

  /**
   * One way a project is asked for, whoever asks: `POST /api/projects` and
   * a session's `project_create` (project-create.ts). A checkout is a
   * machine and a folder together; the name is kept as a rename keeps it
   * (project-edit.ts `projectName`), and with none, words take the
   * placeholder Caw names it from. Refused in the hub's words.
   */
  const newProject: NewProject = async (body) => {
    const name = nameAsked(body);
    if (name instanceof ElysiaStatus) {
      return name;
    }
    // A folder that is no absolute path on its machine is refused in the
    // hub's words (db `placePathOn`).
    const made = await createOrJoinProject(projectAsk(body, name));
    if ("response" in made) {
      return problem(made.status, {
        code: "project-not-made",
        detail: made.response.detail,
      });
    }
    return made;
  };

  return {
    leadHome,
    workPlaceOf,
    newProject,
    createOrJoinProject,
  };
};
