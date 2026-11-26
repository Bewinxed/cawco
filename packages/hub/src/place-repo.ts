/**
 * A project's place made a git repository when a plain folder is first
 * needed as one (agent place-repo.ts does the work on the place's machine):
 * as a publish to a new GitHub repository reads it (repo-publish.ts). A
 * project made from a folder, or a folder added as its place, stays a
 * folder: a workspace is a private copy of any folder (agent layer.ts), and
 * a move makes one a repository with the person's yes (moves.ts `askFor`).
 * CawCo makes one local commit of what is
 * safe to keep in history, pushes nothing and adds no remote. The publish's
 * card says the commit and what it left out, and the session that asked is
 * told of each file left out for its size (repo-publish.ts). Nothing of it
 * is a line in the project's Caw chat.
 *
 * The contract other modules call ({@link PlaceRepos}):
 *
 * - `ensure({ machineId, path })` runs on the place's machine,
 *   through its agent ({@link CONTROL_PLACE_REPO}). Answers the machine's
 *   {@link PlaceRepo}: `checkout` when the place already is in a repository
 *   (nothing done), `made` with `commit`, `files`, `bytes`, `staged`,
 *   `leftOut: { path, why }[]` and `large: { path, bytes }[]` when it made
 *   one. Throws
 *   an Error whose message is the machine's sentence when the place cannot
 *   be made one (not a folder there, past 500 MB to commit, a `.git` git
 *   cannot read, git failing), or the machine is not connected. A place has
 *   one step in flight: a second `ensure` while it runs joins it.
 * - `settled(machineId, path)` resolves once that place's step in flight,
 *   if any, has finished, whichever way: a move's plan inspects after it.
 */

import { makeJoin } from "@cawco/core/effect/join";
import { shortSha } from "@cawco/core/short-id";
import {
  CONTROL_PLACE_REPO,
  type PlaceRepo,
} from "@cawco/core/workspace/controls";
import { Effect, Schema } from "effect";
import type { HubLifetimeShape } from "./lifetime";
import type { MachineCall } from "./machine-answers";

/** What {@link createPlaceRepos} needs of the hub. */
export interface PlaceRepoDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: MachineCall;
  /** The hub's lifetime: each place's step runs on it. */
  readonly lifetime: HubLifetimeShape;
}

/** A place as {@link PlaceRepos.ensure} takes it. */
export interface PlaceRef {
  machineId: string;
  path: string;
}

/** What {@link PlaceRepos.settled} starts when no step is in flight: none, so it ends at once. */
class NoStep extends Schema.TaggedError<NoStep>()("NoStep", {}) {}

export const createPlaceRepos = ({ call, lifetime }: PlaceRepoDeps) => {
  const make = async (place: PlaceRef): Promise<PlaceRepo> => {
    const answer = await call(place.machineId, CONTROL_PLACE_REPO, [
      place.path,
    ]);
    if (answer.state === "made") {
      console.log(
        `[place-repo] ${answer.root}: made a git repository, ${answer.files} file(s) in ${shortSha(answer.commit)}, ${answer.leftOut.length} path(s) left out`
      );
    }
    return answer;
  };

  /** Each place's one repo step in flight, by machine and path. */
  const inFlight = makeJoin<string, PlaceRepo, unknown>();
  const keyOf = (machineId: string, path: string): string =>
    `${machineId}\0${path}`;

  /**
   * A place's repo step: the one in flight, joined, else a new one,
   * registered before this returns. The promise edge of the step.
   */
  const ensure = (place: PlaceRef): Promise<PlaceRepo> =>
    lifetime.run(
      inFlight.run(
        keyOf(place.machineId, place.path),
        Effect.tryPromise({ try: () => make(place), catch: (error) => error })
      )
    );

  /**
   * Resolves once the place at `path` on `machineId` has no repo step in
   * flight: what reads the folder to decide what to ask or do (a move's
   * plan) reads its settled state, whichever step started first. A step
   * that fails leaves the folder as it was; its error is its caller's. With
   * none in flight, the step it starts ({@link NoStep}) ends at once and is
   * kept by nothing.
   */
  const settled = (machineId: string, path: string): Promise<void> =>
    lifetime.run(
      inFlight
        .run(keyOf(machineId, path), Effect.fail(new NoStep()))
        .pipe(Effect.ignore)
    );

  return {
    ensure,
    settled,
  };
};

export type PlaceRepos = ReturnType<typeof createPlaceRepos>;
