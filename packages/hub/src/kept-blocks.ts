/**
 * Where a project keeps a page artifact's source in its folder, by what the
 * page is (tsk-330). A decision page's program or built page is
 * `decisions/<name>/`, which the Decisions tab, its records and logs read.
 * A block an agent drew and someone kept is a page too, but asks nothing:
 * its program is `artifacts/<name>/page.oui`, beside what `artifact_promote`
 * writes for any artifact (artifacts/service.ts `promotedFolder`), so no
 * reader of `decisions/` meets it.
 *
 * Blocks kept before this were filed under `decisions/`: {@link moveKeptBlocks}
 * moves each once, as the hub starts (`data_migrations`).
 */
import { programLibraryOf } from "@cawco/core/inline-blocks";
import { PROGRAM_FILE } from "./decision-program";
import type { AnyProblem } from "./refusal";
import { hubActor } from "./tasks";

/** A decision page's folder in a project's folder. */
const decisionFolder = (name: string): string => `decisions/${name}`;

/** A kept block's folder in a project's folder: the one `artifact_promote` writes for its name. */
export const blockFolder = (name: string): string => `artifacts/${name}`;

/** Whether a page's program is a block's rather than a decision page's. */
export const isBlockProgram = (program: string | undefined): boolean =>
  program !== undefined && programLibraryOf(program) === "block";

/** Where page `name`'s source may stand in its project's folder: a decision page's program or built page, or a block's program. */
export const pageSourcePaths = (name: string): string[] => [
  `${decisionFolder(name)}/${PROGRAM_FILE}`,
  `${decisionFolder(name)}/index.html`,
  `${blockFolder(name)}/${PROGRAM_FILE}`,
];

/**
 * Page `name`'s source to keep, and the paths of its other forms to take out
 * so the folder holds one: a block's program under `artifacts/`, else a
 * decision page's program or built page under `decisions/`.
 */
export const pageSourceKept = (
  name: string,
  page: { html: string; program?: string }
): { keep: { content: string; path: string }; drop: string[] } => {
  let keep: { content: string; path: string };
  if (page.program === undefined) {
    keep = { path: `${decisionFolder(name)}/index.html`, content: page.html };
  } else if (isBlockProgram(page.program)) {
    keep = {
      path: `${blockFolder(name)}/${PROGRAM_FILE}`,
      content: page.program,
    };
  } else {
    keep = {
      path: `${decisionFolder(name)}/${PROGRAM_FILE}`,
      content: page.program,
    };
  }
  return {
    keep,
    drop: pageSourcePaths(name).filter((path) => path !== keep.path),
  };
};

/** The pass's name in `data_migrations`. */
const KEPT_BLOCKS_MOVED = "kept_blocks_moved";

export interface KeptBlocksDeps {
  readonly dataMigrated: (name: string) => boolean;
  /** The folders directly under `dir` in a project's folder; none when it isn't there. */
  readonly folders: (
    projectId: string,
    dir: string
  ) => Promise<string[] | AnyProblem>;
  readonly markDataMigrated: (name: string) => void;
  readonly move: (
    projectId: string,
    change: { writes: { content: string; path: string }[]; deletes: string[] },
    options: { author: { name: string }; message: string }
  ) => Promise<AnyProblem | undefined>;
  readonly projectIds: () => string[];
  /** A file of a project's folder; undefined when it isn't there. */
  readonly read: (
    projectId: string,
    path: string
  ) => Promise<string | undefined | AnyProblem>;
}

/** One project's blocks filed under `decisions/`, as the move that takes each to `artifacts/`; the folder's refusal of a read. */
const blocksIn = async (deps: KeptBlocksDeps, projectId: string) => {
  const moved = {
    names: [] as string[],
    writes: [] as { content: string; path: string }[],
    deletes: [] as string[],
  };
  const folders = await deps.folders(projectId, "decisions");
  if (!Array.isArray(folders)) {
    return folders;
  }
  for (const name of folders) {
    const path = `${decisionFolder(name)}/${PROGRAM_FILE}`;
    const program = await deps.read(projectId, path);
    if (program !== undefined && typeof program !== "string") {
      return program;
    }
    if (!(program !== undefined && isBlockProgram(program))) {
      continue;
    }
    const built = `${decisionFolder(name)}/index.html`;
    const page = await deps.read(projectId, built);
    if (page !== undefined && typeof page !== "string") {
      return page;
    }
    moved.names.push(name);
    moved.writes.push({
      path: `${blockFolder(name)}/${PROGRAM_FILE}`,
      content: program,
    });
    moved.deletes.push(path);
    if (page !== undefined) {
      moved.deletes.push(built);
    }
  }
  return moved;
};

/** One project's kept blocks moved to `artifacts/`, in one commit by the hub; the folder's refusal of a read or of the move. */
const moveIn = async (deps: KeptBlocksDeps, projectId: string) => {
  const blocks = await blocksIn(deps, projectId);
  if ("response" in blocks) {
    return blocks;
  }
  const { names, writes, deletes } = blocks;
  if (names.length === 0) {
    return;
  }
  const refused = await deps.move(
    projectId,
    { writes, deletes },
    {
      author: hubActor("artifacts").author,
      message: `artifacts: kept blocks out of decisions/ (${names.join(", ")})`,
    }
  );
  if (refused) {
    return refused;
  }
  console.info(
    `[artifacts] project ${projectId}: kept blocks moved to artifacts/: ${names.join(", ")}`
  );
};

/**
 * Runs the pass once: every project's kept blocks moved from `decisions/`
 * to `artifacts/`, one commit per project by the hub, then marked done. A
 * project whose folder can't be read or written is said in the log and
 * leaves the pass unmarked, to run again at the next start.
 */
export const moveKeptBlocks = async (deps: KeptBlocksDeps): Promise<void> => {
  if (deps.dataMigrated(KEPT_BLOCKS_MOVED)) {
    return;
  }
  let whole = true;
  for (const projectId of deps.projectIds()) {
    try {
      const refused = await moveIn(deps, projectId);
      if (refused) {
        whole = false;
        console.warn(
          `[artifacts] project ${projectId}'s kept blocks were not moved: ${refused.response.detail}`
        );
      }
    } catch (error) {
      whole = false;
      console.warn(
        `[artifacts] project ${projectId}'s kept blocks were not moved: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (whole) {
    deps.markDataMigrated(KEPT_BLOCKS_MOVED);
  }
};
