/**
 * Each page's and canvas's document as the hub's state makes it, built and
 * stored (db/artifact-documents.ts), so the preview server composes a
 * page's document from the row and the page's own file
 * (preview-server/serve.ts): an open of one that stands is one keyed read.
 *
 * A document is built again when its row is written, and when an artifact
 * one of its pages' pieces shows is written (a Preview's revision, its
 * origin): each such change marks its ids, and the marks are built together
 * a moment later ({@link GATHER_MS}), one keyed build each. An update to a
 * doc builds nothing: the seed is the whole doc, so building it on each
 * update made every person's edit cost the doc (175 to 260 ms a burst on a
 * 13 MB page, 140 to 160 ms on a 19,000-element canvas, 2026-11-19). The
 * document says the seq of each doc it read (`seqs`: its own, and each
 * design graph whose shapes a piece carries); the preview server, finding
 * one of them moved, or no document, has it built now
 * ({@link ArtifactDocuments.build}), so an open serves the doc as it stands
 * and its overlay's socket carries it on from there.
 */
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { PictureSize } from "@cawco/core/decisions-library";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import type { PreviewUnavailable } from "@cawco/core/preview/protocol";
import { folderKey } from "@cawco/preview/proxy";
import { Effect } from "effect";
import type { ServedMedia } from "./artifacts/shapes";
import { ARTIFACTS_ROOT } from "./config";
import type {
  ArtifactDocumentRow,
  ArtifactDocumentsDb,
} from "./db/artifact-documents";
import type { ArtifactRow } from "./db/artifacts";
import type { HubLifetimeShape } from "./lifetime";
import type { StoredPiece } from "./preview-server/document";

/** How long marks gather before they are built together. Our call: a burst of picks or a page's files written one by one is one build. */
const GATHER_MS = 150;

export interface ArtifactDocumentsDeps {
  /** Runs `run` once after `ms` on the hub's lifetime (lifetime.ts `after`). */
  after: (name: string, ms: number, run: () => void) => void;
  documents: ArtifactDocumentsDb;
  /**
   * The key of the preview origin a piece with an origin of its own stands
   * on (a machine's preview or a folder preview, preview-machine.ts
   * `hasOwnOrigin`; db/previews.ts `artifactOrigin` of its row's origin),
   * its port opened; undefined for any other piece; the refusal's words
   * when no port opens.
   */
  embedOf: (
    row: ArtifactRow
  ) => { key: string } | { unopened: string } | undefined;
  /** The hub's lifetime: the gathered builds run on it as named work let go. */
  lifetime: HubLifetimeShape;
  /** The origin key that serves a page (artifact-pages.ts `originKeyOf`). */
  originOf: (id: string) => string | undefined;
  /** A decision page's program as the hub serves it (artifacts service `programServed`). */
  program: (id: string) => {
    hash: string;
    media: Record<string, ServedMedia | null>;
    pictures: Record<string, PictureSize>;
  } | null;
  row: (id: string) => ArtifactRow | undefined;
  /** The doc's seed (artifacts/docs.ts `seed`), read whole: only when the doc moved since the document was built. */
  seed: (id: string) => { maps: string; state: string };
  /** Why the hub knows a piece's version can't be shown now (preview-unavailable.ts); null while nothing stands in the way. */
  unavailable: (row: ArtifactRow | undefined) => PreviewUnavailable | null;
}

/** Whether an artifact's document is one the hub carries state into: a page's or a canvas's. */
const documented = (row: ArtifactRow | undefined): row is ArtifactRow =>
  row?.kind === "page" || row?.kind === "canvas";

