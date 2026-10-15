/**
 * The app's Caw thread is the web's thread, 1:1 (ThreadPane.svelte, the app's
 * ThreadViewController). On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model) and the built app, one run on an
 * iPhone and one on an iPad, each reading the app's DEBUG log lines:
 *
 * 1. Opened at `thread:<id>`, the app lists the thread's messages in the
 *    hub's order (`probe thread … messages N [author:words | …]`).
 * 2. Words sent from the app's composer land in the hub's thread
 *    (a `thread_messages` row by you) and the web's thread shows them.
 * 3. Caw's reply appears in the app's thread.
 * 4. His question (AskUserQuestion) stands on the thread's composer and is
 *    answered there with Other: the hub records your own words as the
 *    question's answer, and Caw reads them as the tool's result.
 * 5. A memory proposal he asks about (`memory_propose` with `ask`, parked on
 *    machine "hub" with no session row) stands there too and is approved there.
 * 6. A tapped push of his ask (its `cawco` data, routed as a tap is) opens
 *    the thread with the card on its composer.
 *
 * Caw starts in his own place's boundary: run it on a host, outside any
 * CawCo workspace (inside one his start fails with EPERM).
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts ios-caw-thread
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device; `PROBE_IOS_APP` names
 * another build of the app.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { Page } from "playwright-core";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, ROOT, type Spec } from "../kit";

const CAW = "You are Caw";
const REPLY = "mcp__cawco__thread_reply";
const PROPOSE = "mcp__cawco__memory_propose";
const ASK = "AskUserQuestion";
/** Your words' markers: `PROBE-REPLY-X`, `PROBE-ASK-X`, `PROBE-PROPOSE-X`; never Caw's "PROBE-REPLY-X done". */
const MARKER = /PROBE-(REPLY|ASK|PROPOSE)-([A-Z]+)(?! done)/g;
const THREAD_IDS = /thread ([0-9a-f-]{36})/g;
const AXE = "/opt/homebrew/bin/axe";
/**
 * A log line's head, up to and with its `[dev.cawco.app:<category>] `: never
 * further, as a probe line may carry `] ` of its own (`asks [...]`).
 */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
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
const tool = (name: string, input: object, everyMs = 5): Reply => ({
  everyMs,
  words: [],
  tool: { name, input },
});
/** Calls `name`, loading it with ToolSearch first when it is deferred. */
const call = (
  request: Seen,
  name: string,
  input: object,
  everyMs = 5
): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input, everyMs);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
const made = new Set<string>();
const question = (tag: string) => `PROBE-VOICE-${tag}: which voice?`;

/**
 * Caw's side, by the newest event: `PROBE-REPLY-X` answers with a
 * thread_reply, `PROBE-ASK-X` with his question, `PROBE-PROPOSE-X` with a
 * memory proposal he asks about.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(CAW)) {
    return text("ok");
  }
  // The newest of your words decides, read across every user message of the
  // turn: a deferred tool's first call is a ToolSearch round, after which the
  // newest user message is no longer the wake, and a wake may quote the
  // thread's earlier words. Caw's own "… done" is never yours.
  const newest = [...request.all.matchAll(MARKER)].at(-1);
  const thread = [...request.all.matchAll(THREAD_IDS)].at(-1)?.[1] ?? "";
  const replying = newest?.[1] === "REPLY" ? newest[2] : undefined;
  const asking = newest?.[1] === "ASK" ? newest[2] : undefined;
  const proposing = newest?.[1] === "PROPOSE" ? newest[2] : undefined;
  if (replying) {
    if (made.has(`reply ${replying}`)) {
      return text("Sent.");
    }
    const reply = call(
      request,
      REPLY,
      { thread, body: `PROBE-REPLY-${replying} done` },
      300
    );
    if (reply.tool?.name === REPLY) {
      made.add(`reply ${replying}`);
    }
    return reply;
  }
  if (asking) {
    if (made.has(`ask ${asking}`)) {
      return text("Noted your pick.");
    }
    made.add(`ask ${asking}`);
    return tool(ASK, {
      questions: [
        {
          question: question(asking),
          header: "Voice",
          multiSelect: false,
          options: [
            { label: "Plain", description: "Say it plainly." },
            { label: "Warm", description: "Say it warmly." },
          ],
        },
      ],
    });
  }
  if (proposing) {
    if (made.has(`propose ${proposing}`)) {
      return text("Asked.");
    }
    const proposal = call(request, PROPOSE, {
      path: "AGENTS.md",
      content: `# Caw threads\n\nPROBE-MEMORY-${proposing}: posts use the plain voice.\n`,
      why: "The voice you chose.",
      ask: true,
    });
    if (proposal.tool?.name === PROPOSE) {
      made.add(`propose ${proposing}`);
    }
    return proposal;
  }
  return text("ok");
};

interface Row {
  answer: string | null;
  author: string;
  /** Null on an event whose title says it all. */
  body: string | null;
  id: string;
}
interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}
interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
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

