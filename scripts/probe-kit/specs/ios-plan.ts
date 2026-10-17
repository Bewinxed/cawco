/**
 * iOS: a session's plan is the hub's (Projects PRD L208–215, "`todo_write`
 * gains a session scope … A plan document the harness wrote … is shown
 * read-only beside it"), read by the app from the hub's plan frames
 * (CawCoCore Tasks.swift `PlanFollows`; the `~/.claude/tasks` disk read is
 * gone) and drawn by Peek/TaskPanel.swift `PlanView` in the session's plan
 * sheet, its ring on the composer.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with "CawCo's to-dos" on, and the built app on an iPhone
 * simulator of its own. The session calls `todo_write` with four steps, one
 * nested under another, and a spec. Then:
 *
 * 1. The app, opened on the session with `-open-plan`, holds the plan the
 *    hub answers at `GET /api/instances/:id/plan`: the same ids, depths and
 *    statuses in order, and the spec (its `plan …` line, from the frames).
 * 2. Its sheet draws those steps and the spec (`plan drawn`).
 * 3. The session ticks the step under way: the app's next `plan …` line,
 *    from the hub's delta, holds it completed, read back against the hub's
 *    `/plan`; how long after the tool's answer it landed is said.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-plan
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
const TODO_WRITE = "mcp__cawco__todo_write";
const SPEC = "# Cards\n\nThe card takes a tone, and the sheet shows each.";
const STEPS = [
  { id: "read", content: "Read the card", status: "completed" },
  { id: "build", content: "Build the tone prop", status: "in_progress" },
  { id: "cut", content: "Cut the enum", status: "pending", depth: 1 },
  { id: "ship", content: "Ship it", status: "pending" },
];

const pause = (ms: number) => Bun.sleep(ms);

/** Where the paired captures go: outside the workspace, for a later review of app against web. */
const keep = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-captures",
  "prd-parity",
  "b2-plan"
);

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const answeredAt = new Map<string, number>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
      answeredAt.set(marker, Date.now());
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

interface HubPlan {
  spec?: { markdown: string };
  steps: { depth: number; id: string; status: string }[];
}

/** A plan's steps as the app's lines say them: `id:depth:status`, in order. */
const said = (plan: HubPlan) =>
  plan.steps.map((step) => `${step.id}:${step.depth}:${step.status}`).join(",");

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // "CawCo's to-dos" on: the session's steps are its todo_write list.
  const choices = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ todos: true }),
  });
  if (
    !kit.check(
      "0a: CawCo's to-dos are on",
      choices.ok,
      `${choices.status} ${await choices.text()}`
    )
  ) {
    return;
  }
  const session = await fleet.spawn("claude", "Plan", fleet.repo);
  let n = 0;
  const call = async (input: object) => {
    n += 1;
    const marker = String(n);
    asks.set(marker, { name: TODO_WRITE, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    await until(
      `todo_write's answer (${marker})`,
      () => answered.get(marker),
      Boolean,
      240_000
    );
    return answeredAt.get(marker) ?? Date.now();
  };
  await call({ steps: STEPS, spec: SPEC });
  const hubPlan = await fleet.api<HubPlan>(`/api/instances/${session}/plan`);
  if (
    !kit.check(
      "0: the hub's plan holds the four steps, one nested, and the spec",
      said(hubPlan) ===
        "read:0:completed,build:0:in_progress,cut:1:pending,ship:0:pending" &&
        hubPlan.spec?.markdown === SPEC,
      JSON.stringify(hubPlan).slice(0, 400)
    )
  ) {
    return;
  }

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const heardAt: number[] = [];
  const planLines = () =>
    heard
      .map((line, i) => ({ line, at: heardAt[i] }))
      .filter(({ line }) => line.startsWith(`plan ${session} rev=`));
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Plan" OR category == "Probe")'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes("dev.cawco.app")) {
            heard.push(line.replace(LOG_HEAD, ""));
            heardAt.push(Date.now());
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);
    await until(
      "the app launched",
      () =>
        sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe -open-plan >/dev/null`
        ).then(() => true),
      Boolean,
      60_000
    );

    // 1. The app's plan, from the hub's frames, against the hub's read.
    const first = await until(
      "the app's plan",
      () => planLines().at(-1)?.line,
      (line) => !!line?.includes(`steps=${said(hubPlan)} `),
      120_000
    ).catch(() => planLines().at(-1)?.line);
    kit.check(
      "1: the app holds the hub's plan: its steps' ids, depths and statuses in order, and the spec",
      !!first?.includes(`steps=${said(hubPlan)} `) &&
        first.includes(`spec=${SPEC.length} `),
      `app: ${first ?? "nothing"}; hub: ${said(hubPlan)}, spec ${SPEC.length} chars`
    );

    // 2. Its sheet draws them.
    const drawn = await until(
      "the plan drawn",
      () => heard.findLast((line) => line.startsWith(`plan drawn ${session}`)),
      Boolean,
      30_000
    ).catch(() => undefined);
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "ios-plan-sheet.png")}" >/dev/null`
    );
    kit.check(
      "2: the plan's sheet draws the hub's steps and its spec",
      drawn === `plan drawn ${session} steps=${said(hubPlan)} spec=true todos=0`,
      `drawn: ${drawn ?? "nothing"}`
    );

    // The plan's sheet beside the dashboard's, at the simulator's viewport, light and dark, for a later review.
    await mkdir(keep, { recursive: true });
    const dashboard = await fleet.dashboard();
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      const opened = heard.filter((line) => line.startsWith("plan opened")).length;
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe -open-plan >/dev/null`
      );
      await until(
        `the ${theme} sheet`,
        () => heard.filter((line) => line.startsWith("plan opened")).length > opened,
        Boolean,
        90_000
      ).catch(() => undefined);
      await pause(2000);
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(keep, `app-plan-${theme}.png`)}" >/dev/null`
      );
      try {
        const page = await kit.page("iphone", { engine: "webkit", theme });
        await page.goto(`${dashboard}/session/${session}`, {
          waitUntil: "domcontentloaded",
        });
        await page.locator('[data-slot="plan-ring"]').first().click({ timeout: 30_000 });
        await pause(1500);
        await page.screenshot({ path: join(keep, `web-plan-${theme}.png`) });
        await page.close();
      } catch (error) {
        console.log(`  the web ${theme} plan wasn't captured: ${(error as Error).message.split("\n")[0]}`);
      }
    }
    await sh(`xcrun simctl ui ${udid} appearance light`);
    console.log(`  captures: ${keep}`);

    // 3. A tick: the step under way completed.
    const before = planLines().length;
    const tickedAt = await call({
      steps: STEPS.map((step) =>
        step.id === "build" ? { ...step, status: "completed" } : step
      ),
    });
    const ticked = await until(
      "the tick in the app",
      () => planLines().slice(before).at(-1),
      (line) => !!line?.line.includes("build:0:completed"),
      30_000
    ).catch(() => planLines().slice(before).at(-1));
    const hubAfter = await fleet.api<HubPlan>(`/api/instances/${session}/plan`);
    kit.check(
      "3: the session's tick reaches the app from the hub's delta, the same as the hub's plan after",
      !!ticked?.line.includes(`steps=${said(hubAfter)} `) &&
        said(hubAfter).includes("build:0:completed"),
      `app ${ticked ? `+${ticked.at - tickedAt}ms after the tool answered: ${ticked.line}` : "nothing"}; hub: ${said(hubAfter)}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
};

const spec: Spec = { name: "ios-plan", run };
export default spec;
