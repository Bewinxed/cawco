/**
 * Forges, on the machine (docs/forge-adapters.md): every forge CawCo posts to
 * plugs in through one {@link ForgeAdapter}, which finds the host's own
 * sign-in where that forge's CLI keeps it and makes an issue, a pull or merge
 * request, or a comment through the forge's own library or MCP server
 * (github.ts on Octokit, gitlab.ts on @gitbeaker/rest, gitea.ts on the
 * official gitea-mcp). No adapter decides whether a write may go: that is
 * core's `decideWrite`, here as at every door.
 *
 * - {@link forgePost}: an agent's write (the hub's `forge_post`, sent here as
 *   `CONTROL_FORGE_POST` with the project's rule): the repository's forge and
 *   sign-in found by its host, then made now, held for the person (the hub
 *   raises the ask the answer names), or refused in the guard's words.
 * - {@link makeForgePost}: a write made once with no decision, an approved
 *   held one or a landing's pull request (`CONTROL_UPSTREAM_POST`).
 *
 * The credential is read on the host, used here, and never sent anywhere but
 * its forge.
 */
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { decideWrite, type UpstreamRule } from "@cawco/core/upstream-guard";
import {
  changeRequestWords,
  FORGE_NAMES,
  type Forge,
  type ForgeAsk,
  type ForgePost,
  type ForgeVerdict,
  type ForgeWrite,
  type PostMade,
} from "@cawco/core/upstream-post";
import { giteaForge } from "./gitea";
import { githubForge } from "./github";
import { gitlabForge } from "./gitlab";

/** The host's own sign-in on a forge's host, as that forge's CLI keeps it. */
export interface ForgeSignIn {
  /** Where the forge's API answers: `https://api.github.com`, `https://gitlab.example.com`. */
  readonly api: string;
  /** Where it came from, in words: "gh's sign-in", "glab's config". */
  readonly from: string;
  readonly host: string;
  /** A unix socket the API is reached through, as the CLI's config names one (gh's `http_unix_socket`). */
  readonly socket?: string;
  readonly token: string;
}

/** What a forge made, or found already open. */
export interface ForgeMade {
  /** A pull or merge request that was open already for the same branches. */
  readonly existing?: boolean;
  readonly url: string;
}

/** One repository on one forge, signed in: the writes every forge has. */
export interface ForgeClient {
  /** The login it posts as. */
  readonly account: () => Promise<string>;
  readonly comment: (
    write: Extract<ForgeWrite, { op: "comment" }>
  ) => Promise<ForgeMade>;
  readonly issue: (
    write: Extract<ForgeWrite, { op: "issue" }>
  ) => Promise<ForgeMade>;
  /** The open pull or merge request from `head` into `base`, or a new one. */
  readonly pullRequest: (
    write: Extract<ForgeWrite, { op: "pull_request" }>
  ) => Promise<ForgeMade>;
}

/** One forge: where its CLI keeps the host's sign-in, and a client for one repository. */
export interface ForgeAdapter {
  /** A client for the repository at `path` (`owner/repo`, `group/sub/project`) on the sign-in's host. */
  readonly client: (signIn: ForgeSignIn, path: string) => ForgeClient;
  readonly forge: Forge;
  /** The host's sign-in for `host`, or why it holds none it can use; undefined when this forge's CLI keeps nothing for it. */
  readonly signIn: (host: string) => Promise<ForgeSignIn | string | undefined>;
}

/** Every forge. A host is the forge whose CLI alone signs in to it ({@link forgeOn}). */
export const FORGE_ADAPTERS: readonly ForgeAdapter[] = [
  githubForge,
  gitlabForge,
  giteaForge,
];

/** How long one forge call may take. Our choice. */
const CALL_MS = 60_000;

/** `host/path` split at its host. */
const hostAndPath = (repo: string): { host: string; path: string } => {
  const at = repo.indexOf("/");
  return { host: repo.slice(0, at), path: repo.slice(at + 1) };
};

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** git's scp-like form, `[user@]host:path`, no slash before the colon (git-scm.com/docs/git-clone, "GIT URLS"). */
const SCP_LIKE = /^(?:[^@/\s]+@)?([^/:\s]+):(.+)$/;
const EDGE_SLASHES = /^\/+|\/+$/g;
const DOT_GIT = /\.git$/i;
const PORT = /:\d+$/;

