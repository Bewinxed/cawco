import { platform } from "node:os";
import {
  AGENT_NOT_STARTED,
  CAWCO_ENV,
  CAWCO_MCP_CALLBACK_PORT,
} from "@cawco/core";
import { holdRestart, isRetiring } from "./restart";
import { resolveBin } from "./tools";

export const canOpenDesktopBrowser = (): boolean => {
  if (process.env[CAWCO_ENV.mcpOauthProofFetch] === "1") {
    return true;
  }
  if (platform() === "darwin" || platform() === "win32") {
    return true;
  }
  return (
    platform() === "linux" &&
    Boolean(
      process.env.DISPLAY ||
        process.env.WAYLAND_DISPLAY ||
        (resolveBin("xdg-open") && process.env.DBUS_SESSION_BUS_ADDRESS)
    )
  );
};

export const openMcpAuthorization = async (
  authorizationUrl: string
): Promise<void> => {
  const url = new URL(authorizationUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The authorization URL must use HTTP or HTTPS.");
  }
  if (!canOpenDesktopBrowser()) {
    throw new Error(
      "This machine has no desktop browser session. Pick a computer with a desktop session."
    );
  }
  if (process.env[CAWCO_ENV.mcpOauthProofFetch] === "1") {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`The proof callback answered ${response.status}.`);
    }
    return;
  }
  const commands: Record<string, string[]> = {
    darwin: ["open", authorizationUrl],
    linux: ["xdg-open", authorizationUrl],
    win32: ["cmd", "/c", "start", "", authorizationUrl],
  };
  const child = Bun.spawn(commands[platform()], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await child.exited) !== 0) {
    throw new Error(
      "The desktop browser could not open. Check this machine’s desktop session and retry sign-in."
    );
  }
};

const MCP_RELAY_PATH = /^\/mcp\/(?:cawco|fleet\/[^/]+)$/;
const TOOL_READ_PATH =
  /^\/api\/(?:instances|delegation\/tools|workflow-runs\/[^/]+\/state\/[^/]+)$/;
const TOOL_WRITE_PATH =
  /^\/api\/(?:delegation\/call\/[^/]+|workflow-steps\/[^/]+\/result|workflow-runs\/[^/]+\/state\/[^/]+)$/;

/** Relay only MCP and the generated tools' exact API routes; never arbitrary hub paths. */
async function relayMcp(request: Request, hubUrl: string): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.hostname !== "127.0.0.1") {
    return new Response("MCP relay requires a loopback host.", { status: 403 });
  }
  if (request.headers.has("Origin")) {
    const origin = request.headers.get("Origin");
    if (origin !== incoming.origin) {
      return new Response("Cross-origin MCP access is not allowed.", {
        status: 403,
      });
    }
  }
  const hub = new URL(hubUrl);
  hub.protocol = hub.protocol === "wss:" ? "https:" : "http:";
  hub.pathname = incoming.pathname;
  hub.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Connection");
  headers.delete("Content-Length");
  try {
    const response = await fetch(hub, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      signal: request.signal,
      redirect: "error",
      timeout: false,
    });
    const outgoing = new Headers(response.headers);
    for (const name of [
      "Content-Encoding",
      "Content-Length",
      "Connection",
      "Transfer-Encoding",
    ]) {
      outgoing.delete(name);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return new Response("The CawCo hub could not be reached.", { status: 502 });
  }
}

/** One stable loopback endpoint for every harness and the browser's OAuth callback. */
export const startMcpGateway = (hubUrl: () => string) => {
  try {
    return Bun.serve({
      hostname: "127.0.0.1",
      port: CAWCO_MCP_CALLBACK_PORT,
      idleTimeout: 0,
      async fetch(request) {
        if (isRetiring()) {
          return Response.json(
            {
              code: AGENT_NOT_STARTED,
              started: false,
              error:
                "The agent is restarting. This request was not started. Retry after it reconnects.",
            },
            { status: 503 }
          );
        }
        const release = holdRestart("mcp-relay", crypto.randomUUID());
        try {
          const response = await serve(request);
          if (!response.body) {
            release();
            return response;
          }
          const reader = response.body.getReader();
          return new Response(
            new ReadableStream({
              async pull(controller) {
                try {
                  const next = await reader.read();
                  if (next.done) {
                    release();
                    controller.close();
                  } else {
                    controller.enqueue(next.value);
                  }
                } catch (error) {
                  release();
                  controller.error(error);
                }
              },
              async cancel(reason) {
                try {
                  await reader.cancel(reason);
                } finally {
                  release();
                }
              },
            }),
            { status: response.status, headers: response.headers }
          );
        } catch (error) {
          release();
          throw error;
        }
      },
    });
    async function serve(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (
        MCP_RELAY_PATH.test(url.pathname) ||
        (request.method === "GET" && TOOL_READ_PATH.test(url.pathname)) ||
        (request.method === "POST" && TOOL_WRITE_PATH.test(url.pathname))
      ) {
        return await relayMcp(request, hubUrl());
      }
      if (request.method !== "GET" || url.pathname !== "/mcp-oauth/callback") {
        return new Response("Not found.", { status: 404 });
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const headers = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      };
      if (!(code && state) || url.searchParams.has("error")) {
        return new Response(
          "Sign-in was not completed. Start sign-in again from Configure → MCP servers.",
          { status: 400, headers }
        );
      }
      try {
        const hub = new URL(hubUrl());
        hub.protocol = hub.protocol === "wss:" ? "https:" : "http:";
        hub.pathname = "/api/fleet/mcp/oauth/complete";
        hub.search = "";
        const response = await fetch(hub, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
          signal: AbortSignal.timeout(30_000),
        });
        return new Response(
          response.ok
            ? "Signed in for the whole fleet. You can close this tab."
            : await response.text(),
          { status: response.status, headers }
        );
      } catch {
        return new Response(
          "The CawCo hub could not be reached. Start sign-in again once it reconnects.",
          { status: 502, headers }
        );
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new Error(
        `MCP callback port ${CAWCO_MCP_CALLBACK_PORT} is already held by another agent.`,
        { cause: error }
      );
    }
    throw error;
  }
};
