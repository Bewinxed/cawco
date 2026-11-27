/**
 * Locate folder (TOM T12, the owner 2026-11-18): points one of a project's
 * checkouts at where its folder is now, on the same machine. No file moves.
 * Offered on any checkout, missing or not ("Yes, on any place").
 *
 * Before anything runs, the hub says what the machine can tell of the folder
 * named ({@link createProjectLocate} `preview`): whether a folder stands
 * there; whether it is the same codebase, by its root commit against the one
 * the checkout was read at (core hub-repo.ts: the same in every clone), or a
 * different one, named; whether it is the very folder that was at the old
 * path, moved or renamed, by its identity on disk as the machine last saw it
 * (agent seen-folders.ts); and whether it holds the copies CawCo placed for
 * this checkout (agent fleet.ts `placedCopiesIn`). When none of these says,
 * CawCo can't tell, and the person's pick stands: it is never refused for it.
 *
 * A folder whose codebase another project already has would make the two
 * one project (project-merge.ts). That is asked first, naming both and the
 * one that stays ("Ask, naming both"): the preview names the other project
 * (`joins`), and the locate goes ahead only when it is sent back as the
 * person's yes; otherwise it is refused, nothing changed.
 *
 * Pointing it there ({@link createProjectLocate} `locate`), in one step:
 * - The place keeps its id and takes the new folder, named by the person,
 *   found, its root commit as read there (db `locatePlace`). The folder it
 *   pointed at before stays on disk, untouched, and is no longer one of the
 *   project's ("No, let it go"); its placed copies are taken back by the
 *   fleet sync as for any place that goes, and placed in the new folder
 *   (`placesChanged`).
 * - Every session of the project that ran in the old folder, or inside it,
 *   launches from now on in the same folder under the new one (db
 *   `repointSessions`), and its stored conversation follows it on every
 *   harness as it next starts ("it needs to be cross harness"): Claude
 *   Code's transcript is filed under the new folder's name (agent
 *   claude-sessions.ts `fileUnder`), pi's session file into the new
 *   folder's session folder (pi-services.ts `piFileUnder`), an OpenCode
 *   session is moved with `session.move` (opencode.ts), and Codex resumes a
 *   thread by id in the folder it is given (codex-session.ts). Carrying it
 *   as it starts means no process of it runs while its files move.
 * - Sessions still running in a missing folder are stopped at once. One
 *   running in an old folder that still stands holds the locate back: its
 *   conversation is being written there.
 * - With the same codebase, the workspaces made from the old folder record
 *   the new one as their source.
 *
 * A machine that is away holds the change (`project_places.locate_to`) until
 * it registers again and can read the folder ({@link createProjectLocate}
 * `resumeHeld`); then it is looked at and pointed as above, or let go with
 * why in the log when what the machine reads stands in the way or would make
 * two projects one, which nobody was asked. The card shows it on the
 * folder's row meanwhile, and Call off lets it go (`callOff`).
 */

import type { MachinePath } from "@cawco/core/machine-path";
import type { FindPlan, FolderForecast } from "@cawco/core/project-folders";
import {
  foldWords,
  locateBlocks,
  locateLines,
  locateRefusals,
  locateTells,
} from "@cawco/core/words/project-locate";
import {
  CONTROL_FOLDER_LOOK,
  type FolderLook,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus, problem } from "elysia";
import type { ClosureContext } from "./closure-context";
import type { PlaceRow, ProjectRow } from "./db/projects";
import { folderStandsOn } from "./folder-stands";
import { mergeSameRemote } from "./project-merge";
import { scratchPlaceRefusal } from "./project-place-scratch";
import { placesChanged } from "./project-placements";
import { readCheckout } from "./projects";

export type ProjectLocateContext = Pick<
  ClosureContext,
  | "askedMachinePath"
  | "db"
  | "machineCalls"
  | "machineName"
  | "merging"
  | "online"
  | "projectOut"
  | "projectStops"
  | "projectsChanged"
  | "runOnMachine"
>;

const log = (line: string): void => console.log(`[locate] ${line}`);

/** `path` is `folder` or inside it. */
const within = (path: string, folder: string): boolean =>
  path === folder ||
  path.startsWith(folder.endsWith("/") ? folder : `${folder}/`);

/** Oldest first, as a fold keeps its oldest (project-merge.ts `byAge`). */
export const olderOf = (a: ProjectRow, b: ProjectRow): ProjectRow =>
  (a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)) <=
  0
    ? a
    : b;

