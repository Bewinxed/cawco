/**
 * GitHub's sign-in on this machine: the host's gh, its token by
 * `gh auth token --hostname <host>` (cli.github.com/manual/gh_auth_token),
 * which reads gh's keyring or `hosts.yml`, never a copy of our own. The API
 * is `api.github.com` for github.com and `<host>/api/v3` for a GitHub
 * Enterprise host; a gh config that names `http_unix_socket` is honoured as
 * go-gh honours it (pkg/api/client_options.go: "if opts.UnixDomainSocket ==
 * \"\" … cfg.Get([]string{\"http_unix_socket\"})"), plain HTTP over that
 * socket. The client is GitHub's provider's (providers github/client.ts).
 */
import { join } from "node:path";
import { githubApiOf } from "@cawco/providers/github/client";
import { z } from "zod";
import { ghSays, hostGh } from "../host-gh";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeLogin, ForgeSignIn } from "./forge-adapter";

/** gh's config dir, as gh finds it: `$GH_CONFIG_DIR`, else `<config home>/gh`. */
const ghConfigDir = (): string =>
  process.env.GH_CONFIG_DIR || join(configHome(), "gh");

/** The `http_unix_socket` gh's config names, when it names one. */
const ghSocket = async (): Promise<string | undefined> => {
  const config = await readYamlConfig(
    join(ghConfigDir(), "config.yml"),
    z.object({ http_unix_socket: z.unknown().optional() })
  );
  const socket = config?.http_unix_socket;
  return typeof socket === "string" && socket ? socket : undefined;
};

export const githubLogin: ForgeLogin = {
  forge: "github",

  async signIn(asked) {
    if (!(await hostGh())) {
      return;
    }
    // gh lists every host it signs in to in hosts.yml, its token there or
    // in the keyring: the one for this host, its port included.
    const hosts = await readYamlConfig(
      join(ghConfigDir(), "hosts.yml"),
      z.record(z.string(), z.unknown())
    );
    const host =
      Object.keys(hosts ?? {}).find((each) => sameHost(each, asked)) ?? asked;
    const token = (await ghSays(["auth", "token", "--hostname", host]))?.trim();
    if (!token) {
      return;
    }
    const socket = await ghSocket();
    const signIn: ForgeSignIn = {
      host,
      token,
      from: "gh's sign-in",
      api: githubApiOf(host),
      ...(socket ? { socket } : {}),
    };
    return signIn;
  },
};
