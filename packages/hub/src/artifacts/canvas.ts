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
 * the request. The tool waits {@link CANVAS_LIMITS.convertMs} for it. A
 * canvas no screen shows is drawn by the hub machine's own headless screen
 * (service `draw`): the published Excalidraw does not load outside a browser
 * (`window is not defined` as its module loads), and Mermaid renders SVG.
 */

import {
  CANVAS_LIMITS,
  type CanvasEntry,
  type CanvasRequestKind,
  type CanvasRequestPayload,
  type CanvasRequestResult,
  keptOnRemake,
  NO_SCREEN,
} from "@cawco/core/canvas";
import { docMeta, setMeta } from "@cawco/core/doc-meta";
import { boundedRead } from "@cawco/core/effect/bounded";
import { lookUntil } from "@cawco/core/effect/poll";
import { secondsOf } from "@cawco/core/time";
import { injectOverlay } from "@cawco/preview/proxy";
import { DateTime, Deferred, Duration, Effect } from "effect";
import { problem } from "elysia";
import { problemResponse } from "elysia/error";
import { Map as YMap } from "yjs";
import { z } from "zod";
import { CANVAS_ASSETS, canvasHostFile, canvasHostPage } from "../canvas-host";
import { elementIdOf, elementsOf } from "./doc-parts";
import type { ArtifactDocs } from "./docs";

/**
 * A canvas's host page, served by the hub as a page is: the page with the
 * overlay, carrying the canvas's doc and kind so it draws before it joins;
 * its bundle and fonts under `/canvas/`. `embed`: a decision page's Canvas
 * shows it (`?embed=1`), so its overlay runs inside that page's frame, joins
 * the canvas's doc as no screen, and the page draws it read-only.
 */
