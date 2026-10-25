/**
 * Everything the agent's loop asks of its stores thread (stores/worker.ts),
 * by name: each op takes one argument and a way to say how far it has come,
 * and answers once.
 */

import { opencodeReads, type SessionQuery } from "./opencode-reads";
import { usageHost } from "./usage-host";

/** How an op says how far it has come, before it answers. */
export type Tell = (value: unknown) => void;

export const storeOps = {
  "opencode.ownRows": (_: undefined) => opencodeReads.ownRows(),
  "opencode.ownChanges": (_: undefined) => opencodeReads.ownChanges(),
  "opencode.ownSignInTypes": (_: undefined) => opencodeReads.ownSignInTypes(),
  "opencode.ownIntegrations": (_: undefined) => opencodeReads.ownIntegrations(),
  "opencode.ownCredentials": (_: undefined) => opencodeReads.ownCredentials(),
  "opencode.sessions": (query: SessionQuery) => opencodeReads.sessions(query),
  "opencode.backupV1": (dataHome: string) => opencodeReads.backupV1(dataHome),
  "usage.scan": (now: number) => usageHost.scan(now),
} satisfies Record<string, (arg: never, tell: Tell) => Promise<unknown>>;

export type StoreOps = typeof storeOps;
export type StoreOp = keyof StoreOps;
export type StoreArg<K extends StoreOp> = Parameters<StoreOps[K]>[0];
export type StoreAnswer<K extends StoreOp> = Awaited<ReturnType<StoreOps[K]>>;

/** What the loop sends: one op and its argument, under an id its answer carries. */
export interface StoreAsk {
  arg: unknown;
  id: number;
  op: StoreOp;
}

/** What the thread sends: how far an op has come, its answer, or why it failed. */
export type StoreSaid =
  | { id: number; kind: "told"; value: unknown }
  | { id: number; kind: "answer"; value: unknown }
  | { code?: string; id: number; kind: "failed"; message: string };
