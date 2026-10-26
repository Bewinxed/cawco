/**
 * Posts to other people's repositories under the upstream choice's `ask`
 * (core upstream-post.ts), on the machine whose workspace held them: each is
 * raised to the hub as the person's ask ({@link raiseUpstreamAsk}), and made
 * here once they approve it ({@link makeUpstreamPost}), with this machine's
 * own sign-in, which no guarded workspace ever holds.
 *
 * What is made is exactly what was asked: the held request sent again to
 * GitHub's API with the host's token, through Octokit's `request`; the held commits pushed from the
 * workspace's clone to the same URL and refs, on any host, with the host's
 * own git credential, their large files first to that repository's own LFS.
 * Nothing is retried.
 */
import { join } from "node:path";
import { CAWCO_ENV, type WorkspaceRef } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { octokitAnswer } from "@cawco/core/octokit-answer";
import { repositoryConfigProblem } from "@cawco/core/safe-git";
import { unhandled } from "@cawco/core/unhandled";
import { GITHUB_API, isWriteMethod } from "@cawco/core/upstream-guard";
import {
  FORGE_NAMES,
  type GitPost,
  type HttpPost,
  type PostMade,
  type UpstreamPost,
} from "@cawco/core/upstream-post";
import { Octokit } from "@octokit/rest";
import { toHttpBase } from "./discovery";
import { forgeLocation, forgeOn, makeForgePost } from "./forges/forge";
import { hostGhToken } from "./host-gh";
import { hostGitEnv, isNetworkRemote, pushLfs, runOnHost } from "./hub-git";
import { provenFetch } from "./hub-proof";
import { copyPathSync, viewRunning } from "./layer";
import { workspaceRefs } from "./workspace-records";

/** How long GitHub may take to answer one approved request. Our choice. A held push is bounded by its silence instead (hub-git.ts `runOnHost`). */
const MAKE_MS = 5 * 60_000;
/** How much of what the post's program said is kept for the session. */
const SAID_MAX = 4000;

/** How long a forge may take to name the login. Our choice. */
const ACCOUNT_MS = 15_000;

/**
 * Who a post to `repo` (`host/owner/repo`) is made as: the login of the
 * host's own sign-in on that host's forge, as its adapter reads it (gh, glab
 * or tea, forges/), found as `forge_post` finds it (forges/forge.ts
 * `forgeOn`: the one forge whose CLI signs in there), or that forge's
 * sign-in in words when the login cannot be read in time; on a host no
 * forge CLI alone signs in to, this machine's own git sign-in there, which
 * only its credential helper or ssh knows.
 */
const hostAccount = async (repo: string): Promise<string> => {
  const at = repo.indexOf("/");
  const found = await forgeOn(repo.slice(0, at));
  if (typeof found === "string") {
    return "this machine's git sign-in";
  }
  const read = await readWithin(ACCOUNT_MS, () =>
    found.adapter.client(found.signIn, repo.slice(at + 1)).account()
  ).catch(() => undefined);
  return read?.kind === "answered" && !read.value.includes(" ")
    ? `@${read.value}`
    : `this machine's ${FORGE_NAMES[found.adapter.forge]} sign-in`;
};

/**
 * Raises one held post as the person's ask (hub upstream-asks.ts), for
 * workspace `id`, the repository it lands in named: answers what the
 * session reads, and whether the hub took it.
 */
export const raiseUpstreamAsk = async (
  id: string,
  post: UpstreamPost,
  repo: string,
  what: string
): Promise<{ ok: boolean; text: string }> => {
  const hub = toHttpBase(process.env[CAWCO_ENV.hubUrl] ?? "");
  if (!hub) {
    return {
      ok: false,
      text: `cawco: \`${what}\` did not run: this machine has no hub to ask the owner through. Nothing was posted.`,
    };
  }
  // A push names its host with its port, as a forge CLI's login does; the
  // repository's identity, as the rule compares it, names none.
  const at = post.via === "git" ? forgeLocation(post.url) : undefined;
  const account = await hostAccount(at ? `${at.host}/${at.path}` : repo);
  try {
    const answer = await provenFetch(`${hub}/api/upstream/asks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: id, post, repo, account, what }),
    });
    return { ok: answer.ok, text: (await answer.text()).trim() };
  } catch (error) {
    return {
      ok: false,
      text: `cawco: \`${what}\` did not run: the hub could not be reached to ask the owner (${error instanceof Error ? error.message : String(error)}). Nothing was posted.`,
    };
  }
};

const cut = (text: string): string =>
  text.length > SAID_MAX ? `${text.slice(0, SAID_MAX)}…` : text;

const TRAILING_SLASHES = /\/+$/u;

/** What @octokit/endpoint reads as its URL template's own (`:name`, `{name}`): kept as the URL's escapes, which GitHub reads alike. */
const TEMPLATE_MARKS = /[:{}]/gu;

/**
 * A held request, sent again to GitHub's API with the host's token through
 * Octokit's `request` (github.com/octokit/request.js): the method, path,
 * query, content type and body exactly as the person approved them (a body
 * given as text is sent as it is, @octokit/endpoint `parse`: "if ("data" in
 * remainingParameters) body = remainingParameters.data"), no redirect
 * followed.
 */
