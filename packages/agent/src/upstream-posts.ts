/**
 * Posts to other people's repositories under the upstream choice's `ask`
 * (core upstream-post.ts), on the machine whose workspace held them: each is
 * raised to the hub as the person's ask ({@link raiseUpstreamAsk}), and made
 * here once they approve it ({@link makeUpstreamPost}), with this machine's
 * own GitHub sign-in, which no guarded workspace ever holds.
 *
 * What is made is exactly what was asked: the held gh argv run by the host's
 * gh in an empty folder of CawCo's own, the repository it resolved to in the
 * workspace pinned (`GH_REPO`, `GH_HOST`); the held request sent again to
 * GitHub's API with the host's token; the held commits pushed from the
 * workspace's clone to the same URL and refs. Nothing is retried.
 */
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CAWCO_ENV } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { cawcoDataDir } from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import type { GhPost } from "@cawco/core/upstream-guard";
import { GITHUB_API, ghPostProblem } from "@cawco/core/upstream-guard";
import type {
  GitPost,
  HttpPost,
  PostMade,
  UpstreamPost,
} from "@cawco/core/upstream-post";
import { toHttpBase } from "./discovery";
import { hostGh, hostGhToken } from "./host-gh";
import { hostGithubGitEnv } from "./hub-git";
import { provenFetch } from "./hub-proof";
import { workspaceRefs } from "./workspace-records";

/** How long one approved post may take to make. Our choice: a push of a large branch is the slowest. */
const MAKE_MS = 5 * 60_000;
/** How much of what the post's program said is kept for the session. */
const SAID_MAX = 4000;

/** How long `gh api user` may take to name the login. Our choice. */
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

/** The GitHub login this machine's gh posts as; a plain phrase when gh cannot say in time. */
export const hostAccount = async (): Promise<string> => {
  const gh = await hostGh();
  if (!gh) {
    return "this machine's GitHub sign-in";
  }
  const read = await runWithin(
    ACCOUNT_MS,
    [gh, "api", "user", "--jq", ".login"],
    {
      env: hostEnvironment(),
      stdin: "ignore",
    }
  );
  const login =
    read.kind === "answered" && read.value.code === 0
      ? read.value.said.split("\n")[0]?.trim()
      : undefined;
  return login && !login.includes(" ")
    ? `@${login}`
    : "this machine's GitHub sign-in";
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
  const account = await hostAccount();
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

/** A held gh post, run by the host's gh in an empty folder of CawCo's own, so nothing of the workspace's is read. */
const makeGh = async (post: GhPost): Promise<PostMade> => {
  const problem = ghPostProblem(post);
  if (problem) {
    return { ok: false, said: `CawCo did not run it: ${problem}.` };
  }
  const gh = await hostGh();
  if (!gh) {
    return { ok: false, said: "This machine has no gh to post with." };
  }
  const dir = join(cawcoDataDir(), "upstream-posts", crypto.randomUUID());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    const read = await runWithin(MAKE_MS, [gh, ...post.args], {
      cwd: dir,
      env: {
        ...hostEnvironment(),
        GH_REPO: post.repo,
        GH_HOST: post.host,
        GH_PROMPT_DISABLED: "1",
        GH_NO_UPDATE_NOTIFIER: "1",
        // No checkout above the empty folder is ever read as gh's.
        GIT_CEILING_DIRECTORIES: dirname(dir),
      },
      stdin:
        post.stdin === undefined ? "ignore" : Buffer.from(post.stdin, "utf8"),
    });
    return madeBy(read, "gh");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

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

const GITHUB_HTTPS = /^https:\/\/github\.com\//;
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const REF = /^refs\/[A-Za-z0-9._/-]+$/;

/** A held push, made from the workspace's clone to the same URL and refs, with the host's gh credential. */
const makeGit = async (id: string, post: GitPost): Promise<PostMade> => {
  if (!GITHUB_HTTPS.test(post.url)) {
    return {
      ok: false,
      said: `CawCo did not push: ${post.url} is not GitHub.`,
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
  const ref = (await workspaceRefs()).find((each) => each.id === id);
  if (!ref) {
    return {
      ok: false,
      said: "CawCo did not push: the workspace's clone is gone from this machine.",
    };
  }
  const gitDir = join(ref.path, ".git");
  const problem = await repositoryConfigProblem(gitDir);
  if (problem) {
    return { ok: false, said: `CawCo did not push: ${problem}.` };
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
      env: { ...(await hostGithubGitEnv()), ...SAFE_GIT_ENV, GIT_DIR: gitDir },
      stdin: "ignore",
    }
  );
  return madeBy(read, "git push");
};

/**
 * Makes one approved post for workspace `id`, once (the hub's
 * `CONTROL_UPSTREAM_POST`): answers whether it went and what was said.
 */
export const makeUpstreamPost = async (
  id: string,
  post: UpstreamPost
): Promise<PostMade> => {
  console.log(`[upstream] ${id}: making an approved ${post.via} post`);
  switch (post.via) {
    case "gh":
      return await makeGh(post);
    case "http":
      return await makeHttp(post);
    case "git":
      return await makeGit(id, post);
    case "mcp":
      return {
        ok: false,
        said: "A connection's post is made by the hub, not a machine.",
      };
  }
};
