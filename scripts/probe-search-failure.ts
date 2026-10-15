/**
 * Probe: a fleet search never drops a machine in silence, on a scratch fleet
 * of two machines (real hub, two agents and their sessionds on loopback; no
 * live service touched).
 *
 * 1. Both machines hold a transcript with the same word; a search through
 *    the hub returns both hits and no failures.
 * 2. The added machine's index folder is made read-only and its transcript
 *    gains a line, so its next sync throws (SQLite can't create its rollback
 *    journal). The search returns the first machine's hit, plus a failure
 *    naming the other and SQLite's reason; searched twice, the agent logs it
 *    once.
 * 3. The added machine's agent is frozen (SIGSTOP): the search returns the
 *    first machine's hit, plus a failure saying it didn't answer in time.
 *
 * Run from the repo root (Linux):
 *   bun scripts/probe-search-failure.ts [--keep]
 */
import { appendFile, chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../packages/core/src/claude-dirs";
import { ensureDeps } from "./lib/deps";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { delay, MACHINE, scratchFleet, until } = await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const WORD = "zephyrine";
const OTHER = "scratch-other";

interface Answer {
  failures: { machineId: string; message: string }[];
  hits: { machineId: string; snippet: string }[];
  machines: number;
}

const fleet = await scratchFleet({
  name: "probe-search-failure",
  respond: () => ({ words: ["ok"], everyMs: 10 }),
});

/** A Claude Code transcript line from a person, in `cwd`'s session `sessionId`. */
const userLine = (cwd: string, sessionId: string, text: string) =>
  `${JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    userType: "external",
    cwd,
    sessionId,
    version: "2.1.0",
    type: "user",
    message: { role: "user", content: text },
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  })}\n`;
/** One transcript in `home`'s Claude Code projects; its file and session. */
const seed = async (home: string, name: string, text: string) => {
  const sessionId = crypto.randomUUID();
  const dir = join(home, CLAUDE_DIR_NAME, "projects", `-work-${name}`);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  await writeFile(file, userLine(`/work/${name}`, sessionId, text));
  return { file, sessionId };
};
const search = () => fleet.api<Answer>(`/api/search?q=${WORD}&limit=20`);
const show = (label: string, answer: Answer) =>
  console.log(
    `\n=== ${label}\n${JSON.stringify(answer, ["machines", "hits", "machineId", "snippet", "failures", "message"], 2)}`
  );
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) {
    process.exitCode = 1;
  }
};

let indexDir: string | undefined;
let failure: unknown;
try {
  await seed(fleet.home, "first", `the ${WORD} plan on the first machine`);
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const other = await fleet.launchMachine(OTHER);
  const agents =
    await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
  console.log(
    `\n=== agents the hub holds\n${agents.map((row) => `${row.machineId}: ${row.status}`).join("\n")}`
  );
  check(
    "both machines registered and online",
    [MACHINE, OTHER].every((id) =>
      agents.some((row) => row.machineId === id && row.status === "online")
    )
  );

  // ── 1. Both machines answer ────────────────────────────────────────────
  const theirs = await seed(
    other.home,
    "other",
    `the ${WORD} plan on the other machine`
  );
  const healthy = await until(
    "both machines' hits",
    search,
    (answer) => answer.hits.length === 2,
    60_000
  );
  show("1. both machines answer", healthy);
  check("1. two hits, no failures", healthy.failures.length === 0);

  // ── 2. The other machine's index sync throws ───────────────────────────
  indexDir = join(other.home, ".local", "share", "cawco");
  await rm(join(indexDir, "transcript-index.db-journal"), { force: true });
  await chmod(indexDir, 0o555);
  await appendFile(
    theirs.file,
    userLine("/work/other", theirs.sessionId, `a ${WORD} line it can't index`)
  );
  // Past the agent's freshness window (search/index.ts SEARCH_FRESH_MS), so the search syncs first.
  await delay(11_000);
  const broken = await search();
  show("2. the other machine's index sync throws", broken);
  const again = await search();
  const named = (answer: Answer, words: string) =>
    answer.hits.length === 1 &&
    answer.hits[0]?.machineId === MACHINE &&
    answer.failures.length === 1 &&
    answer.failures[0]?.machineId === OTHER &&
    (answer.failures[0]?.message.includes(words) ?? false);
  check(
    "2. the first machine's hit, the other named with its index's reason",
    named(broken, "its index couldn't update (") &&
      named(again, "its index couldn't update (")
  );
  const logged = (await other.logs())
    .split("\n")
    .filter((line) => line.includes("[search] transcript index sync failed"));
  console.log(`\nthe other agent's sync failure lines:\n${logged.join("\n")}`);
  check("2. two failed searches, one log line", logged.length === 1);

  // ── 3. The other machine doesn't answer ────────────────────────────────
  process.kill(other.agent.pid, "SIGSTOP");
  const silent = await search();
  process.kill(other.agent.pid, "SIGCONT");
  show("3. the other machine doesn't answer", silent);
  check(
    "3. the first machine's hit, the other named as not answering",
    named(silent, "it didn't answer within 1.5 s")
  );
} catch (error) {
  failure = error;
} finally {
  if (indexDir) {
    await chmod(indexDir, 0o755).catch(() => undefined);
  }
  await fleet.close();
  await fleet.clean(keep);
}
if (failure) {
  throw failure;
}
