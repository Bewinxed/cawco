/**
 * A Cloudflare-like front for a scratch fleet's ports: the proxy the owner's
 * names stand behind (preview-socket's port and host legs, project-origin's
 * dashboard and host-mode names), and the certificate its https answers
 * carry.
 */
import { $ } from "bun";

const HOP = new Set([
  "connection",
  "upgrade",
  "keep-alive",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
]);
/** A WebSocket opened with headers of its own (Bun's client takes them). */
const SocketWith = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> }
) => WebSocket;

/** What Cloudflare adds to every request it sends on to an origin (developers.cloudflare.com/fundamentals/reference/http-headers). */
export const CLOUDFLARE = {
  "x-forwarded-proto": "https",
  "cf-visitor": '{"scheme":"https"}',
  "cf-connecting-ip": "203.0.113.7",
  "x-forwarded-for": "203.0.113.7",
  "cdn-loop": "cloudflare",
  "cf-ray": "8f00000000000000-AMS",
};

/**
 * A proxy in front of `target` (`host:port`) as Cloudflare stands in front
 * of the owner's names: the browser's Host and headers kept, Cloudflare's
 * added, a WebSocket carried both ways. With `tls` it answers https, as
 * Cloudflare's edge does (a certificate of the run's own,
 * {@link scratchCertificate}, which the page's context accepts with
 * `ignoreHTTPSErrors`).
 */
export const cloudflareTo = (
  target: string,
  tls?: { cert: string; key: string }
) =>
  Bun.serve<{
    backend: WebSocket;
    queue: (string | Uint8Array<ArrayBuffer>)[];
  }>({
    hostname: "127.0.0.1",
    port: 0,
    ...(tls ? { tls } : {}),
    fetch(request, bun) {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(CLOUDFLARE)) {
        headers.set(name, value);
      }
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const kept: Record<string, string> = {};
        for (const [name, value] of headers) {
          if (!HOP.has(name)) {
            kept[name] = value;
          }
        }
        const backend = new SocketWith(
          `ws://${target}${url.pathname}${url.search}`,
          { headers: kept }
        );
        if (bun.upgrade(request, { data: { backend, queue: [] } })) {
          return;
        }
        backend.close();
        return new Response("upgrade failed", { status: 500 });
      }
      return fetch(`http://${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        decompress: false,
      } as RequestInit);
    },
    websocket: {
      open(ws) {
        const { backend } = ws.data;
        backend.addEventListener("message", (event) => ws.send(event.data));
        backend.addEventListener("close", () => ws.close());
        backend.addEventListener("error", () => ws.close());
        backend.addEventListener("open", () => {
          for (const held of ws.data.queue) {
            backend.send(held);
          }
          ws.data.queue.length = 0;
        });
      },
      message(ws, said) {
        const { backend, queue } = ws.data;
        const message = typeof said === "string" ? said : new Uint8Array(said);
        if (backend.readyState === WebSocket.OPEN) {
          backend.send(message);
        } else if (backend.readyState === WebSocket.CONNECTING) {
          queue.push(message);
        }
      },
      close(ws) {
        ws.data.backend.close();
      },
    },
  });

/**
 * A self-signed certificate for `names` (RSA 2048, SHA-256, the names as
 * SANs, a day), made in `dir`: what {@link cloudflareTo} answers https with.
 */
export async function scratchCertificate(
  dir: string,
  names: string[]
): Promise<{ cert: string; key: string }> {
  const cert = `${dir}/front.pem`;
  const key = `${dir}/front.key`;
  const san = `subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`;
  await $`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -keyout ${key} -out ${cert} -subj /CN=${names[0] ?? "localhost"} -addext ${san}`.quiet();
  return { cert: await Bun.file(cert).text(), key: await Bun.file(key).text() };
}
