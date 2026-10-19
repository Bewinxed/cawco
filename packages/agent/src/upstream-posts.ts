/**
 * Posts to other people's repositories under the upstream choice's `ask`
 * (core upstream-post.ts), on the machine whose workspace held them: each is
 * raised to the hub as the person's ask ({@link raiseUpstreamAsk}), and made
 * here once they approve it ({@link makeUpstreamPost}), with this machine's
 * own sign-in, which no guarded workspace ever holds.
 *
 * What is made is exactly what was asked: the held request sent again to
 * GitHub's API with the host's token; the held commits pushed from the
 * workspace's clone to the same URL and refs, on any host, with the host's
 * own git credential, their large files first to that repository's own LFS.
 * Nothing is retried.
 */
import { join } from "node:path";
import { CAWCO_ENV, type WorkspaceRef } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { GITHUB_API } from "@cawco/core/upstream-guard";
import {
  FORGE_NAMES,
  type GitPost,
  type HttpPost,
  type PostMade,
  type UpstreamPost,
} from "@cawco/core/upstream-post";
import { toHttpBase } from "./discovery";
import { FORGE_ADAPTERS, forgeLocation, makeForgePost } from "./forges/forge";
import { hostGhToken } from "./host-gh";
import { hostGitEnv, isNetworkRemote, pushLfs } from "./hub-git";
import { provenFetch } from "./hub-proof";
import { workspaceRefs } from "./workspace-records";

/** How long one approved post may take to make. Our choice: a push of a large branch is the slowest. */
const MAKE_MS = 5 * 60_000;
/** How much of what the post's program said is kept for the session. */
const SAID_MAX = 4000;

/** How long a forge may take to name the login. Our choice. */
const ACCOUNT_MS = 15_000;

/** What a program said: its exit, and its stdout and stderr together. */
interface Ran {
  readonly code: number;
  readonly said: string;
}

/** Runs `argv` with `ms` to finish (core bounded.ts): stopped when the time is up. */
const runWithin = (
  ms: number,
  argv: string[],
  options: {
    cwd?: string;
    env: Record<string, string>;
    stdin: "ignore" | Buffer;
  }
): Promise<Bounded<Ran>> =>
  readWithin(ms, async (signal) => {
    const child = Bun.spawn(argv, {
      ...options,
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [code, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, said: `${out}\n${err}`.trim() };
  });

/** A post made by a program, as the session hears it: what it said, or that it did not finish in time. */
const madeBy = (read: Bounded<Ran>, what: string): PostMade => {
  switch (read.kind) {
    case "answered":
      return { ok: read.value.code === 0, said: cut(read.value.said) };
    case "unanswered":
      return {
        ok: false,
        said: `${what} did not finish within ${Math.round(read.after / 1000)} s and was stopped, so it may or may not have posted.`,
      };
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * Who a post to `repo` (`host/owner/repo`) is made as: the login of the
 * host's own sign-in on that host's forge, as its adapter reads it (gh, glab
 * or tea, forges/), or that forge's sign-in in words when the login cannot
 * be read in time; on a host no forge CLI signs in to, this machine's own git
 * sign-in there, which only its credential helper or ssh knows.
 */
export const hostAccount = async (repo: string): Promise<string> => {
  const at = repo.indexOf("/");
  const host = repo.slice(0, at);
  for (const adapter of FORGE_ADAPTERS) {
    // biome-ignore lint/performance/noAwaitInLoops: the first forge that signs in to the host is its forge
    const signIn = await adapter.signIn(host);
    if (typeof signIn !== "object") {
      continue;
    }
    const read = await readWithin(ACCOUNT_MS, () =>
      adapter.client(signIn, repo.slice(at + 1)).account()
    ).catch(() => undefined);
    return read?.kind === "answered" && !read.value.includes(" ")
      ? `@${read.value}`
      : `this machine's ${FORGE_NAMES[adapter.forge]} sign-in`;
  }
  return "this machine's git sign-in";
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

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const TRAILING_SLASHES = /\/+$/;

/** A held request, sent again to GitHub's API with the host's token. */
const makeHttp = async (post: HttpPost): Promise<PostMade> => {
  if (!(GITHUB_API.has(post.host) && WRITE_METHODS.has(post.method))) {
    return {
      ok: false,
      said: `CawCo did not send it: ${post.method} ${post.host} is no write to GitHub's API.`,
    };
  }
  const token = await hostGhToken();
  if (!token) {
    return { ok: false, said: "This machine's gh is not signed in to GitHub." };
  }
  const read = await readWithin(MAKE_MS, async (signal) => {
    const answer = await fetch(
      `https://${post.host}${post.path}${post.search}`,
      {
        method: post.method,
        headers: {
          authorization: `token ${token}`,
          accept: "application/vnd.github+json",
          ...(post.contentType ? { "content-type": post.contentType } : {}),
        },
        ...(post.body === undefined ? {} : { body: post.body }),
        redirect: "manual",
        signal,
      }
    );
    return { answer, text: await answer.text() };
  });
  switch (read.kind) {
    case "answered": {
      const { answer, text } = read.value;
      return {
        ok: answer.ok && !graphqlErrors(post, text),
        said: cut(`${answer.status} ${text}`.trim()),
      };
    }
    case "unanswered":
      return {
        ok: false,
        said: `GitHub did not answer within ${Math.round(read.after / 1000)} s, so the request may or may not have posted.`,
      };
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** Whether a GraphQL answer carries errors: GitHub answers 200 with them. */
const graphqlErrors = (post: HttpPost, text: string): boolean => {
  if (post.path.replace(TRAILING_SLASHES, "") !== "/graphql") {
    return false;
  }
  try {
    return Array.isArray((JSON.parse(text) as { errors?: unknown }).errors);
  } catch {
    // Not JSON: GitHub answered something no GraphQL call ends in.
    return true;
  }
};

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const REF = /^refs\/[A-Za-z0-9._/-]+$/;

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
  const gitDir = join(ref.path, ".git");
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
  const read = await runWithin(
    MAKE_MS,
    safeGitArgv([
      "push",
      post.url,
      ...post.refs.map(
        (each) => `${each.force ? "+" : ""}${each.sha}:${each.dst}`
      ),
    ]),
    {
      cwd: ref.path,
      env: { ...env, ...SAFE_GIT_ENV, GIT_DIR: gitDir },
      stdin: "ignore",
    }
  );
  return madeBy(read, "git push");
};

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
    default:
      return {
        ok: false,
        said: "A connection's post is made by the hub, not a machine.",
      };
  }
};
