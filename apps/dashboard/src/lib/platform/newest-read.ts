/**
 * Reads of one thing where only the newest one's answer is kept: each
 * `next()` starts a read, and what it answers says whether that read is
 * still the newest when its answer comes. A write whose answer stands for
 * the thing calls `next()` too, so a read started before it is dropped.
 */
export interface NewestRead {
  next: () => () => boolean;
}

export function newestRead(): NewestRead {
  let reads = 0;
  return {
    next: () => {
      reads += 1;
      const mine = reads;
      return () => mine === reads;
    },
  };
}
