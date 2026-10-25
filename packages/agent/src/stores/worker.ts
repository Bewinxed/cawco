/**
 * The agent's stores thread: every SQLite file it reads or writes (OpenCode's
 * databases, the transcript search index, the usage store) and the reads
 * that feed them, off the loop. The loop asks through stores/client.ts.
 *
 * Asks run as they arrive, each to its end or its next await: the search
 * index's sync and the usage scan take turns between their parts, so a read
 * the loop asks meanwhile answers between them.
 */
import {
  type StoreAsk,
  type StoreOp,
  type StoreSaid,
  storeOps,
  type Tell,
} from "./ops";

declare const self: Worker;

const say = (said: StoreSaid): void => {
  self.postMessage(said);
};

self.onmessage = async (event: MessageEvent<StoreAsk>) => {
  const { id, op, arg } = event.data;
  const run = storeOps[op as StoreOp] as (
    arg: unknown,
    tell: Tell
  ) => Promise<unknown>;
  try {
    const value = await run(arg, (told) =>
      say({ id, kind: "told", value: told })
    );
    say({ id, kind: "answer", value });
  } catch (error) {
    const { code } = error as { code?: unknown };
    say({
      id,
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
      ...(typeof code === "string" ? { code } : {}),
    });
  }
};