/**
 * Where a repository is, from its git URL or `host/path`: its host with its
 * port, which is how gh, glab and tea name a self-hosted forge's login
 * (`gitea.local:3000`), and its path, `.git` and edge slashes off. Undefined
 * for what names no host and path.
 */
export const forgeLocation = (
  raw: string
): { host: string; path: string } | undefined => {
  const text = raw.trim();
  let host = "";
  let path = "";
  if (SCHEME.test(text)) {
    try {
      const { host: at, pathname } = new URL(text);
      host = at;
      path = decodeURIComponent(pathname);
    } catch {
      return;
    }
  } else {
    const scp = SCP_LIKE.exec(text);
    if (scp) {
      [, host = "", path = ""] = scp;
    } else {
      ({ host, path } = hostAndPath(text));
    }
  }
  path = path.replace(EDGE_SLASHES, "").replace(DOT_GIT, "");
  return host && path.includes("/")
    ? { host: host.toLowerCase(), path }
    : undefined;
};

/** Each forge's CLI, as the person signs it in. */
const CLI_OF: Record<Forge, string> = {
  github: "gh",
  gitlab: "glab",
  gitea: "tea",
};

/**
 * The forge `host` is on, with the host's sign-in there; or why there is
 * none, in words. Every forge's CLI is asked: the host is a forge's when
 * that CLI alone keeps a login that could be it (a usable sign-in, or one
 * it names but cannot use). When more than one could be, which forge the
 * repository is on is not CawCo's to guess, and the session is asked for
 * the repository's URL, its port and all, which names one login.
 */
export const forgeOn = async (
  host: string
): Promise<{ adapter: ForgeAdapter; signIn: ForgeSignIn } | string> => {
  const found = await Promise.all(
    FORGE_ADAPTERS.map(async (adapter) => ({
      adapter,
      signIn: await adapter.signIn(host),
    }))
  );
  const logins = found.filter(
    (each): each is { adapter: ForgeAdapter; signIn: ForgeSignIn | string } =>
      each.signIn !== undefined
  );
  const [only] = logins;
  if (logins.length > 1) {
    const named = logins
      .map(({ adapter, signIn }) =>
        typeof signIn === "object"
          ? `${FORGE_NAMES[adapter.forge]} through ${CLI_OF[adapter.forge]} at ${signIn.host}`
          : `${FORGE_NAMES[adapter.forge]} through ${CLI_OF[adapter.forge]}`
      )
      .join(", ");
    const example =
      logins
        .map(({ signIn }) => (typeof signIn === "object" ? signIn.host : host))
        .find((each) => each !== host) ?? host;
    return `this machine signs in to ${host} as more than one forge (${named}), so which one the repository is on is not CawCo's to guess. Name the repository by its URL, its port included when its forge has one, with repo (for example repo: "https://${example}/owner/name"), and post again.`;
  }
  if (!only) {
    return `this machine has no sign-in on ${host}: neither gh, glab nor tea is signed in there (gh auth login --hostname ${host}, glab auth login --hostname ${host}, or tea login add --url https://${host}).`;
  }
  return typeof only.signIn === "object"
    ? { adapter: only.adapter, signIn: only.signIn }
    : only.signIn;
};

