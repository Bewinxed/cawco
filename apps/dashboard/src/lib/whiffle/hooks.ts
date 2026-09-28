import type { FleetHook, FleetItemState, HookDraft } from "@whiffle/core";
import type { Machine } from "./client.svelte";

/**
 * The dashboard's side of hooks (packages/core's hooks.ts): plain REST against
 * the hub's fleet-wide hook set, in the shape `rules.ts` established — a
 * refusal from the hub is an Elysia bare string, so `said` unwraps it and
 * every call throws a whole sentence the caller can print.
 *
 * Deliberately not `submitCommand`: that envelope is for a live session's
 * per-turn control, and a hook is a config object every machine converges
 * on — the same reason MCP servers and skills go through `fleet.ts`'s plain
 * `fetch` wrappers rather than the socket.
 */

export type { FleetHook, HookDraft } from "@whiffle/core";
// biome-ignore lint/performance/noBarrelFile: consumers import the templates from this file's public surface, not straight off @whiffle/core
export { HOOK_TEMPLATES } from "@whiffle/core";

/** What `GET /api/fleet/hooks` answers with. */
export interface HooksPayload {
  hooks: FleetHook[];
}

/**
 * One superseded version of a hook, as the hub's undo trail lists it — without
 * the material, the same way `/api/fleet/hooks/history` answers. A hook is
 * kept every time it is saved or deleted over one that already existed, so
 * this is a full edit history, not a sample of runs.
 */
export interface HookVersion {
  createdAt: string;
  hash: string;
  hookId: string;
  id: number;
  name: string;
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited
   *  script an overwrite took off that machine. */
  source: string;
}

/** A machine's per-hook convergence, by the same id the hub keeps hooks under.
 *  Absent from a daemon that predates the field — reads as "not reported". */
export type HookFleetReport = Record<string, FleetItemState>;

export const hooksOf = (machine: Machine): HookFleetReport | undefined =>
  machine.fleet?.hooks;

/** Elysia refuses with a bare string; JSON only when something else went wrong. */
async function said(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      return String((parsed as { message: unknown }).message);
    }
  } catch {
    // Not JSON, which is the ordinary case: the string is the sentence.
  }
  return body || `the hub answered ${response.status}`;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Could not ${attempt} — ${await said(response)}.`);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const loadHooks = (): Promise<HooksPayload> =>
  send<HooksPayload>("/api/fleet/hooks", {}, "load the hooks");

/** Only the fields the hub's schema accepts — `force`/`cwd` are the hub's own to set. */
export const saveHook = (id: string, draft: HookDraft): Promise<FleetHook> =>
  send<FleetHook>(
    `/api/fleet/hooks/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      ...json({
        name: draft.name,
        enabled: draft.enabled,
        event: draft.event,
        matcher: draft.matcher,
        handler: draft.handler,
        script: draft.script,
        scope: draft.scope,
        projectId: draft.projectId,
      }),
    },
    `save ${draft.name || "the hook"}`
  );

export const removeHook = async (id: string, name: string): Promise<void> => {
  const response = await fetch(`/api/fleet/hooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Could not delete ${name} — ${await said(response)}.`);
  }
};

/** What this hook used to be, newest first — the hub keeps a version on every
 *  save or delete over one that already existed. */
export const loadHookVersions = (hookId: string): Promise<HookVersion[]> =>
  send<HookVersion[]>(
    `/api/fleet/hooks/history?hookId=${encodeURIComponent(hookId)}`,
    {},
    "load this hook’s history"
  );

/** Writes a past version back as the current one — through the same save door,
 *  so restoring keeps what it replaces, same as any other edit. */
export const restoreHookVersion = (versionId: number): Promise<FleetHook> =>
  send<FleetHook>(
    "/api/fleet/hooks/restore",
    { method: "POST", ...json({ id: versionId }) },
    "restore that version"
  );

/** A blank hook, on the defaults that make the common case one field of typing. */
export const blankHook = (): HookDraft => ({
  name: "",
  enabled: true,
  event: "PostToolUse",
  matcher: "",
  handler: { type: "command" },
  script: "",
});

/** Strips a saved hook back to a draft, so the editor holds one shape either way. */
export const draftOf = (hook: FleetHook): HookDraft => ({
  name: hook.name,
  enabled: hook.enabled,
  event: hook.event,
  matcher: hook.matcher ?? "",
  handler: { ...hook.handler },
  script: hook.script ?? "",
  force: hook.force,
  scope: hook.scope,
  projectId: hook.projectId,
  cwd: hook.cwd,
});

/** Whatever the caller threw, as a sentence. Every panel in this app has one. */
export const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
