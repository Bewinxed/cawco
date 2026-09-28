import type { FramePayload, PreviewSource } from "@whiffle/core";
import {
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@whiffle/core/preview-proxy";
import { PREVIEW_PORT } from "./config";

/**
 * Each preview target maps an instance id to the daemon address and port that
 * serves its content. The dashboard routes `/preview/<id>/…` here via the
 * `x-whiffle-preview` header, so there is no per-browser limitation — every
 * tab can show a different preview simultaneously.
 *
 * A target is the operator's intent, and it outlives the listener: while its
 * machine is away `upstream` is absent, and the register that brings the
 * machine back starts the listener again and fills it in.
 */
export const previewTargets = new Map<
  string,
  {
    machineId: string;
    source: PreviewSource;
    upstream?: { address: string; port: number };
  }
>();

export function previewFrame(
  instanceId: string,
  state: "open" | "closed",
  source?: PreviewSource
): Extract<FramePayload, { kind: "preview" }> {
  return {
    kind: "preview",
    instanceId,
    state,
    path: `/preview/${encodeURIComponent(instanceId)}/`,
    source,
  };
}

export function startPreviewListener(hostname: string) {
  return Bun.serve<PreviewSocket>({
    hostname,
    port: PREVIEW_PORT,
    websocket: previewWebSocket,
    async fetch(request, server) {
      const instanceId = request.headers.get("x-whiffle-preview");
      const target = instanceId ? previewTargets.get(instanceId) : undefined;
      if (!target) {
        return new Response("No preview selected.", { status: 404 });
      }
      if (!target.upstream) {
        return new Response("Preview is restarting.", { status: 503 });
      }
      const url = new URL(request.url);
      const address = target.upstream.address.includes(":")
        ? `[${target.upstream.address}]`
        : target.upstream.address;
      const upstream = `${address}:${target.upstream.port}${url.pathname}${url.search}`;
      const headers = proxyHeaders(request.headers);
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return upgradePreview(request, server, `ws://${upstream}`, headers)
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }
      const response = await fetch(`http://${upstream}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
      const downstream = proxyHeaders(response.headers);
      // Same as the daemon hop: the body is already decoded here.
      if (downstream.has("content-encoding")) {
        downstream.delete("content-encoding");
        downstream.delete("content-length");
      }
      return new Response(response.body, {
        status: response.status,
        headers: downstream,
      });
    },
    error() {
      return new Response("Preview upstream unavailable", { status: 502 });
    },
  });
}
