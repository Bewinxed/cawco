/**
 * A task whose merge checks need a Mac, with no Mac online, waits for one
 * and never fails for the want of it; a Mac coming online wakes it, and it
 * lands (hub work-items.ts `landSubmitted` → `declareWait`, `waitingTurn`,
 * `wakeCapable`; gate-file.ts `capableRefusal`, `capableWaitReason`,
 * `capableOnline`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model). This spec delegates, so its fleet cuts
 * workspaces: it runs on the host, outside every boundary.
 *
 * The project's gate.md declares CawCo's iOS build step (`needs: apple`); no
 * machine reports a Mac. A delegate commits under apps/apple and calls
 * finish_item, as a real agent does once its work is committed.
 *
 * 1. finish_item answers the gate's refusal: the iOS build passes on a Mac,
 *    none is online, the item waits for one, end your turn.
 * 2. The delegate does what the refusal says and ends its turn: its item is
 *    running, its wait reason "waiting for a Mac (apple) to come online".
 * 3. Three more turns end while it waits, each one a message read and
 *    answered in words: after each, the item is still running with that wait
 *    reason, and the hub never told it "Your work item is still open" (the
 *    quiet-turn count that failed every j5 leg's attempt).
 * 4. A Mac comes online (a second scratch machine reporting darwin-arm64, a
 *    stub build script in the project): the hub wakes the delegate with
 *    "<machine>, a Mac (apple), is online now: call finish_item again.", it
 *    finishes again, the iOS build runs on the Mac and passes, and the item
 *    is done, never failed.
 *
 *   bun scripts/probe-kit/run.ts mac-wait
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { APPLE_GATE, declareGate, MAC_ONLINE, NO_MAC } from "../gate";
import { callCount, callsInOrder, listedAs, say } from "../journeys/mock";
import type { Kit, Spec } from "../kit";
import { atRest } from "../phone";

const TAG = "PROBE-MAC-WAIT";
const COMMITTED = "DONE-COMMIT-MAC-WAIT";
const FILE = "apps/apple/Widget.swift";
const MAC = "probe-mac";
/** The wait reason the gate's refusal declares (gate-file.ts `capableWaitReason`). */
const WAIT_REASON = "waiting for a Mac (apple) to come online";
/** What the refusal tells the session to do. */
const END_TURN = "The item waits for one: end your turn";
/** The hub's quiet-turn reminder (work-items.ts `quietTurn`). */
const STILL_OPEN = "Your work item is still open";
const WHILE_WAITING = "PROBE-WHILE-WAITING";
/** The gate's iOS build step, as its lines name it (probe-kit gate.ts). */
const GATE_CHECK = "iOS build compiles";
/** The stub the gate runs on the Mac; the real one needs Xcode. */
const STUB = `#!/usr/bin/env bash
echo "STUB-MAC-BUILD $*"
`;
const TURNS = 3;

/**
 * The delegate: commit, finish; refused for want of a Mac, end the turn in
 * words, as the refusal says; any word while it waits is answered in words;
 * woken by the hub, finish again.
 */
const delegate = (seen: Seen): Reply => {
  if (!seen.all.includes(COMMITTED)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `mkdir -p apps/apple && echo '// widget' >> ${FILE} && git add ${FILE} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Widget' && echo ${COMMITTED}`,
          description: "Commit the work",
        },
      },
    };
  }
  const finishes = callCount(seen, "finish_item");
  const refusals = seen.body.split(NO_MAC).length - 1;
  const wakes = seen.all.split(MAC_ONLINE).length - 1;
  if (finishes === 0 || (finishes === refusals && wakes >= refusals)) {
    const input = {
      headline: "Committed the widget.",
      summary: `Committed ${FILE}.\n\nNot run: none.`,
    };
    const name = listedAs(seen, "finish_item");
    return name
      ? { everyMs: 5, words: [], tool: { name, input } }
      : (callsInOrder(seen, [{ name: "finish_item", input }]) ??
          say("finish_item is not offered."));
  }
  return say(finishes === refusals ? "Waiting for a Mac." : "Done.");
};

const respond = (seen: Seen): Reply =>
  seen.tools && seen.all.includes(TAG) ? delegate(seen) : say("ok");

