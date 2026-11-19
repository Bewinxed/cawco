/**
 * The hub's thread's side of the views thread (views/worker.ts): it starts
 * the thread on the hub's database, tells it what the change log says moved
 * (views/changes.ts), asks it, and answers what it asks back. One ordered
 * line of messages each way, so a change told before an ask is heard before
 * it.
 *
 * A thread that ends (a crash) fails what it was asked as gone, and another
 * is started a moment later, which reads the database whole again; what it
 * held of the machines (their catalogs) is asked again (`restarted`).
 */
import { detach } from "@cawco/core/detach";
import { standalone } from "@cawco/core/runtime";
import { unhandled } from "@cawco/core/unhandled";
import type { ViewChanges } from "./changes";
import type { StoredHeld } from "./stored";
import {
  type AnswerOf,
  createAsking,
  type FromViews,
  type HubOps,
  type ToViews,
  type ViewOps,
} from "./wire";

/** Where the thread is: the binary's own entry when compiled, the source beside this file otherwise. */
const WORKER_URL = new URL(
  standalone ? "./scripts/binary/views-worker.js" : "./worker.ts",
  import.meta.url
);

/** How long after the thread ends another is started, ms. Our call. */
const RESTART_MS = 1000;

/** What the views thread asks of this one, each answered here; `signal` is the find's asker's, for a machine's search. */
export interface HubAnswers {
  askMachine: (
    arg: HubOps["askMachine"]["arg"],
    signal: AbortSignal | undefined
  ) => Promise<HubOps["askMachine"]["answer"]>;
  blockPages: (
    arg: HubOps["blockPages"]["arg"]
  ) => HubOps["blockPages"]["answer"];
  listStored: (
    arg: HubOps["listStored"]["arg"]
  ) => Promise<HubOps["listStored"]["answer"]>;
  stageKinds: (
    arg: HubOps["stageKinds"]["arg"]
  ) => Promise<HubOps["stageKinds"]["answer"]>;
}

export interface ViewsThreadDeps {
  hub: HubAnswers;
  /** The hub's database file. */
  path: string;
  /** The thread started again after it ended: what it held of the machines is to be asked again. */
  restarted: () => void;
  /** Recent's stored list changed (views/stored.ts). */
  stored: (held: StoredHeld) => void;
}

