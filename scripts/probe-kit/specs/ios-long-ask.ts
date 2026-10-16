/**
 * iOS: a permission card for a long shell command draws, and answers, with
 * the main thread free. The owner, verbatim: "whatever this is caused the
 * app to stop responding". "This" was a permission ask from the
 * orchestrator, "Slim the exports to text and file lists": a Bash call of
 * 954 characters (`while read`, `$(…)`, quotes and pipes) with
 * `timeout: 300000`. Its input below is the one the hub recorded, verbatim.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model; the services' HOME is the fleet's own, so the command, once
 * approved, runs against nothing of this Mac's) and the built app on an
 * iPhone simulator of its own (a mac-slot.sh slot, deleted at the end). A
 * session in default mode makes that call, which waits on Approve. The app
 * is opened on the session (`-open-session`), and the owner's own steps
 * are taken, each read from the app:
 *
 * 1. The card stands (`probe card <id>`) within {@link STAND_MS} of the
 *    launch.
 * 2. Standing, the app is at rest: the process sampled on the host for
 *    {@link REST_S} s (`sample`), its main thread waits in its run loop
 *    (`mach_msg2_trap`) for all but {@link REST_SHARE} of the samples, as a
 *    card that draws once and waits does; a layout that keeps running pins it.
 * 3. The card's chevron opens the whole command, and the app is at rest again.
 * 4. Approve (tapped) answers: the ask leaves the hub's pending list and
 *    the session runs the call (its result lands).
 * 5. The app stays one process through it.
 *
 * Where the main thread is busy, the app's own frames it spent most of the
 * samples in are the check's detail, and the spec's folder holds each
 * whole sample. `PROBE_IOS=27` runs the owner's phone and OS.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-long-ask
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** A session as the hub lists it (`/api/instances`). */
interface InstanceRow {
  id?: string;
  instanceId?: string;
  title?: string;
}

/** A block of a hub transcript (`/api/instances/:id/transcript`). */
interface Block {
  content?: string;
  id: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  toolCallId?: string;
  type: string;
}

/** Every block of a session on a running hub, oldest first: its pages read back from the newest, read and never written. */
const wholeTranscript = async (
  hub: string,
  instanceId: string
): Promise<Block[]> => {
  const pages: Block[][] = [];
  let before: string | undefined;
  for (let page = 0; page < 400; page += 1) {
    const url = `${hub}/api/instances/${instanceId}/transcript?limit=500${before ? `&before=${encodeURIComponent(before)}` : ""}`;
    // biome-ignore lint/performance/noAwaitInLoops: each page names the one before it
    const read = (await (await fetch(url)).json()) as {
      blocks?: Block[];
      cursor?: string;
    };
    const blocks = read.blocks ?? [];
    if (blocks.length === 0 || !read.cursor || read.cursor === before) {
      if (blocks.length > 0) {
        pages.unshift(blocks);
      }
      break;
    }
    pages.unshift(blocks);
    before = read.cursor;
  }
  return pages.flat();
};

/**
 * A hub transcript as the Claude Code session file it was read from: each
 * turn a line chained to the one before (`parentUuid`), a tool call its
 * `tool_use` and the `tool_result` after it, the rest (a peer's words, a
 * system note) a user line. Resumed, it is the session's history.
 */
const asSessionFile = (
  blocks: Block[],
  cwd: string,
  sessionId: string
): string => {
  let parent: string | null = null;
  const out: string[] = [];
  const model = MODEL.claude;
  const add = (type: "user" | "assistant", message: object, at?: string) => {
    const uuid = crypto.randomUUID();
    out.push(
      JSON.stringify({
        parentUuid: parent,
        isSidechain: false,
        userType: "external",
        cwd,
        sessionId,
        version: "2.1.0",
        type,
        message,
        uuid,
        timestamp: at ?? new Date().toISOString(),
      })
    );
    parent = uuid;
  };
  for (const block of blocks) {
    const meta = block.metadata ?? {};
    const at = block.timestamp;
    if (block.type === "assistant") {
      add(
        "assistant",
        {
          role: "assistant",
          model,
          content: [{ type: "text", text: block.content ?? "" }],
        },
        at
      );
    } else if (block.type === "thinking") {
      add(
        "assistant",
        {
          role: "assistant",
          model,
          content: [
            {
              type: "thinking",
              thinking: String(meta.thinking ?? block.content ?? ""),
              signature: "",
            },
          ],
        },
        at
      );
    } else if (block.type.startsWith("tool.")) {
      const id = String(
        meta.toolId ??
          block.toolCallId ??
          `toolu_${crypto.randomUUID().replaceAll("-", "")}`
      );
      const name = String(meta.toolName ?? block.content ?? "Tool");
      add(
        "assistant",
        {
          role: "assistant",
          model,
          content: [
            { type: "tool_use", id, name, input: meta.toolInput ?? {} },
          ],
        },
        at
      );
      const result = meta.toolResult;
      add(
        "user",
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: id,
              content:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result ?? ""),
            },
          ],
        },
        at
      );
    } else if (block.content) {
      add("user", { role: "user", content: block.content }, at);
    }
  }
  return `${out.join("\n")}\n`;
};

