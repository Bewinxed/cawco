/**
 * A range of a file read whole, for a file that crosses in pieces (agent
 * inputs.ts, hub handed-inputs.ts): no more of it in memory than the range.
 */
import { open } from "node:fs/promises";

/**
 * Up to `length` bytes of the file at `path` from `at`: shorter only where
 * the file ends first, which its caller says in its own words.
 */
export const readRange = async (
  path: string,
  at: number,
  length: number
): Promise<Buffer> => {
  const range = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    let done = 0;
    while (done < length) {
      const { bytesRead } = await handle.read(
        range,
        done,
        length - done,
        at + done
      );
      if (bytesRead === 0) {
        return range.subarray(0, done);
      }
      done += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return range;
};
