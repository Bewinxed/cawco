/**
 * A project's Who decides (PRD §5.8, core decides.ts), as it declares it:
 * `decides.md` in its hub folder, beside `gate.md`. Each line hands a kind,
 * by its name, to a member, by its id; a kind the file leaves out goes to
 * its area's decides.md (`areas/<id>/decides.md`, core areas.ts) when the
 * project sits in one and that file hands it, else to the fleet's member
 * for it (`decides_settings`, decides.ts).
 *
 * ```
 * ---
 * Look and words: you
 * Approach: advisor
 * Tools and conventions: practice
 * Yours:
 *   DESIGN.md
 *   packages/core/src/injected.ts
 * ---
 * Anything after the block is notes for people; the hub reads none of it.
 * ```
 *
 * The file is read by core `readDecides`, and every write of it, from the
 * dashboard, a session's `folder_write` or the hub itself, passes core
 * `decidesFileProblems` first (project-folder.ts `guardFolderFile`). A
 * decides.md that does not read (a commit pushed from outside CawCo) is
 * never taken for none: every kind is the person's until it reads, and the
 * hub says why with each card's route.
 */

import {
  type DecidesReading,
  type DecidesTable,
  type FleetDecides,
  readDecides,
} from "@cawco/core/decides";
import { ElysiaStatus } from "elysia";
import { areaFolder, readFolderFile } from "./project-folder";
import { StatusRefusal } from "./refusal";

/** A refusal of `settle`, in one sentence. */
export class SettleRefusal extends StatusRefusal<403 | 409> {}

/** The file in the project's folder that declares its Who decides. */
export const DECIDES_FILE = "decides.md";

/** decides.md as the project's folder holds it now, its text; undefined with none. */
export const decidesText = async (projectId: string) => {
  const file = await readFolderFile(projectId, DECIDES_FILE);
  if (file instanceof ElysiaStatus) {
    return file.status === 404 ? undefined : file;
  }
  return file.content;
};

/** decides.md as the project's folder holds it now, read; undefined with none. */
const decidesReading = async (projectId: string, fleet: FleetDecides) => {
  const content = await decidesText(projectId);
  if (content instanceof ElysiaStatus) {
    return content;
  }
  const reading: DecidesReading | undefined =
    content === undefined ? undefined : readDecides(content, fleet);
  return reading;
};

/** Where a table is read for: a project (null: outside any), and the area it sits in (null: none). */
export interface DecidesAt {
  areaId: string | null;
  projectId: string | null;
}

/**
 * The Who decides a card is settled by: the project's decides.md, over its
 * area's, over the fleet's; outside a project (`projectId` null), the
 * fleet's. A decides.md that does not read, the project's or its area's,
 * routes every kind to the person, its problems said.
 */
export const decidesTable = async (
  { projectId, areaId }: DecidesAt,
  fleet: FleetDecides
) => {
  const project = projectId
    ? await decidesReading(projectId, fleet)
    : undefined;
  if (project instanceof ElysiaStatus) {
    return project;
  }
  const area =
    projectId && areaId
      ? await decidesReading(areaFolder(areaId), fleet)
      : undefined;
  if (area instanceof ElysiaStatus) {
    return area;
  }
  const problems = [
    ...(project?.ok === false ? project.problems : []),
    ...(area?.ok === false
      ? area.problems.map((one) => `Its area's ${DECIDES_FILE}: ${one}`)
      : []),
  ];
  const own = project?.ok ? project.routes : {};
  const areas = area?.ok ? area.routes : {};
  const routes: Record<string, string> = {};
  const from: DecidesTable["from"] = {};
  for (const kind of fleet.kinds) {
    const mine = own[kind.id];
    const its = areas[kind.id];
    routes[kind.id] =
      problems.length > 0
        ? "you"
        : (mine ?? its ?? fleet.routes[kind.id] ?? "you");
    from[kind.id] = (mine && "project") || (its && "area") || "fleet";
  }
  const table: DecidesTable = {
    routes,
    from,
    yours: [
      ...new Set([
        ...(project?.ok ? project.yours : []),
        ...(area?.ok ? area.yours : []),
      ]),
    ],
    problems,
  };
  return table;
};
