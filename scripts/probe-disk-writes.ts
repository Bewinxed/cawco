/**
 * Probe: the agent's steady-state disk writes on a busy fleet, on a scratch
 * fleet (real hub, agent and sessiond on loopback; no live service touched).
 *
 * The invariant: with 10 sessions appending to their transcripts continuously,
 * the agent dirties well under macOS's daily budget for a process ("24.86 KB
 * per second over 86400 seconds"); the target is under 10 KB/s.
 *
 * 1. A history is seeded into the scratch HOME's `~/.claude/projects`: 300
 *    Claude Code transcripts at a desktop's scale, every byte drawn from a
 *    fixed seed, so two runs index and count the very same corpus.
 * 2. The agent starts, indexes it and folds its usage; the probe waits until
 *    both have caught up and the agent has gone quiet.
 * 3. Ten writers append Claude Code-shaped events, one step every 3s each
 *    (an assistant message as a text line and a tool_use line sharing its
 *    id and usage, the tool's result, and a person's prompt every 8th step),
 *    for `--minutes` (default 10). The step count is fixed, not the clock, so
 *    the transcripts end byte-identical run to run.
 * 4. `/proc/<agent pid>/io` is read every 30s: `write_bytes` (pages the agent
 *    dirtied, which is what macOS's "file backed memory dirtied" counts) and
 *    `wchar` (bytes it handed to write calls), with each database's file
 *    sizes beside them. The agent runs under strace, which logs every write
 *    call with the path its descriptor names; the RATE line's `writers` are
 *    the window's bytes per second by file, ids in names folded to `*`.
 * 5. After the writers stop and the usage loop has run once more, a search
 *    through the hub brings the index up to date as the dashboard's would;
 *    then the agent is stopped and the probe reads what it delivers: every
 *    usage bucket and the top search hits for a fixed set of queries. Two
 *    runs' `--out` files compare those directly.
 *
 * Run from the repo root (Linux):
 *   bun scripts/probe-disk-writes.ts [--minutes 10] [--out result.json] [--keep]
 */
