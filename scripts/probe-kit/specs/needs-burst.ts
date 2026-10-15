/**
 * The phone gets one notification per moment of attention (hub push.ts,
 * bursts), on a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model) with Cawrier a local stand-in that records every
 * push (`CAWCO_CAWRIER_ORIGIN`). One registered device, its push key the
 * spec's own, so each push's sealed words are opened and read here.
 *
 * A project whose `review` stage is of kind `you`; a "mover" session in it
 * moves tasks there with `task_update`, as the orchestrator did on
 * 2026-10-15 (six tasks to Review in 25 s: six pushes). The owner has the
 * mover open on the dashboard (a web client's presence on it), so its own
 * finished turns are the gate's to drop; two "asker" sessions park a Bash
 * permission each.
 *
 * a. Six moves within 5 s: one visible push, after the burst's quiet,
 *    under the burst's own collapse id: "6 tasks need you", the first
 *    task's title and "and 5 more", kind `needs` (opens Needs you).
 * b. Four more moves, a fifth task moved in and back out, and two asks
 *    amid them: the first ask is pushed at once as itself; the second at
 *    once under the burst's id, naming the first in `cawco.cleared`
 *    (the device takes it down, no stacking); the burst's push follows
 *    under that same id, counting 6 (four tasks, two asks), not the task
 *    that left the stage, which the hub logs as over before it went out.
 * c. One item alone (the first ask answered, its session's turn ends): it
 *    goes as itself, under its own id, as it always has.
 *
 *   bun scripts/probe-kit/run.ts needs-burst
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const MOVE = "mcp__cawco__task_update";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
/** The burst's quiet after its last arrival (push.ts `QUIET_MS`), and slack. */
const QUIET_MS = 10_000;
const SLACK_MS = 6000;
const MARK = /PROBE-(?:MOVE|ASK):\w+/g;

interface Call {
  input: object;
  name: string;
}
/** By a message's marker: the tool calls its turn makes, in order. */
const scripts = new Map<string, Call[]>();
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Each turn makes its marker's calls one by one, finding a deferred tool first. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(MARK)].at(-1)?.[0];
  const queue = marker ? scripts.get(marker) : undefined;
  const [next] = queue ?? [];
  if (!(queue && next)) {
    return text("Done.");
  }
  if (!request.toolNames.includes(next.name)) {
    return request.toolNames.includes("ToolSearch")
      ? {
          everyMs: 1,
          words: [],
          tool: {
            name: "ToolSearch",
            input: { query: `select:${next.name}`, max_results: 1 },
          },
        }
      : text(`${next.name} is not offered`);
  }
  queue.shift();
  return { everyMs: 1, words: [], tool: next };
};

interface PushBody {
  collapseId?: string;
  payload: {
    aps: {
      alert?: { body?: string; subtitle?: string; title?: string };
      category?: string;
      "content-available"?: number;
      "thread-id"?: string;
    };
    cawco?: {
      cleared?: string[];
      count?: number;
      kind?: string;
      requestId?: string;
    };
    e?: string;
  };
  pushType?: string;
}
interface Pushed {
  at: number;
  body: PushBody;
}