/** The app's oldest target by default; `PROBE_IOS=27` the owner's phone and OS (iPhone 17 Pro Max, iOS 27.0). */
const SIM =
  process.env.PROBE_IOS === "27"
    ? {
        runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
        device: "iPhone 17 Pro Max",
      }
    : {
        runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
        device: "iPhone 16 Pro",
      };
/** The orchestrator's call, as the hub recorded it. */
const INPUT = {
  command:
    'O=~/.cache/cawco-orchestrator/lost-scan; ( cd ~/.worktrees/backlot-assistant && git status --porcelain | head -200 > $O/backlot-assistant/status.txt; git diff --cached --stat | tail -40 > $O/backlot-assistant/staged-stat.txt ); rm -f $O/backlot-assistant/uncommitted.diff; for n in cockpit-ee537d0c cockpit-802b2aa2 backlot-cd68941b; do d=~/.worktrees/$n; rm -f $O/$n/untracked.tgz; ( cd $d && while read f; do [ -f "$f" ] && [ $(stat -c %s "$f") -lt 200000 ] && file -b --mime "$f" | grep -q \'^text\' && echo "$f"; done < $O/$n/untracked.txt > $O/$n/untracked-text.txt; tar czf $O/$n/untracked-text.tgz -T $O/$n/untracked-text.txt 2>/dev/null; find $(cut -d/ -f1 $O/$n/untracked.txt | sort -u) -type f 2>/dev/null | head -400 > $O/$n/untracked-files.txt ); done; rm -f ~/.cache/cawco-orchestrator/lost-scan.tgz; tar czf ~/.cache/cawco-orchestrator/lost-scan.tgz -C ~/.cache/cawco-orchestrator lost-scan && du -sh ~/.cache/cawco-orchestrator/lost-scan.tgz',
  description: "Slim the exports to text and file lists",
  timeout: 300_000,
};
const MARKER = "PROBE-LONG-ASK";
/** The asking session's project, the owner's orchestrator's. */
const PROJECT = "cockpit";
/** From launch to the card standing: a free main thread takes a few seconds. */
const STAND_MS = 15_000;
/** When the card has not stood this long after launch, the main thread is sampled while it is awaited. */
const LATE_MS = 8000;
/** How long the app is sampled at rest, and the most of its main thread's samples that may be busy then. */
const REST_S = 5;
const REST_SHARE = 0.25;
const AXE = "/opt/homebrew/bin/axe";
/**
 * Whether axe can tap iOS 27: not from a workspace ("…remote-automation.uds:
 * Operation not permitted"); `PROBE_TAPS=1` where the spec runs outside one.
 */
const taps27 = process.env.PROBE_TAPS === "1";
/** Whether axe can tap this run's simulator. */
const taps = process.env.PROBE_IOS !== "27" || taps27;
const THREAD_HEAD = /^\s{4}\d+ Thread_/;
const LOG_HEAD = /^.*\] /;
const SPACES = /\s+/;

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

let issued = false;
let ran: string | undefined;
/** The session's history before the ask: turns of paragraphs, more rows than a screen holds, as the orchestrator's chat had. */
const HISTORY_TURNS = 12;
const PROSE = Array.from(
  { length: 5 },
  (_, i) =>
    `Paragraph ${i + 1}: the export keeps each worktree's untracked text, its status and its staged changes, so nothing is lost when the checkout goes.`
).join("\n\n");

/** The session's turns: history, then the long call once asked for, then a word once its result is in. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (!request.all.includes(MARKER)) {
    return { everyMs: 2, words: [PROSE] };
  }
  if (issued) {
    ran ??= request.last;
    return { everyMs: 5, words: ["Done."] };
  }
  if (!request.toolNames.includes("Bash")) {
    return { everyMs: 5, words: ["Bash is not offered"] };
  }
  issued = true;
  return { everyMs: 5, words: [], tool: { name: "Bash", input: INPUT } };
};

const SAMPLED = /^\s*[+!:| ]*(\d+) (.*)$/;
const ENTRY =
  /\$main\(\)|UIApplicationMain|main\(\)|_run\]|entry_point|CFRunLoop|GSEvent/;

/**
 * The main thread in a `sample` report: the share of its samples spent
 * anywhere but waiting in its run loop (`mach_msg2_trap`), and the app's
 * own frames it spent most of them in.
 */
