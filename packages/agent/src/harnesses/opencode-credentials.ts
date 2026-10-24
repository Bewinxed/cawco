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
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import { delegationHubUrl } from "../delegation";

export interface HeldCredential {
  /**
   * What the session's shells name the machine's container runtimes by: its
   * own doors (agent `HarnessContext.containerEnv`), which the plugin sets
   * in each of its shells, as one server runs every session.
   */
  containerEnv: Readonly<Record<string, string>>;
  credential: string;
  instanceId: string;
  /**
   * The workspace whose boundary the session's spawn put it in (agent
   * `HarnessContext.workspace`), or null for none. The plugin reads it for a
   * location a place holds (core `isPlace`): one OpenCode location serves
   * every session in its folder, and only the place's own sessions there are
   * bounded by it.
   */
  workspace: string | null;
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

/** `change` applied to the stored credentials, one write at a time, atomic and owner-only. */
const rewrite = (
  change: (stored: Record<string, HeldCredential>) => void
): Promise<void> => {
  const next = writing.then(async () => {
    const stored = await readOpencodeCredentials();
    change(stored);
    const file = opencodeCredentialFile();
    await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
    await writeStateFile(file, JSON.stringify(stored), { mode: 0o600 });
  });
  writing = next.catch(() => undefined);
  return next;
};

/**
 * Records `held` as `sessionId`'s, beside every other session's. A session's
 * entry leaves only when the session is stopped ({@link
 * forgetOpencodeCredential}): it is read back when an agent takes the session
 * over after a restart, and a store that kept only the sessions it knew of
 * dropped the ones starting beside it, which then failed at the next restart
 * ("This OpenCode session holds no session credential", 101 of 120 in the
 * agent-loop probe, 2026-10-24).
 */
export const storeOpencodeCredential = (
  sessionId: string,
  held: HeldCredential
): Promise<void> =>
  rewrite((stored) => {
    stored[sessionId] = held;
  });

/** The stopped session `sessionId`'s entry, gone: its next start installs a fresh one. */
export const forgetOpencodeCredential = (sessionId: string): Promise<void> =>
  rewrite((stored) => {
    delete stored[sessionId];
  });