interface ItemRow {
  error: string | null;
  instance_id: string;
  result: string | null;
  state: string;
  wait_reason: string | null;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "app");
  const scripts = join(repo, "apps", "apple", "scripts");
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "build-both.sh"), STUB);
  await chmod(join(scripts, "build-both.sh"), 0o755);
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Mac wait",
    machineId: MACHINE,
    cwd: repo,
  });
  await declareGate(fleet.base, project.id, APPLE_GATE);
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });

  const started = await fleet.api<{ workItemId: string }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Ship the widget",
    prompt: `${TAG}: commit the widget, then finish.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  const itemOf = () =>
    fleet.query<ItemRow>(
      "SELECT state, error, result, wait_reason, instance_id FROM work_items WHERE id = ?",
      started.workItemId
    )[0];
  const delegateSaw = (words: string) =>
    fleet.seen.filter(
      (one) => one.tools && one.all.includes(TAG) && one.all.includes(words)
    );

  // 1
  const refusal = await until(
    "the delegate's finish_item refused for want of a Mac",
    () => delegateSaw(NO_MAC).find((one) => one.afterTool)?.all,
    Boolean,
    600_000
  ).catch(() => "");
  const at = refusal.indexOf("This item changes");
  const said = at < 0 ? "" : refusal.slice(at);
  check(
    "1: finish_item answers that the iOS build passes on a Mac, none is online, and the item waits for one: end your turn",
    said.includes(NO_MAC) && said.includes(END_TURN),
    said.slice(0, 800) || "no refusal read"
  );

  // 2
  const instanceId = itemOf()?.instance_id as string;
  await atRest(fleet, instanceId);
  const waiting = (row: ItemRow | undefined) =>
    row?.state === "running" && row.wait_reason === WAIT_REASON;
  check(
    "2: its turn ended, the item is running and waits for a Mac",
    waiting(itemOf()),
    JSON.stringify(itemOf())
  );

  // 3
  for (let turn = 1; turn <= TURNS; turn += 1) {
    const words = `${WHILE_WAITING} ${turn}`;
    // biome-ignore lint/performance/noAwaitInLoops: each turn follows the one before it ended
    await fleet.send(instanceId, words);
    await until(
      `turn ${turn} read`,
      () => delegateSaw(words).length > 0,
      Boolean,
      120_000
    );
    await atRest(fleet, instanceId);
    // The hub settles the turn's end after the session rests: a quiet turn
    // would be told "still open" within this, a third would fail the item.
    await Bun.sleep(5000);
    const row = itemOf();
    check(
      `3: after turn ${turn} of ${TURNS} ended while it waits, the item is still running with its wait reason, and the hub never said it was still open`,
      waiting(row) && delegateSaw(STILL_OPEN).length === 0,
      `${JSON.stringify(row)}; still-open reminders: ${delegateSaw(STILL_OPEN).length}`
    );
  }

  // 4
  await fleet.launchMachine(MAC);
  fleet.write(
    "UPDATE agents SET os = 'darwin-arm64' WHERE machine_id = ?",
    MAC
  );
  await fetch(`${fleet.base}/api/projects/${project.id}/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machineId: MAC, path: repo }),
  });
  const woken = await until(
    "the hub wakes the delegate once a Mac is online",
    () => delegateSaw(MAC_ONLINE).length > 0,
    Boolean,
    180_000
  ).catch(() => false);
  check(
    "4: a Mac online, the hub wakes the delegate to call finish_item again",
    woken,
    JSON.stringify(itemOf())
  );
  const ended = await until(
    "the item ended",
    itemOf,
    (row) => !["starting", "running"].includes(row?.state ?? ""),
    600_000
  ).catch(() => itemOf());
  check(
    "4: it finished again, the iOS build passed on the Mac, and the item is done, never failed",
    ended?.state === "done" &&
      (ended.result ?? "").includes(`- ${GATE_CHECK}: pass (`),
    `${ended?.state} ${ended?.error ?? ""}\n${(ended?.result ?? "").slice(0, 1200)}`
  );
};

export default {
  group: "Workspaces and what agents may touch",
  name: "mac-wait",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
