/**
 * A canvas on the hub (Projects spec §5.10, D24–D25): its host page served
 * at its root, and the agent's writes handed to a screen to convert.
 *
 * Conversion needs a DOM (Excalidraw measures text; Mermaid renders SVG),
 * so the hub never converts. A tool's write is a request in the doc's
 * `requests` (`{ id, kind, payload, at }`); every connected screen (a
 * canvas host page, its socket marked `?screen=1`) sees it and claims it,
 * the first claim the hub hears wins (sync.ts `holdClaims`), and the holder
 * converts, writes the elements (`by: "agent"`) and writes the result on
 * the request. The tool waits {@link CANVAS_LIMITS.convertMs} for it. With
 * no screen joined it is refused with {@link NO_SCREEN}: there is no other
 * path.
 */
import {
  CANVAS_LIMITS,
  type CanvasEntry,
  type CanvasRequestKind,
  type CanvasRequestResult,
  NO_SCREEN,
} from "@cawco/core/canvas";
import {
  CANVAS_ASSETS,
  canvasHostFile,
  canvasHostPage,
} from "@cawco/core/canvas-host";
import {
  injectOverlay,
  OVERLAY_PATH,
  overlayResponse,
} from "@cawco/core/preview-proxy";
import { Map as YMap } from "yjs";
import { type ArtifactDocs, elementsOf } from "./docs";
import { ArtifactRefusal } from "./service";

/**
 * A canvas's host page, served by the hub as a page is: the page with the
 * overlay, carrying the canvas's doc and kind so it draws before it joins;
 * its bundle and fonts under `/canvas/`.
 */
export async function serveCanvas(
  artifactId: string,
  pathname: string,
  state: (artifactId: string) => string
): Promise<Response> {
  if (pathname === OVERLAY_PATH) {
    return overlayResponse();
  }
  if (pathname === "/") {
    return new Response(
      injectOverlay(await canvasHostPage(), {
        artifact: artifactId,
        kind: "canvas",
        state: state(artifactId),
      }),
      {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        },
      }
    );
  }
  const file = pathname.startsWith(CANVAS_ASSETS)
    ? await canvasHostFile(pathname.slice(CANVAS_ASSETS.length))
    : null;
  return file ?? new Response("Not found", { status: 404 });
}

/** The canvas's elements as their entries hold them, in scene order. */
export const canvasEntries = (
  docs: ArtifactDocs,
  artifactId: string
): CanvasEntry[] =>
  elementsOf(docs.doc(artifactId))
    .toArray()
    .map((map) => map.toJSON() as CanvasEntry)
    .sort((a, b) => {
      if (a.pos === b.pos) {
        return 0;
      }
      return a.pos > b.pos ? 1 : -1;
    });

/** Waits until a screen has joined the canvas, at most `ms`; whether one has. */
export const screenJoined = async (
  docs: ArtifactDocs,
  artifactId: string,
  ms: number
): Promise<boolean> => {
  const until = Date.now() + ms;
  while (docs.screens(artifactId) === 0 && Date.now() < until) {
    // biome-ignore lint/performance/noAwaitInLoops: a bounded poll for a page to connect
    await Bun.sleep(100);
  }
  return docs.screens(artifactId) > 0;
};

/**
 * Hands the agent's write to a screen and waits for it: the ids it wrote.
 * Refused with {@link NO_SCREEN} when no screen is joined, when none takes
 * it in time, or with the screen's own word when it could not convert.
 */
export const convertOnScreen = async (
  docs: ArtifactDocs,
  artifactId: string,
  kind: CanvasRequestKind,
  payload: unknown
): Promise<string[]> => {
  if (docs.screens(artifactId) === 0) {
    throw new ArtifactRefusal(503, NO_SCREEN);
  }
  const id = crypto.randomUUID();
  const doc = docs.doc(artifactId);
  const requests = doc.getMap("requests") as YMap<YMap<unknown>>;
  docs.transact(artifactId, "agent", () => {
    const request = new YMap<unknown>();
    request.set("id", id);
    request.set("kind", kind);
    request.set("payload", payload);
    request.set("at", new Date().toISOString());
    requests.set(id, request);
  });
  const request = requests.get(id) as YMap<unknown>;
  let observer: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<CanvasRequestResult | null>((resolve) => {
      const answered = () => {
        const value = request.get("result") as CanvasRequestResult | undefined;
        if (value) {
          resolve(value);
        }
      };
      observer = answered;
      request.observe(answered);
      timer = setTimeout(() => resolve(null), CANVAS_LIMITS.convertMs);
    });
    if (!result) {
      throw new ArtifactRefusal(
        504,
        `The canvas wasn't changed: no screen drew it within ${CANVAS_LIMITS.convertMs / 1000} s. Open it on a dashboard (artifact_show), then try again.`
      );
    }
    if ("error" in result) {
      throw new ArtifactRefusal(
        422,
        `The canvas wasn't changed: ${result.error} Fix it, then try again.`
      );
    }
    return result.ids;
  } finally {
    clearTimeout(timer);
    if (observer) {
      request.unobserve(observer);
    }
    docs.transact(artifactId, "hub", () => requests.delete(id));
  }
};

/**
 * Deletes elements by id on the hub, with the labels bound inside them (no
 * screen needed: nothing is measured); the ids deleted, and those the
 * canvas does not hold.
 */
export const deleteElements = (
  docs: ArtifactDocs,
  artifactId: string,
  ids: readonly string[]
): { deleted: string[]; missing: string[] } => {
  const elements = elementsOf(docs.doc(artifactId));
  const asked = new Set(ids);
  const present = new Set(
    elements.toArray().map((map) => (map.get("el") as { id: string }).id)
  );
  const deleted: string[] = [];
  docs.transact(artifactId, "agent", () => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const el = elements.get(index).get("el") as {
        id: string;
        containerId?: string | null;
      };
      if (asked.has(el.id) || (el.containerId && asked.has(el.containerId))) {
        elements.delete(index, 1);
        deleted.push(el.id);
      }
    }
  });
  return {
    deleted: deleted.reverse(),
    missing: ids.filter((id) => !present.has(id)),
  };
};