/** What stands in the way before the machine is asked anything: the folder is already the project's. */
const plainBlock = (
  project: ProjectRow,
  place: PlaceRow,
  path: string
): { why: string; todo: string } | undefined => {
  if (path === place.path) {
    return locateBlocks.same;
  }
  const another = project.places.some(
    (one) =>
      one.id !== place.id &&
      one.machineId === place.machineId &&
      one.path === path
  );
  return another ? locateBlocks.another(path) : undefined;
};

/**
 * The folder read is the checkout's codebase: its root commit is the one the
 * checkout was read at, or, never read there, its origin is one the project
 * links.
 */
const sameRepositoryOf = (
  project: ProjectRow,
  place: PlaceRow,
  read: { remote: string | null; root: string | null }
): boolean => {
  if (read.root === null) {
    return false;
  }
  if (place.root !== null) {
    return place.root === read.root;
  }
  return read.remote !== null && project.links.includes(read.remote);
};

/** What CawCo can tell of the folder named, in one line or more. */
const tellOf = (seen: {
  link: string | null;
  otherRoot: boolean;
  placed: boolean;
  remote: string | null;
  sameFolder: boolean;
  sameRepository: boolean;
  was: string;
}): string => {
  const tells: string[] = [];
  if (seen.sameRepository) {
    tells.push(locateTells.sameCodebase);
  } else if (seen.otherRoot) {
    tells.push(locateTells.otherCodebase(seen.remote, seen.link));
  }
  if (seen.sameFolder) {
    tells.push(locateTells.sameFolder(seen.was));
  }
  if (seen.placed) {
    tells.push(locateTells.placed);
  }
  return (tells.length > 0 ? tells : [locateTells.cannotTell]).join(" ");
};

/** Each line of What will happen, in order. */
const linesOf = (what: {
  conversations: number;
  joins: ProjectRow | null;
  machine: string;
  oldStands: boolean;
  path: string;
  project: ProjectRow;
  running: number;
  was: string;
}): string[] => {
  const lines = [locateLines.pointed(what.path, what.machine)];
  if (what.oldStands) {
    lines.push(locateLines.oldStays(what.was));
  }
  if (what.conversations > 0) {
    lines.push(locateLines.conversations(what.conversations));
  }
  if (what.running > 0) {
    lines.push(locateLines.stopNow(what.running));
  }
  lines.push(locateLines.placed);
  if (what.joins) {
    const kept = olderOf(what.project, what.joins);
    const goes = kept.id === what.project.id ? what.joins : what.project;
    lines.push(foldWords.line(what.joins.name, kept.name, goes.name));
  }
  return lines;
};

/** What the hub found, enough to point the place there. */
interface Plan {
  forecast: FolderForecast;
  /** The machine is away: the change is held until it can read the folder. */
  held: boolean;
  joins: ProjectRow | null;
  path: MachinePath;
  place: PlaceRow;
  project: ProjectRow;
  remote: string | null;
  root: string | null;
  sameRepository: boolean;
  tell: string;
  /** The project's sessions running in a missing old folder: stopped as it is pointed. */
  working: string[];
}

