/**
 * A project's threads with Caw and its Caw setting, as the hub serves them
 * (packages/hub/src/threads.ts, caw.ts). Dates arrive as ISO strings from
 * REST and as ms epochs from `thread_message` frames; {@link at} reads both.
 */
import type { ThreadMessage as HeardMessage } from "@cawco/core";
import { json, send } from "./project-tasks.js";

/** One message, yours or Caw's, as REST or a frame carries it. */
export interface ThreadMessage {
  author: "you" | "caw";
  body: string;
  createdAt: string | number;
  /** Whether yours reached Caw: `off`, `sent`, `failed`; null while on its way, and on Caw's. */
  delivery: "off" | "sent" | "failed" | null;
  deliveryError: string | null;
  id: string;
  instanceId: string | null;
  threadId: string;
}

export interface Thread {
  createdAt: string;
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

/** A thread as the project's list has it. */
export type ThreadSummary = Thread & {
  count: number;
  last: ThreadMessage | null;
};

/** A project's Caw: on or off, what it runs on, its lead session and spend. */
export interface CawView {
  harness: "claude" | "opencode";
  instanceId: string | null;
  model: string | null;
  on: boolean;
  spentUsd: number;
  status: string | null;
}

/** A message's time in ms, from either shape. */
export const at = (message: { createdAt: string | number }): number =>
  typeof message.createdAt === "number"
    ? message.createdAt
    : Date.parse(message.createdAt);

/** Messages read and heard, one each by id (the newest copy wins), oldest first. */
export const merged = (
  read: ThreadMessage[],
  heard: (ThreadMessage | HeardMessage)[]
): ThreadMessage[] => {
  const byId = new Map<string, ThreadMessage>();
  for (const message of [...read, ...heard]) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => at(a) - at(b));
};

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;

export const readCaw = (projectId: string): Promise<CawView> =>
  send(`${base(projectId)}/caw`);

export const setCaw = (
  projectId: string,
  change: { on?: boolean }
): Promise<CawView> => send(`${base(projectId)}/caw`, json("PATCH", change));

export const listThreads = (projectId: string): Promise<ThreadSummary[]> =>
  send(`${base(projectId)}/threads`);

export const readThread = (
  projectId: string,
  threadId: string
): Promise<{ thread: Thread; messages: ThreadMessage[] }> =>
  send(`${base(projectId)}/threads/${encodeURIComponent(threadId)}`);

export const startThread = (
  projectId: string,
  body: string
): Promise<{ thread: Thread; message: ThreadMessage }> =>
  send(`${base(projectId)}/threads`, json("POST", { body }));

export const postToThread = (
  projectId: string,
  threadId: string,
  body: string
): Promise<ThreadMessage> =>
  send(
    `${base(projectId)}/threads/${encodeURIComponent(threadId)}/messages`,
    json("POST", { body })
  );
