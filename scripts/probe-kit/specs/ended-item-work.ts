/**
 * A workspace whose items have all ended runs nothing but what a landing
 * runs or an artifact shows (hub work-items.ts `endLeftWork`, agent
 * boundary.ts `endSessionWork`, `agentServerStarted`, stage.ts `start`; hub
 * server.ts `tellLeak`). On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model), boundaries included: it delegates,
 * so it runs on the host, outside every workspace, on Linux and on macOS.
 * The agent's leak threshold is {@link THRESHOLD_GIB} GiB.
 *
 * A: a delegate starts, in the background, a `bun -e` server on its
 * boundary's loopback (port {@link PORT_A}, and a unix socket in its
 * TMPDIR, which the probe reaches from the host as the boundary's network
 * is its own) that grows 8 MiB a second to 1.5 GiB and holds it; it
 * finishes done once the server answers. The parent's preview artifact
 * shows that port of its workspace, as workspace-retire's (p) does
 * (artifact_create refuses a delegate's preview of a port with no `serve`,
 * artifacts/service.ts `NOT_SERVED`).
 *
 * - (a1) After A's item ends, and after a sweep, its server still answers
 *   and its workspace is kept, and the agent's log says nothing of A's work
 *   ended: the artifact keeps it (the sweep names A's awake session, the
 *   first hold it reads, hub work-items.ts `holdOn`).
 * - (a2) The parent reads the server's climb in memory, naming A's item and
 *   the server, as A takes no word (the old leak-notice-workspace (w3)).
 * - (a2b) The parent's person's transcript draws that as CawCo's notice
 *   row, its line naming A's item and saying the server still runs
 *   ({@link A_LEAK_END}), never as their own message (core
 *   transcript-rules.ts `cawcoRow`; the old leak-notice-workspace (w3b)).
 * - (a3) The parent reads no leftover of A's.
 * - (a4) Once the artifact is deleted, the server is gone within a sweep's
 *   minute, and the agent's log says A finished, naming the server's pid.
 * - (a5) A's session sleeps and its workspace retires.
 *
 * B: a delegate starts `sleep 600.0962` in the background, shows a preview
 * whose server CawCo's stage runs in its workspace (artifact_create's
 * `serve`; the server answers on the stage's port and on a unix socket in
 * its TMPDIR, as A's does), and rests in a wait, its item live. Its parent
 * stops it.
 *
 * - (b1) Before the stop, B's preview serves its page, and its server
 *   answers on its socket.
 * - (b2) After the stop, `sleep 600.0962` is gone (the stop ended what B
 *   left running, agent session.ts `#endWork`), and the stage's server is
 *   the same process and still answers on its socket: on the Mac, where a
 *   session's sweep takes all of its workspace's work, the stage's server
 *   was ended with it until 2026-10-24. (A stopped session's preview origin
 *   closes with it, hub server.ts `endPreviews`, so the stage is reached
 *   on its socket, not through the preview.)
 *
 *   bun scripts/probe-kit/run.ts ended-item-work
 */
import { readWithin } from "../../../packages/core/src/bounded";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { leakWords } from "../../../packages/core/src/words/leaks";
import { noticeLine } from "../../../packages/core/src/words/notices";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { passedFetch } from "../preview-pass";

const THRESHOLD_GIB = 0.25;
const FINISH = "mcp__cawco__finish_item";
const CREATE = "mcp__cawco__artifact_create";
const WAIT = "mcp__cawco__wait_item";
const TAG = /PROBE-ENDED-([AB]):/;
const PORT_A = 47_631;
const PORT_B = 47_632;
/** What A's server is found by: its command line, and the leak notice that names it. */
const MARK_A = "endedProbeA";
/** The unix socket A's server also answers on, in its TMPDIR. */
const SOCKET_A = "ended-a.sock";
const PAGE_A = "ended probe page A";
/** A's item's title, as the parent's notice row names it. */
const TITLE_A = "Serve a page";
/**
 * How the row of A's server's climb ends in the parent's transcript: naming
 * A's item, then its live state, "· still running" while the artifact keeps
 * the server (core words/notices.ts `leaking`, `noticeLine`).
 */
