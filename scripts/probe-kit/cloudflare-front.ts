/**
 * A Cloudflare-like front for a scratch fleet's ports: the proxy the owner's
 * names stand behind (preview-socket's port and host legs, project-origin's
 * dashboard and host-mode names), and the certificate its https answers
 * carry.
 */
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
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
 * `ignoreHTTPSErrors`). `forwardedHost`: it names `target` by its own
 * address in `Host` and says the browser's in `X-Forwarded-Host`, as a proxy
 * that rewrites the Host does: what the dashboard's server reads its own
 * origin from (public-origin.js), and what lets a `vite preview` of it, which
 * refuses a Host it doesn't know with a 403 ("Blocked request. This host
 * (…) is not allowed"), answer a name of the run's own. The hub's preview
 * names never take it: the hub routes them by their Host. `hostname`: the
 * address it listens on, the machine's every address for a browser in a
 * container (artifact-browse).
 */
export const cloudflareTo = (
  target: string,
  tls?: { cert: string; key: string },
  forwardedHost = false,
  hostname = "127.0.0.1"
) =>
  Bun.serve<{
    backend: WebSocket;
    queue: (string | Uint8Array<ArrayBuffer>)[];
  }>({
    hostname,
    port: 0,
    ...(tls ? { tls } : {}),
    fetch(request, bun) {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(CLOUDFLARE)) {
        headers.set(name, value);
      }
      if (forwardedHost) {
        headers.set("x-forwarded-host", request.headers.get("host") ?? "");
        headers.set("host", target);
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
 * The owner's outpost proxy in front of a dashboard at `target`
 * (`host:port`), as `~/.outpost/tunnel-proxy.ts` forwards behind his
 * Cloudflare tunnel (outpost.bewinxed.com → :3220 → :3455), less its Access
 * check: HTTP with every header of the browser's, `X-Forwarded-Host` the
 * browser's host, `X-Forwarded-Proto: https`, `Host` the dashboard's; a
 * WebSocket opened to the dashboard with those two and the browser's
 * `Origin` and `Cookie` alone, upgraded on the browser's side before the
 * dashboard's answers, and its frames pumped both ways. With `tls` it
 * answers https, as Cloudflare's edge does.
 */
export const outpostTo = (
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
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const headers: Record<string, string> = {
          "x-forwarded-host": url.host,
          "x-forwarded-proto": "https",
        };
        for (const name of ["origin", "cookie"]) {
          const value = request.headers.get(name);
          if (value) {
            headers[name] = value;
          }
        }
        const backend = new SocketWith(
          `ws://${target}${url.pathname}${url.search}`,
          { headers }
        );
        if (bun.upgrade(request, { data: { backend, queue: [] } })) {
          return;
        }
        backend.close();
        return new Response("upgrade failed", { status: 500 });
      }
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-host", url.host);
      headers.set("x-forwarded-proto", "https");
      headers.set("host", target);
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
 * This process's one key for the certificates it makes ({@link
 * scratchCertificate}), made once as it is first asked for. A browser the
 * kit launches trusts it ({@link scratchKeySpki}).
 */
let scratchKey: KeyObject | undefined;
const keyOfRun = (): KeyObject => {
  scratchKey ??= generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  return scratchKey;
};

/**
 * The SHA-256 of {@link keyOfRun}'s public key, base64: what the kit's
 * Chromium is launched with (`--ignore-certificate-errors-spki-list`), so a
 * certificate this run made is a valid one there, as the hub's tailnet
 * certificate and Cloudflare's edge are to the owner's browser.
 *
 * Accepted only past `ignoreHTTPSErrors`, the answer carried its error, and
 * Chromium keeps no answer with a certificate error in its HTTP cache
 * (net/http/http_cache_transaction.cc: "Do not cache content with cert
 * errors", `if (IsCertStatusError(response.ssl_info.cert_status) || …)
 * StopCachingImpl`). Every frame of a decision page then fetched each
 * address its page shares (a canvas's entry, runtime, sheet, Vite's
 * client, the faces) one frame after another through the cache's lock, a
 * hop apart: canvas-parallel's page of five painted its last at 3.3 s where
 * the same page with its answers cached paints it at 2.0 s.
 */
export const scratchKeySpki = (): string =>
  createHash("sha256")
    .update(createPublicKey(keyOfRun()).export({ type: "spki", format: "der" }))
    .digest("base64");

/**
 * A certificate for `names` (SHA-256, the names as SANs, a day), made in
 * `dir` on this run's key ({@link keyOfRun}): what {@link cloudflareTo}
 * answers https with, and the kit's Chromium trusts.
 */
export async function scratchCertificate(
  dir: string,
  names: string[]
): Promise<{ cert: string; key: string }> {
  const cert = `${dir}/front.pem`;
  const key = `${dir}/front.key`;
  const keyPem = keyOfRun().export({ type: "pkcs8", format: "pem" }).toString();
  await Bun.write(key, keyPem);
  const san = `subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`;
  await $`openssl req -x509 -key ${key} -nodes -sha256 -days 1 -out ${cert} -subj /CN=${names[0] ?? "localhost"} -addext ${san}`.quiet();
  return { cert: await Bun.file(cert).text(), key: keyPem };
}
