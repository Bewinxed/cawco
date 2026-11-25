/**
 * GitLab's sign-in on this machine: the host's glab,
 * its `config.yml` (`$GLAB_CONFIG_DIR`, else `<config home>/glab-cli`), the
 * host's `token` and where its API answers, `api_protocol` and `api_host`
 * ("`token`: Your GitLab access token … Scoped per host"; "`api_protocol`:
 * What protocol to use to access the API endpoint", docs.gitlab.com/cli/config).
 * GitLab's own MCP server is not used here: it rejects the legacy personal
 * access tokens glab keeps (docs.gitlab.com/user/model_context_protocol/mcp_server).
 */
import { join } from "node:path";
import { z } from "zod";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeLogin, ForgeSignIn } from "./forge-adapter";

/** glab's config dir, as glab finds it. */
const glabConfigDir = (): string =>
  process.env.GLAB_CONFIG_DIR || join(configHome(), "glab-cli");

/** One host's entry in glab's config. */
const GlabHost = z.object({
  api_host: z.unknown().optional(),
  api_protocol: z.unknown().optional(),
  gitlab_token: z.unknown().optional(),
  oauth_token: z.unknown().optional(),
  token: z.unknown().optional(),
  use_keyring: z.unknown().optional(),
});

/** glab's config: its hosts by name; a host listed with nothing under it is null. */
const GlabConfig = z.object({
  hosts: z.record(z.string(), GlabHost.nullable()).optional(),
});

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const gitlabLogin: ForgeLogin = {
  forge: "gitlab",

  async signIn(asked) {
    const config = await readYamlConfig(
      join(glabConfigDir(), "config.yml"),
      GlabConfig
    );
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
};