const mainThread = (report: string): { share: number; frames: string } => {
  const lines = report.split("\n");
  const start = lines.findIndex(
    // `sample` heads the main thread "Main Thread", or names it by its queue (`com.apple.main-thread`).
    (line) =>
      line.includes("Thread_") &&
      (line.includes("main-thread") || line.includes("Main Thread"))
  );
  if (start < 0) {
    return { share: Number.NaN, frames: "no main thread in the sample" };
  }
  const total = Number(SAMPLED.exec(lines[start])?.[1] ?? 0);
  let idle = 0;
  const frames: { count: number; text: string }[] = [];
  for (const line of lines.slice(start + 1)) {
    if (THREAD_HEAD.test(line)) {
      break;
    }
    const sampled = SAMPLED.exec(line);
    if (!sampled) {
      continue;
    }
    const count = Number(sampled[1]);
    if (sampled[2].startsWith("mach_msg2_trap")) {
      idle += count;
    } else if (sampled[2].includes("CawCo") && !ENTRY.test(sampled[2])) {
      frames.push({ count, text: sampled[2].slice(0, 110) });
    }
  }
  const busy = frames
    .filter((frame) => frame.count > total * 0.05)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((frame) => `${frame.count} ${frame.text}`)
    .join(" | ");
  return { share: total > 0 ? 1 - idle / total : Number.NaN, frames: busy };
};

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const liveAsk = process.env.PROBE_LIVE_ASK?.split("|");
  if (liveAsk && liveAsk.length >= 4) {
    const [hub, machineId, cwd, projectId] = liveAsk;
    await askLive(kit, app, { hub, machineId, cwd, projectId });
    return;
  }
  // `PROBE_LIVE=<hub>|<session>`: the app opened on a real session of a
  // running hub, read and never answered; its main thread sampled at the
  // transcript's foot and after scrolling back through it.
  const live = process.env.PROBE_LIVE?.split("|");
  let base: string;
  let asker: string;
  let pending = async () => "";
  if (live && live.length >= 2) {
    [base, asker] = live;
  } else {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    ({ base } = fleet);
    // In a project, as the owner's was ("Orchestrate cockpit fleet work ·
    // cockpit"): a phone lists a session under its project.
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: PROJECT,
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    // `PROBE_HISTORY=<hub>|<instance>`: the session resumes that real
    // session's whole history (the owner's orchestrator chat, thousands of
    // turns), read from its hub and written as its Claude Code file here.
    const history = process.env.PROBE_HISTORY?.split("|");
    if (history && history.length >= 2) {
      const blocks = await wholeTranscript(history[0], history[1]);
      const sessionKey = crypto.randomUUID();
      const dir = join(
        fleet.home,
        CLAUDE_DIR_NAME,
        "projects",
        fleet.repo.replace(/[^a-zA-Z0-9]/g, "-")
      );
      mkdirSync(dir, { recursive: true });
      const file = asSessionFile(blocks, fleet.repo, sessionKey);
      writeFileSync(join(dir, `${sessionKey}.jsonl`), file);
      kit.note(
        `history: ${blocks.length} blocks of ${history[1]}, ${(file.length / 1e6).toFixed(1)} MB, resumed as ${sessionKey}`
      );
      asker = await fleet.spawn("claude", "Long ask", fleet.repo, {
        permissionMode: "default",
        projectId: project.id,
        resume: { sessionKey },
      });
    } else {
      asker = await fleet.spawn("claude", "Long ask", fleet.repo, {
        permissionMode: "default",
        projectId: project.id,
      });
      for (let turn = 0; turn < HISTORY_TURNS; turn += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: the turns are sent in order
        await fleet.send(asker, "Say a few paragraphs.");
      }
    }
    await fleet.send(asker, MARKER);
    pending = async () =>
      JSON.stringify(await (await fetch(`${base}/api/pending`)).json());
    const asked = await until(
      "the long call's ask",
      async () => ((await pending()).includes("lost-scan") ? true : undefined),
      Boolean,
      120_000
    ).catch(() => undefined);
    if (
      !kit.check(
        "the hub holds the long call's ask, waiting on Approve",
        !!asked,
        (await pending()).slice(0, 300)
      )
    ) {
      return;
    }
  }

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Probe" OR category == "Restore")'`,
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

    const pid = async (): Promise<string | undefined> => {
      const listed = await sh(
        `xcrun simctl spawn ${udid} launchctl list | grep 'UIKitApplication:dev.cawco.app' || true`
      );
      const [id] = listed.trim().split(SPACES);
      return id && id !== "-" ? id : undefined;
    };
    /** The main thread's busy share over REST_S s, read from a `sample` of the process, and its heaviest frames. */
    const rest = async (id: string, name: string) => {
      const file = join(kit.out, `${name}.sample.txt`);
      await sh(
        `sample ${id} ${REST_S} -file "${file}" >/dev/null 2>&1 || true`
      );
      try {
        return mainThread(readFileSync(file, "utf8"));
      } catch {
        return { share: Number.NaN, frames: "no sample written" };
      }
    };
    /** Screens where a tap found nothing, each one's labels kept in its own file. */
    let untapped = 0;
    /** A node of the accessibility tree by its label (or a test of it), tapped at its middle. */
    const tap = async (
      label: string | ((said: string) => boolean)
    ): Promise<boolean> => {
      const found: {
        frame?: { x: number; y: number; width: number; height: number };
      }[] = [];
      const matches = (text: unknown) =>
        typeof text === "string" &&
        (typeof label === "string" ? text === label : label(text));
      const walk = (node: Record<string, unknown>) => {
        if (matches(node.AXLabel ?? node.label)) {
          found.push(node as (typeof found)[number]);
        }
        for (const kid of (node.children as
          Record<string, unknown>[] | undefined) ?? []) {
          walk(kid);
        }
      };
      const roots = JSON.parse(
        await sh(`${AXE} describe-ui --udid ${udid}`)
      ) as Record<string, unknown>[];
      for (const root of roots) {
        walk(root);
      }
      const frame = found.find((node) => (node.frame?.width ?? 0) > 0)?.frame;
      if (!frame) {
        // What the screen offered instead, for the reading.
        const labels: string[] = [];
        const list = (node: Record<string, unknown>) => {
          const text = node.AXLabel ?? node.label;
          if (typeof text === "string" && text) {
            labels.push(text);
          }
          for (const kid of (node.children as
            Record<string, unknown>[] | undefined) ?? []) {
            list(kid);
          }
        };
        for (const root of roots) {
          list(root);
        }
        untapped += 1;
        writeFileSync(
          join(kit.out, `untapped-${untapped}.txt`),
          labels.join("\n")
        );
        return false;
      }
      await sh(
        `${AXE} tap -x ${Math.round(frame.x + frame.width / 2)} -y ${Math.round(frame.y + frame.height / 2)} --udid ${udid}`
      );
      return true;
    };
    const launchedAt = Date.now();
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} -open-session ${asker} >/dev/null`
    );
    let launched = await until("the app's pid", pid, Boolean, 30_000).catch(
      () => undefined
    );
    /** The app launched again with `args`; its pid. */
    const relaunch = async (args: string) => {
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} ${args} >/dev/null`
      );
      await pause(1500);
      return await until("the app's pid", pid, Boolean, 30_000).catch(
        () => undefined
      );
    };
    const said = (from: number, start: string) =>
      heard.slice(from).find((line) => line.startsWith(start));
    if (live) {
      // The real chat, read: its transcript loaded, at its foot, then scrolled back a screen at a time.
      const opened = kit.check(
        "the app opens on the live session",
        !!launched,
        `pid ${launched ?? "none"}`
      );
      if (!(opened && launched)) {
        return;
      }
      await pause(20_000);
      const foot = await rest(launched, "live-foot");
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, "live-foot.png")}" >/dev/null 2>&1 || true`
      );
      kit.check(
        `live: at the transcript's foot, the main thread busy under ${REST_SHARE * 100}% of ${REST_S}s`,
        foot.share < REST_SHARE,
        `main thread busy ${(foot.share * 100).toFixed(1)}%${foot.frames ? `: ${foot.frames}` : ""}`
      );
      for (let screen = 0; screen < 8; screen += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one swipe after another
        await sh(
          `${AXE} swipe --start-x 200 --start-y 300 --end-x 200 --end-y 700 --duration 0.5 --udid ${udid}`
        );
        await pause(700);
      }
      const back = await rest(launched, "live-scrolled");
      kit.check(
        `live: scrolled back through the transcript, the main thread busy under ${REST_SHARE * 100}% of ${REST_S}s once it rests`,
        back.share < REST_SHARE,
        `main thread busy ${(back.share * 100).toFixed(1)}%${back.frames ? `: ${back.frames}` : ""}`
      );
      const after = await pid();
      kit.check(
        "live: the app stays one process",
        after === launched,
        `pid ${launched} then ${after ?? "none"}`
      );
      return;
    }
    const card = () => heard.find((line) => line.startsWith("probe card "));
    // Late: what the main thread does while the card is awaited.
    let late: { share: number; frames: string } | undefined;
    const lateSample = (async () => {
      await pause(Math.max(0, LATE_MS - (Date.now() - launchedAt)));
      if (!card() && launched) {
        late = await rest(launched, "awaited");
      }
    })();
    const stood = await until(
      "the card",
      card,
      Boolean,
      Math.max(1000, STAND_MS - (Date.now() - launchedAt))
    ).catch(() => undefined);
    const took = Date.now() - launchedAt;
    await lateSample;
    if (late) {
      kit.note(
        `the card was late: main thread busy ${(late.share * 100).toFixed(1)}% while awaited: ${late.frames}`
      );
    }
    const stands = kit.check(
      `the card stands within ${STAND_MS / 1000}s of the launch`,
      !!(stood && launched),
      stood
        ? `${stood.slice(0, 160)} after ${(took / 1000).toFixed(1)}s`
        : `none in ${(took / 1000).toFixed(1)}s${late ? `; main thread busy ${(late.share * 100).toFixed(1)}% while awaited: ${late.frames}` : ""}`
    );
    if (!(stands && launched)) {
      return;
    }
    await pause(2000);
    const standing = await rest(launched, "standing");
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "card.png")}" >/dev/null 2>&1 || true`
    );
    kit.check(
      `standing, the app is at rest: its main thread busy under ${REST_SHARE * 100}% of ${REST_S}s`,
      standing.share < REST_SHARE,
      `main thread busy ${(standing.share * 100).toFixed(1)}%${standing.frames ? `: ${standing.frames}` : ""}`
    );
    // The owner's other ways to the card: its notification (the ask's push
    // route, which opens the session that asked), and the session list,
    // where a tap reaches the simulator.
    const requestId = stood?.split(" ")[2] ?? "";
    const route = JSON.stringify({ kind: "ask", instanceId: asker, requestId });
    /** The session's title as the hub has it now (a resumed session's may be its history's). */
    const sessionTitle = async (): Promise<string> => {
      const rows = (await (await fetch(`${base}/api/instances`)).json()) as
        InstanceRow[] | { instances?: InstanceRow[] };
      const all = Array.isArray(rows) ? rows : (rows.instances ?? []);
      return (
        all.find((row) => (row.instanceId ?? row.id) === asker)?.title ??
        "Long ask"
      );
    };
    const ways: {
      name: string;
      args: string;
      reach?: () => Promise<boolean>;
    }[] = [
      { name: "the ask's notification", args: `-push-route 'push:${route}'` },
      ...(taps
        ? [
            {
              // Home's "Needs you", the list that draws the ask's command
              // on one line, sampled while it stands; then its row.
              name: "Needs you",
              args: "",
              reach: async () => {
                await pause(6000);
                if (!(await tap((label) => label.startsWith("Needs you")))) {
                  return false;
                }
                await pause(3000);
                const list = launched
                  ? await rest(launched, "needs-you-list")
                  : { share: Number.NaN, frames: "" };
                kit.check(
                  `Needs you lists the long ask with the app at rest, its main thread busy under ${REST_SHARE * 100}%`,
                  list.share < REST_SHARE,
                  `main thread busy ${(list.share * 100).toFixed(1)}%${list.frames ? `: ${list.frames}` : ""}`
                );
                return await tap((label) => label.includes(INPUT.description));
              },
            },
            {
              // The navigation's projects, the session's row in its project
              // by its title as the hub has it now.
              name: "the navigation's session list",
              args: "",
              reach: async () => {
                await pause(6000);
                if (!(await tap("Open navigation"))) {
                  return false;
                }
                await pause(2000);
                // The drawer lists a project's sessions under its row (SidebarViewController, unless it is folded).
                const title = await sessionTitle();
                if (await tap((label) => label.includes(title))) {
                  return true;
                }
                if (!(await tap((label) => label.startsWith(PROJECT)))) {
                  return false;
                }
                await pause(3000);
                return await tap((label) => label.includes(title));
              },
            },
          ]
        : []),
    ];
    for (const way of ways) {
      const from = heard.length;
      // biome-ignore lint/performance/noAwaitInLoops: one way in after another, on one simulator
      launched = (await relaunch(way.args)) ?? launched;
      const reached = way.reach ? await way.reach() : true;
      const standingCard = await until(
        "the card",
        () => said(from, "probe card "),
        Boolean,
        STAND_MS
      ).catch(() => undefined);
      await pause(2000);
      const there = launched
        ? await rest(launched, way.name.replaceAll(" ", "-"))
        : { share: Number.NaN, frames: "" };
      kit.check(
        `from ${way.name}: the card stands and the app is at rest, its main thread busy under ${REST_SHARE * 100}%`,
        reached && !!standingCard && there.share < REST_SHARE,
        `${reached ? "" : "nothing to tap; "}${standingCard ? "card stood" : "no card"}; main thread busy ${(there.share * 100).toFixed(1)}%${there.frames ? `: ${there.frames}` : ""}`
      );
    }
    // The chevron: tapped where axe reaches the simulator, else pressed by the app itself (`-open-ask-command`).
    let opened: boolean;
    if (taps) {
      // Back on the session's own card, whichever way in came last.
      const from = heard.length;
      launched = (await relaunch(`-open-session ${asker}`)) ?? launched;
      await until(
        "the card",
        () => said(from, "probe card "),
        Boolean,
        STAND_MS
      ).catch(() => undefined);
      await pause(2000);
      opened = await tap("Show the whole command");
    } else {
      const from = heard.length;
      launched =
        (await relaunch(`-open-session ${asker} -open-ask-command`)) ??
        launched;
      opened = !!(await until(
        "the command opened",
        () =>
          heard
            .slice(from)
            .find(
              (line) =>
                line.startsWith("probe opened ") && line.endsWith(" whole")
            ),
        Boolean,
        STAND_MS
      ).catch(() => undefined));
    }
    await pause(2000);
    const open = await rest(launched, "opened");
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "card-open.png")}" >/dev/null 2>&1 || true`
    );
    kit.check(
      `the chevron opens the whole command, and the app is at rest again: its main thread busy under ${REST_SHARE * 100}%`,
      opened && open.share < REST_SHARE,
      `${opened ? "opened" : "no chevron to tap"}; main thread busy ${(open.share * 100).toFixed(1)}%${open.frames ? `: ${open.frames}` : ""}`
    );
    // Approve: tapped, else the app relaunched to approve the card as its Approve does (`-approve-asks`).
    let approvedTap: boolean;
    if (taps) {
      approvedTap = await tap("Approve");
    } else {
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} -open-session ${asker} -approve-asks >/dev/null`
      );
      approvedTap = !!(await until(
        "the card's approval",
        () => heard.find((line) => line.startsWith("probe approve ")),
        Boolean,
        STAND_MS
      ).catch(() => undefined));
      launched =
        (await until("the app's pid", pid, Boolean, 30_000).catch(
          () => undefined
        )) ?? launched;
    }
    const answered = await until(
      "the ask answered",
      async () => ((await pending()).includes("lost-scan") ? undefined : true),
      Boolean,
      30_000
    ).catch(() => undefined);
    const result = await until(
      "the call's result",
      () => ran,
      Boolean,
      60_000
    ).catch(() => undefined);
    kit.check(
      "Approve, tapped, answers: the ask leaves the hub's pending list and the call runs",
      approvedTap && !!answered && !!result,
      `${approvedTap ? "tapped" : "no Approve to tap"}; pending ${answered ? "cleared" : (await pending()).slice(0, 160)}; result ${result ? "in" : "none"}`
    );
    const after = await pid();
    kit.check(
      "the app stays one process through the card and its answer",
      !!launched && after === launched,
      `pid ${launched ?? "none"} then ${after ?? "none"}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
}