export async function serveCanvas(
  artifactId: string,
  pathname: string,
  seed: (artifactId: string) => { maps: string; state: string },
  embed = false
): Promise<Response> {
  if (pathname === "/") {
    return new Response(
      injectOverlay(await canvasHostPage(), {
        artifact: artifactId,
        kind: "canvas",
        ...seed(artifactId),
        ...(embed ? { embed: "1" } : {}),
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
  return (
    file ??
    problemResponse({ status: 404, code: "not-found", detail: "Not found" })
  );
}

const AUTHOR = z.enum(["person", "agent"]);
const BINDING = z.object({ elementId: z.string() }).nullable().optional();

/**
 * An entry of a canvas's `elements` as its map holds it (core
 * `CanvasEntry`), the element loose: it keeps every field Excalidraw gave
 * it, for the `.excalidraw` file.
 */
const CANVAS_ENTRY = z.looseObject({
  at: z.string().optional(),
  by: AUTHOR.optional(),
  el: z.looseObject({
    boundElements: z
      .array(z.object({ id: z.string(), type: z.string() }))
      .nullable()
      .optional(),
    containerId: z.string().nullable().optional(),
    customData: z.record(z.string(), z.unknown()).nullable().optional(),
    endBinding: BINDING,
    groupIds: z.array(z.string()).optional(),
    height: z.number(),
    id: z.string(),
    isDeleted: z.boolean().optional(),
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
    startBinding: BINDING,
    text: z.string().optional(),
    type: z.string(),
    width: z.number(),
    x: z.number(),
    y: z.number(),
  }),
  made: AUTHOR.optional(),
  pos: z.string(),
}) satisfies z.ZodType<CanvasEntry>;

/** What a screen writes on a request it converted (core `CanvasRequestResult`). */
const REQUEST_RESULT = z.union([
  z.object({ ids: z.array(z.string()) }),
  z.object({ error: z.string() }),
]) satisfies z.ZodType<CanvasRequestResult>;

/** The canvas's elements as their entries hold them, in scene order: an entry that does not read as one is left out. */
export const canvasEntries = (
  docs: ArtifactDocs,
  artifactId: string
): CanvasEntry[] =>
  elementsOf(docs.doc(artifactId))
    .toArray()
    .flatMap((map) => {
      const entry = CANVAS_ENTRY.safeParse(map.toJSON());
      return entry.success ? [entry.data] : [];
    })
    .sort((a, b) => {
      if (a.pos === b.pos) {
        return 0;
      }
      return a.pos > b.pos ? 1 : -1;
    });

/** Waits until a screen has joined the canvas, at most `ms`; whether one has. */
export const screenJoined = (
  docs: ArtifactDocs,
  artifactId: string,
  ms: number
): Effect.Effect<boolean> =>
  lookUntil(
    { every: 100, deadlineMs: ms, until: (joined: boolean) => joined },
    Effect.sync(() => docs.screens(artifactId) > 0)
  ).pipe(Effect.map((looked) => looked.kind === "found"));

/**
 * The agent's write changed the scene now (`meta.wroteAt`): the
 * picture is owed until a screen posts one after it. Stamped by the hub's
 * service only when the write changed what the canvas shows (its
 * `sceneWritten`), as a screen posts no new picture for a scene that looks
 * the same.
 */
export const stampWrote = (docs: ArtifactDocs, artifactId: string): void =>
  docs.transact(artifactId, "hub", (doc) =>
    setMeta(doc, "wroteAt", new Date().toISOString())
  );

/**
 * Whether the canvas's picture shows the agent's last write: no write
 * stamped, a picture posted at or after it, or no picture of a canvas that
 * holds nothing (a screen posts none for an empty scene).
 */
export const pictureShowsWrite = (
  docs: ArtifactDocs,
  artifactId: string
): boolean => {
  const meta = docMeta(docs.doc(artifactId));
  const wrote = meta.get("wroteAt");
  const at = meta.get("pictureAt");
  if (!wrote) {
    return true;
  }
  return at
    ? at >= wrote
    : canvasEntries(docs, artifactId).every((entry) => entry.el.isDeleted);
};

/** What can be watched for a change: a Yjs type. */
interface Observed {
  observe: (listener: () => void) => void;
  unobserve: (listener: () => void) => void;
}

/**
 * What `answer` reads once `target` changes and it reads something: the
 * first answer after the wait starts. Its observer is removed however the
 * wait ends: answered, or let go.
 */
const heardOn = Effect.fnUntraced(function* <A>(
  target: Observed,
  answer: () => A | undefined
): Effect.fn.Return<A> {
  const answered = yield* Deferred.make<A>();
  const listener = () => {
    const value = answer();
    if (value !== undefined) {
      Deferred.doneUnsafe(answered, Effect.succeed(value));
    }
  };
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => target.observe(listener)),
    () => Deferred.await(answered),
    () => Effect.sync(() => target.unobserve(listener))
  );
});

/**
 * Waits for the picture owed after the agent's last write, from whichever
 * screen draws it (a person's, or the hub machine's headless one), until
 * `screenHoldMs` after that write: the hold the headless screen keeps for
 * the same picture. Whether the picture shows the write once it returns.
 */
export const pictureOfWrite = Effect.fnUntraced(function* (
  docs: ArtifactDocs,
  artifactId: string
): Effect.fn.Return<boolean> {
  if (pictureShowsWrite(docs, artifactId)) {
    return true;
  }
  const meta = docMeta(docs.doc(artifactId));
  const wroteAt = meta.get("wroteAt");
  // No write: the picture shows it ({@link pictureShowsWrite}).
  if (!wroteAt) {
    return true;
  }
  const held = DateTime.add(DateTime.makeUnsafe(wroteAt), {
    milliseconds: CANVAS_LIMITS.screenHoldMs,
  });
  const left = Duration.toMillis(DateTime.distance(yield* DateTime.now, held));
  if (left <= 0) {
    return false;
  }
  return yield* boundedRead(
    left,
    heardOn(meta, () =>
      pictureShowsWrite(docs, artifactId) ? true : undefined
    )
  ).pipe(Effect.catchTag("Unanswered", () => Effect.succeed(false)));
});

/** The refusal of a write no screen could convert, or that the hub refused before any did: why, in words a session acts on. */
export const unconverted = (why: string) =>
  problem(422, {
    code: "artifact-canvas-unconverted",
    detail: `The canvas wasn't changed: ${why} Fix it, then try again.`,
  });

/**
 * Hands the agent's write to a screen and waits for it: the ids it wrote.
 * Refused with {@link NO_SCREEN} when the screen it was handed to has left,
 * when none takes it in time, or with the screen's own word when it could
 * not convert. The request leaves the doc however the wait ends.
 */
export const convertOnScreen = Effect.fnUntraced(function* (
  docs: ArtifactDocs,
  artifactId: string,
  kind: CanvasRequestKind,
  payload: CanvasRequestPayload
) {
  if (docs.screens(artifactId) === 0) {
    return problem(503, {
      code: "artifact-canvas-no-screen",
      detail: NO_SCREEN,
    });
  }
  const id = crypto.randomUUID();
  const doc = docs.doc(artifactId);
  const requests = doc.getMap<YMap<unknown>>("requests");
  // Integrated in place by the write below: the request the doc holds.
  const request = new YMap<unknown>();
  docs.transact(artifactId, "agent", () => {
    request.set("id", id);
    request.set("kind", kind);
    request.set("payload", payload);
    request.set("at", new Date().toISOString());
    requests.set(id, request);
  });
  return yield* boundedRead(
    CANVAS_LIMITS.convertMs,
    heardOn(request, () => {
      const value = REQUEST_RESULT.safeParse(request.get("result"));
      return value.success ? value.data : undefined;
    })
  ).pipe(
    Effect.map((result) =>
      "error" in result ? unconverted(result.error) : result.ids
    ),
    Effect.catchTag("Unanswered", (unanswered) =>
      Effect.succeed(
        problem(504, {
          code: "artifact-canvas-undrawn",
          detail: `The canvas wasn't changed: no screen drew it within ${secondsOf(unanswered.after)} s. Try again.`,
        })
      )
    ),
    Effect.ensuring(
      Effect.sync(() => {
        docs.transact(artifactId, "hub", () => requests.delete(id));
      })
    )
  );
});

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
    elements.toArray().flatMap((map) => elementIdOf(map) ?? [])
  );
  const deleted: string[] = [];
  docs.transact(artifactId, "agent", () => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const el = elements.get(index).get("el");
      if (!(typeof el === "object" && el !== null && "id" in el)) {
        continue;
      }
      const { id } = el;
      const containerId = "containerId" in el ? el.containerId : null;
      if (
        typeof id === "string" &&
        (asked.has(id) ||
          (typeof containerId === "string" && asked.has(containerId)))
      ) {
        elements.delete(index, 1);
        deleted.push(id);
      }
    }
  });
  return {
    deleted: deleted.reverse(),
    missing: ids.filter((id) => !present.has(id)),
  };
};

/**
 * A canvas made again with nothing to draw: its drawing deleted on the hub,
 * every element but those {@link keptOnRemake} (what the person made). A create that draws replaces it on its screen, in the write.
 */
export const clearDrawing = (docs: ArtifactDocs, artifactId: string): void => {
  const drawing = canvasEntries(docs, artifactId)
    .filter((entry) => !keptOnRemake(entry))
    .map((entry) => entry.el.id);
  if (drawing.length > 0) {
    deleteElements(docs, artifactId, drawing);
  }
};
