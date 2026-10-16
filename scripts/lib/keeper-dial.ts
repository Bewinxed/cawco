import type { Bounded } from "../../packages/core/src/bounded";

/**
 * A probe's connection to a keeper (`SessiondClient.connect`'s answer): the
 * welcomed client, or the probe fails saying the keeper at `endpoint` gave no
 * welcome in time, or ended before it.
 */
export const welcomed = <C>(endpoint: string, read: Bounded<C>): C => {
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        read.reason === "timeout"
          ? `the keeper at ${endpoint} gave no welcome within ${read.after} ms`
          : `the keeper at ${endpoint} ended before its welcome`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};
