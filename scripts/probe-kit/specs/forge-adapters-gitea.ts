/**
 * Gitea's writes through gitea-mcp, Gitea's official MCP server, against a
 * stand-in of Gitea's API on the loopback: every leg of forge-legs.ts,
 * making the issue, the pull request and the approved held issue with the
 * real gitea-mcp, signed in from tea's config.
 *
 *   bun scripts/probe-kit/run.ts forge-adapters-gitea
 *
 * The host runs gitea-mcp only from where no workspace writes (agent
 * host-gh.ts `hostProgram`): the spec fetches its release into
 * `~/.cache/cawco-probe/` once and puts it first on PATH.
 */
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { forgeLegs, forgeScratch } from "../forge-legs";
import type { Spec } from "../kit";

/** The gitea-mcp release the spec runs, its Linux and macOS archives. */
const VERSION = "v1.10.0";
const ARCHIVES: Record<string, string> = {
  "linux-x64": "gitea-mcp_Linux_x86_64.tar.gz",
  "linux-arm64": "gitea-mcp_Linux_arm64.tar.gz",
  "darwin-x64": "gitea-mcp_Darwin_x86_64.tar.gz",
  "darwin-arm64": "gitea-mcp_Darwin_arm64.tar.gz",
};

/** gitea-mcp's dir under the host's cache, fetched once. */
const giteaMcpDir = async (): Promise<string> => {
  const dir = join(homedir(), ".cache", "cawco-probe", `gitea-mcp-${VERSION}`);
  if (await Bun.file(join(dir, "gitea-mcp")).exists()) {
    return dir;
  }
  const archive = ARCHIVES[`${process.platform}-${process.arch}`];
  if (!archive) {
    throw new Error(
      `no gitea-mcp ${VERSION} archive for ${process.platform}-${process.arch}`
    );
  }
  await mkdir(dir, { recursive: true });
  const fetched = await fetch(
    `https://gitea.com/gitea/gitea-mcp/releases/download/${VERSION}/${archive}`
  );
  if (!fetched.ok) {
    throw new Error(`gitea-mcp ${VERSION}: ${fetched.status}`);
  }
  await Bun.write(join(dir, archive), fetched);
  await Bun.$`tar -xzf ${join(dir, archive)} -C ${dir} gitea-mcp`.quiet();
  await chmod(join(dir, "gitea-mcp"), 0o755);
  return dir;
};

const spec: Spec = {
  name: "forge-adapters-gitea",
  ownHome:
    "it signs tea in under its own HOME and pushes to a Gitea stand-in with the host's git",
  host: "the host runs gitea-mcp only from where no workspace writes (agent host-gh.ts hostProgram), and inside a workspace every place a command can write is one",
  async run(kit) {
    const dir = await giteaMcpDir();
    const scratch = await forgeScratch();
    process.env.PATH = `${dir}:${process.env.PATH}`;
    try {
      await forgeLegs(kit, scratch, "gitea", true);
    } finally {
      scratch.stop();
    }
  },
};

export default spec;
