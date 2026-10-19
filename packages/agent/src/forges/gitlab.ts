/**
 * GitLab through @gitbeaker/rest, "A Typed GitLab SDK for Browsers, Node.js,
 * and Deno" (github.com/jdalrymple/gitbeaker), signed in as the host's glab:
 * its `config.yml` (`$GLAB_CONFIG_DIR`, else `<config home>/glab-cli`), the
 * host's `token` and where its API answers, `api_protocol` and `api_host`
 * ("`token`: Your GitLab access token … Scoped per host"; "`api_protocol`:
 * What protocol to use to access the API endpoint", docs.gitlab.com/cli/config).
 * GitLab's own MCP server is not used here: it rejects the legacy personal
 * access tokens glab keeps (docs.gitlab.com/user/model_context_protocol/mcp_server).
 */
import { join } from "node:path";
import { Gitlab } from "@gitbeaker/rest";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeAdapter, ForgeSignIn } from "./forge";

/** glab's config dir, as glab finds it. */
const glabConfigDir = (): string =>
  process.env.GLAB_CONFIG_DIR || join(configHome(), "glab-cli");

/** One host's entry in glab's config. */
interface GlabHost {
  api_host?: unknown;
  api_protocol?: unknown;
  gitlab_token?: unknown;
  oauth_token?: unknown;
  token?: unknown;
  use_keyring?: unknown;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const gitlabForge: ForgeAdapter = {
  forge: "gitlab",

  async signIn(asked) {
    const config = (await readYamlConfig(
      join(glabConfigDir(), "config.yml")
    )) as { hosts?: Record<string, GlabHost> } | undefined;
    const host = Object.keys(config?.hosts ?? {}).find((each) =>
      sameHost(each, asked)
    );
    const entry = host ? config?.hosts?.[host] : undefined;
    if (!(host && entry)) {
      return;
    }
    const token =
      text(entry.token) ?? text(entry.gitlab_token) ?? text(entry.oauth_token);
    if (!token) {
      return entry.use_keyring === true || entry.use_keyring === "true"
        ? `glab keeps its ${host} sign-in in the system keyring, which CawCo does not read: run \`glab auth login --hostname ${host}\` and decline the keyring, so the token is in glab's config.yml.`
        : `glab's config names ${host} with no token.`;
    }
    const protocol = text(entry.api_protocol) === "http" ? "http" : "https";
    const signIn: ForgeSignIn = {
      host,
      token,
      from: "glab's config",
      api: `${protocol}://${text(entry.api_host) ?? host}`,
    };
    return signIn;
  },

  client(signIn, path) {
    const api = new Gitlab({ host: signIn.api, token: signIn.token });
    const web = `${signIn.api}/${path}`;
    return {
      account: async () => (await api.Users.showCurrentUser()).username,
      issue: async ({ title, body }) => {
        const made = await api.Issues.create(path, title, {
          description: body,
        });
        return { url: made.web_url };
      },
      pullRequest: async ({ base, head, title, body }) => {
        const open = await api.MergeRequests.all({
          projectId: path,
          sourceBranch: head,
          targetBranch: base,
          state: "opened",
        });
        const [existing] = open;
        if (existing) {
          return { url: existing.web_url, existing: true };
        }
        const made = await api.MergeRequests.create(path, head, base, title, {
          description: body,
        });
        return { url: made.web_url };
      },
      comment: async ({ on, number, body }) => {
        // GitLab numbers issues and merge requests apart, each its own iid.
        const note =
          on === "issue"
            ? await api.IssueNotes.create(path, number, body)
            : await api.MergeRequestNotes.create(path, number, body);
        return {
          url: `${web}/-/${on === "issue" ? "issues" : "merge_requests"}/${number}#note_${note.id}`,
        };
      },
    };
  },
};
