/**
 * The spill folder of a workspace's first session, placed as the workspace
 * is cut (workspace.ts `createWorkspace`) so its boundary starts once: a
 * harness saves a tool result too large to hand the model in a folder of the
 * session's own, which the boundary reads (boundary.ts `addSpill`), and one
 * added at the spawn changes the boundary's form and hands it over to a new
 * generation. Every harness's folder is known before its spawn:
 *
 * - Claude Code: `<config dir>/projects/<slug of the clone>/<session id>/tool-results`
 *   ({@link claudeSpillDir}). CawCo picks the session id (`--session-id
 *   <uuid>`, "Use a specific session ID for the conversation (must be a valid
 *   UUID)", Claude Code 2.1.309): a resumed conversation's own, or one minted
 *   at the cut and recorded for that session's first launch alone
 *   ({@link takeFirstSession}).
 * - pi and OpenCode: CawCo's own folder for the session's instance id
 *   (core `workspaceSpillDir`).
 */
import { readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessKind, WorkspaceFirstSession } from "@cawco/core";
import {
  projectSlug,
  sessionConfigDir,
  workspaceSpillDir,
  workspaceStateDir,
} from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** Where Claude Code session `sessionId`, on `account` (none: the machine's own login) in `cwd`, saves its tool results. */
export const claudeSpillDir = async (
  account: string | null | undefined,
  cwd: string,
  sessionId: string
): Promise<string> =>
  join(
    sessionConfigDir({ accountId: account ?? null }),
    "projects",
    projectSlug(await realpath(cwd).catch(() => cwd)),
    sessionId,
    "tool-results"
  );

/** The record of the session id minted for workspace `id`'s first session ({@link FirstSession}). */
const recordOf = (id: string): string =>
  join(workspaceStateDir(id), "first-session.json");

/** A Claude session id minted at a workspace's cut, for its instance's first launch. */
interface FirstSession {
  readonly instanceId: string;
  readonly sessionId: string;
}

/** The harnesses whose sessions keep a spill folder. */
const SPILLING: readonly HarnessKind[] = ["claude", "opencode", "pi"];

/** A CawCo instance id as one path component, as the workspace's policy reads a spill folder's (core workspace-policy.ts). */
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

/** A Claude Code session id: a UUID. */
const SESSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * The hub's `first` of a workspace's cut, as it came over the wire: a
 * {@link WorkspaceFirstSession}, or none for anything else (none named, a
 * gate workspace's cut), so a cut never fails for it.
 */
export const firstSessionOf = (raw: unknown): WorkspaceFirstSession | null => {
  const given = raw as Partial<WorkspaceFirstSession> | null | undefined;
  if (!(
    given &&
    typeof given.instanceId === "string" &&
    INSTANCE_ID.test(given.instanceId) &&
    typeof given.harness === "string" &&
    SPILLING.includes(given.harness)
  )) {
    return null;
  }
  return {
    harness: given.harness,
    instanceId: given.instanceId,
    resume:
      typeof given.resume === "string" && SESSION_UUID.test(given.resume)
        ? given.resume
        : null,
  };
};

/**
 * The spill folder of workspace `id`'s first session `first`, cut at `cwd`
 * with `account`; none for no session or a harness that keeps none. A new
 * Claude conversation's id is minted and recorded here ({@link
 * takeFirstSession}); a cut again replaces what an earlier cut recorded.
 */
export const firstSpill = async (
  id: string,
  cwd: string,
  account: string | null,
  first: WorkspaceFirstSession | null
): Promise<string | undefined> => {
  await rm(recordOf(id), { force: true });
  if (!first) {
    return;
  }
  if (first.harness !== "claude") {
    return workspaceSpillDir(id, first.instanceId);
  }
  if (first.resume) {
    return claudeSpillDir(account, cwd, first.resume);
  }
  const minted: FirstSession = {
    instanceId: first.instanceId,
    sessionId: crypto.randomUUID(),
  };
  await writeStateFile(recordOf(id), `${JSON.stringify(minted)}\n`, {
    mode: 0o600,
  });
  return claudeSpillDir(account, cwd, minted.sessionId);
};

/**
 * The session id minted at workspace `id`'s cut for instance `instanceId`'s
 * first launch, taken: the record goes as it is read, so no later launch,
 * this instance's or another's, ever uses it again. None for another
 * instance, whose launch mints its own.
 */
export const takeFirstSession = async (
  id: string,
  instanceId: string
): Promise<string | undefined> => {
  const text = await readFile(recordOf(id), "utf8").catch(() => undefined);
  if (text === undefined) {
    return;
  }
  let record: Partial<FirstSession> = {};
  try {
    record = JSON.parse(text) as Partial<FirstSession>;
  } catch {
    // A record that does not parse names no session: it goes.
  }
  if (record.instanceId !== instanceId) {
    return;
  }
  await rm(recordOf(id), { force: true });
  return typeof record.sessionId === "string" ? record.sessionId : undefined;
};

/** Instance `instanceId` stopped: the id minted for its first launch in workspace `id`, if it never launched, goes with it. */
export const forgetFirstSession = async (
  id: string,
  instanceId: string
): Promise<void> => {
  await takeFirstSession(id, instanceId);
};
