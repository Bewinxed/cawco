/**
 * `boundary-log.ts PORT TOKEN ARGV…`: what a macOS workspace's `log` shim
 * runs inside the boundary. Seatbelt refuses `log` there, so this asks the
 * agent's log relay (`log-relay.ts`) to run `log show` or `log stream` outside
 * it, and passes the output and the exit status through. Any other `log` is
 * refused here with one line, before it is asked; the agent checks again.
 *
 * Like `boundary-judge.ts`, a plain script on Bun that the agent writes into
 * the workspace's state dir: it imports only Bun's and node's built-ins and
 * the protocol beside it.
 */
import {
  LOG_FRAME,
  LOG_FRAME_HEADER,
  logRefusal,
} from "./boundary-log-protocol";

const [port, token, ...argv] = process.argv.slice(2);
if (!(port && token)) {
  console.error("cawco: the log shim was written without the agent's address");
  process.exit(1);
}
const why = logRefusal(argv);
if (why) {
  console.error(why);
  process.exit(64);
}

// A reader that went away (`log stream | head`) ends this, and with it the `log` outside.
process.stdout.on("error", () => process.exit(141));
const write = (stream: NodeJS.WriteStream, chunk: Uint8Array): Promise<void> =>
  new Promise((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()));
  });

let response: Response;
try {
  response = await fetch(`http://127.0.0.1:${port}/log`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ argv }),
    // `log stream` may say nothing for a long while.
    timeout: false,
  });
} catch (error) {
  console.error(
    `cawco: log runs through the cawco agent outside the workspace boundary, and the agent did not answer: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
if (!(response.ok && response.body)) {
  console.error(
    `cawco: the cawco agent refused this log request (${response.status}): ${(await response.text()).trim()}`
  );
  process.exit(1);
}

let pending = new Uint8Array(0);
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  const joined = new Uint8Array(pending.byteLength + chunk.byteLength);
  joined.set(pending);
  joined.set(chunk, pending.byteLength);
  let offset = 0;
  while (joined.byteLength - offset >= LOG_FRAME_HEADER) {
    const view = new DataView(joined.buffer, offset);
    const kind = view.getUint8(0);
    const length = view.getUint32(1);
    if (joined.byteLength - offset - LOG_FRAME_HEADER < length) {
      break;
    }
    const data = joined.subarray(
      offset + LOG_FRAME_HEADER,
      offset + LOG_FRAME_HEADER + length
    );
    offset += LOG_FRAME_HEADER + length;
    if (kind === LOG_FRAME.exit) {
      process.exit(Number.parseInt(decoder.decode(data), 10));
    }
    // biome-ignore lint/performance/noAwaitInLoops: output keeps its order, and a slow reader slows the log
    await write(
      kind === LOG_FRAME.stderr ? process.stderr : process.stdout,
      data
    );
  }
  pending = joined.slice(offset);
}
console.error("cawco: the cawco agent stopped answering before log finished");
process.exit(1);
