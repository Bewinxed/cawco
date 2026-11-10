import { posix } from "node:path";
import { detach } from "@cawco/core/detach";
import { type MachinePath, MachinePathRefused } from "@cawco/core/machine-path";
import { projectWords } from "@cawco/core/words/project";
import { ElysiaStatus, problem } from "elysia";
import type { PlaceRow, ProjectRow } from "./db/projects";
import { checkoutOf } from "./db/projects";
import type { HubContext } from "./hub-context";
import { onAccountMachines } from "./placement";
import { listFolder, projectRoot } from "./project-folder";
import type { ProjectAsk, ProjectMade } from "./project-making";
import { placesChanged } from "./project-placements";
import { NOTHING_READ, readCheckout } from "./projects";

import type { WorkAsk, WorkPlace } from "./work-place";
import { workPlace } from "./work-place";

export type ProjectJoiningContext = Pick<
  HubContext,
  | "caw"
  | "db"
  | "machineName"
  | "machinePause"
  | "onlineMachines"
  | "ownMachineId"
  | "ownMachineIdRead"
  | "projectStarters"
  | "projectsChanged"
  | "registry"
  | "runOnMachine"
>;

export const createProjectJoining = (ctx: ProjectJoiningContext) => {
  /** Caw's own folder for a project, under a machine's home ({@link leadHome}). */
  const cawHome = (projectId: string): string =>
    posix.join(".cawco", "caw", projectId);

  /**
   * Where a project's Caw starts before any checkout of it is online (D2):
   * its folder on the hub, on the hub's machine, when that machine runs an
   * agent; else `~/.cawco/caw/<projectId>`, made on the first machine that is
   * online. Undefined while no machine is. Among the machines where the
   * project's account is signed in, when any is (placement.ts
   * `onAccountMachines`). The folder's problem for the hub's folder, and a
   * machine that does not say where its home is.
   */
  const leadHome = async (projectId: string) => {
    const machines = onAccountMachines(
      ctx.onlineMachines().map((id) => ({ machineId: id })),
      ctx.db.project(projectId)?.inEffect.account.value,
      ctx.db.accounts.signins()
    ).map((one) => one.machineId);
    const own = await ctx.ownMachineId;
    const hubMachine = machines.find((id) => id === own);
    if (hubMachine) {
      // Made and committed on first use, as every read of it does.
      const made = await listFolder(projectId);
      if (made instanceof ElysiaStatus) {
        return made;
      }
      const cwd = projectRoot(projectId);
      return cwd instanceof ElysiaStatus ? cwd : { machineId: hubMachine, cwd };
    }
    const [machineId] = machines;
    if (!machineId) {
      return;
    }
    // The machine's home, so the session's row names a real path; the spawn
    // makes the folder (the agent's `#workdir`).
    const home = await ctx.runOnMachine(
      machineId,
      "/",
      'printf %s "$HOME"',
      15_000
    );
    const path = home.stdout.trim();
    if (home.exitCode !== 0 || !path.startsWith("/")) {
      return problem(502, {
        code: "caw-home-unsaid",
        detail: `${ctx.machineName(machineId)} did not say where its home folder is, so Caw has no folder there: ${home.stderr.trim() || `exit ${home.exitCode}`}`,
      });
    }
    return { machineId, cwd: posix.join(path, cawHome(projectId)) };
  };

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
        machines: ctx.db.listAgents(),
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
   * Send applies the shape picked (setup.ts `applySetupPicks`). Given `setup`
   * (your prompt), its conversation starts with it and sets it up, on or off
   * (caw.ts `setup`). The dashboard's "New project" and an accepted project
   * offer come here.
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

  /**
   * The name `POST /api/projects` makes a project under: the one asked, else
   * for New project's words the placeholder Caw names it from (caw.ts
   * `project_name`); none when neither was sent.
   */
  const askedProjectName = (body: {
    name?: string;
    prompt?: string;
  }): string | undefined =>
    body.name ??
    (body.prompt?.trim() ? projectWords.placeholderName : undefined);

  /** Each project being made now, by the id its prompt went as ({@link createOrJoinProject}). */
  const projectsMaking = new Map<
    string,
    ReturnType<typeof makeOrJoinProject>
  >();

  /** The place a project was made from: its checkout, else its folder on the hub. */
  const madeFrom = (project: ProjectRow): PlaceRow =>
    checkoutOf(project) ??
    project.places.find((each) => each.kind === "hub") ??
    (project.places[0] as PlaceRow);

  /**
   * A project made, or a folder joined to the one it belongs to. The same
   * prompt again under the id it went as while the first is being made (a
   * device sending again after its answer was lost) answers both: nothing
   * is made twice. Refused in the hub's words: a folder that is no
   * absolute path on its machine, or a paused machine's.
   */
  const createOrJoinProject = (asked: ProjectAsk) => {
    const promptId = asked.setup?.promptId;
    if (!promptId) {
      return makeOrJoinProject(asked);
    }
    const first = projectsMaking.get(promptId);
    if (first !== undefined) {
      return first;
    }
    const making = makeOrJoinProject(asked);
    projectsMaking.set(promptId, making);
    const done = () => projectsMaking.delete(promptId);
    making.then(done, done);
    return making;
  };

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
    }
    return {
      project: ctx.db.project(known.id) ?? known,
      place,
      placeAdded: added,
      joined: true,
    };
  };

  const makeOrJoinProject = async (asked: ProjectAsk) => {
    const path =
      asked.checkout &&
      ctx.db.machinePathOn(asked.checkout.machineId, asked.checkout.cwd);
    if (path instanceof MachinePathRefused) {
      return problem(400, {
        code: "project-checkout-path-unfit",
        detail: path.message,
      });
    }
    const checkout = asked.checkout &&
      path && { machineId: asked.checkout.machineId, path };
    const unread = folderUnread(checkout?.machineId);
    if (unread) {
      return unread;
    }
    const { remote, root } = checkout
      ? await readCheckout(ctx.runOnMachine, checkout.machineId, checkout.path)
      : NOTHING_READ;
    const known = remote ? ctx.db.projectByRemote(remote) : undefined;
    if (known && checkout) {
      return joinProject(known, { ...checkout, root });
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
    startProject(created, asked);
    const made: ProjectMade = {
      project: created,
      place: madeFrom(created),
      placeAdded: false,
      joined: false,
    };
    return made;
  };

  /**
   * A new project's conversation set to set it up when it is made with
   * your prompt, started as the project is answered and carrying on after:
   * the person's press answers once the project is made, and its page shows
   * Caw starting (his view's `starting`, his session's row) and why he
   * could not (his view's `problem`, caw.ts `startProblems`). Your prompt
   * sets the project up whether its Caw is on or off.
   */
  const startProject = (created: ProjectRow, asked: ProjectAsk): void => {
    if (asked.setup) {
      detach(
        ctx.caw.setup(created.id, asked.setup).then((set) => {
          if (set instanceof ElysiaStatus) {
            console.warn(
              `[project-joining] ${created.id}: Caw did not set it up: ${set.response.detail}`
            );
          }
        }),
        `set up ${created.id} with Caw`
      );
    }
  };

  return {
    leadHome,
    workPlaceOf,
    askedProjectName,
    createOrJoinProject,
  };
};
