/**
 * The finder's one door to the hub: `GET /api/find` (names per keystroke,
 * then the machines on a settle), `GET /api/find/waiting` and
 * `POST /api/find/seen`. Every surface in this folder reads the fleet
 * through here and nowhere else.
 *
 * A failed read is said as one of two things and never turned into an empty
 * answer (The Claim Of Nothing Rule): the hub did not answer (`unreached`),
 * or it answered and refused (`refused`, its own words). An aborted read
 * (a newer keystroke took its place) resolves `null` and is dropped by the
 * caller.
 */
import { hubFailure, unreachable, unreachedAnswer } from "../hub-read";

// PENDING-CORE: the engine's contract (packages/core/src/find.ts, ws
// 0a6da208), declared here until it lands on main; then these become
// `export type { … } from "@cawco/core"`.
export type FindKind =
  | "conversation"
  | "thread"
  | "task"
  | "routine"
  | "project"
  | "machine"
  | "artifact"
  | "decision"
  | "commit"
  | "file";
export type FindField =
  | "title"
  | "purpose"
  | "project"
  | "dir"
  | "machine"
  | "report"
  | "id"
  | "kind"
  | "path"
  | "transcript";
export type FindBy = "me" | "agent" | "report" | "caw";
export type FindLiveState =
  "working" | "needs-you" | "idle" | "sleeping" | "ended" | "unknown";

interface FindCommon {
  handle: string | null;
  id: string;
  /** ms */
  lastActivity: number | null;
  matched: FindField[];
  project: { id: string; name: string } | null;
  score: number;
  title: string;
}
export type MomentAuthor = "owner" | "agent" | "report" | "injected" | "caw";
export interface FindMoment {
  at: number | null;
  author: MomentAuthor;
  docId: string;
  /** The matched terms stand between 「 and 」. */
  excerpt: string;
}
export interface FindConversation extends FindCommon {
  children: { count: number; needsYou: number };
  dir: string | null;
  harness: string;
  instanceId: string | null;
  kind: "conversation";
  lastReport: {
    at: number;
    headline: string;
    outcome: "done" | "failed" | "blocked" | null;
  } | null;
  machine: { id: string; name: string };
  moments: FindMoment[];
  parent: { id: string; title: string } | null;
  purpose: string | null;
  role: "session" | "delegate" | "attempt" | "spin-off";
  sessionId: string;
  state: FindLiveState;
  /** What an attempt is an attempt at. */
  task: { id: string; taskId: string; title: string } | null;
}
export interface FindThread extends FindCommon {
  kind: "thread";
  moments: FindMoment[];
  state: "working" | "needs-you" | "ready";
}
export interface FindTask extends FindCommon {
  kind: "task";
  stage: string;
  /** Null until the project's stages.md is read, and for a stage it doesn't name. */
  stageKind: "todo" | "active" | "waiting" | "you" | "done" | "dropped" | null;
  taskId: string;
  todos: { done: number; total: number };
}
export interface FindRoutine extends FindCommon {
  enabled: boolean;
  kind: "routine";
  lastOutcome: string | null;
  nextRun: number;
}
export interface FindProject extends FindCommon {
  kind: "project";
}
export interface FindMachine extends FindCommon {
  kind: "machine";
  online: boolean;
}
export interface FindArtifact extends FindCommon {
  artifactKind: "page" | "canvas" | "preview";
  conversation: { id: string; title: string };
  kind: "artifact" | "decision";
  picksToMake: boolean;
  revision: number;
  seen: boolean;
}
export interface FindChange extends FindCommon {
  branch: string;
  conversation: { id: string; title: string };
  kind: "commit" | "file";
  landed: boolean;
  what: string;
  workItemId: string;
}
export type FindResult =
  | FindConversation
  | FindThread
  | FindTask
  | FindRoutine
  | FindProject
  | FindMachine
  | FindArtifact
  | FindChange;
export interface FindCoverage {
  asked: boolean;
  machines: {
    answered: boolean;
    indexAgeMs: number | null;
    machineId: string;
    name: string;
    reason: string | null;
    tookMs: number | null;
  }[];
}
export interface FindAnswer {
  coverage: FindCoverage;
  next: string | null;
  query: string;
  results: FindResult[];
  timing: { namesMs: number; transcriptsMs: number | null };
}
export interface WaitingItem {
  artifactKind?: "page" | "canvas" | "preview";
  conversation: { id: string; title: string } | null;
  id: string;
  kind: "artifact" | "decision" | "report" | "task";
  project: { id: string; name: string } | null;
  revision?: number;
  since: number;
  title: string;
  why: string;
}
export interface WaitingAnswer {
  days: number;
  items: WaitingItem[];
}

/** How a read ended. */
export type Read<T> =
  | { ok: true; value: T }
  | { ok: false; unreached: true }
  | { ok: false; unreached: false; detail: string };

async function read<T>(
  url: string,
  signal?: AbortSignal
): Promise<Read<T> | null> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    if (unreachable(error)) {
      return { ok: false, unreached: true };
    }
    throw error;
  }
  if (signal?.aborted) {
    return null;
  }
  if (unreachedAnswer(response)) {
    return { ok: false, unreached: true };
  }
  if (!response.ok) {
    const { detail } = await hubFailure(response);
    return { ok: false, unreached: false, detail };
  }
  return { ok: true, value: (await response.json()) as T };
}

export interface Ask {
  /** Who said it, for the part of the answer read from transcripts. */
  by?: FindBy | null;
  kinds?: readonly FindKind[];
  limit?: number;
  signal?: AbortSignal;
}

const query = (q: string, { by, kinds, limit }: Ask, transcripts: boolean) => {
  const params = new URLSearchParams({ q });
  if (limit) {
    params.set("limit", String(limit));
  }
  if (kinds && kinds.length > 0) {
    params.set("kinds", kinds.join(","));
  }
  if (by) {
    params.set("by", by);
  }
  if (!transcripts) {
    params.set("transcripts", "0");
  }
  return `/api/find?${params}`;
};

/** What the hub knows by name, in milliseconds: asked on every keystroke. */
export const findNames = (q: string, ask: Ask = {}) =>
  read<FindAnswer>(query(q, ask, false), ask.signal);

/** Names and every machine's transcripts (up to 1.5 s each): asked once typing settles. */
export const findEverywhere = (q: string, ask: Ask = {}) =>
  read<FindAnswer>(query(q, ask, true), ask.signal);

export const findWaiting = (signal?: AbortSignal) =>
  read<WaitingAnswer>("/api/find/waiting", signal);

/** Marks a report read: it leaves Waiting for you. */
export async function markReportRead(workItemId: string): Promise<Read<null>> {
  try {
    const response = await fetch("/api/find/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "report", id: workItemId }),
    });
    if (unreachedAnswer(response)) {
      return { ok: false, unreached: true };
    }
    if (!response.ok) {
      const { detail } = await hubFailure(response);
      return { ok: false, unreached: false, detail };
    }
    return { ok: true, value: null };
  } catch (error) {
    if (unreachable(error)) {
      return { ok: false, unreached: true };
    }
    throw error;
  }
}