const A_LEAK_END = noticeLine({
  line: ` in ${TITLE_A}`,
  live: "running",
});
const TITLE_B = "Ended probe page B";
/** The unix socket B's served server also answers on, in its TMPDIR. */
const SOCKET_B = "ended-b.sock";
const B_SLEEP = "600.0962";
/** How long a climb takes to be told: 32 s to the threshold, then a minute of rising readings, and room. */
const MEMORY_WAIT_MS = 240_000;
/** A sweep's minute, its SIGTERM's grace and its SIGKILL. */
const SWEEP_END_MS = 75_000;
/** An item's ask to its end. */
const ITEM_MS = 300_000;
/** A workspace's settle once its session can sleep: the sleep, then its machine's archive. */
const SETTLE_MS = 180_000;

/** `word` as one single-quoted shell word. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/** A's server: the port and the socket, growing 8 MiB a second to 1.5 GiB. */
const SERVE_A = `cd "$TMPDIR" && bun -e ${quoted(
  `globalThis.${MARK_A}=1;const k=[];setInterval(()=>{if(k.length<192)k.push(Buffer.alloc(8388608,1))},1000);const fetch=()=>new Response(${JSON.stringify(PAGE_A)});Bun.serve({hostname:"127.0.0.1",port:${PORT_A},fetch});Bun.serve({unix:${JSON.stringify(SOCKET_A)},fetch});`
)}`;
/** A command that waits for A's server to answer, then says so, spelled apart. */
const UP_A = `for i in $(seq 100); do bun -e ${quoted(`const r = await fetch("http://127.0.0.1:${PORT_A}/"); if (!r.ok) process.exit(1);`)} 2>/dev/null && echo "UP-""A:" && break; sleep 0.1; done`;
/** What serves B's preview: a page on the `PORT` the stage gives it. */
const SERVED_B = `cd "$TMPDIR" && bun -e ${quoted(
  `const page=${JSON.stringify(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE_B}</title></head><body>${TITLE_B}</body></html>`)};const fetch=()=>new Response(page,{headers:{"content-type":"text/html"}});Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT),fetch});Bun.serve({unix:${JSON.stringify(SOCKET_B)},fetch});`
)}`;

const steps: Partial<Record<"A" | "B", number>> = {};
/** The CawCo tool a delegate asked for once ToolSearch has loaded it. */
const pending: Partial<Record<"A" | "B", { input: object; name: string }>> = {};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const bash = (command: string, background: boolean): Reply =>
  tool("Bash", {
    command,
    description: "Run a command",
    ...(background ? { run_in_background: true } : { timeout: 120_000 }),
  });

/** A call of `name`, through ToolSearch while it is not loaded yet. */
const want = (
  request: Seen,
  tag: "A" | "B",
  name: string,
  input: object
): Reply => {
  if (request.toolNames.includes(name)) {
    delete pending[tag];
    return tool(name, input);
  }
  pending[tag] = { name, input };
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** A: its server in the background, then until it answers, then finish_item. */
const workA = (request: Seen): Reply => {
  const step = steps.A ?? 0;
  if (step === 0) {
    steps.A = 1;
    return bash(SERVE_A, true);
  }
  if (!request.afterTool) {
    return text("ok");
  }
  const asked = pending.A;
  if (asked) {
    return want(request, "A", asked.name, asked.input);
  }
  if (step === 1) {
    steps.A = 2;
    return bash(UP_A, false);
  }
  if (step === 2) {
    steps.A = 3;
    return want(request, "A", FINISH, {
      headline: "The server runs.",
      summary: "The server runs in the workspace.",
    });
  }
  return text("ok");
};

/** B: a background sleep, its served preview, then a wait. */
const workB = (request: Seen): Reply => {
  const step = steps.B ?? 0;
  if (step === 0) {
    steps.B = 1;
    return bash(`sleep ${B_SLEEP}`, true);
  }
  if (!request.afterTool) {
    return text("ok");
  }
  const asked = pending.B;
  if (asked) {
    return want(request, "B", asked.name, asked.input);
  }
  if (step === 1) {
    steps.B = 2;
    return want(request, "B", CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "ended-b",
      port: PORT_B,
      serve: { command: SERVED_B },
    });
  }
  if (step === 2) {
    steps.B = 3;
    return want(request, "B", WAIT, {
      minutes: 30,
      reason: "its parent's word on the page",
    });
  }
  return text("ok");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = TAG.exec(request.all)?.[1];
  if (tag === "A") {
    return workA(request);
  }
  if (tag === "B") {
    return workB(request);
  }
  return text("ok");
};

/** The pids of a `bun` whose command line names `mark`: A's server by {@link MARK_A}, B's by {@link TITLE_B}. */
const serverPids = async (mark: string): Promise<number[]> =>
  (await commandLines())
    .filter(
      (line) =>
        (line.command.split(" ")[0] ?? "").endsWith("bun") &&
        line.command.includes(mark)
    )
    .map((line) => line.pid);

/** The pids of B's background sleep. */
const sleepPids = async (): Promise<number[]> =>
  (await commandLines())
    .filter((line) => line.command.trim() === `sleep ${B_SLEEP}`)
    .map((line) => line.pid);

/** What a server answers on its socket `socket` in `dir`, from a process of the host's whose working directory it is (a socket's path is short only from there). */
const answersIn = async (dir: string, socket: string): Promise<string> => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const r = await fetch("http://ended/", { unix: ${JSON.stringify(socket)} }); console.log(r.status, await r.text());`,
    ],
    { cwd: dir, stdout: "pipe", stderr: "pipe" }
  );
  const read = await readWithin(10_000, async () => {
    const [out, err] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return `${out.trim()}${err.trim() ? ` ${err.trim().split("\n").at(-1)}` : ""}`;
  });
  if (read.kind === "answered") {
    return read.value;
  }
  child.kill("SIGKILL");
  return `no answer within ${read.after} ms`;
};

