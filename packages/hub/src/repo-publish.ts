/**
 * A project's folder published to a new GitHub repository (`project_settings`
 * `create_repo`, always behind the person's Approve). THE INVARIANT: the
 * GitHub connection's token never leaves the hub. Any of a project's
 * repositories is published this way, each once: the folder is named, and
 * its repository's link records which hub repository it is the copy of.
 *
 * - **Read**, before the card: the checkout named (`folder`, the project's
 *   only one when left out) is made a git repository when it is a plain folder (place-repo.ts `ensure`: what is
 *   private, secret, large or generated stays out; the card says the
 *   commit it made, and Needs you offers Git LFS for its large files),
 *   then its branch, commit, files and bytes, and every path the rules keep
 *   out, are read on its machine (CONTROL_PLACE_PUSH, a dry run), which
 *   refuses a place whose commits hold what the rules or the credential
 *   scan would have kept out. The card says them all.
 * - **Publish**, on Approve: the place pushes its branch to the hub's own
 *   remote of its repository with its machine's credential (agent
 *   place-push.ts names which); the hub creates
 *   the repository through the connection with Octokit
 *   (`repos.createForAuthenticatedUser`, `POST /user/repos` on core
 *   github-api.ts's API version, private as asked) and pushes that
 *   branch from that repository's bare one with the token in
 *   an `http.extraHeader` given through git's environment, never argv; the
 *   project then links it as that repository's published copy.
 */

import { readWithin } from "@cawco/core/bounded";
import { type HubRepoKey, hubRepoSegment } from "@cawco/core/hub-repo";
import { isRecord } from "@cawco/core/is-record";
import type { ProjectSettingChange } from "@cawco/core/permission-presentation";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { CONTROL_PLACE_PUSH } from "@cawco/core/workspace/controls";
import { startedPath } from "@cawco/core/workspace-needs";
import { ElysiaStatus, problem } from "elysia";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { PlaceRow, ProjectRow } from "./db/projects";
import type { MachineCall } from "./machine-answers";
import type { PlaceRepos } from "./place-repo";

/** GitHub's rule for a repository's name. */
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/u;
/** How long one GitHub API call may take. Our choice. */
const API_MS = 30_000;
/** How long the hub's push to GitHub may take. Our choice. */
const PUSH_MS = 10 * 60_000;

type CreateRepo = Extract<ProjectSettingChange, { kind: "create_repo" }>;

export interface RepoPublishDeps {
  /** The hub's bare repository of one of a project's repositories (git-remote.ts `bareRepoPath`). */
  readonly bare: (key: HubRepoKey) => string;
  /** A machine-scoped daemon function, answered or thrown in the machine's words. */
  readonly call: MachineCall;
  readonly connections: Pick<
    Connections,
    "githubClient" | "githubToken" | "list"
  >;
  readonly db: Pick<DbShape, "projectLinkPublishedFrom">;
  readonly places: Pick<PlaceRepos, "ensure">;
}

/**
 * GitHub's refusal of a create in words: its status and GitHub's own
 * message. Octokit throws it as a RequestError (@octokit/request-error): its
 * `status`, and the answer's `message` under `response.data`.
 */
const refusalOf = (error: unknown): string => {
  const failed = isRecord(error) ? error : {};
  const { response } = failed;
  const answer = isRecord(response) ? response.data : undefined;
  const said = isRecord(answer) ? answer.message : undefined;
  const status =
    typeof failed.status === "number" ? failed.status : "no answer";
  const message = typeof failed.message === "string" ? failed.message : "";
  return `${status} ${typeof said === "string" ? said : message}`.trim();
};

/** A publish done: the repository made, `owner/name`, and the hub repository it is the copy of. */
export interface Published {
  readonly from: HubRepoKey;
  readonly full: string;
}

const TRAILING_SLASHES = /\/+$/u;

