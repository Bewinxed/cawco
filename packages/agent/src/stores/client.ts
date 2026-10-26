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
import { standalone } from "@cawco/core/runtime";
import { unhandled } from "@cawco/core/unhandled";
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
/** Reads asked and not yet answered, by op and argument. */
const reading = new Map<string, Promise<unknown>>();

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

const ask = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  tell?: (value: unknown) => void
): Promise<StoreAnswer<K>> =>
  new Promise((resolve, reject) => {
    const worker = started();
    nextId += 1;
    const id = nextId;
    asked.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      ...(tell ? { tell } : {}),
    });
    worker.ref();
    worker.postMessage({ id, op, arg } satisfies StoreAsk);
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
  const key = `${op}\0${String(JSON.stringify(arg))}`;
  let read = reading.get(key);
  if (!read) {
    read = ask(op, arg).finally(() => reading.delete(key));
    reading.set(key, read);
  }
  const shared = read as Promise<StoreAnswer<K>>;
  return readWithin(ms, () => shared);
};

/** `op` run on the stores thread to its end, `tell` hearing how far it has come. */
export const storeWork = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  tell?: (value: unknown) => void
): Promise<StoreAnswer<K>> => ask(op, arg, tell);
