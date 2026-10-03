import { platform } from "node:os";
import { CAWCO_ENV, CAWCO_MCP_CALLBACK_PORT } from "@cawco/core";
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

/** Loopback redirects work on the computer where the sign-in tab is open. */
export const startMcpOAuthCallback = (hubUrl: () => string) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: CAWCO_MCP_CALLBACK_PORT,
    async fetch(request) {
      const url = new URL(request.url);
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
    },
  });
