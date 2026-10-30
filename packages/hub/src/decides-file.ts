/**
 * A project's Who decides (PRD §5.8, core decides.ts), as it declares it:
 * `decides.md` in its hub folder, beside `gate.md`. Each line hands a kind,
 * by its name, to a member, by its id; a kind the file leaves out goes to
 * the fleet's member for it (`decides_settings`, decides.ts).
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
import { FolderRefusal, readFolderFile } from "./project-folder";

/** A refusal of `settle`, in one sentence. */
export class SettleRefusal extends Error {
  readonly status: 403 | 409;

  constructor(status: 403 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** The file in the project's folder that declares its Who decides. */
export const DECIDES_FILE = "decides.md";

/** decides.md as the project's folder holds it now, its text; undefined with none. */
export const decidesText = async (
  projectId: string
): Promise<string | undefined> => {
  try {
    return (await readFolderFile(projectId, DECIDES_FILE)).content;
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return;
    }
    throw error;
  }
};

/** decides.md as the project's folder holds it now, read; undefined with none. */
const decidesReading = async (
  projectId: string,
  fleet: FleetDecides
): Promise<DecidesReading | undefined> => {
  const content = await decidesText(projectId);
  return content === undefined ? undefined : readDecides(content, fleet);
};

/**
 * The Who decides a card is settled by: the project's decides.md over the
 * fleet's; outside a project (`projectId` null), the fleet's. A decides.md
 * that does not read routes every kind to the person, its problems said.
 */
export const decidesTable = async (
  projectId: string | null,
  fleet: FleetDecides
): Promise<DecidesTable> => {
  const reading = projectId
    ? await decidesReading(projectId, fleet)
    : undefined;
  const own = reading?.ok ? reading.routes : {};
  const routes: Record<string, string> = {};
  const from: DecidesTable["from"] = {};
  for (const kind of fleet.kinds) {
    const project = own[kind.id];
    routes[kind.id] =
      reading?.ok === false
        ? "you"
        : (project ?? fleet.routes[kind.id] ?? "you");
    from[kind.id] = project ? "project" : "fleet";
  }
  return {
    routes,
    from,
    yours: reading?.ok ? reading.yours : [],
    problems: reading?.ok === false ? reading.problems : [],
  };
};