export const createRepoPublish = ({
  bare,
  call,
  connections,
  db,
  places,
}: RepoPublishDeps) => {
  /** The checkout a publish reads and pushes: the one named, else the project's only one. */
  const placeOf = (project: ProjectRow, folder: string | undefined) => {
    const checkouts = project.places.filter(
      (place) => place.kind === "checkout"
    );
    const named = folder?.trim().replace(TRAILING_SLASHES, "");
    const [only, ...others] = checkouts;
    const sole = others.length === 0 ? only : undefined;
    const found = named
      ? checkouts.find((place) => place.path === named)
      : sole;
    if (found) {
      const place: PlaceRow = found;
      return place;
    }
    if (checkouts.length === 0) {
      return problem(409, {
        code: "repo-publish-no-checkout",
        detail:
          "This project has no checkout on a machine to publish: its only place is its folder on the hub.",
      });
    }
    const listed = checkouts.map((place) => place.path).join(", ");
    return problem(400, {
      code: "repo-publish-folder-unnamed",
      detail: named
        ? `${named} isn't one of this project's folders. Pass one as folder: ${listed}.`
        : `Name the folder to publish (folder): ${listed}.`,
    });
  };

  /** Refused when the hub repository `key` is published already: its link names where. */
  const unpublished = (project: ProjectRow, key: HubRepoKey | undefined) => {
    const linked = key
      ? db.projectLinkPublishedFrom(project.id, hubRepoSegment(key))
      : undefined;
    return linked
      ? problem(409, {
          code: "repo-publish-published",
          detail: `This folder's repository is already published, as ${linked}.`,
        })
      : undefined;
  };

  /** The GitHub connection to create it with: the one named, else the project's one, else the fleet's one. */
  const connectionOf = (project: ProjectRow, named: string | undefined) => {
    const github = connections
      .list()
      .filter((one) => one.service.trim().toLowerCase() === "github");
    const wanted = named?.trim();
    const mine = github.filter(
      (one) =>
        one.projects.includes(project.id) ||
        (!!project.areaId && one.areas.includes(project.areaId))
    );
    const from = mine.length > 0 ? mine : github;
    const sole = from.length === 1 ? from[0] : undefined;
    const pick = wanted ? github.find((one) => one.name === wanted) : sole;
    if (!pick) {
      return wanted
        ? problem(404, {
            code: "repo-publish-connection-unknown",
            detail: `There is no GitHub connection ${wanted}.`,
          })
        : problem(400, {
            code: "repo-publish-connection-unnamed",
            detail:
              from.length === 0
                ? "The fleet has no GitHub connection to create the repository with; add one in Settings › Connections."
                : `Name the GitHub connection to create it with (connection): ${from.map((one) => one.name).join(", ")}.`,
          });
    }
    // A connection the hub cannot sign in as is refused before anyone is
    // asked; so is a GitHub App's, which makes no repository under a person
    // (`POST /user/repos` takes a user's token).
    if (!(
      pick.auth === "bearer" ||
      pick.auth === "gh" ||
      pick.auth === "device"
    )) {
      return problem(400, {
        code: "repo-publish-connection-unfit",
        detail: `${pick.name} signs in with ${pick.auth}; creating a repository takes a GitHub connection that acts as you: gh on a machine, a code sign-in, or a token.`,
      });
    }
    connections.githubClient(pick.name);
    return pick;
  };

  /** What the card says: the place made a repository if it is a folder, then what would go. */
  const read = async (
    project: ProjectRow,
    asked: {
      connection?: string;
      folder?: string;
      name?: string;
      private?: boolean;
    }
  ) => {
    const name = asked.name?.trim() ?? "";
    if (!REPO_NAME.test(name)) {
      return problem(400, {
        code: "repo-publish-name-unfit",
        detail:
          "create_repo takes the repository's name: letters, digits, '.', '-' and '_'.",
      });
    }
    const connection = connectionOf(project, asked.connection);
    if (connection instanceof ElysiaStatus) {
      return connection;
    }
    const place = placeOf(project, asked.folder);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const made = await places.ensure({
      machineId: place.machineId,
      path: place.path,
    });
    const tree = await call(place.machineId, CONTROL_PLACE_PUSH, [
      place.path,
      project.id,
      true,
    ]);
    const published = unpublished(project, tree.hub);
    if (published) {
      return published;
    }
    const change: CreateRepo = {
      kind: "create_repo",
      folder: place.path,
      name,
      private: asked.private ?? true,
      connection: connection.name,
      account: connection.account,
      ...(made.state === "made" ? { madeCommit: made.commit } : {}),
      ...(made.state === "made" && made.large.length > 0
        ? { large: made.large }
        : {}),
      files: tree.files,
      bytes: tree.bytes,
      // What stays out by the rules, with what a first commit made now
      // left out besides (its own .gitignore's, a credential's text).
      leftOut: [
        ...new Map(
          [...(made.state === "made" ? made.leftOut : []), ...tree.leftOut].map(
            (one) => [one.path, one]
          )
        ).values(),
      ].sort((a, b) => a.path.localeCompare(b.path)),
    };
    return change;
  };

  /** The hub's push from its bare repository to GitHub, the token in git's environment. */
  const pushFromHub = async (
    key: HubRepoKey,
    branch: string,
    url: string,
    token: string
  ): Promise<void> => {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    const ran = await readWithin(PUSH_MS, async (signal) => {
      const child = Bun.spawn(
        [
          "git",
          "-C",
          bare(key),
          "push",
          "--quiet",
          url,
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        {
          env: {
            PATH: startedPath(),
            HOME: process.env.HOME ?? "/",
            ...GIT_LOCALE,
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.extraHeader",
            GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
          },
          stdin: "ignore",
          stdout: "ignore",
          stderr: "pipe",
          signal,
        }
      );
      const [stderr, code] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stderr, code };
    });
    switch (ran.kind) {
      case "answered":
        break;
      case "unanswered":
        throw new Error(
          `The hub's push to ${url} did not finish within ${secondsOf(ran.after)} s; the repository may hold part of it.`
        );
      default:
        unhandled("read", ran);
    }
    const { stderr, code } = ran.value;
    if (code !== 0) {
      throw new Error(
        `The hub's push to ${url} failed: ${stderr.split(token).join("[token]").split(basic).join("[token]").trim()}`
      );
    }
  };

  /** Approved: pushed to the hub, created on GitHub, pushed there; answers what it made, from where. */
  const publish = async (project: ProjectRow, change: CreateRepo) => {
    const place = placeOf(project, change.folder);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const pushed = await call(place.machineId, CONTROL_PLACE_PUSH, [
      place.path,
      project.id,
      false,
    ]);
    const { hub } = pushed;
    if (!hub) {
      return problem(502, {
        code: "repo-publish-hub-unnamed",
        detail: `${place.path} answered its push without naming the hub repository it went to.`,
      });
    }
    const published = unpublished(project, hub);
    if (published) {
      return published;
    }
    // The connection's token as it is now, taken before the repository is
    // made so a connection that holds none makes nothing on GitHub.
    const token = await connections.githubToken(change.connection);
    const octokit = connections.githubClient(change.connection);
    const asked = await readWithin(API_MS, async (signal) => {
      try {
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
          name: change.name,
          private: change.private,
          auto_init: false,
          request: { signal, redirect: "error" },
        });
        return { made: data };
      } catch (error) {
        return { refused: refusalOf(error) };
      }
    });
    switch (asked.kind) {
      case "answered":
        break;
      case "unanswered":
        throw new Error(
          `GitHub did not answer within ${secondsOf(asked.after)} s about creating ${change.name}, so it may or may not exist: look on GitHub before you retry.`
        );
      default:
        unhandled("read", asked);
    }
    const { made, refused } = asked.value;
    if (!made) {
      throw new Error(`GitHub did not create ${change.name}: ${refused}`);
    }
    await pushFromHub(hub, pushed.branch, made.clone_url, token);
    console.log(
      `[repo-publish] ${project.name}: ${place.path}'s ${pushed.branch} at ${pushed.commit.slice(0, 9)} published to ${made.full_name}`
    );
    const done: Published = { full: made.full_name, from: hub };
    return done;
  };

  return { read, publish };
};

export type RepoPublish = ReturnType<typeof createRepoPublish>;