/** Whether preview `instanceId`'s origin answers 200 with `title`'s page, within 30 s; its last read. */
const serving = async (
  fleet: KitFleet,
  instanceId: string,
  title: string
): Promise<{ ok: boolean; last: string }> => {
  let last = "nothing yet";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      // The session's preview, on its own origin (hub server.ts `frameAddress`).
      // biome-ignore lint/performance/noAwaitInLoops: polls until it answers or the bound passes
      const listed = await fetch(
        `${fleet.base}/api/instances/${instanceId}/artifacts`
      );
      const preview = (
        (await listed.json()) as { id: string; kind: string }[]
      ).find((one) => one.kind === "preview");
      const address = await fetch(
        `${fleet.base}/api/artifacts/${preview?.id}/preview-address`,
        { method: "POST" }
      );
      const { port } = (await address.json()) as { port?: number };
      const read = await readWithin(5000, async (signal) => {
        const response = await passedFetch(fleet, `http://127.0.0.1:${port}/`, {
          signal,
        });
        return { status: response.status, body: await response.text() };
      });
      if (read.kind === "answered") {
        last = `${read.value.status}: ${read.value.body.slice(0, 160)}`;
        if (
          read.value.status === 200 &&
          read.value.body.includes(`<title>${title}</title>`)
        ) {
          return { ok: true, last };
        }
      } else {
        last = `the preview's origin did not answer within ${read.after} ms`;
      }
    } catch (error) {
      last = (error as Error).message;
    }
    await Bun.sleep(500);
  }
  return { ok: false, last };
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

