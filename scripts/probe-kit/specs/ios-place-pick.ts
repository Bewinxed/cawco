/**
 * iOS: a page's `cawco.pickPlace()` has a host in the app (PreviewController
 * and Preview/PlacePick.swift, as preview/PlacePick.svelte): the page's
 * JSON-RPC `cawco/pick-place` opens CawCo's machine select and folder
 * browser, and Use this place answers it with `{ machineId, label, path }`,
 * `label` the machine's name as every surface shows it (core
 * `machineLabel(hostname)`). Caw's setup page ("Choose a machine and
 * folder") asks it.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own. A
 * session makes a page whose button calls `cawco.pickPlace()` on load. Then:
 *
 * 1. The app, opened on the session with `-place-pick <the repo's folder>`,
 *    opens its picker on the page's ask (`place pick opened`), the first
 *    online machine chosen (`place pick machine=`), and Use this place
 *    answers it (`place pick answered`).
 * 2. The page received `{ machineId, label, path }`: the hub's read of the
 *    page holds it under `place` (the page stores what it was answered),
 *    the fleet's machine, its label as `machineLabel` names it, and the
 *    folder typed.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-place-pick
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { machineLabel } from "../../../packages/core/src/index";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const CREATE = "mcp__cawco__artifact_create";
/** The page asks once its overlay is joined, as Caw's setup page's "Choose a machine and folder" does. */
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Setup</title></head>
<body><h1>Where it lives</h1>
<button id="choose" type="button">Choose a machine and folder</button>
<script>
  const ask = () => window.cawco.pickPlace().catch(() => null);
  document.getElementById("choose").addEventListener("click", ask);
  let asked = false;
  window.cawco.on("picks", () => {
    if (asked) return;
    asked = true;
    setTimeout(ask, 500);
  });
</script></body></html>`;

/** Where the paired captures go: outside the workspace, for a later review of app against web. */
const keep = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-captures",
  "prd-parity",
  "place-pick"
);

const pause = (ms: number) => Bun.sleep(ms);

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

interface Place {
  label: string;
  machineId: string;
  path: string;
}

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
  const session = await fleet.spawn("claude", "Setup", fleet.repo);
  asks.set("1", {
    name: CREATE,
    input: { kind: "page", name: "setup", html: PAGE },
  });
  await fleet.send(session, "PROBE-CALL:1");
  const made = (await until(
    "the page",
    () => answered.get("1"),
    Boolean,
    240_000
  )) as string;
  const id = made.match(ANSWERED_ID)?.[1];
  const machines =
    await fleet.api<{ hostname: string; machineId: string }[]>("/api/agents");
  const machine = machines.find((one) => one.machineId === MACHINE);
  if (
    !kit.check(
      "0: the session made the page, and the fleet's machine is known",
      !!id && !!machine,
      `${made.slice(0, 200)}; machines ${JSON.stringify(machines)}`
    )
  ) {
    return;
  }
  const want: Place = {
    machineId: MACHINE,
    label: machineLabel(machine?.hostname ?? ""),
    path: fleet.repo,
  };

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const said = (prefix: string) =>
    heard.filter((line) => line.startsWith(prefix));
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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`,
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
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);
    const launch = (flags: string) =>
      sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe ${flags} >/dev/null`
      );

    // The picker open beside the dashboard's, light and dark, for a later review.
    await mkdir(keep, { recursive: true });
    const dashboard = await fleet.dashboard();
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      const before = said("place pick opened").length;
      await launch("");
      await until(
        `the ${theme} picker`,
        () => said("place pick opened").length > before,
        Boolean,
        120_000
      ).catch(() => undefined);
      await pause(2000);
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(keep, `app-place-pick-${theme}.png`)}" >/dev/null`
      );
      try {
        const page = await kit.page("iphone", { engine: "webkit", theme });
        await page.goto(`${dashboard}/session/${session}`, {
          waitUntil: "domcontentloaded",
        });
        await page.locator("form.place-pick").waitFor({ timeout: 60_000 });
        await pause(800);
        await page.screenshot({
          path: join(keep, `web-place-pick-${theme}.png`),
        });
        await page.close();
      } catch (error) {
        console.log(
          `  the web ${theme} picker wasn't captured: ${(error as Error).message.split("\n")[0]}`
        );
      }
    }
    await sh(`xcrun simctl ui ${udid} appearance light`);
    console.log(`  captures: ${keep}`);

    // 1. The picker, the first online machine, Use this place.
    const opened = said("place pick opened").length;
    await launch(`-place-pick ${fleet.repo}`);
    const answer = await until(
      "the picker's answer",
      () => said("place pick answered").at(-1),
      Boolean,
      120_000
    ).catch(() => undefined);
    const chosen = said("place pick machine=").at(-1);
    const sent = (() => {
      try {
        return JSON.parse(
          answer?.slice("place pick answered ".length) ?? "null"
        ) as Place | null;
      } catch {
        return null;
      }
    })();
    kit.check(
      "1: the page's ask opens the app's picker, the first online machine chosen, and Use this place answers it",
      said("place pick opened").length > opened &&
        chosen?.startsWith(`place pick machine=${MACHINE}:${want.label} `) ===
          true &&
        sent?.machineId === want.machineId &&
        sent.label === want.label &&
        sent.path === want.path,
      `opened ${said("place pick opened").length - opened}; ${chosen}; ${answer ?? "no answer"}`
    );

    // 2. What the page received, as the hub reads the page.
    const read = await until(
      "the place in the page's state",
      () =>
        fleet.api<{ state: Record<string, { value?: Place }> }>(
          `/api/instances/${session}/artifacts/${id}`
        ),
      (answer) => !!answer.state.place?.value,
      30_000
    ).catch(() => undefined);
    const got = read?.state.place?.value;
    kit.check(
      "2: the page received { machineId, label, path }: the fleet's machine, its label, the folder",
      got?.machineId === want.machineId &&
        got.label === want.label &&
        got.path === want.path,
      `page got ${JSON.stringify(got)}; want ${JSON.stringify(want)}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
};

const spec: Spec = { name: "ios-place-pick", run };
export default spec;