/** The checkout's simulator app, only when it was built from this tree (scripts/lib/apple-app.ts). */
const appPath = () => freshApp(ROOT);

/** How the app's probe line writes a message: its author, then its first 40 characters on one line. */
const shown = (row: Row) =>
  `${row.author}:${(row.body ?? "").slice(0, 40).replaceAll("\n", " ")}`;

const run = async (kit: Kit) => {
  const { path: app, problem } = appPath();
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  // Approving a proposal stages its files in the hub's temp dir: in a
  // workspace, its own (`/tmp` is outside its boundary).
  if (process.env.TMPDIR) {
    fleet.env.TMPDIR = process.env.TMPDIR;
  }
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await Bun.$`mkdir -p ${src}`;
  await Bun.write(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw threads",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });
  const started = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    {
      body: "PROBE-REPLY-HELLO hello",
    }
  );
  const threadId = started.thread.id;
  const rows = () =>
    fleet.query<Row>(
      "SELECT id, author, body, answer FROM thread_messages WHERE thread_id = ? ORDER BY created_at, id",
      threadId
    );
  const said = (author: string, words: string) =>
    until(
      `${author} “${words}” in the thread`,
      () => rows().find((r) => r.author === author && r.body === words),
      Boolean,
      120_000
    );
  const statusOf = async () =>
    (
      await fleet.api<{ id: string; status: string }[]>(
        `/api/projects/${project.id}/threads`
      )
    ).find((t) => t.id === threadId)?.status;
  const idle = () =>
    until("the thread ready", statusOf, (read) => read === "ready", 120_000);
  const pending = () => fleet.api<Ask[]>("/api/pending");
  await said("caw", "PROBE-REPLY-HELLO done");
  await idle();
  const lead = fleet.query<{ lead_instance_id: string }>(
    "SELECT lead_instance_id FROM projects WHERE id = ?",
    project.id
  )[0]?.lead_instance_id;
  kit.check("Caw started and answered the first thread", Boolean(lead));

  const base = await fleet.dashboard();
  /**
   * The web's thread, opened for as long as one check reads it: a page left
   * open through a long run is a renderer that may be lost to the machine's load.
   */
  const web = async <T>(read: (page: Page) => Promise<T>): Promise<T> => {
    const page = await kit.page("desk");
    try {
      await open(
        page,
        `${base}/session/thread:${threadId}`,
        'textarea[aria-label="Message the project"]',
        90_000
      );
      return await read(page);
    } finally {
      await page.close();
    }
  };

  const only = process.env.PROBE_DEVICE;
  for (const device of DEVICES.filter((d) => !only || d.tag === only)) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator after another
    await onDevice(kit, fleet, device, {
      app,
      threadId,
      projectId: project.id,
      lead: lead ?? "",
      rows,
      said,
      idle,
      status: statusOf,
      pending,
      web,
    });
  }
};

interface Ctx {
  app: string;
  idle: () => Promise<unknown>;
  lead: string;
  pending: () => Promise<Ask[]>;
  projectId: string;
  rows: () => Row[];
  said: (author: string, words: string) => Promise<Row | undefined>;
  /** The thread's status as the hub lists it now. */
  status: () => Promise<string | undefined>;
  threadId: string;
  web: <T>(read: (page: Page) => Promise<T>) => Promise<T>;
}

