/**
 * Gitea's sign-in on this machine, and Forgejo's: the host's tea, the login
 * in tea's `config.yml` (`<config home>/tea`, "Configuration is persisted in
 * $XDG_CONFIG_HOME/tea", gitea.com/gitea/tea) whose `url` is on the host,
 * and its `token`.
 *
 * Its client (providers gitea/client.ts) is gitea-mcp, "Gitea's official MCP
 * Server" (gitea.com/gitea/gitea-mcp): each write starts the host's
 * `gitea-mcp -t stdio` with the instance and
 * the token in that one process's environment ("Pass the Gitea host and
 * access token as command-line flags or environment variables"), calls one
 * of its tools through the MCP SDK and closes it. A host with no gitea-mcp on
 * its PATH, or one only where a workspace writes, makes no Gitea write, and
 * says so.
 */
import { join } from "node:path";
import { hostEnvironment } from "@cawco/core/session-env";
import { GITEA_TOOLS, type McpToolCaller } from "@cawco/providers/gitea/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  type CallToolResult,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { hostProgram } from "../host-gh";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeLogin, ForgeSignIn } from "./forge-adapter";

/** The gitea-mcp tools the writes call, and no others are listed to it. */
const TOOLS = GITEA_TOOLS.join(",");

const TRAILING_SLASHES = /\/+$/u;

/** The logins of tea's config. */
const TeaConfig = z.object({
  logins: z
    .array(
      z.object({ token: z.unknown().optional(), url: z.unknown().optional() })
    )
    .optional(),
});

/** A tea login's URL, read; none when it does not read as one. */
const urlOf = (value: unknown): URL | undefined => {
  try {
    return typeof value === "string" ? new URL(value) : undefined;
  } catch {
    // Not a URL: no login on any host.
  }
};

/** Calls one gitea-mcp tool, signed in as `signIn`, in a process of its own: the machine's Gitea client (providers gitea/client.ts). */
export const giteaCaller =
  (signIn: ForgeSignIn): McpToolCaller =>
  async (tool, args) =>
    await callTool(signIn, tool, args);

const callTool = async (
  signIn: ForgeSignIn,
  tool: string,
  args: Record<string, unknown>
): Promise<CallToolResult> => {
  const program = await hostProgram("gitea-mcp");
  if (!program) {
    throw new Error(
      "gitea-mcp, Gitea's official MCP server, is not on this machine's PATH (gitea.com/gitea/gitea-mcp/releases), so CawCo makes no Gitea write here."
    );
  }
  const client = new Client({ name: "cawco", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: program,
      args: ["-t", "stdio", "-O", TOOLS],
      env: {
        ...hostEnvironment(),
        GITEA_HOST: signIn.api,
        GITEA_ACCESS_TOKEN: signIn.token,
      },
      stderr: "ignore",
    })
  );
  try {
    return CallToolResultSchema.parse(
      await client.callTool({ name: tool, arguments: args })
    );
  } finally {
    await client.close();
  }
};

export const giteaLogin: ForgeLogin = {
  forge: "gitea",

  async signIn(asked) {
    const config = await readYamlConfig(
      join(configHome(), "tea", "config.yml"),
      TeaConfig
    );
    const login = (config?.logins ?? []).find((each) => {
      const at = urlOf(each.url);
      return at !== undefined && sameHost(at.host, asked);
    });
    const url = urlOf(login?.url);
    if (!(login && url)) {
      return;
    }
    const { host } = url;
    if (typeof login.token !== "string" || !login.token) {
      return `tea's login for ${host} holds no token (an ssh-key login): add one with \`tea login add --url ${url.origin} --token …\`.`;
    }
    const signIn: ForgeSignIn = {
      host,
      token: login.token,
      from: "tea's config",
      api: `${url.origin}${url.pathname.replace(TRAILING_SLASHES, "")}`,
    };
    return signIn;
  },
};
