/**
 * The hub's routes for previews, on its own origin (the dashboard's, through
 * its `/api` and `/ws` relays): the fleet's preview mode (Settings ›
 * Previews, Caw's `admin_previews_*`), a session's preview origin (a canvas
 * asks it before it loads), and what the person's pane does with an
 * artifact's document. The pane is on the dashboard's origin and the page on
 * the preview's, so the pane joins the doc and sends here, never on the
 * preview origin.
 */
import type { ServerWebSocket } from "bun";
import { Elysia, t } from "elysia";
import type { ArtifactSocket } from "./artifacts/sync";
import {
  type PreviewListenerDeps,
  type PreviewListeners,
  PreviewRefusal,
} from "./preview";
import { mintTicket } from "./preview-access";

export const previewRoutes = (deps: {
  /** Whether the hub knows session `id`. */
  hasInstance: (id: string) => boolean;
  listener: PreviewListenerDeps;
  listeners: PreviewListeners;
  /** Every shown preview again, at its address now: the mode changed. */
  republish: () => void;
}) => {
  /** Each pane's doc socket, as the artifact sync code keeps one. */
  const panes = new Map<string, ServerWebSocket<ArtifactSocket>>();
  const refused = (error: unknown) => {
    if (error instanceof PreviewRefusal) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  };
  return (
    new Elysia()
      .get("/api/preview-settings", () => deps.listeners.settings())
      .put(
        "/api/preview-settings",
        {
          body: t.Object({
            mode: t.Union([t.Literal("port"), t.Literal("host")]),
            // A host name's 253, its scheme and a port.
            pattern: t.Optional(t.String({ maxLength: 270 })),
          }),
        },
        async ({ body }) => {
          try {
            const settings = await deps.listeners.set(body);
            deps.republish();
            return settings;
          } catch (error) {
            return refused(error);
          }
        }
      )
      // A session's preview origin, its listener started when it has none.
      .post("/api/instances/:id/preview-address", ({ params }) => {
        if (!deps.hasInstance(params.id)) {
          return new Response("No such session.", { status: 404 });
        }
        try {
          return deps.listeners.address(params.id);
        } catch (error) {
          return refused(error);
        }
      })
      // A ticket into a session's host-mode preview origin (preview-access.ts),
      // for the dashboard's pane and the app's web views: only a client this
      // API already trusts gets one (core browser-gate.ts refuses a page of
      // any other origin, a preview's above all).
      .post("/api/instances/:id/preview-ticket", ({ params }) => {
        if (!deps.hasInstance(params.id)) {
          return new Response("No such session.", { status: 404 });
        }
        if (deps.listeners.settings().mode !== "host") {
          return new Response(
            "Previews are reached by port on this hub, so they take no ticket.",
            { status: 409 }
          );
        }
        return mintTicket(params.id);
      })
      // The pane's Send picks, as the page's own send would.
      .post(
        "/api/instances/:id/artifacts/:artifact/send",
        ({ params, request }) =>
          deps.listener.ownerOf(params.artifact) === params.id
            ? deps.listener.send(request, params.id, params.artifact)
            : new Response("This session has no such artifact.", {
                status: 404,
              })
      )
      // The pane's link to the artifact's document (artifact-doc.ts).
      .ws("/ws/artifact/:instance/:artifact", {
        open(ws) {
          const { instance, artifact } = ws.params;
          if (deps.listener.ownerOf(artifact) !== instance) {
            ws.close(4404, "This session has no such artifact.");
            return;
          }
          const pane = {
            data: { artifactId: artifact, screen: false },
            send: (message: Uint8Array) => ws.send(message),
            close: (code?: number, reason?: string) => ws.close(code, reason),
          } as unknown as ServerWebSocket<ArtifactSocket>;
          panes.set(ws.id, pane);
          deps.listener.socket.open(pane);
        },
        message(ws, message) {
          const pane = panes.get(ws.id);
          if (pane) {
            deps.listener.socket.message(
              pane,
              message instanceof Uint8Array
                ? Buffer.from(message)
                : (message as string | Buffer)
            );
          }
        },
        close(ws) {
          const pane = panes.get(ws.id);
          panes.delete(ws.id);
          if (pane) {
            deps.listener.socket.close(pane);
          }
        },
      })
  );
};
