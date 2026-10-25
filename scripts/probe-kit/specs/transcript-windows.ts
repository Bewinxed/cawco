/**
 * A transcript is read a window at a time, and the rows it builds are the
 * rows a whole read builds: each row's id, its content and its place.
 *
 * Opening a session reads its newest window alone; paging back reads the
 * window before what is held and puts it in front (core
 * `TranscriptBuilder.prepend`). For that to draw what a whole read draws, a
 * window must start where nothing before it is still answered. Proven here on
 * Claude Code transcripts written as the CLI writes them
 * (claude-transcripts.ts: compactions, background tasks and subagents ended
 * turns later, joined and mid-turn prompts, hook failures, abandoned
 * branches), and on every transcript under `CAWCO_TRANSCRIPTS` when it names
 * a folder (the host's `~/.claude/projects`, say):
 *
 * (a) the windows, newest first, joined oldest first, are the conversation a
 *     whole read gives, entry for entry;
 * (b) a builder fed the newest window, then each older one as pages reach
 *     back past what it holds (as the hub's `transcripts.page` reads), holds
 *     the blocks and branches a builder fed the whole read holds, in order,
 *     and its pages, newest first, walk them all;
 * (d) (a) and (b) hold for pi sessions pi itself wrote (pi-transcripts.ts:
 *     tool calls, retried failures, compactions, background commands'
 *     notices, a branch left behind);
 * (c) on a transcript of {@link BIG_MB} MB (or the copy `CAWCO_TRANSCRIPT`
 *     names), opening costs the window and never the file: the newest window
 *     answers within {@link FIRST_MS} with the reader's memory grown under
 *     {@link FIRST_MB} MB, and no read, the line index's first scan
 *     included, holds the loop over {@link LOOP_MS} ms.
 *
 *   bun scripts/probe-kit/run.ts transcript-windows
 */
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import {
  readSaidWindow,
  type SaidWindow,
  type SDKSessionMessage,
} from "../../../packages/agent/src/harnesses/claude-transcript";
import type {
  SessionMessage,
  TranscriptBlock,
  WindowAsk,
} from "../../../packages/core/src";
import { TranscriptBuilder } from "../../../packages/core/src/transcript";
import { writeClaudeTranscript } from "../claude-transcripts";
import type { Kit, Spec } from "../kit";

/** The window the hub asks for (server.ts `HISTORY_WINDOW`). */
const WINDOW = 300;
/** The page the dashboard asks for (core `TRANSCRIPT_PAGE`). */
const PAGE = 60;
/** The big transcript's size: the size of obelisk's longest live session. */
const BIG_MB = 406;
/** The newest window of the big transcript answers within this. */
const FIRST_MS = 1500;
/** And grows the reader's memory by less than this. */
const FIRST_MB = 150;
/** No read holds the loop longer than this. */
const LOOP_MS = 100;

const entriesOf = (messages: SDKSessionMessage[]): SessionMessage[] =>
  messages as unknown as SessionMessage[];

/** A stored conversation as a reader reads it: whole, or a window. */
interface Reader {
  whole: () => Promise<SessionMessage[]>;
  window: (
    ask: WindowAsk
  ) => Promise<{ entries: SessionMessage[]; older: string | null }>;
}

/** A Claude Code transcript read by the agent's reader. */
const claudeReader = (path: string): Reader => {
  const read = async (ask: WindowAsk) => {
    const window: SaidWindow = await readSaidWindow(path, ask);
    return { entries: entriesOf(window.messages), older: window.older };
  };
  return {
    whole: async () =>
      (await read({ start: null, limit: Number.MAX_SAFE_INTEGER })).entries,
    window: read,
  };
};

/**
 * Windows small enough that each written transcript is cut many times, and
 * the hub's: every cut is a place a whole read could be wrong.
 */
const SIZES = [24, WINDOW];

/** Every window of `limit` entries, newest first. */
const windowsOf = async (reader: Reader, limit: number) => {
  const windows = [await reader.window({ end: "newest", limit })];
  for (let older = windows[0]?.older ?? null; older !== null;) {
    // biome-ignore lint/performance/noAwaitInLoops: each window names the one before it
    const window = await reader.window({ before: older, limit });
    windows.push(window);
    ({ older } = window);
  }
  return windows;
};

const shape = (block: TranscriptBlock): string => JSON.stringify(block);

/** The first entry a window read gives differently from the whole read, or none. */
const entriesDiffer = (
  whole: SessionMessage[],
  joined: SessionMessage[]
): string | undefined => {
  if (joined.length !== whole.length) {
    return `the windows hold ${joined.length} entries, the whole read ${whole.length}`;
  }
  const at = whole.findIndex(
    (entry, i) => JSON.stringify(entry) !== JSON.stringify(joined[i])
  );
  return at < 0
    ? undefined
    : `entry ${at} differs: whole ${whole[at]?.uuid}, windows ${joined[at]?.uuid}`;
};

