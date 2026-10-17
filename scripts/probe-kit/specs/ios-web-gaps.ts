/**
 * Three things the web did that the app did not (owner: every web feature
 * exists natively, its styling and words the web's), each driven in the
 * built app on an iPhone 16 Pro and an iPad Pro 13-inch (M4), iOS 18.5,
 * light and dark, and captured beside the dashboard at the same viewport
 * in WebKit (the kit's `iphone` and `ipad` views):
 *
 * 1. A harness that didn't list its sessions: two machines whose OpenCode
 *    is a stand-in, one that exits at once (its listing throws: `failed`)
 *    and one that never answers (`unanswered` after the agent's 10 s). The
 *    app says each in one warning toast per machine, in core's words
 *    (`catalogWords`), as the web's `catalog-unread-<machine>` toast does.
 * 2. Approved actions on a task: a project session proposes two calls of a
 *    connection's tool for a task (`action_propose`). The task's sheet lists
 *    them with Deny and Approve; Deny takes one away, Approve runs the other,
 *    which the connection refuses, so it comes back failed with Remove, and
 *    Remove puts it away, each through the hub's `/api/actions` routes.
 * 3. "Decided on" opens the decision: a task filed from a decision page's
 *    card (decisions-preview seed) says "Decided on <page> › <question>",
 *    and a press opens that page's artifact in the session that made it.
 *
 *   bun scripts/probe-kit/run.ts ios-web-gaps
 *
 * The app is this checkout's simulator build, built first when there is
 * none (scripts/lib/apple-app.ts `freshApp`). `PROBE_DEVICE=iPhone` (or
 * `iPad`) runs one device. The captures are copied to
 * `$XDG_CACHE_HOME/cawco-captures/ios-web-gaps/<run>`, which outlives the
 * workspace, and that folder is said at the end.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: each device, theme and tap in order, as a hand makes them
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each device's steps are read in order.
import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { Page } from "playwright-core";
import { seedDecisions } from "../../decisions-preview/seed";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, type Theme } from "../kit";

const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    view: "iphone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    view: "ipad",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
  },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const AXE = "/opt/homebrew/bin/axe";
const PROPOSE = "mcp__cawco__action_propose";
const CONNECTION = "x-probe";
const FAILING = "gaps-failing";
const SILENT = "gaps-silent";
/** The stand-in that never answers sleeps this long: its own mark, for the sweep at the end. */
const SILENT_SLEEP = 607;
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The compact log's head, up to the `[subsystem:category] ` tag. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;