async function onDevice(
  kit: Kit,
  fleet: KitFleet,
  device: (typeof DEVICES)[number],
  ctx: Ctx
) {
  const { tag } = device;
  const TAG = tag.toUpperCase();
  const { threadId } = ctx;
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  try {
    sim = await macSim({ device: device.type });
    const { udid } = sim;
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${ctx.app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Thread" OR category == "Threads" OR category == "Permission" OR category == "PromptCard" OR category == "Push")'`,
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
          label: (node.AXLabel ?? node.label) as string | undefined,
          frame: node.frame as Node["frame"],
        });
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
    /** The app's newest line about this thread. */
    const probeLine = () =>
      heard.findLast((l) => l.includes(`probe thread ${threadId} `));
    const listed = (want: (line: string) => boolean, label: string) =>
      until(
        `${tag}: ${label}`,
        probeLine,
        (line) => !!line && want(line),
        90_000
      ).catch(() => probeLine());
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

    // 1. The thread lists the web's messages in order.
    await launch(`-open-session thread:${threadId}`);
    const hubOrder = ctx.rows().map(shown);
    const first = await listed(
      (l) => hubOrder.every((m) => l.includes(m)),
      "the thread's messages listed"
    );
    const inOrder = (line: string | undefined, order: string[]) => {
      let at = 0;
      for (const m of order) {
        const found = line?.indexOf(m, at) ?? -1;
        if (found < 0) {
          return false;
        }
        at = found + m.length;
      }
      return true;
    };
    kit.check(
      `1 ${tag}: the thread lists the web's messages in order`,
      inOrder(first, hubOrder),
      `${first} | hub ${hubOrder.join(" | ")}`
    );

    /** The screen as it stands, into the run's out folder as `<device>-<name>.png`. */
    const capture = async (name: string) => {
      await mkdir(kit.out, { recursive: true });
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, `${tag}-${name}.png`)}" >/dev/null 2>&1`
      );
    };

    // 2. A message from the app lands in the hub's thread, and the web thread shows it.
    await ctx.idle();
    const words = `PROBE-REPLY-${TAG} from the app`;
    await tap("steer-message");
    await Bun.sleep(800);
    await sh(`${AXE} type '${words}' --udid ${udid}`);
    await tap("send-steer");
    const row = await ctx.said("you", words);
    const onWeb = await ctx.web((page) =>
      page
        .getByText(words)
        .first()
        .waitFor({ timeout: 30_000 })
        .then(
          () => true,
          () => false
        )
    );
    kit.check(
      `2 ${tag}: a message sent from the app lands in the hub's thread and the web thread shows it`,
      Boolean(row) && onWeb,
      `row ${row?.id}; web ${onWeb}`
    );

    // 3. Caw's reply appears in the app's thread.
    await ctx.said("caw", `PROBE-REPLY-${TAG} done`);
    const replied = await listed(
      (l) => l.includes(`caw:PROBE-REPLY-${TAG} done`),
      "Caw's reply in the thread"
    );
    // The thread at rest, for the screen's review beside the web's.
    await capture("thread");
    kit.check(
      `3 ${tag}: Caw's reply appears in the app thread`,
      !!replied?.includes(`caw:PROBE-REPLY-${TAG} done`),
      replied
    );

    // 4. His question on the thread's composer, answered there with Other.
    await ctx.idle();
    await fleet.api(
      `/api/projects/${ctx.projectId}/threads/${threadId}/messages`,
      { body: `PROBE-ASK-${TAG} which voice should we use` }
    );
    const asked = await until(
      `${tag}: his question parked`,
      async () =>
        (await ctx.pending()).find(
          (a) => a.payload.toolName === ASK && a.payload.threadId === threadId
        ),
      Boolean,
      120_000
    );
    const cardLine = await listed(
      (l) => !!asked && l.includes(asked.requestId),
      "his question on the composer"
    );
    const own = `PROBE-OWN-${TAG}`;
    await tap("prompt-other-1");
    await Bun.sleep(800);
    await sh(`${AXE} type '${own}' --udid ${udid}`);
    // The question on the composer with its own answer written, for the review.
    await capture("question-other");
    await tap("prompt-answer");
    const answered = await until(
      `${tag}: your own answer in the thread`,
      () => ctx.rows().find((r) => r.answer?.includes(own)),
      Boolean,
      60_000
    ).catch(() => undefined);
    const read = await until(
      `${tag}: Caw reads your own answer`,
      () =>
        fleet.seen.find(
          (s) => s.body.includes(own) && s.body.includes("tool_result")
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    kit.check(
      `4 ${tag}: his question stands on the thread's composer; Other answers it there, the hub records your words and Caw reads them`,
      !!cardLine?.includes(asked?.requestId ?? "-") &&
        Boolean(answered) &&
        Boolean(read),
      `card ${cardLine}; answer ${answered?.answer}; read ${Boolean(read)}`
    );

    // 5. A memory proposal he asks about, on machine "hub", answered there.
    await ctx.idle();
    await fleet.api(
      `/api/projects/${ctx.projectId}/threads/${threadId}/messages`,
      { body: `PROBE-PROPOSE-${TAG} keep the voice` }
    );
    const proposal = await until(
      `${tag}: his proposal parked`,
      async () =>
        (await ctx.pending()).find(
          (a) => a.machineId === "hub" && a.payload.threadId === threadId
        ),
      Boolean,
      120_000
    );
    // His question beside it: two asks wait in the thread, and the composer
    // shows one at a time, the rest counted (ThreadPane.svelte `firstAsk`).
    await until(
      `${tag}: his turn over`,
      ctx.status,
      (now) => now !== "working",
      120_000
    );
    await fleet.api(
      `/api/projects/${ctx.projectId}/threads/${threadId}/messages`,
      { body: `PROBE-ASK-${TAG}TWO which voice beside it` }
    );
    const beside = await until(
      `${tag}: his question parked beside the proposal`,
      async () =>
        (await ctx.pending()).find(
          (a) => a.payload.toolName === ASK && a.payload.threadId === threadId
        ),
      Boolean,
      120_000
    );
    const proposed = await listed(
      (l) =>
        !!proposal &&
        l.includes(`asks [${proposal.requestId}]`) &&
        l.includes("place 1 of 2"),
      "his proposal on the composer, one of two"
    );
    kit.check(
      `5 ${tag}: with two asks waiting, the thread's composer shows one card, the first, "1 of 2"`,
      !!proposed?.includes(`asks [${proposal?.requestId}]`) &&
        !!proposed?.includes("place 1 of 2"),
      proposed
    );
    await tap("prompt-approve");
    const settled = await until(
      `${tag}: the proposal settled`,
      async () =>
        !(await ctx.pending()).some((a) => a.requestId === proposal?.requestId),
      Boolean,
      60_000
    ).catch(() => false);
    kit.check(
      `5 ${tag}: a memory proposal he asked about (machine hub, no session row) shows in the thread and is approved there`,
      !!proposed?.includes(proposal?.requestId ?? "-") && settled === true,
      `card ${proposed}; settled ${settled}`
    );
    const next = await listed(
      (l) =>
        !!beside &&
        l.includes(`asks [${beside.requestId}]`) &&
        l.includes("place 2 of 2"),
      "his question moved in, two of two"
    );
    kit.check(
      `5 ${tag}: answered, the next ask moves in, "2 of 2"`,
      !!next?.includes(`asks [${beside?.requestId}]`) &&
        !!next?.includes("place 2 of 2"),
      next
    );
    await tap("prompt-option-1-1");
    await tap("prompt-answer");
    await until(
      `${tag}: his question beside it answered`,
      async () =>
        !(await ctx.pending()).some((a) => a.requestId === beside?.requestId),
      Boolean,
      60_000
    ).catch(() => undefined);

    // 6. A tapped push of his ask opens the thread at its card.
    await ctx.idle();
    await fleet.api(
      `/api/projects/${ctx.projectId}/threads/${threadId}/messages`,
      { body: `PROBE-ASK-${TAG}PUSH which voice now` }
    );
    const again = await until(
      `${tag}: his second question parked`,
      async () =>
        (await ctx.pending()).find(
          (a) => a.payload.toolName === ASK && a.payload.threadId === threadId
        ),
      Boolean,
      120_000
    );
    await sh(`xcrun simctl terminate ${udid} dev.cawco.app || true`);
    const from = heard.length;
    const data = JSON.stringify({
      kind: "ask",
      instanceId: again?.instanceId ?? "",
      machineId: again?.machineId ?? "",
      projectId: ctx.projectId,
      requestId: again?.requestId ?? "",
      threadId,
    });
    await launch(`-push-route 'push:${data}'`);
    const landed = await until(
      `${tag}: the push's route`,
      () =>
        heard
          .slice(from)
          .find((l) =>
            l.includes(`route session("thread:${threadId}") landed`)
          ),
      Boolean,
      90_000
    ).catch(() => undefined);
    const atCard = await until(
      `${tag}: the thread at the card`,
      () =>
        heard
          .slice(from)
          .findLast(
            (l) =>
              l.includes(`probe thread ${threadId} `) &&
              !!again &&
              l.includes(again.requestId)
          ),
      Boolean,
      90_000
    ).catch(() => undefined);
    kit.check(
      `6 ${tag}: a push tap opens the thread at the card`,
      Boolean(landed && atCard),
      `${landed}; ${atCard}`
    );
    // Put down, so the next device starts from a thread at rest.
    if (again) {
      await fleet.post({
        type: "command",
        commandId: crypto.randomUUID(),
        kind: "permission.answer",
        machineId: again.machineId,
        sessionId: again.instanceId,
        payload: {
          instanceId: again.instanceId,
          requestId: again.requestId,
          method: "resolvePermission",
          args: [
            again.requestId,
            {
              behavior: "allow",
              updatedInput: {
                ...again.payload.input,
                answers: { [question(`${TAG}PUSH`)]: "Plain" },
              },
            },
          ],
        },
      });
    }
  } finally {
    stream?.kill();
    await mkdir(kit.out, { recursive: true });
    await writeFile(join(kit.out, `${tag}.log`), heard.join("\n"));
    await sim?.release();
  }
}

export default { name: "ios-caw-thread", run } satisfies Spec;
