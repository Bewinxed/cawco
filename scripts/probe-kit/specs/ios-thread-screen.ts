/**
 * The app's thread screen and its question card's Other, where Caw cannot
 * start (a CawCo workspace refuses his place's nested boundary; the live
 * thread is `ios-caw-thread`, run on a host). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model) and the built
 * app, one run on an iPhone and one on an iPad:
 *
 * 1. A thread written into the hub's store (your words, Caw's reply naming
 *    a file, an event that woke him, your answered question) opens in the
 *    app at `thread:<id>`: its messages listed in the hub's order, the
 *    screen captured as `<device>-thread.png` for review beside the web's.
 * 2. A session's question (AskUserQuestion) answered with Other: the
 *    "Your answer…" line takes your own words, Answer sends them, and the
 *    session reads them as the tool's result. Captured with the words written
 *    as `<device>-question-other.png`.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts ios-thread-screen
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const ASK = "AskUserQuestion";
const ASKING = /PROBE-ASK-([A-Z]+)/;
const AXE = "/opt/homebrew/bin/axe";
const LOG_HEAD = /^.*\] /;
const TRAILING_SLASH = /\/$/;
const DEVICES = [
  {
    tag: "iPhone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const asked = new Set<string>();
const question = (tag: string) => `PROBE-VOICE-${tag}: which voice?`;

/** The session's side: `PROBE-ASK-X` asks its question once, then says what it read. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = ASKING.exec(request.last)?.[1];
  if (tag && !asked.has(tag)) {
    asked.add(tag);
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: ASK,
        input: {
          questions: [
            {
              question: question(tag),
              header: "Voice",
              multiSelect: false,
              options: [
                { label: "Plain", description: "Say it plainly." },
                { label: "Warm", description: "Say it warmly." },
              ],
            },
          ],
        },
      },
    };
  }
  return text("Noted.");
};

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
}

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || out.trim()}`);
  }
  return out;
}

function appPath(): string {
  if (process.env.PROBE_IOS_APP) {
    return process.env.PROBE_IOS_APP;
  }
  const home = process.env.HOME ?? "";
  const top = ROOT.replace(TRAILING_SLASH, "");
  const name = top === join(home, "cockpit") ? "main" : top.split("/").at(-1);
  return join(
    process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
    "cawco-apple",
    name ?? "main",
    "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
  );
}

/** The thread written into the hub's store: what each author says, oldest first. */
const SEEDED = [
  { author: "you", body: "What should the posts sound like?" },
  {
    author: "event",
    body: "Three issues opened since this morning.",
    noteTitle: "Routine · 3 new GitHub issues",
  },
  {
    author: "caw",
    body: "I wrote down the **plain voice** we agreed on and set the stages.",
    files: ["stages.md"],
  },
  {
    author: "you",
    body: "Plain",
    question: {
      questions: [
        {
          question: "Which voice should the posts use?",
          header: "Voice",
          multiSelect: false,
          options: [
            { label: "Plain", description: "Say it plainly." },
            { label: "Warm", description: "Say it warmly." },
          ],
        },
      ],
      toolUseId: "toolu_probe_seeded",
    },
    answer: {
      outcome: "answered",
      answers: { "Which voice should the posts use?": "Plain" },
    },
  },
];

const run = async (kit: Kit) => {
  const app = appPath();
  if (!kit.check("the app is built", existsSync(app), app)) {
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

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw threads",
    machineId: MACHINE,
    cwd: fleet.repo,
  });
  const threadId = crypto.randomUUID();
  const now = Date.now();
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    threadId,
    project.id,
    "Which voice should the posts use?",
    now - 60_000,
    now
  );
  for (const [i, m] of SEEDED.entries()) {
    fleet.write(
      "INSERT INTO thread_messages (id, thread_id, author, body, note_title, files, question, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      threadId,
      m.author,
      m.body,
      m.noteTitle ?? null,
      m.files ? JSON.stringify(m.files) : null,
      m.question ? JSON.stringify(m.question) : null,
      m.answer ? JSON.stringify(m.answer) : null,
      now - 50_000 + i * 10_000
    );
  }
  const session = await fleet.spawn("claude", "Ask probe", fleet.repo, {
    projectId: project.id,
  });

  const only = process.env.PROBE_DEVICE;
  for (const device of DEVICES.filter((d) => !only || d.tag === only)) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator after another
    await onDevice(kit, fleet, device, { app, threadId, session });
  }
};

