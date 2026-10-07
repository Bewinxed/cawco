/**
 * The session credentials of this agent's OpenCode sessions, by OpenCode
 * session id, each with its CawCo instance id: what the cawco plugin stamps
 * into each `cawco_*` call (`__cawco.credential`) and sets in each of the
 * session's shells, because OpenCode has no per-session or per-call MCP
 * header and one server runs every session. Its remote entries carry static
 * `headers` per server, and one server's transports are shared by every
 * session in a directory (opencode.ai/docs/mcp-servers; `requestInit:
 * mcp.headers` in packages/opencode/src/mcp/index.ts). Per-call headers are an
 * open upstream PR (anomalyco/opencode#28319), not a release.
 *
 * The file lives in {@link sessionIdentityDir}, which every workspace boundary
 * hides (a tmpfs over its parent on Linux, a read deny on macOS): the OpenCode
 * server outside the boundary reads it, no delegate's shell can.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths";
import { delegationHubUrl } from "../delegation";

export interface HeldCredential {
  credential: string;
  instanceId: string;
}

/** One file per hub, so an agent for a test hub never touches the machine's. */
export const opencodeCredentialFile = (): string =>
  join(
    sessionIdentityDir(),
    `opencode-${new URL(delegationHubUrl()).host.replaceAll(":", "_")}.json`
  );

export const readOpencodeCredentials = async (): Promise<
  Record<string, HeldCredential>
> => {
  try {
    return JSON.parse(await readFile(opencodeCredentialFile(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

let writing: Promise<unknown> = Promise.resolve();

/**
 * Records `held` as `sessionId`'s, keeping only the sessions in `live`: a
 * session this agent no longer runs has no use for its old one. Writes are
 * serialized and atomic, owner-only.
 */
export const storeOpencodeCredential = (
  sessionId: string,
  held: HeldCredential,
  live: ReadonlySet<string>
): Promise<void> => {
  const next = writing.then(async () => {
    const stored = await readOpencodeCredentials();
    const kept = Object.fromEntries(
      Object.entries(stored).filter(([id]) => live.has(id))
    );
    kept[sessionId] = held;
    const file = opencodeCredentialFile();
    await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
    const staged = `${file}.${process.pid}.tmp`;
    await writeFile(staged, JSON.stringify(kept), { mode: 0o600 });
    await rename(staged, file);
  });
  writing = next.catch(() => undefined);
  return next;
};
