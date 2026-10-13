/**
 * Probe: fleet watch (packages/hub fleet-watch.ts, Projects spec §5.3, P5).
 * A looping session raises exactly one triage run and one nudge; an idle
 * fleet spends nothing. On a scratch fleet (real hub, agent and sessiond on
 * loopback, Claude Code against the mock model), with Jev answered by a
 * mock the hub reaches on its TypeSafe route (`CAWCO_TYPESAFE_URL`, jev.ts).
 *
 * A looping session reads the same missing file again and again: the same
 * `Read` call 3 times in a row, and the same tool error 3 times.
 *
 * a. Jev off: a session with a parent loops. One triage run starts after the
 *    second signal kind, it nudges the parent once, the watched session's
 *    transcript has the line; looping on through another turn starts no
 *    second triage and sends no second nudge.
 * b. Jev on, answering no: a looping session is asked about, and no triage
 *    starts.
 * c. An idle fleet for 10 minutes: no Jev question, no model request, no
 *    triage, counted from the hub's log, the Jev mock and the model mock.
 * d. A Caw-off project (Jev on): its looping session raises a needs-you
 *    notice, wakes no Jev question and starts no triage.
 * e. A reply rule and a meaning rule made before it all still fire.
 *
 * Run from the repo root: bun scripts/probe-fleet-watch.ts [--keep]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  delay,
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const TRIAGE = "You are fleet watch's triage";
const DECIDE = "mcp__cawco__triage_decide";
const MISSING = "/nonexistent-probe/loop.txt";
/** Claude Code's words for a Read of a missing file, in each failed result. */
const READ_FAILED = "File does not exist";
const LOOP = /PROBE-LOOP-([A-Z])/;
const SESSION_ID = /\(([0-9a-f-]{36})\)/;
/** How long the idle fleet is watched for spending (c). */
const IDLE_MS = 10 * 60_000;
/** A hub log line for fleet watch asking Jev, opening a signal or starting triage. */
const SPENDS = /\[fleet-watch\].*(asked Jev|triage started|signal:)/;
/** A hub log line for a Caw session started. */
const CAW_STARTED = /\[caw\].*started Caw/;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** Calls `name`, loading it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

/** The sessions a triage run has decided about, by the watched session's id. */
const decided = new Set<string>();

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // A triage run: one nudge, then its turn ends.
  if (request.all.includes(TRIAGE)) {
    const watched = SESSION_ID.exec(request.all)?.[1] ?? "";
    if (decided.has(watched)) {
      return text("Decided.");
    }
    const reply = call(request, DECIDE, {
      decision: "nudge",
      words:
        "PROBE-NUDGE: it reads the same missing file over and over. Tell it to stop and read the error.",
      reason: "The same failing Read, again and again.",
    });
    if (reply.tool?.name === DECIDE) {
      decided.add(watched);
    }
    return reply;
  }
  // A lead nudged, or a parent told of its child's turn: it answers only.
  if (request.all.includes("PROBE-PARENT")) {
    return text("Heard.");
  }
  // e: the session says both rules' words once, then acknowledges.
  if (request.all.includes("PROBE-RULES")) {
    return request.last.includes("PROBE-RULES")
      ? text("PROBE-RULE-PHRASE and PROBE-MEANING, as asked.")
      : text("Acknowledged.");
  }
  // A looping session: the same failing Read until its count is in.
  const loop = LOOP.exec(request.all);
  if (loop) {
    const fails = count(request.all, READ_FAILED);
    const upTo = request.all.includes("PROBE-AGAIN") ? 16 : 8;
    return fails < upTo
      ? tool("Read", { file_path: MISSING })
      : text("Still failing.");
  }
  return text("ok");
};

// ── Jev, as the hub reaches it on the TypeSafe route (CAWCO_TYPESAFE_URL) ───
/** Every question the hub asked Jev: its keys, and when. */
const jevHits: { at: number; keys: string[] }[] = [];
const jev = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const body = (await request.json()) as {
      questions: Record<string, unknown>;
      state: Record<string, string>;
    };
    const keys = Object.keys(body.questions);
    jevHits.push({ at: Date.now(), keys });
    const answers = Object.fromEntries(
      keys.map((key) => [
        key,
        {
          // Fleet watch's question is answered no; a meaning rule yes when
          // the session said its word.
          noul:
            key !== "stuck" &&
            String(body.state.agent_output).includes("PROBE-MEANING")
              ? 0.95
              : 0.05,
        },
      ])
    );
    return Response.json({
      answers,
      model: "jev-probe",
      usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
    });
  },
});
const stuckAsks = (since = 0) =>
  jevHits.filter((hit) => hit.at >= since && hit.keys.includes("stuck")).length;