async function onDevice(
  kit: Kit,
  fleet: KitFleet,
  device: (typeof DEVICES)[number],
  ctx: { app: string; session: string; threadId: string }
) {
  const { tag } = device;
  const TAG = tag.toUpperCase();
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  await mkdir(kit.out, { recursive: true });
  try {
    sim = await macSim({ device: device.type });
    const { udid } = sim;
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${ctx.app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app"'`,
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
    await Bun.sleep(1500);

    const tree = async (): Promise<Node[]> => {
      const out: Node[] = [];
      const walk = (node: Record<string, unknown>) => {
        out.push({
          id: node.AXUniqueId as string | undefined,
          frame: node.frame as Node["frame"],
        });
        for (const kid of (node.children as
          | Record<string, unknown>[]
          | undefined) ?? []) {
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
    const tap = async (id: string) => {
      const node = await until(
        `${tag}: ${id} on screen`,
        async () => (await tree()).find((n) => n.id === id),
        Boolean,
        60_000
      );
      const f = node?.frame;
      if (!f) {
        throw new Error(`nothing to tap for ${id}`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };
    const capture = (name: string) =>
      sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, `${tag}-${name}.png`)}" >/dev/null 2>&1`
      );
    const launch = (args: string) =>
      until(
        `${tag}: the app launched`,
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} ${args} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );

    // 1. The seeded thread, in the hub's order.
    await launch(`-open-session thread:${ctx.threadId}`);
    const want = SEEDED.map(
      (m) => `${m.author}:${m.body.slice(0, 40).replaceAll("\n", " ")}`
    );
    const line = await until(
      `${tag}: the thread listed`,
      () => heard.findLast((l) => l.includes(`probe thread ${ctx.threadId} `)),
      (l) => !!l && want.every((m) => l.includes(m)),
      90_000
    ).catch(() =>
      heard.findLast((l) => l.includes(`probe thread ${ctx.threadId} `))
    );
    let at = 0;
    const ordered = want.every((m) => {
      const found = line?.indexOf(m, at) ?? -1;
      at = found + m.length;
      return found >= 0;
    });
    await Bun.sleep(2500);
    await capture("thread");
    // What stands on screen: the composer's field when the thread is up.
    const nodes = await tree();
    await writeFile(
      join(kit.out, `${tag}-thread-tree.json`),
      JSON.stringify(nodes, null, 1)
    );
    const field = nodes.some((n) => n.id === "steer-message");
    kit.check(
      `1 ${tag}: the thread opens with its messages in the hub's order`,
      ordered,
      `${line} | composer on screen ${field}`
    );

    // 2. A session's question, answered with Other.
    await fleet.send(ctx.session, `PROBE-ASK-${TAG} which voice?`);
    await launch(`-open-session ${ctx.session}`);
    const own = `PROBE-OWN-${TAG}`;
    await tap("prompt-other-1");
    await Bun.sleep(800);
    await sh(`${AXE} type '${own}' --udid ${udid}`);
    await Bun.sleep(800);
    await capture("question-other");
    await tap("prompt-answer");
    const read = await until(
      `${tag}: the session reads your own answer`,
      () =>
        fleet.seen.find(
          (s) => s.body.includes(own) && s.body.includes("tool_result")
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    kit.check(
      `2 ${tag}: Other takes your own words as the question's answer, and the session reads them as the tool's result`,
      Boolean(read),
      read ? "read" : heard.filter((l) => l.includes("other")).join(" | ")
    );
  } finally {
    stream?.kill();
    await writeFile(join(kit.out, `${tag}.log`), heard.join("\n"));
    await sim?.release();
  }
}

export default { name: "ios-thread-screen", run } satisfies Spec;
