# @cawco/jsonl-parser

Fast, incremental parser and BM25 search index for agent-session transcripts.

- **Claude Code** — session JSONL under `~/.claude/projects/**` (including `subagents/agent-*.jsonl`)
- **OpenCode** — `~/.local/share/opencode/opencode.db` (`message`/`part` tables)

Both harnesses normalize into one document shape and feed one search index.

## Measured performance

Real corpus: 1,037 files, 1.35 GB, 283k records, 48-core Linux, Bun 1.4.

| Operation | Result |
|---|---|
| Full parse, single thread | 2.4 s (565 MB/s) |
| Full parse, worker fan-out | 1.1 s (1.2 GB/s, records returned) |
| Cold BM25 index build (parse + extract + FTS5) | 6.1 s → 108k docs |
| Warm re-sync, nothing changed | **6 ms** |
| BM25 query with snippet | **≤ 2 ms** |
| Newest 300 messages of a 406 MB transcript (`ReverseReader`) | **18 ms** (reads its newest chunks) |

The warm numbers are the point: transcripts are append-only, so per-file
`(size, offset)` checkpoints mean a re-index only ever parses appended bytes.

## Usage

No reader holds a whole file: each reads a chunk at a time, splits on
newline bytes before decoding, and gives the loop a turn between chunks.

```ts
import { scanFile, ReverseReader, readSpans, parseMany, typeFilter } from "@cawco/jsonl-parser";

// Scan a transcript forward, keeping what `pick` takes of each record
// (invalid lines are counted, never thrown); `from` reads on from a checkpoint
const { items, stats, checkpoint } = await scanFile(path, {
  prefilter: typeFilter("user", "assistant"), // other lines skipped at byte level
  pick: ({ record, offset, byteLength }) => ({ uuid: record.uuid, offset, byteLength }),
});
const grown = await scanFile(path, { from: checkpoint, pick: (located) => located });

// Read chosen records back by their byte ranges
const records = await readSpans(path, items.slice(-50));

// Open a session view instantly: newest records read backward from EOF
const reader = new ReverseReader(path);
await reader.more(200);
reader.records; // oldest first

// Parallel parse across files, extracting searchable docs in the workers
const results = await parseMany(files, { mode: "docs", types: ["user", "assistant"] });
```

```ts
import { TranscriptIndex } from "@cawco/jsonl-parser/fts5"; // Bun only

const index = new TranscriptIndex("./transcripts.db");
await index.sync(files); // incremental: full-parses new files, tails grown ones
const hits = index.search("websocket reconnect", { limit: 10 });
// hits: [{ sessionId, role, timestamp, score, snippet, ... }]
```

```ts
import { readOpenCodeDocs, defaultOpenCodePath } from "@cawco/jsonl-parser/opencode"; // Bun only

const { docs, watermark } = readOpenCodeDocs(defaultOpenCodePath());
index.indexDocs(docs);
// next time: readOpenCodeDocs(path, { since: watermark })
```

## Layout

| Export | Runtime | Contents |
|---|---|---|
| `@cawco/jsonl-parser` | neutral | typed records, byte scanner, lazy parse, text extraction, checkpoints, worker fan-out |
| `@cawco/jsonl-parser/fts5` | Bun | SQLite FTS5 BM25 index (`porter unicode61`, external-content table, trigger-synced) |
| `@cawco/jsonl-parser/opencode` | Bun | OpenCode sqlite adapter with `time_updated` watermark |

## Design notes

- `JSON.parse` is the bottleneck, not scanning: newline/byte scanning runs at
  ~3.5 GB/s while parse runs at ~0.5 GB/s. The `prefilter` API decides from
  raw bytes which lines to materialize; a 5 MB tool_result line the caller
  filters out costs one `indexOf`.
- The record types model the stable 12-field envelope observed across 283k
  real records and keep everything else as open passthrough — the format is
  internal to Claude Code, unversioned, and fields churn between releases.
  Unknown record types survive round-trips.
- Real corpora contain invalid JSON lines (crash-truncated tails) and single
  lines up to 5 MB; the parser skips-and-counts, never throws, and makes no
  line-length assumptions.
- FTS5 over the alternatives (Orama, MiniSearch, tantivy bindings): zero added
  dependencies under Bun, the index is the database (no serialize step,
  crash-safe via WAL), and external-content tables keyed by rowid leave room
  to bolt on sqlite-vec hybrid search later without an architectural change.

## Tooling

Built with the ox toolkit: `oxlint` (lint), `oxfmt` (format), `tsdown`
(build + d.ts). `bun run build` emits `dist/`; `publishConfig` flips the
exports to `dist/` on publish while the workspace consumes TypeScript source
directly.
