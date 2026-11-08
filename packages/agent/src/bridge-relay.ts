import { BUN_SCRIPT_ENV, bunScriptRuntime } from "./bun-runtime";

/**
 * The relay, a bun program: it listens on the unix socket its first argument
 * names and carries each connection to 127.0.0.1 at the port its second
 * names, both ways, holding what a side can't take yet until it drains.
 * Every connection is its event loop's, so a canvas's burst of module
 * requests opens no process: socat with `fork` took one per connection (a
 * relay trace on obelisk: 300 GETs through the agent spawned 78 to 299).
 */
const RELAY = `
const [socket, port] = process.argv.slice(-2);
const send = (to, chunk) => {
  const held = to.data.held;
  if (held.length > 0) { held.push(Buffer.from(chunk)); return; }
  const wrote = to.write(chunk);
  if (wrote < chunk.byteLength) held.push(Buffer.from(chunk.subarray(wrote)));
};
const drain = (to) => {
  const held = to.data.held;
  while (held.length > 0) {
    const chunk = held[0];
    const wrote = to.write(chunk);
    if (wrote < chunk.byteLength) { held[0] = chunk.subarray(wrote); return; }
    held.shift();
  }
  if (to.data.ending) to.end();
};
const finish = (to) => {
  if (!to) return;
  if (to.data.held.length > 0) to.data.ending = true; else to.end();
};
Bun.listen({
  unix: socket,
  socket: {
    open(client) {
      client.data = { held: [], early: [], upstream: null, ending: false };
      Bun.connect({
        hostname: "127.0.0.1",
        port: Number(port),
        socket: {
          open(upstream) {
            upstream.data = { held: [], client, ending: false };
            client.data.upstream = upstream;
            for (const chunk of client.data.early) send(upstream, chunk);
            client.data.early = [];
          },
          data(upstream, chunk) { send(upstream.data.client, chunk); },
          drain,
          end(upstream) { finish(upstream.data.client); },
          close(upstream) { finish(upstream.data.client); },
          error(upstream) { finish(upstream.data.client); },
          connectError() { client.end(); },
        },
      }).catch(() => client.end());
    },
    data(client, chunk) {
      const { upstream } = client.data;
      if (upstream) send(upstream, chunk); else client.data.early.push(Buffer.from(chunk));
    },
    drain,
    end(client) { finish(client.data.upstream); },
    close(client) { finish(client.data.upstream); },
    error(client) { finish(client.data.upstream); },
  },
});
`;

/** The relay's own command on `socket` to `port`, and its environment: CawCo's bun (a binary install's runs as bun with `BUN_BE_BUN=1`). */
export const bridgeRelay = (
  socket: string,
  port: number
): { command: string[]; env: Record<string, string> } => ({
  command: [bunScriptRuntime(), "-e", RELAY, socket, String(port)],
  env: { ...BUN_SCRIPT_ENV },
});