import { Database } from "bun:sqlite";
import { appendFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../packages/core/src/claude-dirs";
import { TranscriptIndex } from "../packages/jsonl-parser/src/fts5";
import { ensureDeps } from "./lib/deps";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { delay, scratchFleet, until } = await import("./scratch-fleet");

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const keep = process.argv.includes("--keep");
const minutes = Number(arg("--minutes") ?? 10);
const out = arg("--out");

const SEED_FILES = 300;
const SEED_PROJECTS = 12;
const WRITERS = 10;
const STEP_MS = 3000;
const SAMPLE_MS = 30_000;
const MODEL = "claude-sonnet-4-5";
const SEED_BASE = Date.parse("2026-09-20T00:00:00Z");
const LIVE_BASE = Date.parse("2026-10-12T08:00:00Z");

/** Park–Miller's minimal standard generator: the corpus's one source of chance. */
const PRIME = 2_147_483_647;
const rng = (seed: number) => {
  let state = (seed % (PRIME - 1)) + 1;
  // A few draws first: nearby seeds start far apart.
  for (let i = 0; i < 8; i += 1) {
    state = (state * 48_271) % PRIME;
  }
  return () => {
    state = (state * 48_271) % PRIME;
    return (state - 1) / (PRIME - 1);
  };
};

const SYLLABLES = [
  "ka",
  "lo",
  "mi",
  "ren",
  "tor",
  "sha",
  "vel",
  "dun",
  "pri",
  "zo",
  "qua",
  "nex",
  "bel",
  "cor",
  "fin",
  "gra",
  "hul",
  "jin",
  "lex",
  "mor",
  "nul",
  "pex",
  "ras",
  "sim",
];
const vocabulary = (() => {
  const draw = rng(7);
  const words = new Set<string>();
  while (words.size < 6000) {
    const n = 2 + Math.floor(draw() * 3);
    let word = "";
    for (let i = 0; i < n; i += 1) {
      word += SYLLABLES[Math.floor(draw() * SYLLABLES.length)];
    }
    words.add(word);
  }
  return [...words];
})();
/** A word, skewed toward the head of the vocabulary as prose is. */
const word = (draw: () => number) =>
  vocabulary[Math.floor(vocabulary.length * draw() ** 3)] as string;
const prose = (draw: () => number, words: number) =>
  Array.from({ length: words }, () => word(draw)).join(" ");
/**
 * A v4-shaped uuid, random but for its last six hex: the session's seed. Two
 * sessions' generators can run in step, so without it they collide; at the
 * end, it leaves the leading characters (what an index orders by) random.
 */
const uuidOf = (seed: number) => (draw: () => number) => {
  const hex = Array.from({ length: 26 }, () =>
    Math.floor(draw() * 16).toString(16)
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 26)}${seed.toString(16).padStart(6, "0")}`;
};

/** One session's transcript, a step at a time, as Claude Code writes it. */
const session = (seed: number, project: string, base: number) => {
  const draw = rng(seed);
  const uuid = uuidOf(seed);
  const sessionId = uuid(draw);
  const cwd = `/home/probe/${project}`;
  let parent: string | null = null;
  let step = 0;
  const line = (record: object) => {
    const uuidNow = uuid(draw);
    const json = JSON.stringify({
      parentUuid: parent,
      isSidechain: false,
      userType: "external",
      cwd,
      sessionId,
      version: "2.1.0",
      gitBranch: "main",
      ...record,
      uuid: uuidNow,
      timestamp: new Date(base + step * STEP_MS).toISOString(),
    });
    parent = uuidNow;
    return `${json}\n`;
  };
  return {
    sessionId,
    /** The lines of the next step. */
    next(): string {
      let text = "";
      if (step % 8 === 0) {
        text += line({
          type: "user",
          message: {
            role: "user",
            content: prose(draw, 10 + Math.floor(draw() * 30)),
          },
        });
      }
      const messageId = `msg_${uuid(draw).replaceAll("-", "")}`;
      const requestId = `req_${uuid(draw).replaceAll("-", "")}`;
      const usage = {
        input_tokens: 4 + Math.floor(draw() * 20),
        cache_creation_input_tokens: Math.floor(draw() * 3000),
        cache_read_input_tokens: 20_000 + Math.floor(draw() * 80_000),
        output_tokens: 50 + Math.floor(draw() * 900),
        service_tier: "standard",
      };
      const assistant = (content: object[]) =>
        line({
          type: "assistant",
          requestId,
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            model: MODEL,
            content,
            stop_reason: null,
            stop_sequence: null,
            usage,
          },
        });
      const toolUseId = `toolu_${uuid(draw).replaceAll("-", "")}`;
      const tool = ["Read", "Bash", "Edit", "Grep"][Math.floor(draw() * 4)];
      text += assistant([
        // 8–40 words: with the tool's result and every line's envelope, a
        // step's searchable text comes to ~3% of its bytes, as on a real
        // corpus ("~2.3% of the bytes", packages/jsonl-parser/src/text.ts).
        { type: "text", text: prose(draw, 8 + Math.floor(draw() * 32)) },
      ]);
      text += assistant([
        {
          type: "tool_use",
          id: toolUseId,
          name: tool,
          input: { path: `${cwd}/${word(draw)}.ts` },
        },
      ]);
      text += line({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: prose(draw, 300 + Math.floor(draw() * 500)),
            },
          ],
        },
        toolUseResult: { stdout: "", stderr: "" },
      });
      step += 1;
      return text;
    },
  };
};

const ioOf = async (pid: number) => {
  const text = await Bun.file(`/proc/${pid}/io`).text();
  const field = (name: string) =>
    Number(new RegExp(`^${name}: (\\d+)$`, "m").exec(text)?.[1] ?? Number.NaN);
  return { writeBytes: field("write_bytes"), wchar: field("wchar") };
};

const sizeOf = (path: string) =>
  stat(path).then(
    (s) => s.size,
    () => 0
  );

/**
 * The agent's command prefix: strace logging each write call (one file per
 * thread, so no call is split across lines) with its descriptor's path and
 * the epoch time. The seccomp filter stops the agent only on those calls.
 */
const straceWrap = (prefix: string) => [
  "strace",
  "--seccomp-bpf",
  "-ff",
  "-y",
  "-ttt",
  "-qq",
  "-s",
  "0",
  "-e",
  "signal=none",
  "-e",
  "status=successful",
  "-e",
  "trace=write,pwrite64,writev,pwritev,pwritev2",
  "-o",
  prefix,
];

/** `<epoch> pwrite64(12</path>, ""..., 4096, 8192) = 4096` */
const WRITE_CALL = /^(\d+\.\d+) \w+\(\d+<(.+?)>, .* = (\d+)$/;
/** What strace appends to an unlinked file's path. */
const DELETED = / \(deleted\)$/;
/** A uuid, a run of eight or more hex characters, or of digits. */
const ID = /[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8,}|\d+/g;

/**
 * What the agent wrote to files between two epoch seconds, by file class:
 * a path under the scratch HOME shown from `~`, with every run of digits or
 * of eight or more hex characters (a session's id, a temp file's suffix)
 * folded to `*`. Sockets, pipes and devices are not files and are left out.
 */
const writesByFile = async (
  dir: string,
  home: string,
  from: number,
  to: number
): Promise<Map<string, number>> => {
  const bytes = new Map<string, number>();
  for (const name of await readdir(dir)) {
    // biome-ignore lint/performance/noAwaitInLoops: one thread's log at a time
    const text = await Bun.file(join(dir, name)).text();
    for (const line of text.split("\n")) {
      const call = WRITE_CALL.exec(line);
      if (!call) {
        continue;
      }
      const [, at, path, written] = call as unknown as [
        string,
        string,
        string,
        string,
      ];
      const time = Number(at);
      if (
        time < from ||
        time > to ||
        !path.startsWith("/") ||
        path.startsWith("/dev/")
      ) {
        continue;
      }
      const shown = path
        .replace(home, "~")
        .replace(DELETED, "")
        .replace(ID, "*");
      bytes.set(shown, (bytes.get(shown) ?? 0) + Number(written));
    }
  }
  return bytes;
};

const projectOf = (i: number) => `-home-probe-project-${i % SEED_PROJECTS}`;

/** Writes the seeded history under `projects`; answers its size in bytes. */
const writeHistory = async (projects: string): Promise<number> => {
  let seededBytes = 0;
  for (let i = 0; i < SEED_FILES; i += 1) {
    const dir = join(projects, projectOf(i));
    // biome-ignore lint/performance/noAwaitInLoops: one transcript written at a time
    await mkdir(dir, { recursive: true });
    const one = session(1000 + i, projectOf(i), SEED_BASE + i * 3_600_000);
    const steps = 50 + Math.floor(rng(5000 + i)() * 200);
    let text = "";
    for (let s = 0; s < steps; s += 1) {
      text += one.next();
    }
    seededBytes += text.length;
    await writeFile(join(dir, `${one.sessionId}.jsonl`), text);
  }
  return seededBytes;
};

/** The ten live sessions, each a step at a time. */
const liveWriters = (projects: string) =>
  Array.from({ length: WRITERS }, (_, w) => {
    const one = session(90_000 + w, projectOf(w), LIVE_BASE + w * 1000);
    return {
      file: join(projects, projectOf(w), `${one.sessionId}.jsonl`),
      session: one,
    };
  });

const liveSteps = Math.round((minutes * 60_000) / STEP_MS);

// `--corpus <dir>`: the same transcripts a run ends with, written at once and
// nothing run, for reading what two indexers make of identical bytes.
const corpus = arg("--corpus");
if (corpus) {
  await writeHistory(corpus);
  for (const writer of liveWriters(corpus)) {
    let text = "";
    for (let s = 0; s < liveSteps; s += 1) {
      text += writer.session.next();
    }
    // biome-ignore lint/performance/noAwaitInLoops: one transcript written at a time
    await writeFile(writer.file, text);
  }
  console.log(`… corpus written to ${corpus}`);
  process.exit(0);
}

const fleet = await scratchFleet({
  name: "probe-disk-writes",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
const dataDir = join(fleet.home, ".local", "share", "cawco");
const usageDb = join(dataDir, "usage.db");
const indexDb = join(dataDir, "transcript-index.db");
const projectsDir = join(fleet.home, CLAUDE_DIR_NAME, "projects");
const traceDir = join(fleet.sandbox, "strace");
await mkdir(traceDir, { recursive: true });

const dbSizes = async () => ({
  usageDb: await sizeOf(usageDb),
  usageWal: await sizeOf(`${usageDb}-wal`),
  indexDb: await sizeOf(indexDb),
});

let failure: unknown;
try {
  // ── 1. The seeded history ──────────────────────────────────────────────
  const seededBytes = await writeHistory(projectsDir);
  console.log(
    `… seeded ${SEED_FILES} transcripts, ${(seededBytes / 2 ** 20).toFixed(1)} MB`
  );

  // ── 2. The fleet, caught up and quiet ─────────────────────────────────
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  // The launched child is strace; the agent is its one child.
  const tracer = fleet.launch("agent", straceWrap(join(traceDir, "agent")));
  const agent = {
    pid: await until(
      "the agent started under strace",
      async () =>
        Number(
          (
            await Bun.file(
              `/proc/${tracer.pid}/task/${tracer.pid}/children`
            ).text()
          ).trim()
        ),
      (pid) => pid > 0,
      30_000
    ),
  };
  await fleet.agentUp();
  // The index keeps a rollback journal: its writer shuts readers out while
  // it commits (and while a catch-up spills its cache), so a read waits.
  const read = <T>(path: string, sql: string): T | undefined => {
    const db = new Database(path, { readonly: true });
    try {
      db.exec("PRAGMA busy_timeout = 60000");
      return db.query(sql).get() as T;
    } finally {
      db.close();
    }
  };
  await until(
    "the index caught up on the seeded history",
    () => read<{ n: number }>(indexDb, "SELECT count(*) AS n FROM files")?.n,
    (n) => n >= SEED_FILES,
    600_000
  );
  await until(
    "the usage store rebuilt",
    () => read<{ n: number }>(usageDb, "SELECT count(*) AS n FROM files")?.n,
    (n) => n >= SEED_FILES,
    600_000
  );
  // The agent attaches to the hub once both have caught up, and its first
  // fleet sync then installs the fleet's skills into each harness's fresh
  // directory (~700 KB, once: an unchanged skill is never rewritten). The
  // window is the steady state, so it opens after that.
  await until(
    "the fleet's first sync placed in every harness",
    async () => {
      const sidecars = [
        join(fleet.home, CLAUDE_DIR_NAME, "cawco-fleet.json"),
        join(fleet.home, ".pi", "agent", "cawco-fleet.json"),
        join(fleet.home, ".config", "opencode", "cawco-fleet.json"),
      ];
      const placed = await Promise.all(
        sidecars.map((path) => Bun.file(path).exists())
      );
      return placed.every(Boolean);
    },
    (placed) => placed,
    600_000
  );
  let last = await ioOf(agent.pid);
  await until(
    "the agent quiet (under 64 KB dirtied in 65s)",
    async () => {
      await delay(65_000);
      const now = await ioOf(agent.pid);
      const dirtied = now.writeBytes - last.writeBytes;
      last = now;
      return dirtied;
    },
    (dirtied) => dirtied < 64 * 1024,
    900_000
  );
  // The catch-up's last WAL frames, checkpointed now from this process, so
  // the window counts only what the agent writes in it.
  const usage0 = new Database(usageDb);
  usage0.exec("PRAGMA busy_timeout = 60000; PRAGMA wal_checkpoint(TRUNCATE)");
  usage0.close();
  console.log("… caught up and quiet:", await dbSizes());

  // ── 3. Ten sessions writing ────────────────────────────────────────────
  const appended = { bytes: 0 };
  const run = liveWriters(projectsDir).map(async (writer, w) => {
    await delay(w * (STEP_MS / WRITERS));
    const start = performance.now();
    for (let s = 0; s < liveSteps; s += 1) {
      const text = writer.session.next();
      appended.bytes += text.length;
      // biome-ignore lint/performance/noAwaitInLoops: a session writes its steps in order
      await appendFile(writer.file, text);
      const due = start + (s + 1) * STEP_MS - performance.now();
      if (due > 0) {
        await delay(due);
      }
    }
  });

  // ── 4. What the agent dirtied ─────────────────────────────────────────
  const first = await ioOf(agent.pid);
  const windowFrom = Date.now() / 1000;
  const t0 = performance.now();
  const samples: object[] = [];
  let writing = true;
  const done = Promise.all(run).then(() => {
    writing = false;
  });
  while (writing) {
    // biome-ignore lint/performance/noAwaitInLoops: one sample per interval
    await Promise.race([delay(SAMPLE_MS), done]);
    const now = await ioOf(agent.pid);
    const seconds = (performance.now() - t0) / 1000;
    const sample = {
      seconds: Math.round(seconds),
      writeBytes: now.writeBytes - first.writeBytes,
      wchar: now.wchar - first.wchar,
      ...(await dbSizes()),
    };
    samples.push(sample);
    console.log("…", JSON.stringify(sample));
  }
  const end = await ioOf(agent.pid);
  const windowTo = Date.now() / 1000;
  const seconds = (performance.now() - t0) / 1000;

  // ── 5. What it delivers, once the usage loop has run again and a search
  // has brought the index up to date ─────────────────────────────────────
  await delay(150_000);
  const live = liveWriters(projectsDir).map((writer) => writer.file);
  await until(
    "a search through the hub brought the index up to date",
    async () => {
      await fleet.api(`/api/search?q=${vocabulary[0]}`);
      const sizes = await Promise.all(live.map(sizeOf));
      const db = new Database(indexDb, { readonly: true });
      try {
        db.exec("PRAGMA busy_timeout = 60000");
        const offsetOf = db.query("SELECT offset FROM files WHERE path = ?");
        return live.every(
          (path, i) =>
            (offsetOf.get(path) as { offset: number } | null)?.offset ===
            sizes[i]
        );
      } finally {
        db.close();
      }
    },
    (fresh) => fresh,
    60_000
  );
  await fleet.stop("agent");
  // strace has exited with the agent, so its logs are whole.
  const byFile = await writesByFile(traceDir, fleet.home, windowFrom, windowTo);
  const writers = Object.fromEntries(
    [...byFile]
      .sort((a, b) => b[1] - a[1])
      .map(([file, bytes]) => [file, Math.round(bytes / seconds)])
  );
  const rates = {
    seconds: Math.round(seconds),
    writeBytesPerSecond: Math.round(
      (end.writeBytes - first.writeBytes) / seconds
    ),
    wcharPerSecond: Math.round((end.wchar - first.wchar) / seconds),
    transcriptBytesPerSecond: Math.round(appended.bytes / seconds),
    /** Write calls' bytes per second, by file (wchar's share that went to files). */
    writers,
  };
  console.log("RATE", JSON.stringify(rates));
  const usage = new Database(usageDb);
  const buckets = usage
    .query(
      `SELECT harness, start, first_ts, last_ts, session_id, project, project_path, model, provider,
         input, output, cache_creation, cache_read, reasoning, round(cost, 9) AS cost, messages
       FROM buckets ORDER BY harness, session_id, model, start`
    )
    .all();
  const messages = (
    usage.query("SELECT count(*) AS n FROM claude").get() as { n: number }
  ).n;
  usage.close();
  const index = new TranscriptIndex(indexDb);
  const queries = [
    ...[0, 3, 10, 40, 120, 400, 900, 1600, 2500, 3600, 4800, 5900].map(
      (i) => vocabulary[i] as string
    ),
    `${vocabulary[2]} ${vocabulary[50]}`,
    `${vocabulary[7]} ${vocabulary[300]}`,
    "Bash",
    "Edit",
  ];
  // The top hits by score, ties in docId order. Equal scores rank in the
  // order their rows were inserted, which follows when each sync caught the
  // writers, so the tie group a limit cuts through is left out.
  const SEARCH_LIMIT = 500;
  const search = Object.fromEntries(
    queries.map((q) => {
      const hits = index
        .search(q, { limit: SEARCH_LIMIT })
        .map((hit) => ({
          docId: hit.docId,
          sessionId: hit.sessionId,
          score: hit.score.toFixed(6),
          snippet: hit.snippet,
        }))
        .sort(
          (a, b) =>
            Number(a.score) - Number(b.score) || a.docId.localeCompare(b.docId)
        );
      const cut = hits.length === SEARCH_LIMIT ? hits.at(-1)?.score : undefined;
      return [q, hits.filter((hit) => hit.score !== cut)];
    })
  );
  const docs = index.count();
  index.close();
  const result = {
    rates,
    samples,
    counts: { buckets: buckets.length, messages, docs },
    buckets,
    search,
  };
  console.log("COUNTS", JSON.stringify(result.counts));
  if (out) {
    await writeFile(out, JSON.stringify(result, null, 1));
    console.log(`… written to ${out}`);
  }
} catch (error) {
  failure = error;
  console.error(error);
  console.error((await fleet.logs("agent")).split("\n").slice(-30).join("\n"));
} finally {
  await fleet.close();
  await fleet.clean(keep);
}
process.exit(failure ? 1 : 0);