const makeHttp = async (post: HttpPost): Promise<PostMade> => {
  if (!(GITHUB_API.has(post.host) && isWriteMethod(post.method))) {
    return {
      ok: false,
      said: `CawCo did not send it: ${post.method} ${post.host} is no write to GitHub's API.`,
    };
  }
  const token = await hostGhToken();
  if (!token) {
    return { ok: false, said: "This machine's gh is not signed in to GitHub." };
  }
  const octokit = new Octokit({
    auth: token,
    baseUrl: `https://${post.host}`,
    userAgent: "CawCo",
  });
  const read = await readWithin(MAKE_MS, (signal) =>
    octokitAnswer(() =>
      octokit.request({
        method: post.method,
        url: `${post.path}${post.search}`.replace(TEMPLATE_MARKS, (mark) =>
          encodeURIComponent(mark)
        ),
        headers: post.contentType ? { "content-type": post.contentType } : {},
        ...(post.body === undefined ? {} : { data: post.body }),
        request: { redirect: "manual", signal },
      })
    )
  );
  switch (read.kind) {
    case "answered": {
      const { status, data } = read.value;
      const text = typeof data === "string" ? data : JSON.stringify(data ?? "");
      return {
        ok: status >= 200 && status < 300 && !graphqlErrors(post, data),
        said: cut(`${status} ${text}`.trim()),
      };
    }
    case "unanswered":
      return {
        ok: false,
        said: `GitHub did not answer within ${Math.round(read.after / 1000)} s, so the request may or may not have posted.`,
      };
    default:
      unhandled("read", read);
  }
};

/** Whether a GraphQL answer carries errors: GitHub answers 200 with them. */
const graphqlErrors = (post: HttpPost, data: unknown): boolean => {
  if (post.path.replace(TRAILING_SLASHES, "") !== "/graphql") {
    return false;
  }
  // Not an object: GitHub answered something no GraphQL call ends in.
  return typeof data === "object" && data !== null
    ? Array.isArray((data as { errors?: unknown }).errors)
    : true;
};

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/u;
const REF = /^refs\/[A-Za-z0-9._/-]+$/u;

/**
 * A held push, made from the clone of workspace `ref` to the same URL and
 * refs, with the host's own credential for its host and transport: the
 * large files its commits reach go first to that repository's own LFS, by
 * its URL alone (hub-git.ts `pushLfs`), and when they do not go nothing is
 * pushed.
 */
export const makeHeldPush = async (
  ref: WorkspaceRef,
  post: GitPost
): Promise<PostMade> => {
  if (!isNetworkRemote(post.url)) {
    return {
      ok: false,
      said: `CawCo did not push: ${post.url} is no remote across the network, which is all a held push goes to.`,
    };
  }
  const bad = post.refs.find(
    (pushed) => !(SHA.test(pushed.sha) && REF.test(pushed.dst))
  );
  if (bad) {
    return {
      ok: false,
      said: `CawCo did not push: ${bad.sha}:${bad.dst} is not a commit and a ref.`,
    };
  }
  await viewRunning(ref.id);
  const gitDir = join(copyPathSync(ref.id, ref.path), ".git");
  const problem = await repositoryConfigProblem(gitDir);
  if (problem) {
    return { ok: false, said: `CawCo did not push: ${problem}.` };
  }
  const env = await hostGitEnv();
  const lfsRefused = await pushLfs(
    ref,
    post.refs.map((each) => each.sha),
    env,
    post.url
  );
  if (lfsRefused) {
    return { ok: false, said: `CawCo did not push: ${lfsRefused}.` };
  }
  // In a process group of its own, its progress forced on, as the door's
  // own push: when it says nothing for the door's silence limit the whole
  // group is stopped, the credential helper it waits on included. A
  // stopped `git-credential-osxkeychain` left behind keeps its lock on its
  // own binary, and every keychain lookup on the machine waits on it.
  const ran = await runOnHost(
    ref,
    [
      "push",
      "--progress",
      post.url,
      ...post.refs.map(
        (each) => `${each.force ? "+" : ""}${each.sha}:${each.dst}`
      ),
    ],
    env
  );
  return {
    ok: ran.code === 0,
    said: cut(settled(`${ran.out}\n${ran.err}`)),
  };
};

/** What git said with each progress meter at its last redraw: a line redrawn after `\r` keeps only its last state. */
const settled = (said: string): string =>
  said
    .split("\n")
    .map((line) => line.split("\r").filter(Boolean).at(-1) ?? "")
    .filter(Boolean)
    .join("\n");

/**
 * Makes one post once (the hub's `CONTROL_UPSTREAM_POST`), approved or the
 * project's own: a held request or push for workspace `id`, or a forge write,
 * which needs no workspace. Answers whether it went and what was said.
 */
export const makeUpstreamPost = async (
  id: string | null,
  post: UpstreamPost
): Promise<PostMade> => {
  console.log(`[upstream] ${id}: making an approved ${post.via} post`);
  switch (post.via) {
    case "http":
      return await makeHttp(post);
    case "forge":
      return await makeForgePost(post);
    case "git": {
      const ref = (await workspaceRefs()).find((each) => each.id === id);
      return ref
        ? await makeHeldPush(ref, post)
        : {
            ok: false,
            said: "CawCo did not push: the workspace's clone is gone from this machine.",
          };
    }
    case "mcp":
      return {
        ok: false,
        said: "A connection's post is made by the hub, not a machine.",
      };
  }
};
