import { detach } from "@cawco/core/detach";

/**
 * Work run in turns by key: a call waits for every call before it under the
 * same key to end, however it ended, then runs; calls under different keys
 * run at once. A key is let go once nothing waits behind it.
 */
export const keyedTurns = (what: string) => {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => undefined);
    tails.set(key, tail);
    detach(
      tail.then(() => {
        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      }),
      `${what} turn cleanup`
    );
    return next;
  };
};
