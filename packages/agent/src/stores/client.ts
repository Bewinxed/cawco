/**
 * The loop's side of the agent's stores thread (stores/worker.ts): every
 * SQLite read or write the agent makes, but the transcript index's (its own
 * process, search/process.ts), is asked of that thread, so the loop never
 * waits on a disk, a sync or another process's lock.
 *
 * A read is asked with a deadline ({@link storeRead}, core bounded.ts): a
 * thread held by a slow disk or a locked database answers it unanswered,
 * and the caller keeps what it had. A read already asked and not yet
 * answered is not asked again; its answer serves every caller. Work that
 * must finish (a sync, a scan, a backup) is asked without one
 * ({@link storeWork}).
 *
 * The thread starts with the first ask. One that ends (a crash) fails what
 * it held as gone, and the next ask starts another.
 */
import { type Bounded, Gone, readWithin } from "@cawco/core/bounded";
import { type Join, makeJoin } from "@cawco/core/effect/join";
import { standalone } from "@cawco/core/runtime";
import { unhandled } from "@cawco/core/unhandled";
import { Effect } from "effect";
import type {
  StoreAnswer,
  StoreArg,
  StoreAsk,
  StoreOp,
  StoreSaid,
} from "./ops";

/** Where the thread is: the binary's own entry when compiled, the source beside this file otherwise. */
const WORKER_URL = new URL(
  standalone ? "./scripts/binary/stores-worker.js" : "./worker.ts",
  import.meta.url
);

interface Asked {
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  tell?: (value: unknown) => void;
}

let thread: Worker | undefined;
let nextId = 0;
const asked = new Map<number, Asked>();
/** Reads asked and not yet answered, by op, then by argument: each op's own join, so its answer keeps its type. */
const reading: { [K in StoreOp]: Join<string, StoreAnswer<K>, unknown> } = {
  "opencode.ownRows": makeJoin(),
  "opencode.ownChanges": makeJoin(),
  "opencode.ownSignInTypes": makeJoin(),
  "opencode.ownIntegrations": makeJoin(),
  "opencode.ownCredentials": makeJoin(),
  "opencode.sessions": makeJoin(),
  "opencode.backupV1": makeJoin(),
  "usage.scan": makeJoin(),
  "claude.saidWindow": makeJoin(),
  "catalog.transcripts": makeJoin(),
};

/** Every ask thread `ended` held, failed as gone, and the thread let go; a thread already let go is nothing more. */
const lost = (ended: Worker, why: string): void => {
  if (thread !== ended) {
    return;
  }
  ended.terminate();
  thread = undefined;
  for (const one of asked.values()) {
    one.reject(new Gone(`the agent's stores thread ended: ${why}`));
  }
  asked.clear();
};

const started = (): Worker => {
  if (thread) {
    return thread;
  }
  const made = new Worker(WORKER_URL, { ref: false });
  made.onmessage = (event: MessageEvent<StoreSaid>) => {
    const said = event.data;
    const one = asked.get(said.id);
    if (!one) {
      return;
    }
    switch (said.kind) {
      case "told":
        one.tell?.(said.value);
        return;
      case "answer":
        settle(said.id);
        one.resolve(said.value);
        return;
      case "failed":
        settle(said.id);
        one.reject(
          Object.assign(new Error(said.message), {
            ...(said.code ? { code: said.code } : {}),
          })
        );
        return;
      default:
        unhandled("answer", said);
    }
  };
  made.addEventListener("error", (event) => lost(made, event.message));
  made.addEventListener("close", () => lost(made, "it exited"));
  thread = made;
  return made;
};

/** An ask answered: the thread holds the process open only while it owes one. */
const settle = (id: number): void => {
  asked.delete(id);
  if (asked.size === 0) {
    thread?.unref();
  }
};

/** `op` asked of the thread, answered when it says; let go, the ask is forgotten and its answer dropped. */
const ask = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  tell?: (value: unknown) => void
): Effect.Effect<StoreAnswer<K>, unknown> =>
  Effect.callback<StoreAnswer<K>, unknown>((resume) => {
    const worker = started();
    nextId += 1;
    const id = nextId;
    asked.set(id, {
      // Platform gap: the answer crosses the thread's boundary as a
      // structured clone, typed by no message (`MessageEvent<StoreSaid>`
      // carries it as `unknown`), and the asks of every op wait in one map
      // by id, whose op TypeScript cannot correlate with the answer
      // (microsoft/TypeScript#30581). The thread answers id `id` with op
      // `op`'s own answer (stores/worker.ts `storeOps`).
      resolve: (value) => resume(Effect.succeed(value as StoreAnswer<K>)),
      reject: (error) => resume(Effect.fail(error)),
      ...(tell ? { tell } : {}),
    });
    worker.ref();
    worker.postMessage({ id, op, arg } satisfies StoreAsk);
    return Effect.sync(() => {
      if (asked.has(id)) {
        settle(id);
      }
    });
  });

/**
 * `op` read on the stores thread, given `ms` to answer: unanswered when the
 * thread is held past it (a slow disk, another process's lock), the read
 * itself still answering any later caller that asks the same.
 */
export const storeRead = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  ms: number
): Promise<Bounded<StoreAnswer<K>>> => {
  const key = String(JSON.stringify(arg));
  // The promise edge of the join: a caller there is never interrupted, so
  // the read goes to its end for whoever asks the same after this caller's
  // deadline.
  const shared = Effect.runPromise(reading[op].run(key, ask(op, arg)));
  return readWithin(ms, () => shared);
};

/** `op` run on the stores thread to its end, `tell` hearing how far it has come. */
export const storeWork = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  tell?: (value: unknown) => void
): Promise<StoreAnswer<K>> =>
  // The promise edge of ask.
  Effect.runPromise(ask(op, arg, tell));
