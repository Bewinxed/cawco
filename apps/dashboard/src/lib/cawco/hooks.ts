import type { FleetItemState } from "@cawco/core/fleet";
import type {
  FleetHook,
  HookDraft,
  HookVersion as KeptHookVersion,
} from "@cawco/core/hooks";
import { hub } from "#lib/platform/hub.js";
import { couldNotOrAway } from "#lib/platform/hub-read.js";
import type { Machine } from "./stores/board.svelte";

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

export type { FleetHook, HookDraft } from "@cawco/core/hooks";
/** One superseded version of a hook as `GET /api/fleet/hooks/history` sends it: core's, its `createdAt` the ISO string. */
export type HookVersion = Omit<KeptHookVersion, "createdAt"> & {
  createdAt: string;
};
/** A machine's per-hook convergence, by the same id the hub keeps hooks under.
 *  Absent until the machine's first sync — reads as "not reported". */
export type HookFleetReport = Record<string, FleetItemState>;

export const hooksOf = (machine: Machine): HookFleetReport | undefined =>
  machine.fleet?.hooks;

/** Only the fields the hub's schema accepts — `force`/`cwd` are the hub's own to
 *  set. The hub merges a PUT over the stored hook, so an optional field the
 *  draft leaves empty goes as `null`, which clears it; an absent one would keep
 *  the stored value. */
export const saveHook = async (id: string, draft: HookDraft) => {
  const answer = await hub.api.fleet.hooks({ id }).put({
    name: draft.name,
    enabled: draft.enabled,
    event: draft.event,
    matcher: draft.matcher ?? null,
    handler: { ...draft.handler },
    script: draft.script ?? null,
    scope: draft.scope ?? null,
    projectId: draft.projectId ?? null,
  });
  if (answer.error) {
    throw couldNotOrAway(`save ${draft.name || "the hook"}`)(answer);
  }
  return answer.data;
};

/** Deletes a hook everywhere, into the hub's trash for its Undo (config/undo.ts). */
export const removeHook = async (id: string, name: string) => {
  const answer = await hub.api.fleet.hooks({ id }).delete();
  if (answer.error) {
    throw couldNotOrAway(`delete ${name}`)(answer);
  }
  return answer.data;
};

/** What this hook used to be, newest first — the hub keeps a version on every
 *  save or delete over one that already existed. */
export const loadHookVersions = async (hookId: string) => {
  const answer = await hub.api.fleet.hooks.history.get({ query: { hookId } });
  if (answer.error) {
    throw couldNotOrAway("load this hook’s history")(answer);
  }
  return answer.data;
};

/** Writes a past version back as the current one — through the same save door,
 *  so restoring keeps what it replaces, same as any other edit. */
export const restoreHookVersion = async (versionId: number) => {
  const answer = await hub.api.fleet.hooks.restore.post({ id: versionId });
  if (answer.error) {
    throw couldNotOrAway("restore that version")(answer);
  }
  return answer.data;
};

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
