/**
 * Which session the New Session dialog is continuing, when it is. Set by the
 * session menus, read by the one dialog mount in the Shell: the menus live
 * in rows all over the app, and the dialog must not be mounted once per row.
 *
 * Also the continuations this tab started. The hub carries each one to its
 * end whatever happens to the dialog; a dialog dismissed while it runs hands
 * it over here, and this tab then says on the source session's rows that it
 * started (with the new session to open), or why it failed, with a way back
 * into the same form.
 */
import type {
  ContinuationJob,
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core";
import { cawco, followContinuations, type SendExtras } from "./client.svelte";
import { conversationHref } from "./links";
import { faultOn, noteOn, pendingOn } from "./session-acts.svelte";
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
  /** The account picked for the session; absent: placement chooses. */
  account?: string;
  /** Continue from the person's own messages alone: nothing is summarised. */
  asks: boolean;
  baseCwd: string;
  cwd: string;
  effort: EffortLevel | null;
  /** What rode the prompt: its images and attachments, as a send carries them. */
  extras: SendExtras;
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

/** A continuation's running stages, as the dialog's Start and the source's rows say them. */
export const continuationStageWords = {
  filing: "Filing its open items…",
  summarising: "Summarising…",
  starting: "Starting…",
} as const;

/** What the source's rows say while its continuation runs, by stage. */
const pendingWords = (stage: ContinuationJob["stage"] | undefined): string =>
  stage === "filing" || stage === "summarising" || stage === "starting"
    ? `Continuing in a new session · ${continuationStageWords[stage]}`
    : "Continuing in a new session…";

/** Cancel, in any stage before the new session has started: nothing starts. Throws the hub's refusal. */
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

/**
 * The dialog was dismissed while `id` runs: this tab sees it through, on the
 * source session's rows, where it was asked for (session-acts), with its
 * stage and a Cancel beside it until it has started.
 */
export function detachContinuation(id: string): void {
  const entry = started.get(id);
  if (entry) {
    entry.detached = true;
    settleDetached(cawco.continuations);
  }
}

/**
 * A dismissed continuation, said under its source's rows: running, its
 * stage with Cancel; started, a note with the new session to open (the
 * person is left where they are); failed, the hub's reason with Reopen,
 * which brings the same form back.
 */
function settleDetached(table: ContinuationJob[]): void {
  for (const [id, entry] of started) {
    const job = table.find((row) => row.id === id);
    if (!entry.detached) {
      continue;
    }
    const from = entry.source.instanceId;
    if (
      !job ||
      job.stage === "filing" ||
      job.stage === "summarising" ||
      job.stage === "starting"
    ) {
      pendingOn(from, pendingWords(job?.stage), {
        label: "Cancel",
        run: () => cancelContinuation(id),
      });
      continue;
    }
    if (job.stage === "started") {
      started.delete(id);
      pendingOn(from, undefined);
      noteOn(from, {
        text: "Continued in a new session.",
        href: conversationHref(job.targetInstanceId, cawco.instanceIndex),
      });
    } else if (job.stage === "failed") {
      started.delete(id);
      pendingOn(from, undefined);
      faultOn(from, {
        reason: job.error
          ? `Couldn't continue: ${job.error}`
          : "Couldn't continue.",
        again: () => {
          faultOn(from, undefined);
          continueInNewSession(entry.source, entry.draft);
        },
        againLabel: "Reopen",
      });
    } else if (job.stage === "cancelled") {
      started.delete(id);
      pendingOn(from, undefined);
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
