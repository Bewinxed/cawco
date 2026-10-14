/**
 * The atomic-writes spec's writer: writes the record at `file` 1000 times,
 * each a JSON value naming its round with a body of `bytes` characters,
 * through core `writeStateFile` (`atomic`), or in place in 16 KB pieces as a
 * streaming writer does (`plain`, the control). Prints one line once the
 * first record is whole, then keeps writing until it is killed or done.
 *
 *   bun scripts/probe-kit/atomic-writer.ts <file> atomic|plain <bytes>
 */
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { writeStateFile } from "../../packages/core/src/state-file";

const PIECE = 16 * 1024;

/** The record written over the file where it stands, a piece at a time. */
const writeInPlace = async (path: string, text: string): Promise<void> => {
  const handle = await open(path, "w");
  try {
    const bytes = Buffer.from(text);
    for (let at = 0; at < bytes.length; at += PIECE) {
      // biome-ignore lint/performance/noAwaitInLoops: the pieces in order, as a stream writes them
      await handle.write(bytes, at, Math.min(PIECE, bytes.length - at));
    }
  } finally {
    await handle.close();
  }
};

const [file, how, bytes] = process.argv.slice(2);
if (!(file && (how === "atomic" || how === "plain") && bytes)) {
  console.error("usage: atomic-writer.ts <file> atomic|plain <bytes>");
  process.exit(2);
}
await mkdir(dirname(file), { recursive: true });
const write = how === "atomic" ? writeStateFile : writeInPlace;
for (let round = 0; round < 1000; round += 1) {
  const body = String.fromCharCode(97 + (round % 26)).repeat(Number(bytes));
  // biome-ignore lint/performance/noAwaitInLoops: one record over the last, as a keeper of state writes it
  await write(file, JSON.stringify({ round, body }));
  if (round === 0) {
    console.log("under way");
  }
}
