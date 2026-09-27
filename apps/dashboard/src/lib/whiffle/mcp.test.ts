// Which servers a chip can fetch a favicon for: only the ones whose config
// names a URL, and only when that URL parses — then where to look for it.
import { expect, test } from "bun:test";
import type { McpServerStatus } from "@whiffle/core";
import { mcpHost, rootDomain } from "./mcp";

const server = (config?: unknown): McpServerStatus =>
  ({ name: "exa", status: "connected", config }) as McpServerStatus;

test("a remote server is named by its URL host", () => {
  expect(mcpHost(server({ type: "http", url: "https://mcp.exa.ai/mcp" }))).toBe(
    "mcp.exa.ai"
  );
});

test("a server that runs on the machine has no host", () => {
  expect(mcpHost(server({ type: "stdio", command: "bunx" }))).toBeNull();
  expect(mcpHost(server())).toBeNull();
});

test("a URL that does not parse is no host", () => {
  expect(mcpHost(server({ type: "http", url: "not a url" }))).toBeNull();
});

test("the root is the last two labels", () => {
  expect(rootDomain("mcp.exa.ai")).toBe("exa.ai");
  expect(rootDomain("exa.ai")).toBe("exa.ai");
});

test("a generic second level under a country TLD keeps three", () => {
  expect(rootDomain("api.foo.co.uk")).toBe("foo.co.uk");
  // Nothing to strip, and nothing that parses as a root either.
  expect(rootDomain("localhost")).toBe("localhost");
});
