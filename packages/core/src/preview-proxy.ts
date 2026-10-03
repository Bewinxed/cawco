import type { Server, WebSocketHandler } from "bun";

// The DOM ambient declaration hides Bun's headers-and-protocols overload.
const ProxyWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

const HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export function proxyHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of (headers.get("connection") ?? "").split(",")) {
    if (name.trim()) {
      headers.delete(name.trim());
    }
  }
  for (const name of HOP_HEADERS) {
    headers.delete(name);
  }
  return headers;
}

export interface PreviewSocket {
  closed: boolean;
  headers: Headers;
  pending: (string | Uint8Array<ArrayBuffer>)[];
  protocol: string;
  upstream?: WebSocket;
  url: string;
}

export function upgradePreview(
  request: Request,
  server: Server<PreviewSocket>,
  url: string,
  headers: Headers
): boolean {
  const protocol =
    request.headers.get("sec-websocket-protocol")?.split(",")[0]?.trim() ?? "";
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
    "host",
  ]) {
    headers.delete(name);
  }
  return server.upgrade(request, {
    headers: protocol ? { "sec-websocket-protocol": protocol } : undefined,
    data: { url, protocol, headers, pending: [], closed: false },
  });
}

/**
 * The close code a socket is allowed to send onward. 1005/1006/1015 (and 1004)
 * are reserved for the runtime to report, not for a peer to send, so a close
 * that arrived with one of them goes on as a plain 1000; the same for anything
 * outside the ranges the protocol defines.
 */
const sendable = (code: number): number =>
  (code >= 1000 && code <= 1013 && ![1004, 1005, 1006].includes(code)) ||
  (code >= 3000 && code <= 4999)
    ? code
    : 1000;

export const previewWebSocket: WebSocketHandler<PreviewSocket> = {
  open(socket) {
    const { data } = socket;
    const upstream = new ProxyWebSocket(data.url, {
      protocols: data.protocol ? [data.protocol] : [],
      headers: Object.fromEntries(data.headers),
    });
    data.upstream = upstream;
    upstream.binaryType = "arraybuffer";
    upstream.onopen = () => {
      if (data.closed) {
        upstream.close();
        return;
      }
      for (const message of data.pending) {
        upstream.send(message);
      }
      data.pending.length = 0;
    };
    upstream.onmessage = (event) => {
      if (!data.closed) {
        socket.send(event.data);
      }
    };
    // The app's own close code and reason travel through: a client that
    // reconnects on a `restart` code must not be told 1000 instead.
    upstream.onclose = (event) =>
      socket.close(sendable(event.code), event.reason);
    upstream.onerror = () => socket.close(1011, "Preview connection failed");
  },
  message(socket, message) {
    const { upstream, pending } = socket.data;
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(message);
    } else if (upstream?.readyState === WebSocket.CONNECTING) {
      pending.push(message);
    }
  },
  close(socket, code, reason) {
    socket.data.closed = true;
    socket.data.pending.length = 0;
    socket.data.upstream?.close(sendable(code), reason);
  },
};