export const createProjectLocate = (ctx: ProjectLocateContext) => {
  /** What machine `machineId` can tell of `asked`; undefined when it did not say. */
  const look = async (
    machineId: string,
    folder: { path: string; placeId: string; was: string }
  ): Promise<FolderLook | undefined> => {
    const answer = await ctx.machineCalls.readAgent(
      machineId,
      CONTROL_FOLDER_LOOK,
      [folder]
    );
    return answer.kind === "answered" && answer.value.ok
      ? answer.value.result
      : undefined;
  };

  /** Whether a folder stands at `path` on `machineId`; undefined when it did not say. */
  const stands = (machineId: string, path: string) =>
    folderStandsOn(ctx.machineCalls.readAgent, machineId, path);

  /** How many of the project's sessions have a conversation from the checkout's folder, or a folder inside it. */
  const conversationsIn = (project: ProjectRow, place: PlaceRow): number =>
    ctx.db
      .sessionOwnership(place.machineId)
      .filter(
        (row) =>
          row.projectId === project.id &&
          row.sessionId !== null &&
          within(row.cwd, place.path)
      ).length;

  /** What the checkout's machine can tell of `path`; an agent that predates the look still says whether a folder stands. */
  const lookAt = async (place: PlaceRow, path: string) =>
    (await look(place.machineId, {
      path,
      placeId: place.id,
      was: place.path,
    })) ?? {
      stands: await stands(place.machineId, path),
      sameFolder: null,
      placed: false,
    };

  /** The project, its checkout and the folder asked for, or the refusal. */
  const asked = (projectId: string, placeId: string, raw: string) => {
    const project = ctx.db.project(projectId);
    if (!project) {
      return problem(404, {
        code: "locate-project-unknown",
        detail: locateRefusals.noProject,
      });
    }
    const place = project.places.find((one) => one.id === placeId);
    if (!place) {
      return problem(404, {
        code: "locate-place-unknown",
        detail: locateRefusals.noPlace,
      });
    }
    if (place.kind !== "checkout") {
      return problem(409, {
        code: "locate-hub-folder",
        detail: locateRefusals.hubFolder,
      });
    }
    const path = ctx.askedMachinePath(place.machineId, raw);
    if (path instanceof ElysiaStatus) {
      return path;
    }
    const scratch = scratchPlaceRefusal(
      ctx.db.machineHome(place.machineId),
      path
    );
    return scratch ?? { project, place, path };
  };

  /** What pointing `placeId` at `raw` would do, read from its machine; the refusal. */
  const plan = async (projectId: string, placeId: string, raw: string) => {
    const found = asked(projectId, placeId, raw);
    if (found instanceof ElysiaStatus) {
      return found;
    }
    const { project, place, path } = found;
    const machine = ctx.machineName(place.machineId);
    const base = {
      held: false,
      joins: null,
      path,
      place,
      project,
      remote: null,
      root: null,
      sameRepository: false,
      tell: "",
      working: [],
    };
    const blocked = (why: { why: string; todo: string }): Plan => ({
      ...base,
      forecast: { state: "blocked", ...why },
    });
    const plainly = plainBlock(project, place, path);
    if (plainly) {
      return blocked(plainly);
    }
    const away = (): Plan => ({
      ...base,
      held: true,
      tell: locateTells.away(machine),
      forecast: {
        state: "ready",
        lines: [locateLines.pointed(path, machine), locateLines.held(machine)],
      },
    });
    if (!ctx.online(place.machineId)) {
      return away();
    }
    const there = await lookAt(place, path);
    if (there.stands === undefined) {
      return away();
    }
    if (!there.stands) {
      return blocked(locateBlocks.nothing(path, machine));
    }
    const oldStands = await stands(place.machineId, place.path);
    const running = ctx.projectStops
      .running(project.id)
      .filter(
        (one) =>
          one.machineId === place.machineId && within(one.cwd, place.path)
      );
    if (oldStands !== false && running.length > 0) {
      return blocked(locateBlocks.working(running.length, place.path));
    }
    const { remote, root } = await readCheckout(
      ctx.runOnMachine,
      place.machineId,
      path
    );
    const sameRepository = sameRepositoryOf(project, place, { remote, root });
    const tell = tellOf({
      link: project.links[0] ?? null,
      otherRoot: root !== null && place.root !== null,
      placed: there.placed,
      remote,
      sameFolder: there.sameFolder === true,
      sameRepository,
      was: place.path,
    });
    const owner = remote ? ctx.db.projectByRemote(remote) : undefined;
    const joins = owner && owner.id !== project.id ? owner : null;
    const conversations = conversationsIn(project, place);
    const lines = linesOf({
      conversations,
      joins,
      machine,
      oldStands: oldStands === true,
      path,
      project,
      running: running.length,
      was: place.path,
    });
    const ready: Plan = {
      ...base,
      forecast: { state: "ready", lines },
      joins,
      remote,
      root,
      sameRepository,
      tell,
      working: running.map((one) => one.id),
    };
    return ready;
  };

  /** The plan as the dashboard reads it (core `FindPlan`). */
  const findPlanOf = (planned: Plan): FindPlan => ({
    forecast: planned.forecast,
    joins: planned.joins
      ? { id: planned.joins.id, name: planned.joins.name }
      : null,
    tell: planned.tell,
  });

  /** Points the place where `planned` says, as the module's head says; the refusal of a stop, before anything changed. */
  const apply = async (planned: Plan) => {
    const { place, project, path } = planned;
    if (planned.working.length > 0) {
      const stopped = ctx.projectStops.stop(project.id, planned.working);
      if (stopped instanceof ElysiaStatus) {
        return stopped;
      }
    }
    const sessions = ctx.db.repointSessions(
      project.id,
      place.machineId,
      place.path,
      path
    );
    ctx.db.locatePlace(place.id, path, planned.root, planned.sameRepository);
    placesChanged(place.machineId, project.id);
    log(
      `${project.name} (${project.id}): checkout ${place.id} on ${place.machineId} moved from ${place.path} to ${path}; ${sessions.length} session(s) launch there now, ${planned.working.length} stopped; ${planned.sameRepository ? "the same repository" : "not known to be the same repository"}`
    );
    const linked =
      planned.remote !== null &&
      ctx.db.addProjectLink(project.id, planned.remote);
    if (linked && planned.remote && planned.joins) {
      // The person said yes, naming both: the two become one.
      await mergeSameRemote(ctx.merging, planned.remote);
    }
    ctx.projectsChanged();
  };

  /** What pointing checkout `placeId` of `projectId` at `raw` would do. */
  const preview = async (projectId: string, placeId: string, raw: string) => {
    const planned = await plan(projectId, placeId, raw);
    return planned instanceof ElysiaStatus ? planned : findPlanOf(planned);
  };

  /**
   * Points checkout `placeId` of `projectId` at `raw`, or holds it while its
   * machine is away; `joins` is the person's yes to the project the preview
   * named. The project as it is now (the one it joined, when it was folded
   * into it), or the refusal.
   */
  const locate = async (
    projectId: string,
    placeId: string,
    raw: string,
    joins: string | undefined
  ) => {
    const planned = await plan(projectId, placeId, raw);
    if (planned instanceof ElysiaStatus) {
      return planned;
    }
    const { forecast, project, place } = planned;
    if (forecast.state === "blocked") {
      return problem(409, {
        code: "locate-blocked",
        detail: `${forecast.why} ${forecast.todo}`,
      });
    }
    if (planned.held) {
      ctx.db.holdLocate(place.id, planned.path);
      ctx.projectsChanged();
      log(
        `${project.name} (${project.id}): checkout ${place.id} held for ${planned.path} until ${place.machineId} can read it`
      );
      return ctx.projectOut(ctx.db.project(project.id) ?? project);
    }
    if (planned.joins && joins !== planned.joins.id) {
      const kept = olderOf(project, planned.joins);
      return problem(409, {
        code: "locate-fold-unasked",
        detail: foldWords.unasked(planned.joins.name, kept.name, "locate"),
      });
    }
    const refused = await apply(planned);
    if (refused) {
      return refused;
    }
    const now =
      ctx.db.project(project.id) ??
      (planned.joins ? ctx.db.project(planned.joins.id) : undefined);
    return ctx.projectOut(now ?? project);
  };

  /** The change held for checkout `place`, to `to`: pointed, still held, or let go. */
  const resumeOne = async (
    machineId: string,
    project: ProjectRow,
    place: PlaceRow,
    to: string
  ): Promise<void> => {
    const letGo = (why: string) => {
      ctx.db.holdLocate(place.id, null);
      ctx.projectsChanged();
      log(
        `${project.name} (${project.id}): the change held for checkout ${place.id}, to ${to}, is let go: ${why}`
      );
    };
    const planned = await plan(project.id, place.id, to);
    if (planned instanceof ElysiaStatus) {
      letGo(JSON.stringify(planned.response));
      return;
    }
    if (planned.held) {
      log(`${project.name}: ${to} still waits for ${machineId}`);
      return;
    }
    if (planned.forecast.state === "blocked") {
      letGo(`${planned.forecast.why} ${planned.forecast.todo}`);
      return;
    }
    if (planned.joins) {
      letGo(
        `${planned.joins.name} already has its codebase, and nobody was asked to make the two one project`
      );
      return;
    }
    const refused = await apply(planned);
    if (refused) {
      letGo(JSON.stringify(refused.response));
    }
  };

  /**
   * Each change held for a checkout on `machineId`, now that it is back:
   * looked at again and pointed, or let go, with why in the log, when what
   * it reads stands in the way, would make two projects one (nobody was
   * asked), or it is still away.
   */
  const resumeHeld = async (machineId: string): Promise<void> => {
    const held = ctx.db
      .listProjects()
      .flatMap((project) =>
        project.places
          .filter((place) => place.machineId === machineId && place.locateTo)
          .map((place) => ({ project, place }))
      );
    for (const { project, place } of held) {
      if (place.locateTo) {
        await resumeOne(machineId, project, place, place.locateTo);
      }
    }
  };

  /** The change held for checkout `placeId` while its machine is away, called off: the project as it is now, or the refusal. */
  const callOff = (projectId: string, placeId: string) => {
    const project = ctx.db.project(projectId);
    const place = project?.places.find((one) => one.id === placeId);
    if (!(project && place?.locateTo)) {
      return problem(409, {
        code: "locate-not-held",
        detail: locateRefusals.notHeld,
      });
    }
    ctx.db.holdLocate(place.id, null);
    ctx.projectsChanged();
    log(
      `${project.name} (${project.id}): the change held for checkout ${place.id}, to ${place.locateTo}, is called off`
    );
    return ctx.projectOut(ctx.db.project(project.id) ?? project);
  };

  return { preview, locate, resumeHeld, callOff };
};
