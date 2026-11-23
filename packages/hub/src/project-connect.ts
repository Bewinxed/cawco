/**
 * Connect existing folder: another folder of a project's, named by hand on
 * a machine on its details card (`POST /api/projects/:id/places`).
 * Nothing in the folder moves; the project starts counting it.
 *
 * Before anything runs, the hub says what it will do
 * ({@link createProjectConnect} `preview`), read from the folder's machine
 * as Locate folder reads it (project-locate.ts): a folder whose codebase
 * another project already links would make the two one project
 * (project-merge.ts). That is asked first, naming both and the one that
 * stays (the owner, 2026-11-18: "Ask, naming both"): the preview names the
 * other project (`joins`), and the folder is connected only when it comes
 * back as the person's yes; otherwise it is refused, nothing changed. Its
 * machine away, nothing can be read: the folder is connected, and its
 * codebase is read at the machine's next register, linked only when no
 * other project has it (machine-commands.ts `learnCheckout`).
 */

import type { MachinePath } from "@cawco/core/machine-path";
import type { FindPlan } from "@cawco/core/project-folders";
import { stepWords } from "@cawco/core/words/project-details";
import { foldWords } from "@cawco/core/words/project-locate";
import { ElysiaStatus, problem } from "elysia";
import type { ClosureContext } from "./closure-context";
import type { ProjectRow } from "./db/projects";
import type { createMachineCommands } from "./machine-commands";
import { olderOf } from "./project-locate";
import { mergeSameRemote } from "./project-merge";
import { placeAddedOf } from "./project-out";
import { scratchPlaceRefusal } from "./project-place-scratch";
import { placesChanged } from "./project-placements";
import { readCheckout } from "./projects";

export type ProjectConnectContext = Pick<
  ClosureContext,
  | "askedMachinePath"
  | "db"
  | "machineName"
  | "merging"
  | "online"
  | "projectOut"
  | "runOnMachine"
> &
  Pick<ReturnType<typeof createMachineCommands>, "learnCheckout">;

/** What connecting the folder would do. */
interface Plan {
  joins: ProjectRow | null;
  lines: string[];
  path: MachinePath;
  project: ProjectRow;
  remote: string | null;
}

export const createProjectConnect = (ctx: ProjectConnectContext) => {
  /** The project and the folder asked for, or the refusal. */
  const asked = (projectId: string, machineId: string, raw: string) => {
    const project = ctx.db.project(projectId);
    if (!project) {
      return problem(404, {
        code: "place-project-unknown",
        detail: "No project with that id on this hub.",
      });
    }
    if (!ctx.db.machineKnown(machineId)) {
      return problem(404, {
        code: "place-machine-unknown",
        detail: "No machine with that id on this hub.",
      });
    }
    const path = ctx.askedMachinePath(machineId, raw);
    if (path instanceof ElysiaStatus) {
      return path;
    }
    const scratch = scratchPlaceRefusal(ctx.db.machineHome(machineId), path);
    return scratch ?? { project, path };
  };

  /** What connecting `raw` on `machineId` to `projectId` would do, read from that machine; the refusal. */
  const plan = async (projectId: string, machineId: string, raw: string) => {
    const found = asked(projectId, machineId, raw);
    if (found instanceof ElysiaStatus) {
      return found;
    }
    const { project, path } = found;
    const lines = stepWords.connectLines(path, ctx.machineName(machineId));
    if (!ctx.online(machineId)) {
      const unread: Plan = { joins: null, lines, path, project, remote: null };
      return unread;
    }
    const { remote } = await readCheckout(ctx.runOnMachine, machineId, path);
    const owner = remote ? ctx.db.projectByRemote(remote) : undefined;
    const joins = owner && owner.id !== project.id ? owner : null;
    if (joins) {
      const kept = olderOf(project, joins);
      const goes = kept.id === project.id ? joins : project;
      lines.push(foldWords.line(joins.name, kept.name, goes.name));
    }
    const read: Plan = { joins, lines, path, project, remote };
    return read;
  };

  /** `POST /api/projects/:id/places/preview`: what connecting the folder would do. */
  const preview = async (projectId: string, machineId: string, raw: string) => {
    const planned = await plan(projectId, machineId, raw);
    if (planned instanceof ElysiaStatus) {
      return planned;
    }
    const answer: FindPlan = {
      forecast: { state: "ready", lines: planned.lines },
      joins: planned.joins
        ? { id: planned.joins.id, name: planned.joins.name }
        : null,
      tell: "",
    };
    return answer;
  };

  /**
   * `POST /api/projects/:id/places`: the folder connected; `joins` is the
   * person's yes to the project the preview named as already having its
   * codebase, and the two become one. The project as it is now (the one it
   * joined, once folded into it), or the refusal.
   */
  const connect = async (
    projectId: string,
    machineId: string,
    raw: string,
    joins: string | undefined
  ) => {
    const planned = await plan(projectId, machineId, raw);
    if (planned instanceof ElysiaStatus) {
      return planned;
    }
    const { project, path, remote } = planned;
    if (planned.joins && joins !== planned.joins.id) {
      return problem(409, {
        code: "place-fold-unasked",
        detail: foldWords.unasked(
          planned.joins.name,
          olderOf(project, planned.joins).name,
          "connect"
        ),
      });
    }
    const { place, added } = ctx.db.addPlace({
      projectId: project.id,
      machineId,
      path,
      kind: "checkout",
    });
    if (added) {
      placesChanged(machineId, project.id);
    }
    // A plain folder stays one: a workspace is a private copy of any folder
    // (agent layer.ts), a move makes it a repository with the person's yes
    // (moves.ts `askFor`), and a publish as it reads it (repo-publish.ts).
    // Its repository, a project's second among them, is linked by its origin.
    await ctx.learnCheckout(place);
    if (planned.joins && remote && ctx.db.addProjectLink(project.id, remote)) {
      // The person said yes, naming both: the two become one.
      await mergeSameRemote(ctx.merging, remote);
    }
    const now =
      ctx.db.project(project.id) ??
      (planned.joins ? ctx.db.project(planned.joins.id) : undefined) ??
      project;
    return placeAddedOf(ctx.projectOut(now), place, added);
  };

  return { preview, connect };
};
