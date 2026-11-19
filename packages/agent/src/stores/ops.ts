/**
 * Everything the agent's loop asks of its stores thread (stores/worker.ts),
 * by name: each op takes one argument and a way to say how far it has come,
 * and answers once.
 */

import type { WindowAsk } from "@cawco/core/transcript-types";
import { storedTranscripts } from "../catalog-index";
import { readSaidWindow } from "../harnesses/claude-transcript";
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
  /**
   * A window of a Claude conversation as it was said (claude-transcript.ts
   * `readSaidWindow`): its lines parsed and its chain walked here, never on
   * the loop. On the loop, a window took 1 to 7.5 s each on obelisk's agent
   * after its 12:22 restart on 2026-11-19, a dozen at once as dashboards
   * opened their conversations again, and its own listing ran past 10 s
   * behind them.
   */
  "claude.saidWindow": (read: { ask: WindowAsk; path: string }) =>
    readSaidWindow(read.path, read.ask),
  /**
   * The transcripts in a harness's project folders, each with its mtime and
   * size (catalog-index.ts `storedTranscripts`): listed and stat'd here, so
   * the machine's listing costs the loop only the files that moved.
   */
  "catalog.transcripts": (read: { only: string | null; roots: string[] }) =>
    storedTranscripts(read),
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
