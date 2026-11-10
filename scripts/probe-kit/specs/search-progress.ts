/**
 * A catch-up's progress claims only what its commits hold: after each early
 * commit (jsonl-parser fts5.ts `sync`, `progress`), every transcript last
 * written before the time it tells is in the index, and the agent says that
 * time as `indexedThrough` (agent search/index.ts). It told the oldest new
 * file still to read alone, so a grown file still to read, or an OpenCode
 * session whose documents only the sync's last commit takes, was claimed
 * while it was out of the index.
 *
 * In this process, on an index in a scratch folder: three Claude
 * transcripts indexed once, then each grown by {@link TAIL_MB} MB (two of
 * them pass the write batch, so the third is still out at its first commit),
 * two new ones of {@link NEW_MB} MB, and OpenCode documents
 * written before all of them. Each claim the sync tells is read against the
 * index's own committed checkpoints (a second connection, as the reader
 * reads it):
 * 1. every planted transcript last written before a claim is wholly in;
 * 2. no claim reaches past an OpenCode document the sync has not committed;
 * 3. the catch-up told at least one claim, and the sync's end holds every
 *    file.
 *
 *   bun scripts/probe-kit/run.ts search-progress
 */
import { Database } from "bun:sqlite";
import {
  appendFile,
  mkdtemp,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MINUTE_MS } from "../../../packages/core/src/time";
import type { TranscriptDoc } from "../../../packages/jsonl-parser/src/text";
import type { Kit, Spec } from "../spec";

/** What each grown transcript gains: two of them pass the sync's write batch (fts5.ts `WRITE_BATCH_BYTES`, 32 MB), one doesn't. */
const TAIL_MB = 20;
/** Each new transcript's size. */
const NEW_MB = 20;

/** One Claude transcript line of turn `at`, about 1 KB. */
const line = (sessionId: string, at: number): string =>
  `${JSON.stringify({
    type: at % 2 === 0 ? "user" : "assistant",
    uuid: crypto.randomUUID(),
    parentUuid: null,
    sessionId,
    cwd: "/probe",
    timestamp: new Date(Date.UTC(2026, 9, 1) + at * 1000).toISOString(),
    isSidechain: false,
    message:
      at % 2 === 0
        ? { role: "user", content: `${at}: ${"word ".repeat(200)}` }
        : {
            id: `msg_${sessionId}_${at}`,
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5",
            content: [{ type: "text", text: `${at}: ${"word ".repeat(200)}` }],
            usage: { input_tokens: 10, output_tokens: 20 },
          },
  })}\n`;

/** About `mb` MB of transcript lines of `sessionId`, from turn `from`. */
const lines = (sessionId: string, mb: number, from = 0): string => {
  const out: string[] = [];
  let size = 0;
  for (let at = from; size < mb * 1024 * 1024; at += 1) {
    const one = line(sessionId, at);
    out.push(one);
    size += one.length;
  }
  return out.join("");
};

const run = async (kit: Kit) => {
  const { TranscriptIndex } =
    await import("../../../packages/jsonl-parser/src/fts5");
  const scratch = await mkdtemp(join(tmpdir(), "search-progress-"));
  const indexPath = join(scratch, "index.db");
  const now = Date.now();
  /** Each planted transcript, and when it was last written. */
  const planted = new Map<string, number>();
  const plant = async (name: string, text: string, ago: number) => {
    const path = join(scratch, `${name}.jsonl`);
    await (planted.has(path) ? appendFile(path, text) : writeFile(path, text));
    const at = new Date(now - ago * MINUTE_MS);
    await utimes(path, at, at);
    planted.set(path, at.getTime());
    return path;
  };
  const index = new TranscriptIndex(indexPath);
  try {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    const [g1, g2, g3, n1, n2] = ids as [
      string,
      string,
      string,
      string,
      string,
    ];
    // Three transcripts indexed once.
    await plant("g1", line(g1, 0), 90);
    await plant("g2", line(g2, 0), 90);
    await plant("g3", line(g3, 0), 90);
    const files = () =>
      [...planted.keys()].map((path) => ({
        harness: "claude-code" as const,
        path,
      }));
    await index.sync(files());
    // Each grown: the first two read pass the write batch, and the third is still out.
    await plant("g1", lines(g1, TAIL_MB, 1), 50);
    await plant("g2", lines(g2, TAIL_MB, 1), 40);
    await plant("g3", lines(g3, TAIL_MB, 1), 30);
    // Two new ones, written after every grown one.
    await plant("n1", lines(n1, NEW_MB), 20);
    await plant("n2", lines(n2, NEW_MB), 10);
    // OpenCode's documents, written before every transcript.
    const docsAt = now - 60 * MINUTE_MS;
    const docs: TranscriptDoc[] = Array.from({ length: 3 }, (_, at) => ({
      harness: "opencode",
      sessionId: "opencode-session",
      id: `opencode-${at}`,
      role: "user",
      author: "owner",
      timestamp: new Date(docsAt + at * 1000).toISOString(),
      text: `opencode words ${at}`,
    }));
    const sizes = new Map(
      await Promise.all(
        [...planted.keys()].map(
          async (path) => [path, (await stat(path)).size] as const
        )
      )
    );
    const committed = new Database(indexPath, { readonly: true });
    const claims: { at: number; out: string[]; docsIn: boolean }[] = [];
    try {
      await index.sync(files(), {
        docs,
        progress: (through) => {
          const held = new Map(
            (
              committed.query("SELECT path, offset FROM files").all() as {
                path: string;
                offset: number;
              }[]
            ).map((row) => [row.path, row.offset])
          );
          const out = [...planted]
            .filter(
              ([path, writtenAt]) =>
                writtenAt < through && held.get(path) !== sizes.get(path)
            )
            .map(([path]) => path.split("/").at(-1) ?? path);
          const docsIn =
            (
              committed
                .query(
                  "SELECT count(*) AS n FROM docs WHERE harness = (SELECT id FROM strings WHERE value = 'opencode')"
                )
                .get() as { n: number } | null
            )?.n === docs.length;
          claims.push({ at: through, out, docsIn });
        },
      });
    } finally {
      committed.close();
    }
    const said = claims
      .map(
        (one) =>
          `${Math.round((now - one.at) / MINUTE_MS)} min ago${one.out.length > 0 ? ` (out: ${one.out.join(", ")})` : ""}`
      )
      .join("; ");
    kit.check(
      "1: every transcript last written before a catch-up's claim is wholly in the index",
      claims.every((one) => one.out.length === 0),
      said || "no claim told"
    );
    kit.check(
      "2: no claim reaches past an OpenCode document not yet committed",
      claims.every((one) => one.docsIn || one.at < docsAt),
      said || "no claim told"
    );
    const end = new Map(
      (
        index.db.query("SELECT path, offset FROM files").all() as {
          path: string;
          offset: number;
        }[]
      ).map((row) => [row.path, row.offset])
    );
    kit.check(
      "3: the catch-up told a claim, and its end holds every transcript",
      claims.length > 0 &&
        [...planted.keys()].every((path) => end.get(path) === sizes.get(path)),
      `${claims.length} claim(s); ${[...planted.keys()].filter((path) => end.get(path) !== sizes.get(path)).length} transcript(s) short at the end`
    );
  } finally {
    index.close();
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Speed",
  name: "search-progress",
  run,
};
export default spec;