const fleet = await scratchFleet({ name: "probe-fleet-watch", respond });
fleet.env.CAWCO_TYPESAFE_URL = `http://127.0.0.1:${jev.port}/systemone`;
const home = fleet.env.HOME as string;
const hubLog = () => fleet.logs("hub");
const watchLines = async () =>
  (await hubLog()).split("\n").filter((line) => line.includes("[fleet-watch]"));

const overseers = () =>
  fleet.query<{ id: string; title: string | null }>(
    "SELECT id, title FROM instances WHERE role = 'overseer'"
  );
const nudgesTo = (instanceId: string) =>
  fleet.query<{ uuid: string }>(
    "SELECT uuid FROM sent_messages WHERE instance_id = ? AND body LIKE '%[Fleet watch]%'",
    instanceId
  );
const linesOf = (instanceId: string) =>
  (
    fleet.query<{ lines: string | null }>(
      "SELECT watch_lines AS lines FROM instances WHERE id = ?",
      instanceId
    )[0]?.lines ?? "[]"
  ).toString();
/** The looping session has failed `fails` reads: the mock ends its turn there. */
const looped = (marker: string, fails: number) =>
  until(
    `${marker} to fail ${fails} reads`,
    () =>
      fleet.seen.filter(
        (one) =>
          one.all.includes(marker) && count(one.all, READ_FAILED) >= fails
      ).length,
    (n) => n > 0,
    300_000
  );

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // Two rules made before any of it: a phrase and a meaning (e).
  const phraseRule = await fleet.api<{ id: string }>("/api/rules", {
    name: "Probe phrase",
    enabled: true,
    pattern: "PROBE-RULE-PHRASE",
    matchKind: "phrase",
    caseSensitive: false,
    wholeWord: false,
    watch: "text",
    reply: "PROBE-RULE-REPLY: noted.",
    timing: "turn",
    interrupt: false,
    repeat: false,
    scope: {},
  });
  const meaningRule = await fleet.api<{ id: string }>("/api/rules", {
    name: "Probe meaning",
    enabled: true,
    pattern: "Does the agent's message contain the token PROBE-MEANING?",
    matchKind: "meaning",
    caseSensitive: false,
    wholeWord: false,
    watch: "text",
    reply: "PROBE-MEANING-REPLY: noted.",
    timing: "turn",
    interrupt: false,
    repeat: false,
    scope: {},
  });
  console.log(`… rules ${phraseRule.id}, ${meaningRule.id}`);
  const settings = await fleet.api<{ on: boolean; jev: boolean }>(
    "/api/fleet-watch"
  );
  check(
    "setup: fleet watch is on and Jev is off",
    settings.on && !settings.jev,
    JSON.stringify(settings)
  );

  // ── a: Jev off, a looping session with a parent ──────────────────────────
  let child = "";
  let parent = "";
  await section("a", async () => {
    parent = await fleet.spawn("claude", "Probe parent");
    child = await fleet.spawn("claude", "Probe looper");
    // Its parent, as a session it started would have it.
    fleet.write(
      "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
      parent,
      child
    );
    // The parent's conversation carries its marker, so the mock answers it.
    await fleet.send(parent, "PROBE-PARENT: wait for your session's reports.");
    await until(
      "the parent's first turn",
      () => fleet.seen.filter((one) => one.all.includes("PROBE-PARENT")).length,
      (n) => n > 0
    );
    await fleet.send(child, `PROBE-LOOP-A: read ${MISSING} until it works.`);
    await until(
      "a triage run",
      () => overseers(),
      (rows) => rows.length > 0,
      300_000
    );
    await until(
      "a nudge to the parent",
      () => nudgesTo(parent),
      (rows) => rows.length > 0,
      300_000
    );
    await looped("PROBE-LOOP-A", 8);
    await delay(5000);
    check(
      "a: one triage run after the second signal kind (Jev off)",
      overseers().length === 1,
      `${overseers().length} triage run(s): ${(await watchLines()).filter((line) => line.includes("triage") || line.includes("signal")).join(" | ")}`
    );
    check(
      "a: exactly one nudge, to its lead (the parent)",
      nudgesTo(parent).length === 1 && nudgesTo(child).length === 0,
      `${nudgesTo(parent).length} to the parent, ${nudgesTo(child).length} to the watched session`
    );
    check(
      "a: the decision is a line in the watched session's transcript",
      linesOf(child).includes("nudged"),
      linesOf(child).slice(0, 300)
    );
    // It loops on through another turn: the same episode.
    await fleet.send(child, "PROBE-AGAIN: try it again.");
    await looped("PROBE-AGAIN", 16);
    await delay(10_000);
    check(
      "a: looping on starts no second triage and sends no second nudge",
      overseers().length === 1 && nudgesTo(parent).length === 1,
      `${overseers().length} triage run(s), ${nudgesTo(parent).length} nudge(s)`
    );
  });

  // ── Jev on: a TypeSafe key, as Settings saves it ─────────────────────────
  const saved = await fetch(`${fleet.base}/api/jev/typesafe-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: `ts-probe-${crypto.randomUUID()}` }),
  });
  if (!saved.ok) {
    throw new Error(`the TypeSafe key was refused: ${await saved.text()}`);
  }
  const jevOn = await fleet.api<{ jev: boolean }>("/api/fleet-watch");
  check("setup: Jev is on", jevOn.jev, JSON.stringify(jevOn));

  // ── b: Jev on, answering no ──────────────────────────────────────────────
  await section("b", async () => {
    const before = overseers().length;
    const asked = stuckAsks();
    const looper = await fleet.spawn("claude", "Probe looper b");
    await fleet.send(looper, `PROBE-LOOP-B: read ${MISSING} until it works.`);
    await until(
      "Jev asked about it",
      () => stuckAsks() - asked,
      (n) => n > 0,
      300_000
    );
    await looped("PROBE-LOOP-B", 8);
    await delay(10_000);
    check(
      "b: Jev was asked, said no, and no triage started",
      stuckAsks() - asked > 0 && overseers().length === before,
      `${stuckAsks() - asked} fleet-watch question(s) to Jev, ${overseers().length - before} new triage run(s)`
    );
  });

  // ── d: a Caw-off project, Jev on ─────────────────────────────────────────
  await section("d", async () => {
    const src = join(fleet.sandbox, "caw-off");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`git init -q -b main && echo off > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Caw off",
      machineId: MACHINE,
      cwd: src,
      caw: false,
    });
    const before = overseers().length;
    const asked = stuckAsks();
    const looper = await fleet.spawn("claude", "Probe looper d", src, {
      projectId: project.id,
    });
    await fleet.send(looper, `PROBE-LOOP-D: read ${MISSING} until it works.`);
    const notices = await until(
      "a needs-you notice",
      () =>
        fleet.api<{ notices: { instanceId: string; title: string }[] }>(
          "/api/fleet-watch/notices"
        ),
      (read) => read.notices.some((one) => one.instanceId === looper),
      300_000
    );
    await looped("PROBE-LOOP-D", 8);
    await delay(5000);
    check(
      "d: a needs-you notice, no Jev question and no triage",
      notices.notices.some((one) => one.instanceId === looper) &&
        stuckAsks() - asked === 0 &&
        overseers().length === before,
      `notice “${notices.notices.find((one) => one.instanceId === looper)?.title}”, ${stuckAsks() - asked} Jev question(s), ${overseers().length - before} triage run(s); line ${linesOf(looper).slice(0, 200)}`
    );
  });

  // ── e: the rules made before it all still fire ───────────────────────────
  await section("e", async () => {
    const speaker = await fleet.spawn("claude", "Probe rules");
    await fleet.send(speaker, "PROBE-RULES: say the two words.");
    const replies = await until(
      "both rules' replies",
      () =>
        fleet.seen.filter(
          (one) =>
            one.all.includes("PROBE-RULES") &&
            (one.last.includes("PROBE-RULE-REPLY") ||
              one.last.includes("PROBE-MEANING-REPLY"))
        ),
      (seen) =>
        seen.some((one) => one.last.includes("PROBE-RULE-REPLY")) &&
        seen.some((one) => one.last.includes("PROBE-MEANING-REPLY")),
      300_000
    );
    check(
      "e: the reply rule and the meaning rule both fired",
      replies.length >= 2,
      `${replies.length} turn(s) started by a rule's reply`
    );
  });

  // ── c: an idle fleet for 10 minutes ──────────────────────────────────────
  await section("c", async () => {
    // Settle: every session's last turn over.
    await delay(30_000);
    const models = fleet.seen.length;
    const questions = jevHits.length;
    const runs = overseers().length;
    const spendLines = async () =>
      (await hubLog())
        .split("\n")
        .filter(
          (line) =>
            SPENDS.test(line) ||
            line.includes("[meaning]") ||
            CAW_STARTED.test(line)
        ).length;
    const logged = await spendLines();
    console.log(
      `… idle for ${IDLE_MS / 60_000} min from ${new Date().toISOString()}`
    );
    await delay(IDLE_MS);
    check(
      "c: an idle fleet for 10 minutes: no Jev question, no model request, no triage",
      fleet.seen.length === models &&
        jevHits.length === questions &&
        overseers().length === runs &&
        (await spendLines()) === logged,
      `model requests ${models} → ${fleet.seen.length}, Jev questions ${questions} → ${jevHits.length}, triage runs ${runs} → ${overseers().length}, hub log lines (Jev asks, signals, triage, meaning, Caw starts) ${logged} → ${await spendLines()}`
    );
  });
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  console.log((await watchLines()).slice(-40).join("\n"));
  await fleet.close();
  await jev.stop(true);
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
