#!/usr/bin/env bun
/**
 * Restore probe: a session whose turn was running when its process died is
 * back mid-turn once the hub restores it, handed that turn back exactly once.
 *
 *   bun scripts/probe-restore-turn.ts [--harness claude|opencode|pi]...
 *
 * On a scratch fleet (scratch-fleet.ts): a real hub, agent and sessiond
 * against a mock model that streams a slow reply.
 *
 *   A. Each harness's session is sent a turn; while the mock streams it, the
 *      agent is stopped and sessiond's process tree killed (what systemd's
 *      control-group stop does), then both start again. The session must be
 *      handed back its turn once: the mock sees one new request carrying the
 *      hand-back, and the hub holds one hand-back send.
 *   B. The hub is killed (SIGKILL) and started again: no second hand-back.
 *   C. (claude) Two delegates asleep on a cut turn from before the hub kept
 *      the turn it cut, past the restore's horizon: one whose workspace is
 *      there is woken to carry on, once; one whose workspace is gone fails,
 *      and its parent is told.
 *
 * Prints `restore probe: <harness> continued once; no repeat after hub
 * restart` per harness that passed, and exits 0 only if every one did.
 */
import {
  delay,
  HARNESSES,
  type Harness,
  MODEL,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const HAND_BACK =
  /CawCo restarted this session's process|A restart cut your turn/;
const TAG = /SLOW-PROBE ([\w-]+)/;
const SLOW_WORDS = Array.from({ length: 240 }, (_, i) => `word${i} `);

const wanted = (() => {
  const named: Harness[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--harness") {
      named.push(argv[i + 1] as Harness);
      i += 1;
    }
  }
  return named.length ? named : HARNESSES;
})();

/** A request carrying a hand-back of a cut turn. */
const isHandBack = (one: Seen) => HAND_BACK.test(one.last);
/** A session's own slow turn, as the probe started it. */
const isSlow = (one: Seen) =>
  one.tools && !isHandBack(one) && TAG.test(one.last);
/** Which probe session a request is in: the tag its conversation carries. */
const tagOf = (one: Seen) => one.all.match(TAG)?.[1];

const fleet = await scratchFleet({
  name: "restore-probe",
  respond: (request) =>
    isSlow(request)
      ? { words: SLOW_WORDS, everyMs: 1000 }
      : {
          words: [isHandBack(request) ? "probe-continued" : "probe-ok"],
          everyMs: 5,
        },
});
const { seen, instance, query, write } = fleet;

const handBacksStored = (id: string) =>
  query<{ n: number }>(
    "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND (body LIKE '%CawCo restarted this session%' OR body LIKE '%A restart cut your turn%')",
    id
  )[0]?.n ?? 0;
const handBacksSeen = (tag: string) =>
  seen.filter((one) => isHandBack(one) && one.tools && tagOf(one) === tag)
    .length;
const streaming = (tag: string) =>
  seen.some((one) => isSlow(one) && tagOf(one) === tag);

const results: { harness: string; ok: boolean; detail: string }[] = [];
const check = (harness: string, ok: boolean, detail: unknown) => {
  results.push({ harness, ok, detail: JSON.stringify(detail) });
  console.log(`${ok ? "PASS" : "FAIL"} ${harness}: ${JSON.stringify(detail)}`);
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  if (wanted.includes("claude")) {
    await fleet.accountSignedIn();
  }

  // ── A. Cut mid-turn by a sessiond and agent stop ──────────────────────
  const sessions = new Map<Harness, string>();
  for (const harness of wanted) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one session up at a time
      const id = await fleet.spawn(harness, `Restore probe ${harness}`);
      sessions.set(harness, id);
      await fleet.send(id, `SLOW-PROBE ${harness}: count slowly.`);
      await until(
        `${harness} turn streaming`,
        () => streaming(harness),
        Boolean,
        180_000
      );
      await until(
        `${harness} turn written down`,
        () => instance(id),
        (row) => row?.turn_open_at !== null,
        30_000
      );
      console.log(
        `… ${harness} ${id} mid-turn: ${JSON.stringify(instance(id))}`
      );
    } catch (error) {
      sessions.delete(harness);
      check(harness, false, { phase: "reach", error: String(error) });
    }
  }
  await delay(3000);
  await fleet.stop("agent");
  await fleet.killSessiond();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
  for (const [harness, id] of sessions) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each harness's hand-back is waited for in turn
      await until(
        `${harness} handed back its turn`,
        () => handBacksSeen(harness),
        (n) => n >= 1,
        240_000
      );
    } catch (error) {
      check(harness, false, {
        phase: "hand-back",
        error: String(error),
        row: instance(id),
        stored: handBacksStored(id),
      });
      sessions.delete(harness);
    }
  }
  await delay(20_000);
  const afterRestore = new Map<Harness, { seen: number; stored: number }>();
  for (const [harness, id] of sessions) {
    afterRestore.set(harness, {
      seen: handBacksSeen(harness),
      stored: handBacksStored(id),
    });
  }

  // ── B. The hub killed and started again ──────────────────────────────
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  // Three heartbeats and a register's restores: room for any repeat.
  await delay(50_000);
  for (const [harness, id] of sessions) {
    const before = afterRestore.get(harness);
    const now = { seen: handBacksSeen(harness), stored: handBacksStored(id) };
    const ok =
      before?.seen === 1 &&
      before.stored === 1 &&
      now.seen === 1 &&
      now.stored === 1;
    check(harness, ok, {
      afterRestore: before,
      afterHubRestart: now,
      row: instance(id),
    });
    if (ok) {
      console.log(
        `restore probe: ${harness} continued once; no repeat after hub restart`
      );
    }
  }

  // ── C. Delegates asleep on a cut turn, past the horizon ──────────────
  if (wanted.includes("claude")) {
    await phaseC();
  }
} catch (error) {
  check("probe", false, {
    error: error instanceof Error ? error.stack : String(error),
  });
} finally {
  await fleet.close();
}