export const createArtifactDocuments = (deps: ArtifactDocumentsDeps) => {
  /** Ids marked and not built yet. */
  const marked = new Set<string>();
  let gathering = false;
  /**
   * One build at a time per artifact: the document kept last for an id is
   * from its newest read. Builds of different ids run beside each other.
   */
  const builds = makeKeyedLock<string>();

  /** One piece of a page's media as its document keeps it ({@link storedMedia}); `owner` the origin that serves the page. */
  const storedPiece = (
    held: ServedMedia | null,
    owner: string | undefined
  ): StoredPiece => {
    if (!(held && (held.kind === "preview" || held.kind === "component"))) {
      return held;
    }
    const row = deps.row(held.id);
    // One the hub knows can't be shown is drawn so, its origin unopened:
    // its Preview loads no frame (preview-unavailable.ts).
    const unavailable = deps.unavailable(row);
    if (unavailable) {
      return { ...held, unavailable };
    }
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

  /**
   * The seq of each doc a document of `id` reads now: its own, and each
   * design graph's whose shapes one of its pieces carries (artifacts
   * service `programServed`). Read after the reads it names, so a load's
   * own writes are counted.
   */
  const seqsOf = (
    id: string,
    media: Record<string, ServedMedia | null> | undefined
  ): Record<string, number> => {
    const seqs: Record<string, number> = {};
    for (const piece of Object.values(media ?? {})) {
      if (piece?.shapes) {
        seqs[piece.id] = deps.row(piece.id)?.seq ?? 0;
      }
    }
    seqs[id] = deps.row(id)?.seq ?? 0;
    return seqs;
  };

  /** A document's etag: its fields but the seed, which its own seq in `seqs` names. */
  const etagOf = (fields: object): string =>
    createHash("sha256")
      .update(JSON.stringify(fields))
      .digest("base64url")
      // @limit measured: 22 base64url characters are 132 bits of a hash; one document's etags share the namespace, so two collide after about 2^66 names
      .slice(0, 22);

  /**
   * Artifact `id`'s document built now and kept; nothing for an artifact
   * whose document carries none of the hub's state, and no seed read when
   * the one kept was read at the doc's seq now.
   */
  const buildOne = async (id: string): Promise<void> => {
    if (!documented(deps.row(id))) {
      return;
    }
    const folder =
      deps.row(id)?.kind === "page" ? await pageFolderKey(id) : null;
    // Read at once from here: what it says and the seqs it read it at.
    const row = deps.row(id);
    if (!documented(row)) {
      return;
    }
    const program = row.kind === "page" ? deps.program(id) : null;
    const media = program ? storedMedia(id, program.media) : null;
    const shows = program
      ? Object.entries(program.media).flatMap(([shown, held]) =>
          held ? [shown] : []
        )
      : [];
    const fields = {
      programHash: program?.hash ?? null,
      media: media && JSON.stringify(media),
      pictures: program && JSON.stringify(program.pictures),
      shows: JSON.stringify(shows),
      folderKey: folder,
      seqs: JSON.stringify(seqsOf(id, program?.media)),
    };
    if (deps.documents.get(id)?.etag === etagOf(fields)) {
      return;
    }
    const seed = deps.seed(id);
    // A first load writes its own changes (docs.ts `load`): the seed holds them.
    const read = {
      ...fields,
      seqs: JSON.stringify(seqsOf(id, program?.media)),
    };
    const kept: ArtifactDocumentRow = {
      artifactId: id,
      etag: etagOf(read),
      seedState: seed.state,
      seedMaps: seed.maps,
      ...read,
      builtAt: new Date(),
    };
    deps.documents.keep(kept);
  };

  /** Artifact `id`'s document built in its turn. */
  const buildInTurn = (id: string): Effect.Effect<void, unknown> =>
    builds.withLock(
      id,
      Effect.tryPromise({ try: () => buildOne(id), catch: (error) => error })
    );

  /** Every mark built, each once, each in its own artifact's turn. */
  const flush = (): void => {
    gathering = false;
    const ids = [...marked];
    marked.clear();
    for (const id of ids) {
      deps.lifetime.fork(
        "artifact document built",
        buildInTurn(id).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              console.error(`[documents] ${id} wasn't built`, error);
            })
          )
        )
      );
    }
  };

  return {
    /**
     * Artifact rows `ids` were written: each one's document is built
     * again, and each page's that shows one of them.
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

    /**
     * The promise edge of artifact `id`'s document built now, after any
     * build of it running: what the preview server asks for when it finds
     * none, or one read from a doc that moved since.
     */
    build: (id: string): Promise<ArtifactDocumentRow | undefined> =>
      deps.lifetime.run(
        buildInTurn(id).pipe(Effect.map(() => deps.documents.get(id)))
      ),
  };
};

export type ArtifactDocuments = ReturnType<typeof createArtifactDocuments>;
