/**
 * A page's document as the preview server serves it: the page's own HTML
 * file, its overlay tag carrying the doc's seed (core `injectOverlay`), a
 * decision page's media and pictures in its head, its own files at their
 * folder's key (core `versionAssets`), and its own sheets and scripts named
 * in a `Link` header so the browser asks for them with the document's
 * headers, before it parses a line of it. What the hub knows of it is the
 * document's row (db/artifact-documents.ts), built as the hub's state moves
 * (artifact-documents.ts); what changes with where the page was reached (an
 * embed's address, the framer an embed allows) is made here.
 */
import { PICTURES_TAG } from "@cawco/core/decisions-library";
import { OVERLAY_PATH } from "@cawco/core/preview/routes";
import { causeOf, injectOverlay, versionAssets } from "@cawco/preview/proxy";
import { z } from "zod";
import type { ServedMedia } from "../artifacts/shapes";
import type { ArtifactDocumentRow } from "../db/artifact-documents";
import { FACE_PRELOADS, scriptJson } from "../decision-program";

/**
 * A piece of a decision page's media as its document row keeps it (the
 * hub's `ServedMedia`): a machine-served one by its origin's key and its
 * start path (`embedKey`, `embedPath`), whose address is made where the page
 * is reached, or the hub's words for why no port opened for it
 * (`unopened`); null once the hub no longer holds it.
 */
export type StoredPiece =
  | (ServedMedia & {
      embedKey?: string;
      embedPath?: string;
      unopened?: string;
    })
  | null;

const StoredMediaSchema = z.record(
  z.string(),
  z
    .looseObject({
      embedKey: z.string().optional(),
      embedPath: z.string().optional(),
    })
    .nullable()
);

/** An embed's address where its page was reached, or why it has none. */
export type EmbedAt = (
  key: string,
  path: string
) => { embed: string } | { unopened: string };

/** A decision page's head: its faces' preloads, its media as the page reached at `embedAt` names them, and its pictures' sizes. */
const programHead = (
  row: ArtifactDocumentRow,
  embedAt: EmbedAt
): string | null => {
  if (row.media === null) {
    return null;
  }
  let stored: z.output<typeof StoredMediaSchema>;
  try {
    stored = StoredMediaSchema.parse(JSON.parse(row.media));
  } catch {
    stored = {};
  }
  const media: Record<string, unknown> = {};
  for (const [id, piece] of Object.entries(stored)) {
    if (!piece?.embedKey) {
      media[id] = piece;
      continue;
    }
    const { embedKey, embedPath, ...rest } = piece;
    media[id] = { ...rest, ...embedAt(embedKey, embedPath ?? "/") };
  }
  let pictures: unknown = {};
  try {
    pictures = row.pictures === null ? {} : JSON.parse(row.pictures);
  } catch (error) {
    // The page draws its pictures at their own sizes.
    console.warn(
      `[preview] ${row.artifactId}'s pictures don't read: ${causeOf(error)}`
    );
  }
  return `${FACE_PRELOADS}${scriptJson("cawco-media", media)}${scriptJson(PICTURES_TAG, pictures)}`;
};

/** What the browser is told to fetch with the document: each of its own sheets and scripts, as `Link` header values. */
const LINKS: [selector: string, attribute: string, link: string][] = [
  ['link[rel="stylesheet"][href]', "href", "rel=preload; as=style"],
  ['script[type="module"][src]', "src", "rel=modulepreload"],
  ["script[src]:not([type])", "src", "rel=preload; as=script"],
];

/** The `Link` header naming `html`'s own sheets and scripts (same origin, not the overlay's), so they load beside the document. */
const preloads = (html: string): string => {
  const found: string[] = [];
  let rewriter = new HTMLRewriter();
  for (const [selector, attribute, link] of LINKS) {
    rewriter = rewriter.on(selector, {
      element(element) {
        const at = element.getAttribute(attribute) ?? "";
        if (at.startsWith("/") && !at.startsWith("//")) {
          found.push(`<${at}>; ${link}`);
        }
      },
    });
  }
  rewriter.transform(html);
  return [...new Set(found)].join(", ");
};

/**
 * Page `artifactId`'s document from its own HTML `html`, served at
 * `pathname` under `mount` (`/`, or `/__cawco/page/<id>/`), with its row's
 * state and its overlay's tag at the overlay's key now (`overlayAt`, core
 * `keyedOverlayPath`): the body, and the `Link` header naming the overlay
 * and the page's own sheets and scripts.
 */
export const composePage = (
  artifactId: string,
  html: string,
  row: ArtifactDocumentRow,
  at: {
    embedAt: EmbedAt;
    mount: string;
    overlayAt: string;
    pathname: string;
    versioned: boolean;
  }
): { body: string; links: string } => {
  const injected = injectOverlay(
    html,
    { artifact: artifactId, maps: row.seedMaps, state: row.seedState },
    row.programHash ?? undefined
  ).replace(`<script src="${OVERLAY_PATH}"`, `<script src="${at.overlayAt}"`);
  const head = programHead(row, at.embedAt);
  const page = head ? injected.replace("</head>", `${head}</head>`) : injected;
  const body =
    at.versioned || row.folderKey === null
      ? page
      : versionAssets(page, row.folderKey, at.mount, at.pathname);
  return { body, links: preloads(body) };
};
