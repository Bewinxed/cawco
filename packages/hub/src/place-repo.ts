/**
 * A project's place made a git repository when a plain folder is first
 * needed as one (agent place-repo.ts does the work on the place's machine):
 * as a publish to a new GitHub repository reads it (repo-publish.ts). A
 * project made from a folder, or a folder added as its place, stays a
 * folder: a workspace is a private copy of any folder (agent layer.ts), and
 * a move makes one a repository with the person's yes (moves.ts `askFor`).
 * CawCo makes one local commit of what is
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
 *   cannot read, git failing), or the machine is not connected. A place has
 *   one step in flight: a second `ensure` while it runs joins it.
 * - `settled(machineId, path)` resolves once that place's step in flight,
 *   if any, has finished, whichever way: a move's plan inspects after it.
 */
import {
  CONTROL_PLACE_REPO,
  LARGE_FILE_BYTES,
  machineCalled,
  type PlaceLeftOut,
  type PlaceRepo,
  type ThreadNote,
} from "@cawco/core";
import type { DbShape } from "./db";

/** What {@link createPlaceRepos} needs of the hub. */
export interface PlaceRepoDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly db: Pick<
    DbShape,
    "lfsOffers" | "listAgents" | "newestConversation" | "project"
  >;
  /**
   * A note in a project's thread, waking no model (caw.ts `notice`); called
   * only once the hub is up, so it may reach a Caw made after this. Answers
   * the thread it went to; null when no Caw took it.
   */
  readonly notice: (
    projectId: string,
    threadId: string | null,
    note: ThreadNote
  ) => string | null;
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

export const createPlaceRepos = ({ call, db, notice }: PlaceRepoDeps) => {
  const machineName = (machineId: string): string =>
    machineCalled(machineId, db.listAgents());

  /**
   * The note a made repository leaves in the project's newest conversation;
   * when its first commit left files out for their size alone, it carries
   * the offer to commit them through Git LFS (lfs-offers.ts), filed with it.
   */
  const noteMade = (
    place: PlaceRef,
    made: Extract<PlaceRepo, { state: "made" }>
  ): void => {
    const leaf = made.root.split("/").filter(Boolean).at(-1) ?? made.root;
    const offer = made.lfs.length > 0 ? crypto.randomUUID() : undefined;
    const large = made.lfs.reduce((sum, row) => sum + row.count, 0);
    const threadId = notice(
      place.projectId,
      db.newestConversation(place.projectId)?.id ?? null,
      {
        title: `Made ${leaf} a git repository`,
        event: {
          kind: "repo",
          root: made.root,
          machineId: place.machineId,
          commit: made.commit,
          ...(offer ? { lfsOffer: offer } : {}),
        },
        body: `${made.root} on ${machineName(place.machineId)} was a plain folder, so CawCo made it a git repository to cut workspaces from: one commit, ${made.commit.slice(0, 9)}, of ${made.files} ${made.files === 1 ? "file" : "files"} (${(made.bytes / MB).toFixed(1)} MB). It goes to no outside remote; the project's workspaces reach it through the hub's own, as for any repository without one.\n\n${leftOutLines(made.leftOut)}${offer ? `\n\n${large} of them ${large === 1 ? "was" : "were"} left out for size alone, ${LARGE_FILE_BYTES / MB} MB or more: Git LFS can keep ${large === 1 ? "it" : "them"} instead, by pattern.` : ""}`,
      }
    );
    if (offer && threadId) {
      db.lfsOffers.offer({
        id: offer,
        projectId: place.projectId,
        machineId: place.machineId,
        root: made.root,
        threadId,
        rows: made.lfs,
        offeredAt: new Date(),
      });
    }
  };

  const make = async (place: PlaceRef): Promise<PlaceRepo> => {
    const answer = (await call(place.machineId, CONTROL_PLACE_REPO, [
      place.path,
    ])) as PlaceRepo;
    if (answer.state === "made") {
      noteMade(place, answer);
    }
    return answer;
  };

  /** Each place's one repo step in flight, by machine and path. */
  const inFlight = new Map<string, Promise<PlaceRepo>>();
  const keyOf = (machineId: string, path: string): string =>
    `${machineId}\0${path}`;

  const track = (key: string, step: Promise<PlaceRepo>): void => {
    inFlight.set(key, step);
    const forget = () => {
      if (inFlight.get(key) === step) {
        inFlight.delete(key);
      }
    };
    step.then(forget, forget);
  };

  /** A place's repo step: the one in flight, joined, else a new one, registered before this returns. */
  const ensure = (place: PlaceRef): Promise<PlaceRepo> => {
    const key = keyOf(place.machineId, place.path);
    const running = inFlight.get(key);
    if (running !== undefined) {
      return running;
    }
    const mine = make(place);
    track(key, mine);
    return mine;
  };

  /**
   * Resolves once the place at `path` on `machineId` has no repo step in
   * flight: what reads the folder to decide what to ask or do (a move's
   * plan) reads its settled state, whichever step started first. A step
   * that fails leaves the folder as it was; its error is its caller's.
   */
  const settled = async (machineId: string, path: string): Promise<void> => {
    await inFlight.get(keyOf(machineId, path))?.catch(() => undefined);
  };

  return {
    ensure,
    settled,
  };
};

export type PlaceRepos = ReturnType<typeof createPlaceRepos>;
