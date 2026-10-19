/**
 * Gitea, and Forgejo, through gitea-mcp, "Gitea's official MCP Server"
 * (gitea.com/gitea/gitea-mcp), built on Gitea's official Go SDK, which
 * TypeScript cannot call; the one TypeScript client, gitea-js, stops at Gitea
 * 1.23 (docs/forge-adapters.md §2). Signed in as the host's tea: the login
 * in tea's `config.yml` (`<config home>/tea`, "Configuration is persisted in
 * $XDG_CONFIG_HOME/tea", gitea.com/gitea/tea) whose `url` is on the host,
 * and its `token`.
 *
 * Each write starts the host's `gitea-mcp -t stdio` with the instance and
 * the token in that one process's environment ("Pass the Gitea host and
 * access token as command-line flags or environment variables"), calls one
 * of its tools through the MCP SDK and closes it. A host with no gitea-mcp on
 * its PATH, or one only where a workspace writes, makes no Gitea write, and
 * says so.
 */
import { join } from "node:path";
import { hostEnvironment } from "@cawco/core/session-env";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { hostProgram } from "../host-gh";
import { configHome, readYamlConfig, sameHost } from "./cli-config";
import type { ForgeAdapter, ForgeSignIn } from "./forge";

/** The gitea-mcp tools the adapter calls, and no others are listed to it. */
const TOOLS = "get_me,issue_write,pull_request_write,pull_request_read";

const TRAILING_SLASHES = /\/+$/;

/** One login in tea's config. */
interface TeaLogin {
  token?: unknown;
  url?: unknown;
}

/** A tea login's URL, read; none when it does not read as one. */
const urlOf = (value: unknown): URL | undefined => {
  try {
    return typeof value === "string" ? new URL(value) : undefined;
  } catch {
    // Not a URL: no login on any host.
  }
};

/** A tool's answer as text, or a failure in its words. */
const answerText = (result: CallToolResult, tool: string): string => {
  const said = result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
  if (result.isError) {
    throw new Error(`gitea-mcp's ${tool}: ${said || "failed"}`);
  }
  return said;
};

/** An object's `html_url` at its top or one level down, as Gitea's answers carry it. */
const htmlUrl = (text: string): string | undefined => {
  try {
    const read = JSON.parse(text) as Record<string, unknown>;
    const nested = Object.values(read).find(
      (value): value is Record<string, unknown> =>
        typeof value === "object" && value !== null && "html_url" in value
    );
    const url = read.html_url ?? nested?.html_url;
    return typeof url === "string" ? url : undefined;
  } catch {
    // Not JSON: gitea-mcp named no page.
  }
};

/** A pull request's page when the answer is one still open; Gitea's lookup by branches answers its latest, closed or not. */
const openUrl = (text: string): string | undefined => {
  try {
    const read = JSON.parse(text) as { state?: unknown };
    return read.state === "open" ? htmlUrl(text) : undefined;
  } catch {
    // Not JSON: no pull request it names.
  }
};

/** Calls one gitea-mcp tool, signed in as `signIn`, in a process of its own. */
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
    return (await client.callTool({
      name: tool,
      arguments: args,
    })) as CallToolResult;
  } finally {
    await client.close();
  }
};

export const giteaForge: ForgeAdapter = {
  forge: "gitea",

  async signIn(asked) {
    const config = (await readYamlConfig(
      join(configHome(), "tea", "config.yml")
    )) as { logins?: TeaLogin[] } | undefined;
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

  client(signIn, path) {
    const [owner = "", repo = ""] = path.split("/");
    const call = async (tool: string, args: Record<string, unknown>) =>
      answerText(await callTool(signIn, tool, args), tool);
    const made = (text: string, what: string) => {
      const url = htmlUrl(text);
      if (!url) {
        throw new Error(`gitea-mcp did not say where the ${what} is: ${text}`);
      }
      return url;
    };
    return {
      account: async () => {
        const me = JSON.parse(await call("get_me", {})) as {
          login?: unknown;
          username?: unknown;
        };
        const login = me.login ?? me.username;
        if (typeof login !== "string") {
          throw new Error("gitea-mcp's get_me named no login");
        }
        return login;
      },
      issue: async ({ title, body }) => ({
        url: made(
          await call("issue_write", {
            method: "create",
            owner,
            repo,
            title,
            body,
          }),
          "issue"
        ),
      }),
      pullRequest: async ({ base, head, title, body }) => {
        // The open one for these branches, when there is one: an answer
        // that is no error is it; a refusal, none ("get_by_branches").
        const found = await callTool(signIn, "pull_request_read", {
          method: "get_by_branches",
          owner,
          repo,
          base,
          head,
        });
        const open = found.isError
          ? undefined
          : openUrl(answerText(found, "pull_request_read"));
        if (open) {
          return { url: open, existing: true };
        }
        return {
          url: made(
            await call("pull_request_write", {
              method: "create",
              owner,
              repo,
              base,
              head,
              title,
              body,
            }),
            "pull request"
          ),
        };
      },
      comment: async ({ number, body }) => ({
        // Gitea numbers issues and pull requests alike, and a pull request's
        // conversation is its issue's.
        url: made(
          await call("issue_write", {
            method: "add_comment",
            owner,
            repo,
            issue_number: number,
            body,
          }),
          "comment"
        ),
      }),
    };
  },
};
