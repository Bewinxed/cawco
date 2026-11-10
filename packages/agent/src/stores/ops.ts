/**
 * Everything the agent's loop asks of its stores thread (stores/worker.ts),
 * by name: each op takes one argument and a way to say how far it has come,
 * and answers once.
 */

import { opencodeReads, type SessionQuery } from "./opencode-reads";
import { usageHost } from "./usage-host";

/** How an op says how far it has come, before it answers. */
export type Tell = (value: unknown) => void;

const opsOf = {
  "opencode.ownRows": (_: undefined) => opencodeReads.ownRows(),
  "opencode.ownChanges": (_: undefined) => opencodeReads.ownChanges(),
  "opencode.ownSignInTypes": (_: undefined) => opencodeReads.ownSignInTypes(),
  "opencode.ownIntegrations": (_: undefined) => opencodeReads.ownIntegrations(),
  "opencode.ownCredentials": (_: undefined) => opencodeReads.ownCredentials(),
  "opencode.sessions": (query: SessionQuery) => opencodeReads.sessions(query),
  "opencode.backupV1": (dataHome: string) => opencodeReads.backupV1(dataHome),
  "usage.scan": (now: number) => usageHost.scan(now),
} satisfies Record<string, (arg: never, tell: Tell) => Promise<unknown>>;

type StoreOps = typeof opsOf;
export type StoreOp = keyof StoreOps;
export type StoreArg<K extends StoreOp> = Parameters<StoreOps[K]>[0];
export type StoreAnswer<K extends StoreOp> = Awaited<ReturnType<StoreOps[K]>>;

/** Each op as a handler of its own argument and answer: what lets one call by a name `K` and its argument pass the checker. */
export const storeOps: {
  [K in StoreOp]: (arg: StoreArg<K>, tell: Tell) => Promise<StoreAnswer<K>>;
} = opsOf;

/** What the loop sends: one op and its argument, under an id its answer carries. */
export interface StoreAsk<K extends StoreOp = StoreOp> {
  arg: StoreArg<K>;
  id: number;
  op: K;
}

/** What the thread sends: how far an op has come, its answer, or why it failed. */
export type StoreSaid =
  | { id: number; kind: "told"; value: unknown }
  | { id: number; kind: "answer"; value: unknown }
  | { code?: string; id: number; kind: "failed"; message: string };