// ── The mock model: each PROBE-CALL:<n> message is one tool call ─────────
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

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [said, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || said.trim()}`);
  }
  return said;
}

/** A connection's server with one tool, `post`, that refuses every call as the service would. */
const refusingServer = () => {
  const rpc = (id: unknown, result: unknown) =>
    Response.json({ jsonrpc: "2.0", id, result });
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") {
        return new Response(null, { status: 405 });
      }
      const message = (await request.json()) as { id?: unknown; method?: string };
      if (message.id === undefined) {
        return new Response(null, { status: 202 });
      }
      switch (message.method) {
        case "initialize":
          return rpc(message.id, {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "probe-poster", version: "1" },
          });
        case "tools/list":
          return rpc(message.id, {
            tools: [
              {
                name: "post",
                description: "Posts a message.",
                inputSchema: {
                  type: "object",
                  properties: { text: { type: "string" } },
                  required: ["text"],
                },
              },
            ],
          });
        case "tools/call":
          return rpc(message.id, {
            isError: true,
            content: [{ type: "text", text: "rate limited: try in an hour" }],
          });
        default:
          return Response.json({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32_601, message: "no such method" },
          });
      }
    },
  });
};

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const keep = join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "cawco-captures",
    "ios-web-gaps",
    new Date().toISOString().replaceAll(":", "-").slice(0, 19)
  );
  await mkdir(keep, { recursive: true });
  const server = refusingServer();
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // ── 1: two machines whose OpenCode fails or never answers its listing ──
  const bin = async (name: string, body: string) => {
    const dir = join(fleet.sandbox, `bin-${name}`);
    await mkdir(dir, { recursive: true });
    const file = join(dir, "opencode2");
    await writeFile(file, `#!/bin/sh\n${body}\n`);
    await chmod(file, 0o755);
    return dir;
  };
  const path = fleet.env.PATH ?? process.env.PATH ?? "";
  fleet.env.PATH = `${await bin(FAILING, 'echo "this OpenCode stand-in does not start" >&2; exit 1')}:${path}`;
  await fleet.launchMachine(FAILING);
  fleet.env.PATH = `${await bin(SILENT, `exec sleep ${SILENT_SLEEP}`)}:${path}`;
  await fleet.launchMachine(SILENT);
  fleet.env.PATH = path;

  // ── 2 and 3: the decision pages, their tasks, a connection, a proposer ──
  const seeded = await seedDecisions(fleet, {
    cwd: fleet.repo,
    machineId: MACHINE,
    name: "Gaps probe",
  });
  const { projectId } = seeded;
  // The pricing page's tasks: the first is filed done, the second is open.
  const taskId = Object.values(seeded.tasks)[1] ?? "";
  await fleet.api("/api/connections", {
    name: CONNECTION,
    service: "x",
    account: "@probe",
    transport: "http",
    url: `http://127.0.0.1:${server.port}/mcp`,
    auth: "none",
    projects: [projectId],
  });
  const proposer = seeded.writers.pricing;
  let sent = 0;
  /** One action proposed for the task by the project's session; its id. */
  const propose = async (text: string, reason: string): Promise<string> => {
    const before = new Set(
      fleet.query<{ id: string }>("SELECT id FROM actions").map((filed) => filed.id)
    );
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: PROPOSE,
      input: {
        connection: CONNECTION,
        tool: "post",
        args: { text },
        reason,
        task: taskId,
      },
    });
    await fleet.send(proposer, `PROBE-CALL:${marker}`);
    const said = await until(
      `the proposal (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    );
    const row = fleet
      .query<{ id: string }>("SELECT id FROM actions ORDER BY created_at")
      .find((one) => !before.has(one.id));
    if (!row) {
      throw new Error(`no action was filed; the tool answered: ${said}`);
    }
    return row.id;
  };
  const stateOf = (id: string) =>
    fleet.query<{ state: string }>("SELECT state FROM actions WHERE id = ?", id)[0]
      ?.state;

  const web = await fleet.dashboard();
  const webPage = async (view: "iphone" | "ipad", theme: Theme) =>
    await kit.page(view, { engine: "webkit", theme });
  const webShot = async (page: Page, name: string) => {
    const file = join(keep, `${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };

  for (const device of DEVICES) {
    if (process.env.PROBE_DEVICE && process.env.PROBE_DEVICE !== device.tag) {
      continue;
    }
    const { tag } = device;
    const first = await propose(
      `Pricing goes live on ${tag}`,
      "Announce the hosted plan's price."
    );
    const second = await propose(
      `A follow-up for ${tag}`,
      "Answer the questions the announcement raises."
    );
    kit.check(
      `${tag}: 2: two actions proposed for ${taskId}`,
      stateOf(first) === "proposed" && stateOf(second) === "proposed",
      `${first} ${stateOf(first)}, ${second} ${stateOf(second)}`
    );

    let sim: MacSim | undefined;
    let stream: Subprocess | undefined;
    const heard: string[] = [];
    try {
      sim = await macSim({ runtime: RUNTIME, device: device.type });
      const { udid } = sim;
      console.log(`  ${tag} simulator ${udid}`);
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      const child = Bun.spawn(
        [
          "bash",
          "-c",
          `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Probe" OR category == "TaskSheet" OR category == "Transcript")'`,
        ],
        { stdout: "pipe", stderr: "ignore" }
      );
      stream = child;
      (async () => {
        const decoder = new TextDecoder();
        const reader = child.stdout.getReader();
        let rest = "";
        for (;;) {
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
      await Bun.sleep(1500);

      const appShot = async (name: string) => {
        const file = join(keep, `${name}.png`);
        await sh(`xcrun simctl io ${udid} screenshot "${file}" >/dev/null 2>&1`);
        return file;
      };
      const heardSince = (start: number, test: (line: string) => boolean) =>
        heard.slice(start).find(test);
      /** A node of the accessibility tree whose label passes `test`, tapped at its middle. */
      const tap = async (test: (label: string) => boolean): Promise<boolean> => {
        const roots = JSON.parse(
          await sh(`${AXE} describe-ui --udid ${udid}`)
        ) as Record<string, unknown>[];
        let frame: { x: number; y: number; width: number; height: number } | undefined;
        const walk = (node: Record<string, unknown>) => {
          const label = node.AXLabel ?? node.label;
          const at = node.frame as typeof frame;
          if (!frame && typeof label === "string" && test(label) && (at?.width ?? 0) > 0) {
            frame = at;
          }
          for (const kid of (node.children as Record<string, unknown>[] | undefined) ?? []) {
            walk(kid);
          }
        };
        for (const root of roots) {
          walk(root);
        }
        if (!frame) {
          return false;
        }
        await sh(
          `${AXE} tap -x ${Math.round(frame.x + frame.width / 2)} -y ${Math.round(frame.y + frame.height / 2)} --udid ${udid}`
        );
        return true;
      };

      for (const theme of THEMES) {
        const at = `${tag}-${theme}`;
        await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
        const from = heard.length;
        await sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-task ${projectId}/${taskId} >/dev/null`
        );
        // 1: each machine's toast, captured as it stands.
        for (const machine of [FAILING, SILENT]) {
          const said = await until(
            `${at}: 1: ${machine}'s toast`,
            () =>
              heardSince(
                from,
                (line) =>
                  line.includes(`probe catalog left out: machine ${machine} `) &&
                  line.includes(" said ")
              ),
            Boolean,
            60_000
          ).catch(() => undefined);
          const toast = heardSince(
            from,
            (line) =>
              line.startsWith("toast shown:") &&
              line.includes(`id catalog-unread-${machine}`)
          );
          const shot = said ? await appShot(`${at}-toast-${machine}`) : "";
          const words =
            machine === FAILING
              ? "couldn't list its stored sessions (" // core catalogWords.harnessCouldntList
              : "didn't answer within 10 s, so its stored sessions are the ones it listed last."; // harnessDidntAnswer
          kit.check(
            `${at}: 1: ${machine}'s left-out harness is said in its own toast, in core's words`,
            Boolean(said && toast?.includes("opencode on ") && toast.includes(words)),
            `${toast ?? said ?? "no toast"}${shot ? ` → ${shot}` : ""}`
          );
        }
        // 2 and 3: the task's sheet, its actions and its decision line.
        const cards = await until(
          `${at}: 2: the sheet's action cards`,
          () =>
            [first, second].every((id) =>
              heardSince(
                from,
                (line) =>
                  line.includes(`part task-action-${id} `) &&
                  line.includes("shows=true")
              )
            )
              ? true
              : undefined,
          Boolean,
          60_000
        ).catch(() => false);
        await Bun.sleep(4500); // the toasts gone, the sheet alone
        const sheetShot = await appShot(`${at}-sheet`);
        const decided = heardSince(
          from,
          (line) => line.includes("part task-decided ") && line.includes("says=Decided on ")
        );
        kit.check(
          `${at}: 2: both actions stand in the sheet's needs, Deny and Approve on each`,
          cards &&
            [first, second].every(
              (id) =>
                heardSince(from, (line) => line.includes(`part task-action-deny-${id} `)) &&
                heardSince(from, (line) => line.includes(`part task-action-approve-${id} `))
            ),
          `→ ${sheetShot}`
        );
        kit.check(
          `${at}: 3: the head says "Decided on" the page and its card`,
          Boolean(decided),
          decided ?? "no task-decided line"
        );

        // The web's counterpart at the same viewport.
        const page = await webPage(device.view, theme);
        await open(
          page,
          `${web}/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`,
          "[data-slot='needs']"
        );
        const webToast = await page
          .waitForSelector(`[data-sonner-toast]:has-text("couldn't list")`, {
            timeout: 30_000,
          })
          .then(() => webShot(page, `${at}-web-toast-${FAILING}`))
          .catch(() => "");
        await page
          .waitForSelector(`[data-sonner-toast]:has-text("didn't answer")`, {
            timeout: 30_000,
          })
          .then(() => webShot(page, `${at}-web-toast-${SILENT}`))
          .catch(() => "");
        await page.waitForTimeout(4500);
        const webSheet = await webShot(page, `${at}-web-sheet`);
        kit.note(`${at}: web counterparts ${webToast || "(no toast)"} ${webSheet}`);
        await page.close();
      }

      // The taps, once per device, in the dark: Deny, Approve, Remove, Decided on.
      const at = `${tag}-dark`;
      let from = heard.length;
      const denied = await tap((label) => label === `Deny post on ${CONNECTION}`);
      const deniedOne = await until(
        `${at}: 2: one action denied`,
        () => [first, second].find((id) => stateOf(id) === "denied"),
        Boolean,
        30_000
      ).catch(() => undefined);
      const left = deniedOne === first ? second : first;
      const gone = await until(
        `${at}: 2: its card gone`,
        () => heardSince(from, (line) => line === `gone task-action-${deniedOne}`),
        Boolean,
        30_000
      ).catch(() => undefined);
      kit.check(
        `${at}: 2: Deny denies the action through the hub, and its card leaves`,
        denied && Boolean(deniedOne) && Boolean(gone),
        `tapped ${denied}; denied ${deniedOne ?? "none"}; ${gone ?? "card stands"}`
      );
      from = heard.length;
      const approved = await tap((label) => label === `Approve post on ${CONNECTION}`);
      const failed = await until(
        `${at}: 2: the approved action failed at the service`,
        () => (stateOf(left) === "failed" ? true : undefined),
        Boolean,
        60_000
      ).catch(() => false);
      const removeShown = await until(
        `${at}: 2: its card says it failed, with Remove`,
        () =>
          heardSince(from, (line) =>
            line.includes(`part task-action-remove-${left} `) && line.includes("shows=true")
          ),
        Boolean,
        30_000
      ).catch(() => undefined);
      const failedShot = await appShot(`${at}-action-failed`);
      kit.check(
        `${at}: 2: Approve runs the call; the service's refusal comes back failed, with Remove`,
        approved && failed && Boolean(removeShown),
        `tapped ${approved}; state ${stateOf(left)}; → ${failedShot}`
      );
      const failedPage = await webPage(device.view, "dark");
      await open(
        failedPage,
        `${web}/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`,
        "[data-slot='needs']"
      );
      await failedPage.waitForTimeout(4500);
      kit.note(`${at}: web failed card ${await webShot(failedPage, `${at}-web-action-failed`)}`);
      await failedPage.close();
      from = heard.length;
      const removed = await tap((label) => label === "Remove");
      const checked = await until(
        `${at}: 2: Remove puts it away`,
        () => heardSince(from, (line) => line === `gone task-action-${left}`),
        Boolean,
        30_000
      ).catch(() => undefined);
      kit.check(
        `${at}: 2: Remove puts the failed action away through the hub`,
        removed &&
          Boolean(checked) &&
          typeof fleet.query<{ checked_at: number | null }>(
            "SELECT checked_at FROM actions WHERE id = ?",
            left
          )[0]?.checked_at === "number",
        `tapped ${removed}; ${checked ?? "card stands"}`
      );
      from = heard.length;
      const pressed = await tap((label) => label.startsWith("Decided on "));
      const opened = await until(
        `${at}: 3: the decision's artifact opened`,
        () =>
          heardSince(from, (line) => line.startsWith("decided opens artifact ")),
        Boolean,
        30_000
      ).catch(() => undefined);
      await Bun.sleep(4000);
      const openedShot = await appShot(`${at}-decided-opened`);
      const artifact = seeded.artifacts.pricing;
      kit.check(
        `${at}: 3: "Decided on" opens the pricing page's artifact in its writer's session`,
        pressed &&
          Boolean(opened?.includes(`artifact ${artifact} in ${seeded.writers.pricing}`)),
        `${opened ?? `tapped ${pressed}; no open line`} → ${openedShot}`
      );
      await writeFile(join(keep, `${tag}.log`), heard.join("\n"));
    } finally {
      stream?.kill();
      await sim?.release();
    }
  }
  await sh(`pkill -f "sleep ${SILENT_SLEEP}" || true`);
  await server.stop(true);
  await cp(kit.out, join(keep, "kit-out"), { recursive: true }).catch(() => undefined);
  kit.note(`captures: ${keep}`);
}

export default { name: "ios-web-gaps", run } satisfies Spec;
