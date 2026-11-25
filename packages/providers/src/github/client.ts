/**
 * GitHub's client, made here for every caller (provider spec §2.2: each
 * provider's client is made in its own folder): from a hub connection's
 * credential (hub connections.ts: a token, one read fresh for each request,
 * or a GitHub App's installation) or from a machine's CLI sign-in (agent
 * forges: gh's token, its unix socket).
 *
 * Every REST call names one API version, {@link GITHUB_API_VERSION}: a call
 * that names none is served `2022-11-28`, which GitHub retires on
 * 2028-03-10 (docs.github.com/en/rest/about-the-rest-api/api-versions). Each
 * read is written to what this version answers (its breaks:
 * .../breaking-changes#version-2026-03-10).
 */
import { createAppAuth, type StrategyOptions } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

/** Named in `X-GitHub-Api-Version` on every REST call. */
export const GITHUB_API_VERSION = "2026-03-10";

/** The header that names it, as a `fetch` takes it. */
export const GITHUB_API_VERSION_HEADER = {
  "x-github-api-version": GITHUB_API_VERSION,
} as const;

/**
 * Octokit with {@link GITHUB_API_VERSION} named on every REST request it
 * makes, an auth strategy's own (an app's installation token) among them:
 * those go through the same `request` hook. GraphQL has no REST version.
 */
export class GitHubOctokit extends Octokit {
  constructor(options?: ConstructorParameters<typeof Octokit>[0]) {
    super(options);
    this.hook.before("request", (request) => {
      if (request.url !== "/graphql") {
        request.headers["x-github-api-version"] = GITHUB_API_VERSION;
      }
    });
  }
}

/** A client signed in to GitHub: what every GitHub read and write takes. */
export type GitHubClient = Octokit;

/** Where GitHub's API answers for `host`: api.github.com for github.com, `<host>/api/v3` for a GitHub Enterprise host. */
export const githubApiOf = (host: string): string =>
  host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;

const HTTPS = /^https:/u;

/**
 * A client signed in with a token: one fixed, or read again for each
 * request (`token` a function: a gh token read again once old, a code
 * sign-in's refreshed near its end). `refused` hears GitHub's 401, so the
 * caller reads its token afresh next time. A `socket` is dialled as gh's
 * `http_unix_socket` is, plain HTTP over it (go-gh, pkg/api/client_options.go).
 */
export const githubTokenClient = (signIn: {
  api: string;
  refused?: () => void;
  socket?: string;
  token: string | (() => Promise<string>);
  userAgent: string;
}): GitHubClient => {
  const { socket, token } = signIn;
  const octokit = new GitHubOctokit({
    baseUrl: signIn.api,
    userAgent: signIn.userAgent,
    ...(typeof token === "string" ? { auth: token } : {}),
    ...(socket
      ? {
          request: {
            // go-gh speaks plain HTTP over the socket; Bun's fetch dials it.
            fetch: (url: string | URL, init?: RequestInit) =>
              fetch(String(url).replace(HTTPS, "http:"), {
                ...init,
                unix: socket,
              }),
          },
        }
      : {}),
  });
  if (typeof token === "function") {
    octokit.hook.before("request", async (options) => {
      options.headers.authorization = `token ${await token()}`;
    });
  }
  const { refused } = signIn;
  if (refused) {
    octokit.hook.error("request", (error) => {
      if ("status" in error && error.status === 401) {
        refused();
      }
      throw error;
    });
  }
  return octokit;
};

/** A GitHub App's auth, which mints and caches its installation's tokens. */
export type GitHubAppAuth = ReturnType<typeof createAppAuth>;

/**
 * A GitHub App installation's client, and the app auth that signs its
 * requests: Octokit makes the auth through its `authStrategy`, with its own
 * request, and it is handed back as made, because Octokit's own `auth` is
 * typed `unknown` (@octokit/core: "TODO: type `octokit.auth` based on
 * passed options.authStrategy"). Its requests and `auth({ type:
 * "installation" })` share its one installation-token cache.
 */
export const githubAppClient = (app: {
  api: string;
  appId: string;
  installationId: number;
  privateKey: string;
  userAgent: string;
}): { auth: GitHubAppAuth | undefined; octokit: GitHubClient } => {
  const signer: { auth?: GitHubAppAuth } = {};
  const octokit = new GitHubOctokit({
    authStrategy: (options: StrategyOptions) => {
      signer.auth = createAppAuth(options);
      return signer.auth;
    },
    auth: {
      appId: app.appId,
      installationId: app.installationId,
      privateKey: app.privateKey,
    },
    baseUrl: app.api,
    userAgent: app.userAgent,
  });
  return { octokit, auth: signer.auth };
};

/** A client signed as the GitHub App itself (its JWT): what reads its registration and its installations. */
export const githubAppJwtClient = (app: {
  api: string;
  appId: string;
  privateKey: string;
  userAgent: string;
}): GitHubClient =>
  new GitHubOctokit({
    authStrategy: createAppAuth,
    auth: { appId: app.appId, privateKey: app.privateKey },
    baseUrl: app.api,
    userAgent: app.userAgent,
  });

/** A client signed in as no one: what a sign-in's first step (an app's manifest code) asks with. */
export const githubAnonymousClient = (api: string, userAgent: string) =>
  new GitHubOctokit({ baseUrl: api, userAgent });