export const createViewsThread = (deps: ViewsThreadDeps) => {
  let thread: Worker | undefined;
  let closed = false;
  /** A thread ended and none started since: the next one started is a restart. */
  let restartOwed = false;
  let nextRequest = 0;
  /** Each find's asker's signal, by the number the views thread names it by. */
  const signals = new Map<number, AbortSignal>();

  const post = (message: ToViews): void => {
    started().postMessage(message);
  };
  const asking = createAsking<ViewOps>((message) => post(message));

  /** What the views thread asked, answered: its value, or why it failed. */
  const answerHub = async (
    id: number,
    answer: () => Promise<AnswerOf<HubOps>>
  ): Promise<void> => {
    try {
      post({ ...(await answer()), id, kind: "answer" });
    } catch (error) {
      post({
        id,
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** One ask of the views thread's, answered by its op. */
  const answerOf = async (
    asked: Extract<FromViews, { kind: "ask" }>
  ): Promise<AnswerOf<HubOps>> => {
    switch (asked.op) {
      case "askMachine":
        return {
          op: "askMachine",
          value: await deps.hub.askMachine(
            asked.arg,
            signals.get(asked.arg.requestId)
          ),
        };
      case "blockPages":
        return { op: "blockPages", value: deps.hub.blockPages(asked.arg) };
      case "listStored":
        return {
          op: "listStored",
          value: await deps.hub.listStored(asked.arg),
        };
      case "stageKinds":
        return {
          op: "stageKinds",
          value: await deps.hub.stageKinds(asked.arg),
        };
      default:
        return unhandled("op", asked);
    }
  };

  const heard = (message: FromViews): void => {
    switch (message.kind) {
      case "stored":
        deps.stored(message.held);
        return;
      case "ask":
        detach(
          answerHub(message.id, () => answerOf(message)),
          `views: ${message.op} answered`
        );
        return;
      case "answer":
      case "failed":
        asking.answered(message);
        return;
      default:
        unhandled("message", message);
    }
  };

  /** The thread ended: what it was asked fails as gone, and another starts a moment later. */
  const lost = (ended: Worker, why: string): void => {
    if (thread !== ended) {
      return;
    }
    ended.terminate();
    thread = undefined;
    console.warn(`[views] the views thread ended: ${why}`);
    asking.lost(`the hub's views thread ended: ${why}`);
    if (closed) {
      return;
    }
    restartOwed = true;
    setTimeout(() => {
      if (!(closed || thread)) {
        started();
      }
    }, RESTART_MS).unref();
  };

  const started = (): Worker => {
    if (thread) {
      return thread;
    }
    const made = new Worker(WORKER_URL, { ref: false });
    made.onmessage = (event: MessageEvent<FromViews>) => heard(event.data);
    made.addEventListener("error", (event) => lost(made, event.message));
    made.addEventListener("close", () => lost(made, "it exited"));
    thread = made;
    made.postMessage({ kind: "start", path: deps.path } satisfies ToViews);
    // Started again after one ended (by its timer, or an ask before it):
    // what the one that ended held of the machines is asked again.
    if (restartOwed) {
      restartOwed = false;
      queueMicrotask(deps.restarted);
    }
    return made;
  };

  return {
    /** Starts the thread: it reads the names and the lists whole, once. */
    start: (): void => {
      started();
    },
    /** What the change log says moved, told to the thread. */
    hear: (changes: ViewChanges): void => {
      if (thread) {
        post({ kind: "changes", changes });
      }
    },
    find: (arg: ViewOps["find"]["arg"], signal?: AbortSignal) =>
      asking.ask(
        { op: "find", arg },
        (answer) => (answer.op === "find" ? answer : undefined),
        signal
      ),
    listing: (arg: ViewOps["listing"]["arg"], signal?: AbortSignal) =>
      asking.ask(
        { op: "listing", arg },
        (answer) => (answer.op === "listing" ? answer : undefined),
        signal
      ),
    named: (arg: ViewOps["named"]["arg"]) =>
      asking.ask({ op: "named", arg }, (answer) =>
        answer.op === "named" ? answer : undefined
      ),
    waiting: (arg: ViewOps["waiting"]["arg"]) =>
      asking.ask({ op: "waiting", arg }, (answer) =>
        answer.op === "waiting" ? answer : undefined
      ),
    relist: (arg: ViewOps["relist"]["arg"]) =>
      asking.ask({ op: "relist", arg }, (answer) =>
        answer.op === "relist" ? answer : undefined
      ),
    catalogMoved: (arg: ViewOps["catalogMoved"]["arg"]) =>
      asking.ask({ op: "catalogMoved", arg }, (answer) =>
        answer.op === "catalogMoved" ? answer : undefined
      ),
    catalogSessions: (arg: ViewOps["catalogSessions"]["arg"]) =>
      asking.ask({ op: "catalogSessions", arg }, (answer) =>
        answer.op === "catalogSessions" ? answer : undefined
      ),
    /**
     * Runs `run` with a number the views thread names this request by, tied
     * to `signal`: the machines it asks for are told to stop once it aborts.
     */
    withRequest: async <Answer>(
      signal: AbortSignal | undefined,
      run: (requestId: number) => Promise<Answer>
    ): Promise<Answer> => {
      nextRequest += 1;
      const requestId = nextRequest;
      if (signal) {
        signals.set(requestId, signal);
      }
      try {
        return await run(requestId);
      } finally {
        signals.delete(requestId);
      }
    },
    close: (): void => {
      closed = true;
      thread?.terminate();
      thread = undefined;
    },
  };
};

export type ViewsThread = ReturnType<typeof createViewsThread>;
