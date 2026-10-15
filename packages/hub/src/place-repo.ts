/**
 * A project's place made a git repository when a plain folder is first
 * needed as one (agent place-repo.ts does the work on the place's machine):
 * before a workspace is cut from it (a task's attempt, a delegate, a
 * routine's run, a retry, a check on another machine), and as a project is
 * made from or joined to a folder. Every workspace is then a clone, on one
 * path. The person is never asked: CawCo makes one local commit of what is
 * safe to keep in history, pushes nothing, adds no remote, and notes in the
 * project's newest conversation what the commit took and what it left out.
 *
 * The contract other modules call ({@link PlaceRepos}):
 *
 * - `ensure({ projectId, machineId, path })` runs on the place's machine,
 *   through its agent ({@link CONTROL_PLACE_REPO}). Answers the machine's
 *   {@link PlaceRepo}: `checkout` when the place already is in a repository
 *   (nothing done, no note), `made` with `files`, `bytes`, `staged` and
 *   `leftOut: { path, why }[]` when it made one (the note written). Throws
 *   an Error whose message is the machine's sentence when the place cannot
 *   be made one (not a folder there, past 500 MB to commit, a `.git` git
 *   cannot read, git failing), or the machine is not connected.
 */
import {
  CONTROL_PLACE_REPO,
  namedAmong,
  type PlaceLeftOut,
  type PlaceRepo,
  type ThreadNote,
} from "@cawco/core";
import type { DbShape, PlaceRow } from "./db";

/** What {@link createPlaceRepos} needs of the hub. */
export interface PlaceRepoDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly db: Pick<DbShape, "listAgents" | "newestConversation" | "project">;
  /**
   * A note in a project's thread, waking no model (caw.ts `notice`); called
   * only once the hub is up, so it may reach a Caw made after this.
   */
  readonly notice: (
    projectId: string,
    threadId: string | null,
    note: ThreadNote
  ) => void;
}

/** A place as {@link PlaceRepos.ensure} takes it. */
export interface PlaceRef {
  machineId: string;
  path: string;
  projectId: string;
}

/** Lines of left-out paths a note lists; the rest is a count. */
const NOTE_LINES = 100;

const MB = 1024 * 1024;

/** What the note says was left out, a line each. */
const leftOutLines = (leftOut: readonly PlaceLeftOut[]): string => {
  if (leftOut.length === 0) {
    return "Nothing was left out.";
  }
  const lines = leftOut
    .slice(0, NOTE_LINES)
    .map((each) => `- \`${each.path}\`: ${each.why}`);
  const more =
    leftOut.length > NOTE_LINES
      ? `\n- and ${leftOut.length - NOTE_LINES} more, each named in its .gitignore`
      : "";
  return `Left out, ${leftOut.length} ${leftOut.length === 1 ? "path" : "paths"}, each named in its .gitignore:\n${lines.join("\n")}${more}`;
};

/** The project's place on `machineId` that holds `cwd`: the deepest, when one place lies in another. */
export const placeHolding = (
  places: readonly PlaceRow[],
  machineId: string,
  cwd: string
): PlaceRow | undefined =>
  places
    .filter(
      (place) =>
        place.machineId === machineId &&
        place.kind === "checkout" &&
        (cwd === place.path || cwd.startsWith(`${place.path}/`))
    )
    .sort((a, b) => b.path.length - a.path.length)[0];

export const createPlaceRepos = ({ call, db, notice }: PlaceRepoDeps) => {
  const machineName = (machineId: string): string => {
    const agents = db.listAgents();
    const agent = agents.find((each) => each.machineId === machineId);
    return agent ? namedAmong(agent, agents) : machineId;
  };

  /** The note a made repository leaves in the project's newest conversation. */
  const noteMade = (
    place: PlaceRef,
    made: Exclude<PlaceRepo, { state: "checkout" }>
  ): void => {
    const leaf = made.root.split("/").filter(Boolean).at(-1) ?? made.root;
    notice(
      place.projectId,
      db.newestConversation(place.projectId)?.id ?? null,
      {
        title: `Made ${leaf} a git repository`,
        event: {
          kind: "repo",
          root: made.root,
          machineId: place.machineId,
          commit: made.commit ?? null,
        },
        body: `${made.root} on ${machineName(place.machineId)} was a plain folder, so CawCo made it a git repository to cut workspaces from: one commit, ${made.commit?.slice(0, 9)}, of ${made.files} ${made.files === 1 ? "file" : "files"} (${(made.bytes / MB).toFixed(1)} MB). It goes to no outside remote; the project's workspaces reach it through the hub's own, as for any repository without one.\n\n${leftOutLines(made.leftOut)}`,
      }
    );
  };

  const ensure = async (place: PlaceRef): Promise<PlaceRepo> => {
    const answer = (await call(place.machineId, CONTROL_PLACE_REPO, [
      place.path,
    ])) as PlaceRepo;
    if (answer.state === "made") {
      noteMade(place, answer);
    }
    return answer;
  };

  return {
    ensure,

    /**
     * Before a workspace is cut from `cwd` on `machineId` for `projectId`:
     * the project's place that holds it, made a repository when it is not
     * one. A folder that is none of the project's places is left alone, and
     * the workspace's own create says why it cannot be cut.
     */
    async beforeCut(
      projectId: string,
      machineId: string,
      cwd: string
    ): Promise<void> {
      const place = placeHolding(
        db.project(projectId)?.places ?? [],
        machineId,
        cwd
      );
      if (place) {
        await ensure({ projectId, machineId, path: place.path });
      }
    },
  };
};

export type PlaceRepos = ReturnType<typeof createPlaceRepos>;
