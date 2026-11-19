/**
 * Each page's and canvas's document as the hub's state makes it, built as
 * that state moves and stored (db/artifact-documents.ts), so the preview
 * server composes a page's document from the row and the page's own file
 * without asking the hub (preview-server/pages.ts). Nothing here runs when a
 * page opens: what an open reads was written when it last moved.
 *
 * A document is built again when its artifact's doc takes an update, when
 * its row is written, and when an artifact one of its pages' pieces shows
 * is written (a Preview's revision, its origin): each such change marks its
 * ids, and the marks are built together a moment later ({@link GATHER_MS}),
 * one keyed build each. An artifact with no row yet (one opened for the
 * first time since this table came) is built when the preview server asks
 * for it ({@link ArtifactDocuments.build}).
 */
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { PictureSize } from "@cawco/core/decisions-library";
import { detach } from "@cawco/core/detach";
import { folderKey } from "@cawco/preview/proxy";
import type { ServedMedia } from "./artifacts/shapes";
import { ARTIFACTS_ROOT } from "./config";
import type {
  ArtifactDocumentRow,
  ArtifactDocumentsDb,
} from "./db/artifact-documents";
import type { ArtifactRow } from "./db/artifacts";
import type { StoredPiece } from "./preview-server/document";

/** How long marks gather before they are built together. Our call: a burst of picks or a page's files written one by one is one build. */
const GATHER_MS = 150;

export interface ArtifactDocumentsDeps {
  /** Runs `run` once after `ms` on the hub's lifetime (lifetime.ts `after`). */
  after: (name: string, ms: number, run: () => void) => void;
  documents: ArtifactDocumentsDb;
  /**
   * The key of the preview origin a machine-served piece stands on
   * (db/previews.ts `artifactOrigin` of its row's origin), its port opened;
   * undefined for a piece no machine serves; the refusal's words when no
   * port opens.
   */
  embedOf: (
    row: ArtifactRow
  ) => { key: string } | { unopened: string } | undefined;
  /** The origin key that serves a page (artifact-pages.ts `originKeyOf`). */
  originOf: (id: string) => string | undefined;
  /** A decision page's program as the hub serves it (artifacts service `programServed`). */
  program: (id: string) => {
    hash: string;
    media: Record<string, ServedMedia | null>;
    pictures: Record<string, PictureSize>;
  } | null;
  row: (id: string) => ArtifactRow | undefined;
  /** The doc's seed (artifacts/docs.ts `seed`). */
  seed: (id: string) => { maps: string; state: string };
}

/** Whether an artifact's document is one the hub carries state into: a page's or a canvas's. */
const documented = (row: ArtifactRow | undefined): row is ArtifactRow =>
  row?.kind === "page" || row?.kind === "canvas";

export const createArtifactDocuments = (deps: ArtifactDocumentsDeps) => {
  /** Ids marked and not built yet. */
  const marked = new Set<string>();
  let gathering = false;
  /** The build running now, which the next waits on: two never interleave their writes. */
  let building: Promise<void> = Promise.resolve();

  /** One piece of a page's media as its document keeps it ({@link storedMedia}); `owner` the origin that serves the page. */
  const storedPiece = (
    held: ServedMedia | null,
    owner: string | undefined
  ): StoredPiece => {
    if (!(held && (held.kind === "preview" || held.kind === "component"))) {
      return held;
    }
    const row = deps.row(held.id);
    // A page no session or project holds frames no embed.
    const embed = row && owner ? deps.embedOf(row) : undefined;
    if (!embed) {
      return held;
    }
    if ("unopened" in embed) {
      return { ...held, unopened: embed.unopened };
    }
    const path = row && !("page" in row.source) ? row.source.path : undefined;
    return { ...held, embedKey: embed.key, embedPath: path ?? "/" };
  };

  /** Its media as the document keeps it: each machine-served piece named by its origin's key and its start path, never an address, which the preview server makes where the page is reached. */
  const storedMedia = (
    pageId: string,
    media: Record<string, ServedMedia | null>
  ): Record<string, StoredPiece> => {
    const owner = deps.originOf(pageId);
    return Object.fromEntries(
      Object.entries(media).map(([id, held]) => [id, storedPiece(held, owner)])
    );
  };

  /** The key of a page's folder's files now; null when it has none. */
  const pageFolderKey = async (id: string): Promise<string | null> => {
    try {
      return await folderKey(await realpath(join(ARTIFACTS_ROOT, id)));
    } catch {
      return null;
    }
  };

  /** Artifact `id`'s document built now and kept; nothing for an artifact whose document carries none of the hub's state. */
  const buildOne = async (id: string): Promise<void> => {
    const row = deps.row(id);
    if (!documented(row)) {
      return;
    }
    const seed = deps.seed(id);
    const program = row.kind === "page" ? deps.program(id) : null;
    const media = program ? storedMedia(id, program.media) : null;
    const shows = program
      ? Object.entries(program.media).flatMap(([shown, held]) =>
          held ? [shown] : []
        )
      : [];
    const folder = row.kind === "page" ? await pageFolderKey(id) : null;
    const fields = {
      seedState: seed.state,
      seedMaps: seed.maps,
      programHash: program?.hash ?? null,
      media: media && JSON.stringify(media),
      pictures: program && JSON.stringify(program.pictures),
      shows: JSON.stringify(shows),
      folderKey: folder,
    };
    const etag = createHash("sha256")
      .update(JSON.stringify(fields))
      .digest("base64url")
      .slice(0, 22);
    if (deps.documents.get(id)?.etag === etag) {
      return;
    }
    const kept: ArtifactDocumentRow = {
      artifactId: id,
      etag,
      ...fields,
      builtAt: new Date(),
    };
    // Its row may have gone while its folder was read: the foreign key refuses it then.
    if (deps.row(id)) {
      deps.documents.keep(kept);
    }
  };

  /** Every mark built, each once, then told. */
  const flush = (): void => {
    gathering = false;
    const ids = [...marked];
    marked.clear();
    building = building.then(async () => {
      for (const id of ids) {
        try {
          await buildOne(id);
        } catch (error) {
          console.error(`[documents] ${id} wasn't built`, error);
        }
      }
    });
    detach(building, "artifact documents built");
  };

  return {
    /**
     * Artifacts `ids` moved (their doc, their row): each one's document is
     * built again, and each page's that shows one of them.
     */
    moved(ids: readonly string[]): void {
      for (const id of ids) {
        marked.add(id);
        for (const page of deps.documents.showing(id)) {
          marked.add(page);
        }
      }
      if (!gathering && marked.size > 0) {
        gathering = true;
        deps.after("artifact documents gathered", GATHER_MS, flush);
      }
    },

    /** Artifact `id`'s document built now, after any build running: what the preview server asks for when it finds none. */
    async build(id: string): Promise<ArtifactDocumentRow | undefined> {
      const run = building.then(() => buildOne(id));
      building = run.catch(() => undefined);
      await run;
      return deps.documents.get(id);
    },
  };
};

export type ArtifactDocuments = ReturnType<typeof createArtifactDocuments>;