/** A running hub, the machine and folder a probe session runs in there, and its project. */
interface LiveHub {
  cwd: string;
  hub: string;
  machineId: string;
  projectId: string;
}

const HTTP_SCHEME = /^http/;

/** What the Deny step came to, in words. */
const denyWords = (denied: boolean, cleared: boolean): string => {
  if (!denied) {
    return "no Deny to tap";
  }
  return cleared
    ? "denied; the hub's pending list cleared"
    : "tapped; still pending";
};

/** One message to a running hub's dashboard socket (trusted mode: no pairing). */
const dashboardSend = async (hub: string, message: object): Promise<void> => {
  const ws = new WebSocket(`${hub.replace(HTTP_SCHEME, "ws")}/ws/dashboard`);
  await new Promise<void>((open, fail) => {
    ws.onopen = () => open();
    ws.onerror = () =>
      fail(new Error(`the dashboard socket at ${hub} refused`));
  });
  ws.send(JSON.stringify(message));
  await pause(500);
  ws.close();
};

/** What the probe session is told: the one call, word for word, to be denied. */
const PROBE_PROMPT = [
  "This is a UI probe of the CawCo app's permission card. Make exactly one tool call: the Bash tool, with",
  `description "${INPUT.description}", timeout ${INPUT.timeout}, and command set to exactly the text between the two marker lines below.`,
  "Do not change the command, do not run anything else, and do not explain. The call will be denied.",
  "<<<COMMAND",
  INPUT.command,
  "COMMAND>>>",
].join("\n");