/** A call within {@link CALL_MS}: its answer, or its failure in words. */
const within = async <T>(
  what: string,
  run: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; said: string }> => {
  let read: Bounded<T>;
  try {
    read = await readWithin(CALL_MS, () => run());
  } catch (error) {
    return {
      ok: false,
      said: `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return read.kind === "answered"
    ? { ok: true, value: read.value }
    : {
        ok: false,
        said: `${what} did not answer within ${Math.round(read.after / 1000)} s, so it may or may not be there.`,
      };
};

/** One write through `client`. */
const write = (client: ForgeClient, one: ForgeWrite): Promise<ForgeMade> => {
  switch (one.op) {
    case "issue":
      return client.issue(one);
    case "pull_request":
      return client.pullRequest(one);
    case "comment":
      return client.comment(one);
    default: {
      const unhandled: never = one;
      throw new Error(`unhandled forge write: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** What a write is, in the words a session and the card read. */
const whatOf = (forge: Forge, one: ForgeWrite, repo: string): string => {
  switch (one.op) {
    case "issue":
      return `open an issue on ${repo}`;
    case "pull_request":
      return `open a ${changeRequestWords(forge)} on ${repo}`;
    case "comment":
      return `comment on ${one.on === "issue" ? "issue" : changeRequestWords(forge)} ${one.number} of ${repo}`;
    default: {
      const unhandled: never = one;
      throw new Error(`unhandled forge write: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** What a made write says. */
const madeWords = (forge: Forge, one: ForgeWrite, made: ForgeMade): string => {
  const name = FORGE_NAMES[forge];
  if (one.op === "pull_request") {
    const kind = changeRequestWords(forge);
    return made.existing
      ? `${name} has a ${kind} open from ${one.head} into ${one.base} already: ${made.url}`
      : `${name} opened the ${kind}: ${made.url}`;
  }
  return one.op === "issue"
    ? `${name} opened the issue: ${made.url}`
    : `${name} took the comment: ${made.url}`;
};

/** Makes `post` once, with the host's sign-in on its forge: no decision, the write is approved or the project's own. */
export const makeForgePost = async (post: ForgePost): Promise<PostMade> => {
  const { host, path } = hostAndPath(post.repo);
  const adapter = FORGE_ADAPTERS.find((each) => each.forge === post.forge);
  const signIn = adapter ? await adapter.signIn(host) : undefined;
  if (!(adapter && typeof signIn === "object")) {
    return {
      ok: false,
      said: `CawCo did not post: ${typeof signIn === "string" ? signIn : `this machine has no ${FORGE_NAMES[post.forge]} sign-in on ${host}`}.`,
    };
  }
  const made = await within(`${FORGE_NAMES[post.forge]} on ${host}`, () =>
    write(adapter.client(signIn, path), post.write)
  );
  return made.ok
    ? {
        ok: true,
        said: madeWords(post.forge, post.write, made.value),
        url: made.value.url,
        ...(made.value.existing ? { existing: true } : {}),
      }
    : { ok: false, said: made.said };
};

/**
 * An agent's write under the project's `rule`: the repository's forge and
 * the host's sign-in there found by its host, then decided (core
 * `decideWrite`) and made now, held with the account it would post as, or
 * refused.
 */
export const forgePost = async (
  rule: UpstreamRule | undefined,
  ask: ForgeAsk
): Promise<ForgeVerdict> => {
  const at = forgeLocation(ask.repo);
  if (!at) {
    return {
      kind: "refused",
      why: `cawco: ${ask.repo} names no repository on a forge: give its URL or host/owner/repo.`,
    };
  }
  const found = await forgeOn(at.host);
  if (typeof found === "string") {
    return { kind: "refused", why: `cawco: nothing was posted: ${found}` };
  }
  const { forge } = found.adapter;
  // The rule names repositories without a port, as every remote's identity
  // is (core normaliseRemote); the post names the host its sign-in is for,
  // port and all, so it is made where it was decided.
  const repo = `${at.host.replace(PORT, "")}/${at.path}`;
  const what = whatOf(forge, ask.write, repo);
  const post: ForgePost = {
    via: "forge",
    forge,
    repo: `${found.signIn.host}/${at.path}`,
    write: ask.write,
  };
  const decision = decideWrite(rule, { what, repo });
  switch (decision.kind) {
    case "go":
      return { kind: "made", made: await makeForgePost(post) };
    case "refuse":
      return { kind: "refused", why: decision.why };
    case "hold": {
      const login = await within("reading the account", () =>
        found.adapter.client(found.signIn, at.path).account()
      );
      return {
        kind: "held",
        post,
        what,
        account: login.ok
          ? `@${login.value}`
          : `this machine's ${FORGE_NAMES[forge]} sign-in`,
      };
    }
    default: {
      const unhandled: never = decision;
      throw new Error(`unhandled decision: ${JSON.stringify(unhandled)}`);
    }
  }
};
