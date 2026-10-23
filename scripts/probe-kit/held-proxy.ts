/**
 * An HTTPS proxy a scratch hub reaches the internet through
 * (`HTTPS_PROXY`), standing for a slow release host: while held, every
 * tunnel to a host `holds` names, open now or opened later, keeps what the
 * far end sends and passes none of it on; let go, each passes on what it
 * kept and carries on. Only the hosts named: an archive's download held so
 * is a release host slow to send it, while the release's pages and API (its
 * redirect to the asset) answer as they do. Holding those too held GitHub's
 * redirect past its keep-alive, which then closed the connection under the
 * held answer (ssh-forward-download (b), 2026-10-23).
 *
 * It counts what each host sent back through it, so a spec reads how many
 * copies of a download the hub drew (TLS hides the requests themselves).
 *
 * Each CONNECT goes on through the proxy this process itself was given
 * (`https_proxy`, `HTTPS_PROXY`: a workspace boundary's), else straight to
 * its host.
 */
import net from "node:net";

export interface HeldProxy {
  /** The bytes each `host:port` has sent back through the proxy so far, in all its tunnels. */
  carried: () => Record<string, number>;
  /** Each far end that closed: its `host:port`, when (ms since the proxy started), whether it was held then, and what it had sent. */
  closes: () => { at: number; bytes: number; held: boolean; target: string }[];
  /** Holds every tunnel's answer from now (true), or lets each go on (false). */
  hold: (held: boolean) => void;
  stop: () => void;
  /** The `host:port` each tunnel was asked for, in order. */
  targets: () => string[];
  url: string;
}

interface Tunnel {
  /** What its far end has sent. */
  bytes: number;
  client: net.Socket;
  /** The far end closed while its bytes were held: the client is ended once they are passed on. */
  farGone: boolean;
  kept: Buffer[];
  target: string;
}

/** Where this process itself goes out: its own proxy's host and port, if it has one. */
const upstreamProxy = (): { host: string; port: number } | undefined => {
  const said = process.env.https_proxy ?? process.env.HTTPS_PROXY;
  if (!said) {
    return;
  }
  const url = new URL(said);
  return { host: url.hostname, port: Number(url.port || 80) };
};

export async function heldProxy(
  holds: (target: string) => boolean
): Promise<HeldProxy> {
  const tunnels = new Set<Tunnel>();
  const targets: string[] = [];
  const carried = new Map<string, number>();
  const closes: { at: number; bytes: number; held: boolean; target: string }[] =
    [];
  const started = Date.now();
  let held = false;
  const upstream = upstreamProxy();

  /** The far end's bytes to the client: kept while held, else passed on. */
  const toClient = (tunnel: Tunnel, chunk: Buffer) => {
    carried.set(
      tunnel.target,
      (carried.get(tunnel.target) ?? 0) + chunk.length
    );
    tunnel.bytes += chunk.length;
    if (held && holds(tunnel.target)) {
      tunnel.kept.push(chunk);
      return;
    }
    tunnel.client.write(chunk);
  };

  const server = net.createServer((client) => {
    client.once("data", (head: Buffer) => {
      const text = head.toString("latin1");
      const end = text.indexOf("\r\n\r\n");
      const [method, target = ""] = (text.split("\r\n")[0] ?? "").split(" ");
      if (method !== "CONNECT" || end < 0) {
        client.end("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
        return;
      }
      targets.push(target);
      const at = target.lastIndexOf(":");
      const tunnel: Tunnel = {
        bytes: 0,
        client,
        farGone: false,
        kept: [],
        target,
      };
      tunnels.add(tunnel);
      const rest = head.subarray(
        Buffer.byteLength(text.slice(0, end + 4), "latin1")
      );
      const far = upstream
        ? net.connect(upstream.port, upstream.host)
        : net.connect(Number(target.slice(at + 1)), target.slice(0, at));
      const close = () => {
        tunnels.delete(tunnel);
        far.destroy();
        client.destroy();
      };
      // A far end that closes while held (a proxy before it cuts a tunnel
      // that has carried nothing for a while) leaves what it sent to be
      // passed on: the client hears the close only after those bytes.
      const farClosed = () => {
        if (!tunnel.farGone) {
          closes.push({
            at: Date.now() - started,
            bytes: tunnel.bytes,
            held,
            target,
          });
        }
        if ((held && holds(target)) || tunnel.kept.length > 0) {
          tunnel.farGone = true;
          return;
        }
        close();
      };
      far.on("error", farClosed);
      client.on("error", close);
      far.on("close", farClosed);
      client.on("close", close);
      const carry = () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (rest.length > 0) {
          far.write(rest);
        }
        far.on("data", (chunk: Buffer) => toClient(tunnel, chunk));
        client.on("data", (chunk: Buffer) => far.write(chunk));
      };
      if (!upstream) {
        far.on("connect", carry);
        return;
      }
      // Through this process's own proxy: its CONNECT answered first.
      far.on("connect", () =>
        far.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)
      );
      let answer = Buffer.alloc(0);
      const answered = (chunk: Buffer) => {
        answer = Buffer.concat([answer, chunk]);
        const split = answer.indexOf("\r\n\r\n");
        if (split < 0) {
          return;
        }
        far.off("data", answered);
        if (!answer.subarray(0, split).toString("latin1").includes(" 200")) {
          client.end(answer.subarray(0, split + 4));
          return;
        }
        carry();
        const early = answer.subarray(split + 4);
        if (early.length > 0) {
          toClient(tunnel, early);
        }
      };
      far.on("data", answered);
    });
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as net.AddressInfo).port)
    );
  });
  return {
    carried: () => Object.fromEntries(carried),
    closes: () => [...closes],
    hold: (next) => {
      held = next;
      if (next) {
        return;
      }
      for (const tunnel of tunnels) {
        for (const chunk of tunnel.kept.splice(0)) {
          tunnel.client.write(chunk);
        }
        if (tunnel.farGone) {
          tunnels.delete(tunnel);
          tunnel.client.end();
        }
      }
    },
    stop: () => {
      for (const tunnel of tunnels) {
        tunnel.client.destroy();
      }
      server.close();
    },
    targets: () => [...targets],
    url: `http://127.0.0.1:${port}`,
  };
}