/**
 * The hub's page walk over a builder fed the newest window: older windows
 * read as a page reaches past what is held. The pages' blocks, oldest
 * first, or why a page could not be cut.
 */
const walkPages = (
  paged: TranscriptBuilder,
  older: { entries: SessionMessage[]; older: string | null }[]
): TranscriptBlock[] | string => {
  const pages: TranscriptBlock[][] = [];
  let before: string | undefined;
  let next = 0;
  for (;;) {
    while (!paged.holds(PAGE, before) && next < older.length) {
      const window = older[next];
      next += 1;
      if (window) {
        paged.prepend(window.entries, {}, window.older === null);
      }
    }
    const page = paged.page(PAGE, before);
    if (!page) {
      return `no page before ${before}`;
    }
    pages.unshift(page.blocks);
    if (page.cursor === null) {
      return pages.flat();
    }
    before = page.cursor;
  }
};

/** The first block `blocks` (named `name`) holds differently from `want`, or none. */
const blocksDiffer = (
  name: string,
  blocks: TranscriptBlock[],
  want: TranscriptBlock[]
): string | undefined => {
  if (blocks.length !== want.length) {
    return `${name}: ${blocks.length} blocks, the whole read's ${want.length}`;
  }
  const at = want.findIndex(
    (block, i) => shape(block) !== shape(blocks[i] as TranscriptBlock)
  );
  return at < 0
    ? undefined
    : `${name}: block ${at} is ${blocks[at]?.id} (${blocks[at]?.type}), the whole read's ${want[at]?.id} (${want[at]?.type})`;
};

/** (a) and (b) on one transcript; the first difference found, or none. */
const parity = async (
  reader: Reader,
  limit: number
): Promise<{
  windows: number;
  entries: number;
  blocks: number;
  wrong?: string;
}> => {
  const whole = await reader.whole();
  const windows = await windowsOf(reader, limit);
  const found = { windows: windows.length, entries: whole.length, blocks: 0 };
  const joined = windows.toReversed().flatMap((window) => window.entries);
  const wrongEntry = entriesDiffer(whole, joined);
  if (wrongEntry) {
    return { ...found, wrong: wrongEntry };
  }
  const reference = new TranscriptBuilder("probe", () => 0);
  reference.merge(whole, {}, [], false, true);
  const want = reference.whole();
  const paged = new TranscriptBuilder("probe", () => 0);
  const [newest, ...older] = windows;
  paged.merge(
    newest?.entries ?? [],
    {},
    [],
    false,
    (newest?.older ?? null) === null
  );
  const walked = walkPages(paged, older);
  if (typeof walked === "string") {
    return { ...found, wrong: walked };
  }
  const held = paged.whole();
  const sorted = (list: typeof want.branches) =>
    JSON.stringify(
      list.toSorted((x, y) => x.toolUseId.localeCompare(y.toolUseId))
    );
  const wrong =
    blocksDiffer("held", held.blocks, want.blocks) ??
    blocksDiffer("paged", walked, want.blocks) ??
    (sorted(held.branches) === sorted(want.branches)
      ? undefined
      : "the branches differ");
  return { ...found, blocks: want.blocks.length, ...(wrong ? { wrong } : {}) };
};

/** Every `.jsonl` under `dir` but subagents'. */
const transcriptsUnder = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true }))
    .map(String)
    .filter((name) => name.endsWith(".jsonl") && !name.includes("subagents"))
    .map((name) => join(dir, name));

const rssMb = (): number => process.memoryUsage().rss / 1024 / 1024;

/** `read`, timed, with the loop's longest hold and the reader's memory growth while it ran. */
const measured = async <T>(read: () => Promise<T>) => {
  Bun.gc(true);
  const before = rssMb();
  const loop = monitorEventLoopDelay({ resolution: 5 });
  loop.enable();
  let peak = before;
  const sampler = setInterval(() => {
    peak = Math.max(peak, rssMb());
  }, 20);
  const began = performance.now();
  const value = await read();
  const ms = performance.now() - began;
  clearInterval(sampler);
  loop.disable();
  peak = Math.max(peak, rssMb());
  return { value, ms, grewMb: peak - before, loopMs: loop.max / 1e6 };
};