interface Workspace {
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface Sweep {
  kept: { hold: string; workspaceId: string }[];
}

/** What the legs read of the fleet: its delegate start, an item's state, the parent, a workspace's row. */
interface Scene {
  delegate: (tag: "A" | "B", title: string) => Promise<Started>;
  itemState: (
    id: string
  ) => { ended_at: number | null; state: string } | undefined;
  parent: string;
  workspaceOf: (id: string) => Workspace;
}

/** B: a preview CawCo's stage serves, its delegate stopped ((b1), (b2)). */
const stoppedLeg = async (
  kit: Kit,
  fleet: KitFleet,
  { delegate, itemState, parent, workspaceOf }: Scene
): Promise<void> => {
  const { check } = kit;
  const b = await delegate("B", "Show a served page");
  const before = await until(
    "B's preview serving",
    () => serving(fleet, b.instanceId, TITLE_B),
    (read) => read.ok,
    ITEM_MS
  ).catch((): { ok: boolean; last: string } => ({
    ok: false,
    last: "never served",
  }));
  const sleeping = await until(
    "B's background sleep",
    sleepPids,
    (pids) => pids.length > 0,
    60_000
  ).catch(() => [] as number[]);
  const wb = workspaceOf(b.workspaceId);
  const staged = await serverPids(TITLE_B);
  const stagedSaid = await answersIn(wb.tmp ?? "", SOCKET_B);
  check(
    "(b1) B's preview serves its page, its stage's server answers on its socket, and its background sleep runs",
    before.ok &&
      staged.length > 0 &&
      stagedSaid.startsWith("200") &&
      stagedSaid.includes(TITLE_B) &&
      sleeping.length > 0,
    `${before.last}; stage server ${staged.join(", ") || "not found"}: ${stagedSaid.slice(0, 120)}; sleep ${sleeping.join(", ") || "none"}`
  );
  await until(
    "B resting in its wait",
    () => steps.B ?? 0,
    (step) => step >= 3,
    60_000
  ).catch(() => undefined);
  const credential = await fleet.sessionCredential(parent);
  const stopped = await toolWords(
    { base: fleet.base, id: parent, credential },
    "stop_delegate",
    { target: b.instanceId }
  );
  const bEnded = await until(
    "B's item ended",
    () => itemState(b.workItemId),
    (row) => row !== undefined && !!row.ended_at,
    120_000
  ).catch(() => itemState(b.workItemId));
  const sleepLeft = await until(
    "B's background sleep ended",
    sleepPids,
    (pids) => pids.length === 0,
    30_000
  ).catch(() => [] as number[]);
  // Past the stop's sweep: SIGTERM, its grace and the SIGKILL.
  await Bun.sleep(10_000);
  const stagedAfter = await serverPids(TITLE_B);
  const stagedSaidAfter = await answersIn(wb.tmp ?? "", SOCKET_B);
  check(
    "(b2) B stopped, its background sleep is gone, and its stage's server is the same process and still answers",
    stopped.status === 200 &&
      !!bEnded?.ended_at &&
      sleepLeft.length === 0 &&
      (await sleepPids()).length === 0 &&
      staged.length > 0 &&
      staged.every((pid) => stagedAfter.includes(pid)) &&
      stagedSaidAfter.startsWith("200") &&
      stagedSaidAfter.includes(TITLE_B),
    `stop ${stopped.status} ${stopped.text.slice(0, 200)}; ${bEnded?.state}; sleep ${(await sleepPids()).join(", ") || "gone"}; stage server before ${staged.join(", ") || "none"}, after ${stagedAfter.join(", ") || "none"}: ${stagedSaidAfter.slice(0, 120)}`
  );
};

const spec: Spec = {
  name: "ended-item-work",
  host: "its delegates' commands run in workspace boundaries",
  run: async (kit: Kit) => {
    const { check } = kit;
    for (const tag of ["A", "B"] as const) {
      delete steps[tag];
      delete pending[tag];
    }
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], { CAWCO_LEAK_MEMORY_GIB: String(THRESHOLD_GIB) });
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const home = fleet.env.HOME as string;
    const repo = `${fleet.sandbox}/code`;
    await Bun.write(
      `${home}/.gitconfig`,
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo ended > README.md && git add -A && git commit -qm 'First commit'`
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Ended item work",
      machineId: MACHINE,
      cwd: repo,
    });
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const itemState = (id: string) =>
      fleet.query<{ ended_at: number | null; state: string }>(
        "SELECT state, ended_at FROM work_items WHERE id = ?",
        id
      )[0];
    const delegate = (tag: "A" | "B", title: string) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title,
        prompt: `PROBE-ENDED-${tag}: run the commands.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      });
    try {
      // A: a server of the delegate's own, shown by the parent's preview.
      const a = await delegate("A", TITLE_A);
      const wa = workspaceOf(a.workspaceId);
      const artifact = crypto.randomUUID();
      const now = Date.now();
      fleet.write(
        "INSERT INTO artifacts (id, instance_id, project_id, kind, name, machine_id, source_port, source_workspace, revision, seq, delivered_seq, created_at, updated_at, shown_at) VALUES (?, ?, ?, 'preview', 'ended-a', ?, ?, ?, 1, 0, 0, ?, ?, ?)",
        artifact,
        parent,
        project.id,
        MACHINE,
        PORT_A,
        a.workspaceId,
        now,
        now,
        now
      );
      const aEnded = await until(
        "A's item ended",
        () => itemState(a.workItemId),
        (row) => row !== undefined && !!row.ended_at,
        ITEM_MS
      ).catch(() => itemState(a.workItemId));
      const servers = await serverPids(MARK_A);
      const swept = await fleet.api<Sweep>("/api/workspaces/retire", {});
      const hold = swept.kept.find((one) => one.workspaceId === wa.id)?.hold;
      // Past the settle's own end: SIGTERM, its grace and the SIGKILL.
      await Bun.sleep(10_000);
      const answered = await answersIn(wa.tmp ?? "", SOCKET_A);
      const endedEarly = (await fleet.logs("agent"))
        .split("\n")
        .find((line) =>
          line.includes(`${a.instanceId}: finished, so what it left running`)
        );
      check(
        "(a1) after A's item ends and a sweep, its server still answers, its workspace is kept, and nothing of A's work was ended",
        aEnded?.state === "done" &&
          servers.length > 0 &&
          servers.every((pid) => isAlive(listedPid(pid))) &&
          answered.startsWith("200") &&
          answered.includes(PAGE_A) &&
          workspaceOf(wa.id).state === "active" &&
          hold !== undefined &&
          endedEarly === undefined,
        `${aEnded?.state}; server ${servers.join(", ") || "not found"}; answered ${answered}; ${workspaceOf(wa.id).state}; hold ${hold ?? JSON.stringify(swept).slice(0, 300)}; ${endedEarly ?? "no agent line ending A's work"}`
      );
      const climbed = await until(
        "the parent told of A's server's climb",
        () =>
          fleet.seen.find(
            (request) =>
              request.last.includes(leakWords.yourDelegate) &&
              request.last.includes(leakWords.leaking) &&
              request.last.includes(MARK_A)
          )?.last,
        Boolean,
        MEMORY_WAIT_MS
      ).catch(() => undefined);
      check(
        "(a2) with A's item ended, its parent reads that its server is leaking memory, naming the item and the server",
        !!climbed?.includes(a.workItemId.slice(0, 8)),
        climbed?.slice(0, 600) ?? "no such message"
      );
      // What the parent's person sees of it: CawCo's notice row, its line
      // naming the delegate's item, never their own message.
      const parentRows = (
        await fleet.api<{
          blocks: {
            content: string;
            metadata?: { notice?: string; noteTitle?: string };
            type: string;
          }[];
        }>(`/api/instances/${parent}/transcript?limit=400`)
      ).blocks.filter((block) =>
        block.content.includes(leakWords.yourDelegate)
      );
      check(
        "(a2b) the parent's transcript draws it as CawCo's notice, its line saying the process leaks in A's item, never as the person's message",
        parentRows.length > 0 &&
          parentRows.every(
            (block) =>
              block.type === "ui.system_note" &&
              block.metadata?.notice === "leak" &&
              !!block.metadata.noteTitle?.endsWith(A_LEAK_END)
          ),
        JSON.stringify(
          parentRows.map((block) => ({ type: block.type, ...block.metadata }))
        )
      );
      const deleted = await fetch(
        `${fleet.base}/api/instances/${parent}/artifacts/${artifact}`,
        { method: "DELETE" }
      );
      const deletedAt = Date.now();
      await fleet.api("/api/workspaces/retire", {});
      const ended = await until(
        "A's server ended",
        () => servers.filter((pid) => isAlive(listedPid(pid))),
        (running) => running.length === 0,
        SWEEP_END_MS
      ).catch(() => undefined);
      const seconds = (Date.now() - deletedAt) / 1000;
      const said = (await fleet.logs("agent"))
        .split("\n")
        .find(
          (line) =>
            line.includes(
              `${a.instanceId}: finished, so what it left running`
            ) && servers.some((pid) => line.includes(String(pid)))
        );
      check(
        "(a4) the artifact deleted, A's server is gone within a sweep's minute, and the agent's log says A finished, naming its pid",
        deleted.status === 200 && ended !== undefined && said !== undefined,
        `DELETE ${deleted.status}; ${ended ? `gone ${seconds.toFixed(1)} s on` : "still running"}; ${said ?? "no agent line saying it finished"}`
      );
      const retired = await until(
        "A's workspace retired",
        () => workspaceOf(wa.id),
        (row) => row.state === "archived",
        SETTLE_MS
      ).catch(() => workspaceOf(wa.id));
      check(
        "(a5) A's session sleeps and its workspace retires",
        retired.state === "archived" &&
          fleet.instance(a.instanceId)?.status === "sleeping",
        `${retired.state}; session ${fleet.instance(a.instanceId)?.status}`
      );

      await stoppedLeg(kit, fleet, {
        delegate,
        itemState,
        parent,
        workspaceOf,
      });

      const left = fleet.seen.find(
        (request) =>
          request.last.includes(leakWords.yourDelegate) &&
          request.last.includes(leakWords.leftBehind)
      )?.last;
      check(
        "(a3) the parent read no leftover of a delegate's",
        left === undefined,
        left?.slice(0, 600) ?? "none read"
      );
    } finally {
      const probes = [
        ...(await serverPids(MARK_A)),
        ...(await serverPids(TITLE_B)),
        ...(await sleepPids()),
      ];
      for (const pid of probes) {
        signalPid(listedPid(pid), "SIGKILL");
      }
    }
  },
};

export default spec;