const run = async (kit: Kit) => {
  const t0 = Date.now();
  const clock = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const pushes: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        const body = (await request.json()) as PushBody;
        pushes.push({ at: Date.now(), body });
        kit.note(
          `${clock()} cawrier ← ${body.pushType ?? "alert"} ${body.collapseId ?? ""} ${body.payload.cawco?.kind ?? ""} "${body.payload.aps.alert?.title ?? ""}" / "${body.payload.aps.alert?.body ?? ""}" cleared=${JSON.stringify(body.payload.cawco?.cleared ?? [])}`
        );
      }
      return Response.json({ ok: true });
    },
  });
  const visible = (since: number) =>
    pushes.filter(
      (one) => one.at >= since && one.body.pushType !== "background"
    );

  // The device's push key: the spec opens each push's sealed words with it.
  const key = crypto.getRandomValues(new Uint8Array(32));
  const opener = await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "decrypt",
  ]);
  const sealed = async (
    push: Pushed
  ): Promise<{ body?: string; title?: string }> => {
    const bytes = Buffer.from(push.body.payload.e ?? "", "base64");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12), tagLength: 128 },
      opener,
      bytes.subarray(12)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  };

  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  let beating: ReturnType<typeof setInterval> | undefined;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    await fleet.api("/api/push/register", {
      pairingId: crypto.randomUUID(),
      secret: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        "base64url"
      ),
      key: Buffer.from(key).toString("base64"),
      name: "Probe iPhone",
      platform: "ios",
    });
    const project = await fleet.api<{ id: string; name: string }>(
      "/api/projects",
      { name: "Burst", machineId: MACHINE, cwd: fleet.repo, caw: false }
    );
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "stages.md", content: STAGES }),
      }
    );
    if (!put.ok) {
      throw new Error(`stages.md: ${put.status} ${await put.text()}`);
    }
    const titles = [
      "Show a project's custom views on the phone",
      "Keep the board's order across restarts",
      "Name the machine in every push",
      "Fold the usage chart into the sidebar",
      "Retry a failed relay enrolment",
      "Read task files written by hand",
      "Open a run's question from its card",
      "Mark a thread read from Telegram",
      "Draw the attempt's diff in the sheet",
      "Count tokens per routine run",
      "Move the stop button under the composer",
    ];
    const tasks: { id: string; title: string }[] = [];
    for (const title of titles) {
      // biome-ignore lint/performance/noAwaitInLoops: one commit at a time, in order
      const filed = await fleet.api<{ id: string }>(
        `/api/projects/${project.id}/tasks`,
        { title, stage: "ready" }
      );
      tasks.push({ id: filed.id, title });
    }
    const stageOf = async (id: string) =>
      (
        await fleet.api<{ stage: string }>(
          `/api/projects/${project.id}/tasks/${id}`
        )
      ).stage;
    const moveCall = (id: string, stage: string): Call => ({
      name: MOVE,
      input: { id, stage, reason: "ready for your review" },
    });
    const taskId = (id: string) => `task-${project.id}:${id}`;

    const mover = await fleet.spawn("claude", "Mover", fleet.repo, {
      projectId: project.id,
    });
    const asker1 = await fleet.spawn("claude", "Asker one", fleet.repo, {
      projectId: project.id,
      permissionMode: "default",
    });
    const asker2 = await fleet.spawn("claude", "Asker two", fleet.repo, {
      projectId: project.id,
      permissionMode: "default",
    });
    kit.note(`mover ${mover}, askers ${asker1} ${asker2}`);
    // The owner has the mover open on the dashboard.
    const beat = () =>
      fleet.api("/api/presence", {
        clientId: "probe-web",
        client: "web",
        sessionId: mover,
        active: true,
        saidAt: Date.now(),
      });
    await beat();
    beating = setInterval(() => {
      beat().catch(() => undefined);
    }, 15_000);

    /** When each task first read `stage`, polled every half second until all have. */
    const reached = async (ids: string[], stage: string) => {
      const at = new Map<string, number>();
      await until(
        `${ids.length} tasks in ${stage}`,
        async () => {
          const stages = await Promise.all(ids.map(stageOf));
          const now = Date.now();
          for (const [index, id] of ids.entries()) {
            if (stages[index] === stage && !at.has(id)) {
              at.set(id, now);
            }
          }
          return at.size;
        },
        (size) => size === ids.length,
        120_000
      );
      return [...at.values()];
    };
    /** Nothing more for the burst's quiet and slack after `push`. */
    const settled = async (push: Pushed) => {
      await Bun.sleep(Math.max(0, push.at + QUIET_MS + SLACK_MS - Date.now()));
    };

    // ── a. six moves within 5 s ───────────────────────────────────────────
    const aStart = Date.now();
    const six = tasks.slice(0, 6);
    scripts.set(
      "PROBE-MOVE:A",
      six.map((one) => moveCall(one.id, "review"))
    );
    await fleet.send(mover, "PROBE-MOVE:A move these six to review");
    const aAt = await reached(
      six.map((one) => one.id),
      "review"
    );
    const aSpread = Math.max(...aAt) - Math.min(...aAt);
    kit.check(
      "a: the six moves land within 5 s",
      aSpread <= 5000,
      `${aSpread} ms from the first to the last`
    );
    const aBurst = await until(
      "a: the burst's push",
      () =>
        visible(aStart).find((one) => one.body.payload.cawco?.kind === "needs"),
      Boolean,
      60_000
    );
    if (!aBurst) {
      throw new Error("a: no burst push");
    }
    await settled(aBurst);
    const aPushes = visible(aStart);
    const aSealed = await sealed(aBurst);
    kit.check(
      "a: six moves within 5 s give one visible push",
      aPushes.length === 1,
      aPushes.map((one) => one.body.collapseId).join(", ")
    );
    kit.check(
      "a: it says 6, names the first and opens Needs you",
      aBurst.body.collapseId?.startsWith("needs-") === true &&
        aBurst.body.payload.cawco?.count === 6 &&
        aBurst.body.payload.aps.category === "CAWCO_NEEDS" &&
        aBurst.body.payload.aps.alert?.title === "6 tasks need you" &&
        aBurst.body.payload.aps.alert?.body === `${six[0].title}, and 5 more` &&
        aSealed.title === "6 tasks need you" &&
        aSealed.body === `${six[0].title}, and 5 more`,
      JSON.stringify({
        collapseId: aBurst.body.collapseId,
        cawco: aBurst.body.payload.cawco,
        aps: aBurst.body.payload.aps,
        sealed: aSealed,
      })
    );
    kit.check(
      "a: no task pushed on its own",
      !aPushes.some((one) => one.body.collapseId?.startsWith("task-")),
      `${Math.round((aBurst.at - Math.max(...aAt)) / 100) / 10} s after the last move`
    );

    // ── b. two asks amid four moves, a fifth task in and back out ─────────
    const bStart = Date.now();
    const [t7, t8, t9, t10, t11] = tasks.slice(6);
    scripts.set("PROBE-MOVE:B", [
      moveCall(t7.id, "review"),
      moveCall(t8.id, "review"),
      moveCall(t11.id, "review"),
      moveCall(t9.id, "review"),
      moveCall(t11.id, "ready"),
      moveCall(t10.id, "review"),
    ]);
    const bash = (n: number): Call => ({
      name: "Bash",
      input: {
        command: `touch burst-probe-${n}.txt`,
        description: "Make a file",
      },
    });
    scripts.set("PROBE-ASK:1", [bash(1)]);
    scripts.set("PROBE-ASK:2", [bash(2)]);
    interface Parked {
      instanceId?: string;
      requestId?: string;
    }
    const parked = (instanceId: string) =>
      until(
        `the ask of ${instanceId.slice(0, 8)} parked`,
        async () =>
          (await fleet.api<Parked[]>("/api/pending")).find(
            (one) => one.instanceId === instanceId && one.requestId
          )?.requestId,
        Boolean,
        120_000
      ) as Promise<string>;
    await fleet.send(mover, "PROBE-MOVE:B four more, and one in and out");
    await reached([t7.id], "review");
    await fleet.send(asker1, "PROBE-ASK:1 make a file");
    const ask1 = await parked(asker1);
    const ask1Parked = Date.now();
    await fleet.send(asker2, "PROBE-ASK:2 make another");
    const ask2 = await parked(asker2);
    const ask2Parked = Date.now();
    const bAt = await reached([t7.id, t8.id, t9.id, t10.id], "review");
    await reached([t11.id], "ready");
    const ask1Push = await until(
      "b: the first ask's push",
      () =>
        visible(bStart).find((one) => one.body.collapseId === `ask-${ask1}`),
      Boolean,
      15_000
    );
    const ask2Push = await until(
      "b: the second ask's push",
      () =>
        visible(bStart).find(
          (one) =>
            one.body.payload.cawco?.kind === "ask" &&
            one.body.payload.cawco.requestId === ask2
        ),
      Boolean,
      15_000
    );
    const bBurst = await until(
      "b: the burst's push",
      () =>
        visible(bStart).find((one) => one.body.payload.cawco?.kind === "needs"),
      Boolean,
      60_000
    );
    if (!(ask1Push && ask2Push && bBurst)) {
      throw new Error("b: a push is missing");
    }
    await settled(bBurst);
    const bPushes = visible(bStart);
    kit.check(
      "b: the first ask goes at once, as itself",
      ask1Push.at - ask1Parked < 3000 && ask1Push.at < bBurst.at,
      `${ask1Push.at - ask1Parked} ms after it parked, under ${ask1Push.body.collapseId}`
    );
    const ask2Sealed = await sealed(ask2Push);
    kit.check(
      "b: the second ask goes at once and replaces the first under the burst's id",
      ask2Push.at - ask2Parked < 3000 &&
        ask2Push.body.collapseId?.startsWith("needs-") === true &&
        (ask2Push.body.payload.cawco?.cleared ?? []).includes(`ask-${ask1}`) &&
        ask2Push.body.payload.aps.category === "CAWCO_PERMISSION_OPEN" &&
        ask2Sealed.body?.endsWith("\nAnd 1 more") === true,
      JSON.stringify({
        ms: ask2Push.at - ask2Parked,
        collapseId: ask2Push.body.collapseId,
        cleared: ask2Push.body.payload.cawco?.cleared,
        category: ask2Push.body.payload.aps.category,
        sealed: ask2Sealed,
      })
    );
    const bSealed = await sealed(bBurst);
    kit.check(
      "b: the burst's push collapses onto the same notification and counts 6",
      bBurst.body.collapseId === ask2Push.body.collapseId &&
        bBurst.body.payload.cawco?.count === 6 &&
        bBurst.body.payload.aps.alert?.title === "6 need you" &&
        bBurst.body.payload.aps.alert?.body === `${t7.title}, and 5 more` &&
        bSealed.title === "6 need you",
      JSON.stringify({
        collapseId: bBurst.body.collapseId,
        cawco: bBurst.body.payload.cawco,
        alert: bBurst.body.payload.aps.alert,
        sealed: bSealed,
      })
    );
    kit.check(
      "b: three visible pushes under two ids: the first ask's, then the burst's twice",
      bPushes.length === 3 &&
        new Set(bPushes.map((one) => one.body.collapseId)).size === 2,
      bPushes.map((one) => one.body.collapseId).join(", ")
    );
    const hubLog = await fleet.logs("hub");
    const over = hubLog
      .split("\n")
      .filter(
        (line) => line.includes(taskId(t11.id)) && line.includes("over before")
      );
    kit.check(
      "b: the task moved back out inside the window isn't counted",
      over.length === 1 &&
        !bPushes.some((one) => one.body.collapseId === taskId(t11.id)),
      over.join(" | ") || "no 'over before' line"
    );
    kit.check(
      "b: the moves landed inside one burst",
      Math.max(...bAt, ask2Parked) - Math.min(...bAt, ask1Parked) < 30_000,
      `${Math.max(...bAt, ask2Parked) - Math.min(...bAt, ask1Parked)} ms from the first to the last arrival`
    );

    // ── c. one item alone goes as itself ──────────────────────────────────
    const cStart = Date.now();
    await fleet.control(asker1, "resolvePermission", [
      ask1,
      {
        behavior: "allow",
        updatedInput: bash(1).input,
      },
    ]);
    const turn = await until(
      "c: the answered session's finished turn",
      () => visible(cStart)[0],
      Boolean,
      90_000
    );
    if (!turn) {
      throw new Error("c: no push");
    }
    await settled(turn);
    kit.check(
      "c: a single item goes under its own id, as itself",
      visible(cStart).length === 1 &&
        turn.body.collapseId === `turn-${asker1}` &&
        turn.body.payload.cawco?.kind === "turn",
      visible(cStart)
        .map((one) => `${one.body.collapseId} ${one.body.payload.cawco?.kind}`)
        .join(", ")
    );

    await writeFile(
      join(kit.out, "pushes.json"),
      JSON.stringify(pushes, null, 2)
    );
    await writeFile(
      join(kit.out, "hub-notify.log"),
      (await fleet.logs("hub"))
        .split("\n")
        .filter((line) => line.includes("[notify]") || line.includes("[push]"))
        .join("\n")
    );
    kit.note(`captures: ${kit.out}`);
  } finally {
    clearInterval(beating);
    cawrier.stop(true);
  }
};

export default { name: "needs-burst", run } satisfies Spec;