/**
 * `PROBE_LIVE_ASK=<hub>|<machine>|<cwd>|<project>`: the owner's case on his
 * own hub, with the app as TestFlight builds it (`PROBE_IOS_APP` names the
 * Release simulator build). A probe session of this spec's own, in default
 * mode in that project, asks for the long call; the app is measured with
 * that ask raised on iOS 27.0 (the owner's phone and OS: at rest from
 * launch, as nothing taps there from a workspace) and on iOS 18.5, reached
 * through Needs you and the drawer, then its whole command opened and its
 * Deny tapped (its notification takes no push on an unauthorised simulator
 * app; that route is the Debug runs' `-push-route`). Only the probe's own ask is touched,
 * found by its ids; the probe is stopped and archived at the end.
 */
async function askLive(kit: Kit, app: string, live: LiveHub): Promise<void> {
  const instanceId = crypto.randomUUID();
  const title = "Probe: long ask (ios-long-ask)";
  const listed = async (): Promise<
    (InstanceRow & { status?: string }) | undefined
  > => {
    const rows = (await (await fetch(`${live.hub}/api/instances`)).json()) as
      | (InstanceRow & { status?: string })[]
      | { instances?: (InstanceRow & { status?: string })[] };
    const all = Array.isArray(rows) ? rows : (rows.instances ?? []);
    return all.find((row) => (row.instanceId ?? row.id) === instanceId);
  };
  await dashboardSend(live.hub, {
    verb: "spawn",
    machineId: live.machineId,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: live.cwd,
      harness: "claude",
      title,
      permissionMode: "default",
      projectId: live.projectId,
    },
  });
  try {
    const running = await until(
      "the probe running",
      listed,
      (row) => row?.status === "running",
      180_000
    ).catch(() => undefined);
    if (
      !kit.check(
        "live: the probe session runs on the hub, in default mode, in its project",
        !!running,
        `${instanceId} ${running?.status ?? "not listed"}`
      )
    ) {
      return;
    }
    const uuid = crypto.randomUUID();
    await dashboardSend(live.hub, {
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: live.machineId,
      sessionId: instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: PROBE_PROMPT },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
    const ours = async () => {
      const all = (await (await fetch(`${live.hub}/api/pending`)).json()) as {
        instanceId?: string;
        requestId?: string;
      }[];
      return all.find(
        (entry) =>
          entry.instanceId === instanceId &&
          JSON.stringify(entry).includes("lost-scan")
      );
    };
    const ask = await until(
      "the probe's long ask",
      ours,
      Boolean,
      240_000
    ).catch(() => undefined);
    if (
      !kit.check(
        "live: the probe asks for the long call, waiting on its card",
        !!ask,
        ask?.requestId ?? "no ask from the probe"
      )
    ) {
      return;
    }
    for (const which of ["27", "18"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator after the other
      await onSimulator(kit, app, live, which, ours);
    }
  } finally {
    // The probe stopped (its ask goes with it, if still standing) and archived.
    await dashboardSend(live.hub, {
      verb: "stop",
      machineId: live.machineId,
      instanceId,
      requestId: crypto.randomUUID(),
    }).catch(() => undefined);
    await until(
      "the probe stopped",
      listed,
      (row) => row?.status !== "running" && row?.status !== "starting",
      60_000
    ).catch(() => undefined);
    const archived = await fetch(`${live.hub}/api/seen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [instanceId], kind: "archive" }),
    });
    kit.check(
      "live: the probe is stopped and archived",
      archived.ok,
      `${archived.status} ${(await archived.text()).slice(0, 160)}`
    );
  }
}

/** The Release app on one simulator against the live hub, the probe's ask raised; on iOS 18.5 reached each way, opened and denied. */
async function onSimulator(
  kit: Kit,
  app: string,
  live: LiveHub,
  which: "27" | "18",
  ours: () => Promise<{ instanceId?: string; requestId?: string } | undefined>
): Promise<void> {
  const tag = which === "27" ? "iOS 27" : "iOS 18.5";
  const sim = await macSim(
    which === "27"
      ? {
          runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
          device: "iPhone 17 Pro Max",
        }
      : {
          runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
          device: "iPhone 16 Pro",
        }
  );
  const { udid } = sim;
  try {
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const pid = async (): Promise<string | undefined> => {
      const listed = await sh(
        `xcrun simctl spawn ${udid} launchctl list | grep 'UIKitApplication:dev.cawco.app' || true`
      );
      const [id] = listed.trim().split(SPACES);
      return id && id !== "-" ? id : undefined;
    };
    const launch = async () => {
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -cawco-hub-url ${live.hub} >/dev/null`
      );
      return await until("the app's pid", pid, Boolean, 30_000).catch(
        () => undefined
      );
    };
    const rest = async (process: string, name: string) => {
      const file = join(kit.out, `release-${which}-${name}.sample.txt`);
      await sh(
        `sample ${process} ${REST_S} -file "${file}" >/dev/null 2>&1 || true`
      );
      try {
        return mainThread(readFileSync(file, "utf8"));
      } catch {
        return { share: Number.NaN, frames: "no sample written" };
      }
    };
    const labels = async (): Promise<
      {
        label: string;
        frame?: { x: number; y: number; width: number; height: number };
      }[]
    > => {
      const out: {
        label: string;
        frame?: { x: number; y: number; width: number; height: number };
      }[] = [];
      const walk = (node: Record<string, unknown>) => {
        const text = node.AXLabel ?? node.label;
        if (typeof text === "string" && text) {
          out.push({
            label: text,
            frame: node.frame as (typeof out)[number]["frame"],
          });
        }
        for (const kid of (node.children as
          Record<string, unknown>[] | undefined) ?? []) {
          walk(kid);
        }
      };
      const roots = JSON.parse(
        await sh(`${AXE} describe-ui --udid ${udid}`)
      ) as Record<string, unknown>[];
      for (const root of roots) {
        walk(root);
      }
      return out;
    };
    let screens = 0;
    const tap = async (test: (label: string) => boolean): Promise<boolean> => {
      const all = await labels();
      const frame = all.find(
        (node) => test(node.label) && (node.frame?.width ?? 0) > 0
      )?.frame;
      if (!frame) {
        screens += 1;
        writeFileSync(
          join(kit.out, `release-${which}-screen-${screens}.txt`),
          all.map((node) => node.label).join("\n")
        );
        return false;
      }
      await sh(
        `${AXE} tap -x ${Math.round(frame.x + frame.width / 2)} -y ${Math.round(frame.y + frame.height / 2)} --udid ${udid}`
      );
      return true;
    };
    const report = (
      name: string,
      reached: boolean,
      at: { share: number; frames: string }
    ) =>
      kit.check(
        `live ${tag} (Release): ${name}, the main thread busy under ${REST_SHARE * 100}%`,
        reached && at.share < REST_SHARE,
        `${reached ? "" : "not reached; "}main thread busy ${(at.share * 100).toFixed(1)}%${at.frames ? `: ${at.frames}` : ""}`
      );
    let id = await launch();
    await pause(20_000);
    if (!id) {
      kit.check(`live ${tag} (Release): the app launches`, false, "no pid");
      return;
    }
    report(
      "from launch, with the probe's ask raised on the hub",
      true,
      await rest(id, "launch")
    );
    if (which === "27" && !taps27) {
      kit.note(
        `live ${tag} (Release): only from launch here; its taps need a shell outside a workspace (PROBE_TAPS=1)`
      );
      return;
    }
    // Notifications turned on as the owner has them: the hub sheet's "Turn
    // on notifications", then iOS's own Allow (a first launch asks for none,
    // and `simctl privacy` grants every service but notifications).
    let allowed = false;
    if (await tap((label) => label === "Open navigation")) {
      await pause(2000);
      // "Change hub" stands at the drawer's foot, under every project's
      // sessions: the drawer scrolled down to it.
      // On the owner's hub the drawer holds every project's sessions above
      // it: each project folded first ("Hide <project>'s sessions", this
      // simulator's own view of the drawer), then flicked, as a hand does.
      for (let fold = 0; fold < 30; fold += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one project folded after another
        const folded = await tap(
          (label) => label.startsWith("Hide ") && label.endsWith("'s sessions")
        );
        if (!folded) {
          break;
        }
        await pause(700);
      }
      for (let swipe = 0; swipe < 20; swipe += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one swipe after another, until it shows
        if ((await labels()).some((node) => node.label === "Change hub")) {
          break;
        }
        await sh(
          `${AXE} swipe --start-x 150 --start-y 750 --end-x 150 --end-y 150 --duration 0.12 --udid ${udid}`
        );
        await pause(900);
      }
      if (await tap((label) => label === "Change hub")) {
        await pause(2000);
        if (await tap((label) => label === "Turn on notifications")) {
          await pause(2000);
          allowed = await tap((label) => label === "Allow");
        }
      }
    }
    kit.check(
      `live ${tag} (Release): notifications turned on, as the owner has them`,
      allowed,
      allowed
        ? "allowed"
        : `see release-${which}-screen-*.txt for where it stopped`
    );
    id = (await launch()) ?? id;
    await pause(8000);
    // Needs you, the list that draws the ask's command on a line; then the probe's own row.
    const needs = await tap((label) => label.startsWith("Needs you"));
    await pause(3000);
    report("Needs you lists the asks", needs, await rest(id, "needs-you"));
    const row =
      needs && (await tap((label) => label.includes(INPUT.description)));
    await pause(3000);
    report(
      "the probe's card from Needs you",
      row,
      await rest(id, "card-from-needs-you")
    );
    // The drawer: the project, the probe's row under it.
    id = (await launch()) ?? id;
    await pause(8000);
    let drawer = await tap((label) => label === "Open navigation");
    if (drawer) {
      await pause(2000);
      // Its project open again, if the notifications step folded it.
      if (await tap((label) => label === "Show cockpit's sessions")) {
        await pause(1500);
      }
      // The live probe's own row, which says it needs you: not an earlier probe's
      // stopped row, nor any other session that needs you.
      drawer = await tap(
        (label) => label === "Needs you: Probe: long ask (ios-long-ask)"
      );
    }
    await pause(3000);
    report(
      "the probe's card from the drawer's session row",
      drawer,
      await rest(id, "card-from-drawer")
    );
    // The ask's notification, the app in the background: its banner tapped.
    const ask = await ours();
    await sh(`xcrun simctl launch ${udid} com.apple.Preferences >/dev/null`);
    await pause(2000);
    const payload = join(kit.out, `release-${which}-push.json`);
    writeFileSync(
      payload,
      JSON.stringify({
        aps: {
          alert: { title: "Probe: long ask", body: INPUT.description },
          sound: "default",
        },
        cawco: {
          kind: "ask",
          instanceId: ask?.instanceId,
          requestId: ask?.requestId,
        },
      })
    );
    await sh(`xcrun simctl push ${udid} dev.cawco.app "${payload}" >/dev/null`);
    await pause(2500);
    const banner =
      allowed &&
      (await tap(
        (label) =>
          label.includes(INPUT.description) || label.includes("Probe: long ask")
      ));
    await pause(5000);
    id = (await pid()) ?? id;
    report(
      "the probe's card from its notification",
      banner,
      await rest(id, "card-from-notification")
    );
    if (!banner) {
      // Back on the card the way Needs you reaches it, for the steps after.
      id = (await launch()) ?? id;
      await pause(8000);
      if (await tap((label) => label.startsWith("Needs you"))) {
        await pause(3000);
        await tap((label) => label.includes(INPUT.description));
      }
      await pause(3000);
    }
    // On the card: the whole command opened, then Deny.
    const opened = await tap((label) => label === "Show the whole command");
    await pause(2000);
    report(
      "the probe's whole command opened",
      opened,
      await rest(id, "card-opened")
    );
    const denied = await tap((label) => label === "Deny");
    const cleared =
      denied &&
      !!(await until(
        "the probe's ask answered",
        async () => ((await ours()) ? undefined : true),
        Boolean,
        30_000
      ).catch(() => undefined));
    kit.check(
      `live ${tag} (Release): Deny, tapped, answers the probe's ask`,
      cleared,
      denyWords(denied, cleared)
    );
    const after = await pid();
    kit.check(
      `live ${tag} (Release): the app stays one process`,
      !!after,
      `pid ${after ?? "none"}`
    );
  } finally {
    await sim.release();
  }
}

const spec: Spec = { name: "ios-long-ask", run };
export default spec;
