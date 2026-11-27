/**
 * The hub's views thread: what scans or rebuilds a list runs here, off the
 * thread every request, heartbeat and machine frame waits on. It holds find's
 * names (views/find-index.ts) and its engine (views/find-engine.ts), each
 * machine's catalog (views/catalogs.ts) and Recent's stored list
 * (views/stored.ts), each kept by what the hub's change log says moved
 * (views/changes.ts), on a read-only connection of its own (views/read.ts).
 * The hub's thread asks by message (views/client.ts).
 */
import { unhandled } from "@cawco/core/unhandled";
import { makeLifetime } from "../lifetime";
import { createCatalogs } from "./catalogs";
import type { ViewChanges } from "./changes";
import { createFindEngine, type Live } from "./find-engine";
import { createFindIndex } from "./find-index";
import { openViewsDb } from "./read";
import { createStoredList } from "./stored";
import {
  type AnswerOf,
  createAsking,
  type FromViews,
  type HubOps,
  type LiveFacts,
  type ToViews,
  type ViewOps,
} from "./wire";

declare const self: Worker;

const say = (message: FromViews): void => {
  self.postMessage(message);
};

/** The views thread's asks of the hub's thread, waiting on their answers. */
const asking = createAsking<HubOps>((message) => say(message));

/**
 * The views thread's own lifetime: a thread of its own, it is its own
 * edge, as the hub's thread's is (index.ts). Its asks of the hub's thread
 * and a catalog's listing again run on it, and it closes as the thread
 * exits.
 */
const lifetime = makeLifetime();
process.on("exit", () => lifetime.close());

/** The promise edge of an ask of the hub's thread. */
const ask = <Answer>(
  asked: Parameters<typeof asking.ask>[0],
  pick: (answer: AnswerOf<HubOps>) => { value: Answer } | undefined
): Promise<Answer> => lifetime.run(asking.ask(asked, pick));

const liveOf = (facts: LiveFacts): Live => ({
  online: new Set(facts.online),
  needsYou: new Set(facts.needsYou),
});

/** Everything the thread holds, made once the hub's thread names its database. */
const startViews = (path: string) => {
  const db = openViewsDb(path);
  // A catalog's move goes to the index and the list, made below it.
  const catalogs = createCatalogs({
    lifetime,
    listStored: (machineId) =>
      asking.ask({ op: "listStored", arg: machineId }, (answer) =>
        answer.op === "listStored" ? answer : undefined
      ),
    hostname: (machineId) => index.hostname(machineId),
    moved: (machineId, ids) => {
      index.catalogMoved(machineId, ids);
      stored.catalogMoved(machineId, ids);
    },
  });
  const index = createFindIndex({
    db,
    catalogs,
    blockPages: (ids) =>
      ask({ op: "blockPages", arg: ids }, (answer) =>
        answer.op === "blockPages" ? answer : undefined
      ),
    stageKinds: async (projectId) => {
      const kinds = await ask({ op: "stageKinds", arg: projectId }, (answer) =>
        answer.op === "stageKinds" ? answer : undefined
      );
      return kinds ? new Map(kinds) : undefined;
    },
  });
  const stored = createStoredList({
    db,
    catalogs,
    projects: () => index.projects(),
    told: (held) => say({ kind: "stored", held }),
  });
  const engine = createFindEngine({
    index,
    catalogs,
    askMachine: (machineId, query, options, asker) =>
      ask(
        {
          op: "askMachine",
          arg: {
            machineId,
            query,
            options,
            caller: asker.caller,
            requestId: asker.requestId,
          },
        },
        (answer) => (answer.op === "askMachine" ? answer : undefined)
      ),
  });
  index.start();

  /** One ask of the hub's thread's, answered by its op. */
  const answerOf = async (
    asked: Extract<ToViews, { kind: "ask" }>
  ): Promise<AnswerOf<ViewOps>> => {
    switch (asked.op) {
      case "find":
        return {
          op: "find",
          value: await engine.find(asked.arg.request, liveOf(asked.arg.live)),
        };
      case "listing":
        return {
          op: "listing",
          value: await engine.listing(
            asked.arg.request,
            liveOf(asked.arg.live)
          ),
        };
      case "named":
        return {
          op: "named",
          value: engine.named(asked.arg.names, liveOf(asked.arg.live)),
        };
      case "waiting":
        return {
          op: "waiting",
          value: engine.waiting(asked.arg.from, liveOf(asked.arg.live)),
        };
      case "relist":
        await catalogs.relist(asked.arg);
        return { op: "relist", value: null };
      case "catalogMoved":
        await catalogs.moved(
          asked.arg.machineId,
          asked.arg.moved,
          asked.arg.removed
        );
        return { op: "catalogMoved", value: null };
      case "catalogSessions":
        return {
          op: "catalogSessions",
          value: asked.arg.sessionIds.flatMap((sessionId) => {
            const info = catalogs.session(asked.arg.machineId, sessionId);
            return info ? [info] : [];
          }),
        };
      default:
        return unhandled("op", asked);
    }
  };

  return {
    heard(changes: ViewChanges): void {
      index.heard(changes);
      // A machine the hub no longer knows takes its catalog with it.
      const known = new Set(index.machineIds());
      for (const machineId of changes.machines ?? []) {
        if (!known.has(machineId)) {
          catalogs.forget(machineId);
        }
      }
      if (changes.sessions) {
        stored.sessionsMoved(changes.sessions);
      }
      if (changes.projects) {
        stored.projectsMoved();
      }
    },
    answer: answerOf,
  };
};

let views: ReturnType<typeof startViews> | undefined;

self.onmessage = (event: MessageEvent<ToViews>) => {
  const message = event.data;
  switch (message.kind) {
    case "start":
      views = startViews(message.path);
      return;
    case "changes":
      views?.heard(message.changes);
      return;
    case "answer":
    case "failed":
      asking.answered(message);
      return;
    case "ask": {
      const { id } = message;
      if (!views) {
        say({ id, kind: "failed", message: "the views thread is not started" });
        return;
      }
      views.answer(message).then(
        (answer) => say({ ...answer, id, kind: "answer" }),
        (error: unknown) =>
          say({
            id,
            kind: "failed",
            message: error instanceof Error ? error.message : String(error),
          })
      );
      return;
    }
    default:
      unhandled("message", message);
  }
};
