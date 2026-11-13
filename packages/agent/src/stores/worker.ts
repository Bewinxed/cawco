/**
 * The agent's stores thread: the SQLite files it reads or writes (OpenCode's
 * databases, the usage store) and the reads that feed them, off the loop.
 * The loop asks through stores/client.ts. The transcript search index is not
 * here: it runs in a process of its own, which a query past its limit ends
 * (search/process.ts), so no read here waits behind one.
 *
 * Asks run as they arrive, each to its end or its next await: the usage scan
 * takes turns between its parts, so a read the loop asks meanwhile answers
 * between them.
 */
import {
  type StoreAnswer,
  type StoreArg,
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

const runOp = <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>,
  tell: Tell
): Promise<StoreAnswer<K>> => storeOps[op](arg, tell);

self.onmessage = async (event: MessageEvent<StoreAsk>) => {
  const { id, op, arg } = event.data;
  try {
    const value = await runOp(op, arg, (told) =>
      say({ id, kind: "told", value: told })
    );
    say({ id, kind: "answer", value });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;
    say({
      id,
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
      ...(typeof code === "string" ? { code } : {}),
    });
  }
};