async function phaseC(): Promise<void> {
  const parent = await fleet.spawn(
    "claude",
    "Restore probe parent",
    fleet.repo
  );
  // A parent with a conversation of its own, as every delegating session has.
  const answered = seen.length;
  await fleet.send(parent, "Say hello.");
  await until(
    "the parent's first turn",
    () => seen.length,
    (n) => n > answered,
    120_000
  );
  await delay(5000);
  const items: {
    name: string;
    workItemId: string;
    instanceId: string;
    workspaceId: string;
  }[] = [];
  for (const name of ["item-wake", "item-gone", "item-open"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one delegate at a time
    const started = await fleet.api<{
      workItemId: string;
      instanceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Restore probe ${name}`,
      prompt: `SLOW-PROBE ${name}: count slowly.`,
      harness: "claude",
      model: MODEL.claude,
      cwd: fleet.repo,
      checks: [{ name: "Probe check", command: "true" }],
    });
    await until(`${name} streaming`, () => streaming(name), Boolean, 180_000);
    const [item] = query<{ workspace_id: string }>(
      "SELECT workspace_id FROM work_items WHERE id = ?",
      started.workItemId
    );
    items.push({ name, ...started, workspaceId: item?.workspace_id ?? "" });
  }
  await delay(3000);
  await fleet.stop("agent");
  await fleet.stop("hub");
  await fleet.killSessiond();
  // Asleep, last moved two hours ago (past the restore's horizon). item-wake
  // and item-gone as the migration leaves a row from before this fix: the
  // turn it had open unrecorded, so their transcripts decide; item-gone's
  // workspace is gone. item-open keeps the open turn this hub recorded.
  const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
  const byName = (name: string) => items.find((item) => item.name === name);
  const open = byName("item-open");
  const recorded = open ? instance(open.instanceId)?.turn_open_at : undefined;
  if (!(typeof recorded === "number" && recorded > 0)) {
    throw new Error(
      `item-open's open turn was not recorded: ${String(recorded)}`
    );
  }
  for (const item of items) {
    write(
      `UPDATE instances SET status = 'sleeping', updated_at = ?${item.name === "item-open" ? "" : ", turn_open_at = -1"} WHERE id = ?`,
      twoHoursAgo,
      item.instanceId
    );
  }
  const gone = byName("item-gone");
  if (gone) {
    write(
      "UPDATE workspaces SET state = 'archived' WHERE id = ?",
      gone.workspaceId
    );
  }
  const wakeCount = () => handBacksSeen("item-wake");
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const wake = byName("item-wake");
  try {
    await until("item-wake carried on", wakeCount, (n) => n >= 1, 240_000);
    await until(
      "item-open carried on",
      () => handBacksSeen("item-open"),
      (n) => n >= 1,
      240_000
    );
    const failed = await until(
      "item-gone failed",
      () =>
        query<{ state: string; error: string | null }>(
          "SELECT state, error FROM work_items WHERE id = ?",
          gone?.workItemId ?? ""
        )[0],
      (row) => row?.state === "failed",
      60_000
    );
    const told = await until(
      "the parent told",
      () =>
        query<{ n: number }>(
          "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND body LIKE '%cut by a restart%'",
          parent
        )[0]?.n ?? 0,
      (n) => n >= 1,
      60_000
    );
    // A second hub start settles nothing twice.
    await fleet.stop("hub", "SIGKILL");
    fleet.launch("hub");
    await fleet.hubUp();
    await fleet.agentUp();
    await delay(30_000);
    // A woken item carries on as any item does: the mock's one-word answers
    // never call finish_item, so the item's own rule may end it for that
    // later. What counts is that the settle woke it rather than failed it.
    const stateOf = (workItemId: string | undefined) => {
      const [row] = query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        workItemId ?? ""
      );
      return row?.error?.includes("cut by a restart")
        ? `failed by the settle: ${row.error}`
        : "woken";
    };
    const woken = {
      requests: wakeCount(),
      stored: handBacksStored(wake?.instanceId ?? ""),
      item: stateOf(wake?.workItemId),
    };
    const reopened = {
      requests: handBacksSeen("item-open"),
      stored: handBacksStored(open?.instanceId ?? ""),
      item: stateOf(open?.workItemId),
    };
    const once = (one: typeof woken) =>
      one.requests === 1 && one.stored === 1 && one.item === "woken";
    const ok = once(woken) && once(reopened) && told === 1;
    check("settle", ok, {
      unrecordedWoken: woken,
      recordedWoken: reopened,
      goneItem: failed,
      parentTold: told,
    });
    if (ok) {
      console.log(
        "restore probe: asleep items settled once; no repeat after hub restart"
      );
    }
  } catch (error) {
    check("settle", false, { error: String(error) });
  }
}

const failed = results.filter((one) => !one.ok);
await fleet.clean(failed.length > 0 || Boolean(process.env.RESTORE_PROBE_KEEP));
console.log(
  `${results.length - failed.length}/${results.length} checks passed`
);
process.exit(failed.length === 0 && results.length > 0 ? 0 : 1);
