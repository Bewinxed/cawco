/**
 * Which session the New Session dialog is continuing, when it is. Set by the
 * session menus, read by the one dialog mount in the sidebar: the menus live
 * in rows all over the app, and the dialog must not be mounted once per row.
 *
 * Also the continuations this tab started. The hub carries each one to its
 * end whatever happens to the dialog; a dialog dismissed while it runs hands
 * it over here, and this tab then opens the new session once it starts, or
 * says why it failed with a way back into the same form.
 */
import type {
  ContinuationJob,
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core";
import { toast } from "svelte-sonner";
import { goto } from "$app/navigation";
import { cawco, followContinuations } from "./client.svelte";
import { conversationHref } from "./links";
import { contextOf } from "./workspace/workspace.svelte";

/** The session a continuation starts from, as the dialog shows and sends it. */
export interface ContinueSource {
  cwd: string;
  harness: HarnessKind;
  /** The id the hub knows it by: a cawco instance id, or a stored session's own id. */
  instanceId: string;
  machineId: string;
  model?: string;
  title: string;
}

/** The New Session form as it was submitted: what a failed continuation reopens with. */
export interface SessionDraft {
  baseCwd: string;
  cwd: string;
  effort: EffortLevel | null;
  harness: HarnessKind;
  machineIds: string[];
  model: string;
  permissionMode: PermissionMode;
  projectId: string | undefined;
  prompt: string;
  repo: string | undefined;
  scratch: { baseCwd: string; worktree: boolean } | undefined;
  summarizer: { harness: HarnessKind; model: string };
  usedModel: string;
}

export const continuing = $state<{
  source: ContinueSource | null;
  /** The form to open with instead of the defaults: a failed continuation's. */
  restore: SessionDraft | null;
}>({
  source: null,
  restore: null,
});

/** Opens the New Session dialog continuing `source`, with `restore`'s form when given. */
export function continueInNewSession(
  source: ContinueSource,
  restore?: SessionDraft
): void {
  continuing.source = source;
  continuing.restore = restore ?? null;
}

/**
 * The continuations this tab started, by id, with what started them. The
 * dialog follows its own while it is open; `detached` is one whose dialog was
 * dismissed, which this tab now sees through.
 */
const started = new Map<
  string,
  { detached: boolean; draft: SessionDraft; source: ContinueSource }
>();

/**
 * Starts a continuation of `source`: the hub answers with the job's ids at
 * once and runs it from there. `body` is the request as the dialog builds it.
 */
export async function startContinuation(
  source: ContinueSource,
  draft: SessionDraft,
  body: unknown
): Promise<string> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(source.instanceId)}/continue`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const { continuationId } = (await response.json()) as {
    continuationId: string;
  };
  started.set(continuationId, { detached: false, draft, source });
  return continuationId;
}

/** Cancel: the hub stops the summariser and starts nothing. Throws the hub's refusal. */
export async function cancelContinuation(id: string): Promise<void> {
  const response = await fetch(`/api/continuations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  started.delete(id);
}

/** The dialog saw its continuation to an end itself: nothing more to do here. */
export function releaseContinuation(id: string): void {
  started.delete(id);
}

/** The dialog was dismissed while `id` runs: this tab sees it through. */
export function detachContinuation(id: string): void {
  const entry = started.get(id);
  if (entry) {
    entry.detached = true;
    settleDetached(cawco.continuations);
  }
}

function settleDetached(table: ContinuationJob[]): void {
  for (const [id, entry] of started) {
    const job = table.find((row) => row.id === id);
    if (!(entry.detached && job)) {
      continue;
    }
    if (job.stage === "started") {
      started.delete(id);
      goto(conversationHref(job.targetInstanceId, cawco.instanceIndex));
    } else if (job.stage === "failed") {
      started.delete(id);
      // Kept until dismissed or used: it carries the form to recover with.
      toast.error(`Couldn't continue "${entry.source.title}"`, {
        id: `continuation-${id}`,
        description: job.error,
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Reopen",
          onClick: () => continueInNewSession(entry.source, entry.draft),
        },
      });
    } else if (job.stage === "cancelled") {
      started.delete(id);
    }
  }
}

followContinuations(settleDetached);

/**
 * A dashboard session as a continuation source, found the way the session
 * details card finds it: the live view, then the instance row, then the
 * workspace's remembered context.
 */
export function continueSourceOf(
  sessionId: string,
  title: string
): ContinueSource {
  const session = cawco.session(sessionId);
  const row = cawco.instanceIndex.byId.get(sessionId);
  const context = contextOf(sessionId);
  return {
    instanceId: sessionId,
    machineId: (session?.machineId ||
      row?.machineId ||
      context?.machine) as string,
    cwd: session?.cwd || row?.cwd || context?.cwd || "",
    harness: (session?.harness ||
      row?.harness ||
      context?.harness) as HarnessKind,
    model: session?.model ?? undefined,
    title,
  };
}
