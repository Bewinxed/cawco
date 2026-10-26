/**
 * GitHub through Octokit, "The all-batteries-included GitHub SDK"
 * (github.com/octokit/octokit.js), signed in as the host's gh: its token by
 * `gh auth token --hostname <host>` (cli.github.com/manual/gh_auth_token),
 * which reads gh's keyring or `hosts.yml`, never a copy of our own. The API
 * is `api.github.com` for github.com and `<host>/api/v3` for a GitHub
 * Enterprise host; a gh config that names `http_unix_socket` is honoured as
 * go-gh honours it (pkg/api/client_options.go: "if opts.UnixDomainSocket ==
 * \"\" … cfg.Get([]string{\"http_unix_socket\"})"), plain HTTP over that
 * socket.
 */
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import { ghSays, hostGh } from "../host-gh";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeAdapter, ForgeSignIn } from "./forge";

const HTTPS = /^https:/u;

/** gh's config dir, as gh finds it: `$GH_CONFIG_DIR`, else `<config home>/gh`. */
const ghConfigDir = (): string =>
  process.env.GH_CONFIG_DIR || join(configHome(), "gh");

/** The `http_unix_socket` gh's config names, when it names one. */
const ghSocket = async (): Promise<string | undefined> => {
  const config = (await readYamlConfig(join(ghConfigDir(), "config.yml"))) as
    { http_unix_socket?: unknown } | undefined;
  const socket = config?.http_unix_socket;
  return typeof socket === "string" && socket ? socket : undefined;
};

/** `owner/repo` as its two parts. */
const ownerAndRepo = (path: string): { owner: string; repo: string } => {
  const [owner = "", repo = ""] = path.split("/");
  return { owner, repo };
};

export const githubForge: ForgeAdapter = {
  forge: "github",

  async signIn(asked) {
    if (!(await hostGh())) {
      return;
    }
    // gh lists every host it signs in to in hosts.yml, its token there or
    // in the keyring: the one for this host, its port included.
    const hosts = (await readYamlConfig(join(ghConfigDir(), "hosts.yml"))) as
      Record<string, unknown> | undefined;
    const host =
      Object.keys(hosts ?? {}).find((each) => sameHost(each, asked)) ?? asked;
    const token = (
      await ghSays(["auth", "token", "--hostname", host])
    )?.trim();
    if (!token) {
      return;
    }
    const socket = await ghSocket();
    const signIn: ForgeSignIn = {
      host,
      token,
      from: "gh's sign-in",
      api:
        host === "github.com"
          ? "https://api.github.com"
          : `https://${host}/api/v3`,
      ...(socket ? { socket } : {}),
    };
    return signIn;
  },

  client(signIn, path) {
    const { socket } = signIn;
    const octokit = new Octokit({
      auth: signIn.token,
      baseUrl: signIn.api,
      userAgent: "CawCo",
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
    const target = ownerAndRepo(path);
    return {
      account: async () =>
        (await octokit.rest.users.getAuthenticated()).data.login,
      issue: async ({ title, body }) => {
        const { data } = await octokit.rest.issues.create({
          ...target,
          title,
          body,
        });
        return { url: data.html_url };
      },
      pullRequest: async ({ base, head, title, body }) => {
        const { data: open } = await octokit.rest.pulls.list({
          ...target,
          state: "open",
          head: `${target.owner}:${head}`,
          base,
        });
        const [existing] = open;
        if (existing) {
          return { url: existing.html_url, existing: true };
        }
        const { data } = await octokit.rest.pulls.create({
          ...target,
          base,
          head,
          title,
          body,
        });
        return { url: data.html_url };
      },
      comment: async ({ number, body }) => {
        // A pull request's conversation is its issue's: GitHub numbers both
        // alike ("Every pull request is an issue", docs.github.com, REST
        // issues).
        const { data } = await octokit.rest.issues.createComment({
          ...target,
          issue_number: number,
          body,
        });
        return { url: data.html_url };
      },
    };
  },
};
