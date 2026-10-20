/**
 * Files draws the pictures it lacks: a session's page that no pane has
 * taken a thumbnail of yet (made before Files kept them, or never shown in
 * a dashboard) is loaded unseen at its own address, `/__cawco/page/<id>/`
 * on the origin that serves it, its project's or its session's
 * (preview/page-source, as the Decisions
 * tab loads a page), whatever the session's panel shows. Its overlay is
 * greeted as every host greets it, asked for the same capture the pane asks
 * for (`cawco:capture`), and the hub keeps the picture (`keepThumbnail`);
 * the list is read again once the queue is done, so the cards take them.
 *
 * One page at a time, each tried once per tab, each given a bounded time:
 * a page that never answers stays its kind's glyph. Nothing here shows an
 * artifact or says it was seen: only the pane's own word marks a page
 * opened (hub `shown`). A preview or a component has no address of its own
 * and runs a server to be drawn, so it is drawn by the pane alone.
 */
import { type ArtifactSummary, projectPagePlace } from "@cawco/core";
import { theme } from "#lib/theme.svelte.js";
import { keepThumbnail } from "../artifact-api";
import { pageSource } from "../preview/page-source";
import { previewThumbnail } from "../preview/wire";
import { readArtifacts } from "./files.svelte";

/** How long a page's frame stands still after it says ready before it is drawn, as the pane waits. */
const SETTLE_MS = 1000;
/** The most one page is given, from its frame's load to its picture. Our call. */
const PAGE_MS = 15_000;
/** The frame's size: the pane's at a desk, so the picture is the page as it is read there. */
const FRAME = { width: 640, height: 800 };

/** Pages tried in this tab, drawn or not: never tried again. */
const tried = new Set<string>();
/** Each session's queue, while one runs. */
const running = new Set<string>();

/** One page drawn unseen; true when the hub kept its picture. */
async function drawPage(
  instanceId: string,
  artifact: ArtifactSummary
): Promise<boolean> {
  const found = await pageSource(
    artifact.project ? { project: artifact.project } : { instance: instanceId },
    projectPagePlace(artifact.id)
  );
  if ("problem" in found) {
    return false;
  }
  const frame = document.createElement("iframe");
  frame.title = "";
  frame.tabIndex = -1;
  frame.inert = true;
  frame.setAttribute("aria-hidden", "true");
  frame.dataset.filesDrawing = artifact.id;
  Object.assign(frame.style, {
    position: "fixed",
    insetInlineStart: "-10000px",
    insetBlockStart: "0",
    inlineSize: `${FRAME.width}px`,
    blockSize: `${FRAME.height}px`,
    border: "0",
    pointerEvents: "none",
  });
  const shot = await new Promise<ReturnType<typeof previewThumbnail>>(
    (done) => {
      let settle: ReturnType<typeof setTimeout> | undefined;
      const post = (message: object) =>
        frame.contentWindow?.postMessage(message, found.origin);
      const finish = (picture: ReturnType<typeof previewThumbnail>) => {
        clearTimeout(settle);
        clearTimeout(bound);
        window.removeEventListener("message", heard);
        done(picture);
      };
      const heard = (event: MessageEvent) => {
        if (
          event.source !== frame.contentWindow ||
          event.origin !== found.origin
        ) {
          return;
        }
        const data = event.data as { type?: unknown } | null;
        if (data?.type === "cawco:ready") {
          clearTimeout(settle);
          settle = setTimeout(() => post({ type: "cawco:capture" }), SETTLE_MS);
        } else if (data?.type === "cawco:captured") {
          finish(
            previewThumbnail(data as Parameters<typeof previewThumbnail>[0])
          );
        }
      };
      const bound = setTimeout(() => finish(null), PAGE_MS);
      window.addEventListener("message", heard);
      frame.addEventListener("load", () => {
        post({
          type: "cawco:hello",
          theme: theme.resolved,
          artifact: { id: artifact.id, kind: "page", name: artifact.name },
          sync: `/__cawco/artifact/${artifact.id}`,
          inset: { bottom: 0 },
        });
      });
      frame.src = found.src;
      document.body.append(frame);
    }
  );
  frame.remove();
  if (!shot) {
    return false;
  }
  return keepThumbnail(instanceId, artifact.id, shot).then(
    () => true,
    () => false
  );
}

/**
 * Draws the session's pages that have no picture, one at a time, once
 * each per tab; the list is read again when any was kept.
 */
export function drawMissingPages(
  instanceId: string,
  artifacts: readonly ArtifactSummary[]
): void {
  if (running.has(instanceId)) {
    return;
  }
  const missing = artifacts.filter(
    (artifact) =>
      artifact.kind === "page" &&
      artifact.thumbnail === null &&
      !tried.has(artifact.id)
  );
  if (missing.length === 0) {
    return;
  }
  running.add(instanceId);
  (async () => {
    let kept = false;
    for (const artifact of missing) {
      tried.add(artifact.id);
      // biome-ignore lint/performance/noAwaitInLoops: one unseen page at a time, never a pile of frames
      kept = (await drawPage(instanceId, artifact)) || kept;
    }
    running.delete(instanceId);
    if (kept) {
      await readArtifacts(instanceId);
    }
  })();
}
