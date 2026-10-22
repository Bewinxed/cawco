/**
 * Which session the New Session form is continuing, when it is. Set by the
 * session menus, read by the one form mount in the Shell: the menus live in
 * rows all over the app, and the form must not be mounted once per row. Kept
 * in the tab's own storage, so a reload opens the form on it again (DESIGN.md,
 * The Work Outlives Its Surface Rule).
 *
 * A continuation the form starts is the hub's job; the form hands it to this
 * tab's parked starts (spawn/parked), which follow it to its end whatever
 * happens to the form.
 */
import type {
  ContinuationJob,
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core";
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { cawco, type SendExtras } from "./client.svelte";
import { spawning } from "./spawn/new-session.svelte";
import { readJson, writeJson } from "./storage";
import { contextOf } from "./workspace/workspace.svelte";

/** The session a continuation starts from, as the form shows and sends it. */
export interface ContinueSource {
  cwd: string;
  harness: HarnessKind;
  /** The id the hub knows it by: a cawco instance id, or a stored session's own id. */
  instanceId: string;
  machineId: string;
  model?: string;
  title: string;
}

/**
 * The New Session form's picks and first prompt: what a start was submitted
 * with, and what the form is opened on again (a reload, a parked start).
 */
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
  /** None for a harness with no modes (pi), the one thing it may be. */
  permissionMode: PermissionMode | null;
  projectId: string | undefined;
  prompt: string;
  repo: string | undefined;
  scratch: { baseCwd: string; worktree: boolean } | undefined;
  summarizer: { harness: HarnessKind; model: string };
  usedModel: string;
}

/** Where this tab keeps the session its form continues. */
const KEY = "cawco:continuing";

export const continuing = $state<{ source: ContinueSource | null }>({
  source: readJson<ContinueSource | null>(KEY, null, "session"),
});

$effect.root(() => {
  $effect(() => {
    writeJson(KEY, $state.snapshot(continuing.source), "session");
  });
});

/** Opens the New Session form continuing `source`; none opens nothing. */
export function continueInNewSession(source: ContinueSource | null): void {
  spawning.shown = null;
  spawning.anchor = null;
  spawning.opening += 1;
  continuing.source = source;
}

/**
 * Starts a continuation of `source`: the hub answers with the job's id at
 * once and runs it from there. `body` is the request as the form builds it.
 */
export async function startContinuation(
  source: ContinueSource,
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
    throw await hubRefusal(response);
  }
  const { continuationId } = (await response.json()) as {
    continuationId: string;
  };
  return continuationId;
}

/** A continuation's running stages, as the form's Start and its parked row say them. */
export const continuationStageWords = {
  waiting: "Waiting for its work in flight…",
  filing: "Filing its open items…",
  summarising: "Summarising…",
  starting: "Starting…",
} as const;

/** A continuation still on its way, by its stage. */
export const continuationRunning = (
  stage: ContinuationJob["stage"] | undefined
): stage is keyof typeof continuationStageWords =>
  stage === "waiting" ||
  stage === "filing" ||
  stage === "summarising" ||
  stage === "starting";

/** Cancel, in any stage before the new session has started: nothing starts. Throws the hub's refusal. */
export async function cancelContinuation(id: string): Promise<void> {
  const response = await fetch(`/api/continuations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await hubRefusal(response);
  }
}

/**
 * A dashboard session as a continuation source, found the way the session
 * details card finds it: the live view, then the instance row, then the
 * workspace's remembered context. Its harness is its row's, else its stored
 * address's. Null when nothing says where it lives or what runs it.
 */
export function continueSourceOf(
  sessionId: string,
  title: string
): ContinueSource | null {
  const session = cawco.session(sessionId);
  const row = cawco.instanceIndex.byId.get(sessionId);
  const context = contextOf(sessionId);
  const machineId = session?.machineId || row?.machineId || context?.machine;
  const harness = row?.harness ?? context?.harness ?? session?.harness;
  if (!(machineId && harness)) {
    return null;
  }
  return {
    instanceId: sessionId,
    machineId,
    cwd: session?.cwd || row?.cwd || context?.cwd || "",
    harness,
    model: session?.model ?? undefined,
    title,
  };
}