export default {
  name: "transcript-windows",
  run: async (kit: Kit) => {
    const { check, note } = kit;
    const dir = join(
      process.env.TMPDIR ?? tmpdir(),
      `transcript-windows-${process.pid}`
    );
    await mkdir(dir, { recursive: true });
    try {
      // (a) and (b): written transcripts, then the host's own when named.
      const written: string[] = [];
      for (const [seed, mb, compactEvery] of [
        [1, 2, 0],
        [2, 6, 25],
        [3, 12, 8],
        [4, 20, 40],
      ] as const) {
        const path = join(dir, `seed-${seed}.jsonl`);
        writeClaudeTranscript(path, {
          bytes: mb * 1024 * 1024,
          compactEvery,
          seed,
          sessionId: `00000000-0000-4000-8000-00000000000${seed}`,
          cwd: "/probe",
        });
        written.push(path);
      }
      const named = process.env.CAWCO_TRANSCRIPTS;
      const real = named ? await transcriptsUnder(named) : [];
      for (const path of [...written, ...real]) {
        for (const limit of SIZES) {
          // biome-ignore lint/performance/noAwaitInLoops: one transcript at a time
          const found = await parity(claudeReader(path), limit);
          check(
            `a, b: ${path.replace(dir, "written")} (${found.entries} entries, ${found.blocks} blocks) read in ${found.windows} window(s) of ${limit} builds the rows, branches and pages a whole read builds`,
            found.wrong === undefined,
            found.wrong
          );
        }
      }

      // (d) pi: sessions pi itself wrote, read through the agent's pi reader.
      process.env.PI_CODING_AGENT_DIR = join(dir, "pi-agent");
      const cwd = join(dir, "pi-project");
      await mkdir(cwd, { recursive: true });
      const { writePiSession } = await import("../pi-transcripts");
      const { piHarness } =
        await import("../../../packages/agent/src/harnesses/pi");
      for (const [seed, turns] of [
        [11, 12],
        [12, 60],
        [13, 160],
      ] as const) {
        const key = writePiSession(cwd, turns, seed);
        const reader: Reader = {
          whole: () => piHarness.getSessionMessages(key, cwd),
          window: (ask) => piHarness.readTranscriptWindow(key, cwd, ask),
        };
        for (const limit of SIZES) {
          // biome-ignore lint/performance/noAwaitInLoops: one session at a time
          const found = await parity(reader, limit);
          check(
            `d: a pi session of ${turns} turns (${found.entries} entries, ${found.blocks} blocks) read in ${found.windows} window(s) of ${limit} builds the rows, branches and pages a whole read builds`,
            found.wrong === undefined,
            found.wrong
          );
        }
      }

      // (c) The big one.
      let big = process.env.CAWCO_TRANSCRIPT;
      if (!big) {
        big = join(dir, "big.jsonl");
        const made = writeClaudeTranscript(big, {
          bytes: BIG_MB * 1024 * 1024,
          compactEvery: 400,
          seed: 7,
          sessionId: "00000000-0000-4000-8000-000000000007",
          cwd: "/probe",
        });
        note(
          `a ${Math.round(made.bytes / 1024 / 1024)} MB transcript of ${made.turns} turns written`
        );
      }
      const size = (await stat(big)).size / 1024 / 1024;
      const first = await measured(() =>
        readSaidWindow(big, { end: "newest", limit: WINDOW })
      );
      check(
        `c: the newest window of a ${Math.round(size)} MB transcript (${first.value.messages.length} entries) answers in ${Math.round(first.ms)} ms (≤ ${FIRST_MS}), the reader grown ${Math.round(first.grewMb)} MB (< ${FIRST_MB}), the loop held at most ${first.loopMs.toFixed(1)} ms (≤ ${LOOP_MS})`,
        first.ms <= FIRST_MS &&
          first.grewMb < FIRST_MB &&
          first.loopMs <= LOOP_MS
      );
      const { older } = first.value;
      if (older === null) {
        check("c: the newest window names an older one", false);
        return;
      }
      const scan = await measured(() =>
        readSaidWindow(big, { before: older, limit: WINDOW })
      );
      note(
        `c: the window before it, the line index's first scan of the file with it: ${Math.round(scan.ms)} ms, the reader grown ${Math.round(scan.grewMb)} MB`
      );
      check(
        `c: the line index's first scan of ${Math.round(size)} MB holds the loop at most ${scan.loopMs.toFixed(1)} ms (≤ ${LOOP_MS})`,
        scan.loopMs <= LOOP_MS
      );
      const next = scan.value.older;
      if (next !== null) {
        const paged = await measured(() =>
          readSaidWindow(big, { before: next, limit: WINDOW })
        );
        check(
          `c: with the index built, the next older window (${paged.value.messages.length} entries) answers in ${Math.round(paged.ms)} ms (≤ ${FIRST_MS}), the loop held at most ${paged.loopMs.toFixed(1)} ms`,
          paged.ms <= FIRST_MS && paged.loopMs <= LOOP_MS
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
} satisfies Spec;
