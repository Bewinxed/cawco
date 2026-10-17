/**
 * How the hub keeps a delegate alive across a declared wait, and how a
 * parent reaches a cold delegate's unlanded work. On a scratch fleet (real
 * hub, agent and sessiond; Claude Code against the mock model) with Jev on
 * against the kit's mock, which answers every noul 0.05: "fresh", the
 * verdict that refused hand-offs to cold delegates holding unlanded work
 * (2026-10-16/17). This spec delegates, so its fleet cuts workspaces: it
 * runs on the host, outside every boundary.
 *
 * - (a) A delegate declares a wait (wait_item), then three delegate reports
 *   reach it, each a turn of its own it answers in words. Its item is still
 *   running after each, its wait still declared, and no "still open"
 *   reminder reached it: those turns count toward no quiet-turn failure. A
 *   fourth report it answers with a tool call of its own (Bash): that ends
 *   the wait, the quiet-turn reminder reaches it again, and it finishes.
 * - (b) A delegate leaves an uncommitted file and fails its item; made cold
 *   by the hub's own cache-expiry reading (its last request two hours back
 *   on a 5-minute cache), it takes its parent's hand-off, and Jev is not
 *   asked.
 * - (c) A delegate commits and fails its item with a clean tree; made cold
 *   the same way, its parent's hand-off is refused naming delegate with
 *   `from` and its workspace, Jev not asked. delegate with that `from` gets
 *   a new clone on its own `ws/` branch whose `git log` holds the commit,
 *   tracking the default branch.
 *
 *   bun scripts/probe-kit/run.ts delegate-lifecycle
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "../../../packages/core/src/safe-git";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import type { Kit, KitFleet, Spec } from "../kit";

const WAITER = "PROBE-LIFECYCLE-WAITER";
const CHILD = "PROBE-LIFECYCLE-CHILD";
const DIRTY = "PROBE-LIFECYCLE-DIRTY";
const AHEAD = "PROBE-LIFECYCLE-AHEAD";
const FROM = "PROBE-LIFECYCLE-FROM";
const HANDED = "PROBE-LIFECYCLE-HANDED";
const WORKED = "PROBE-LIFECYCLE-WORKED";
const DIRTY_MADE = "PROBE-LIFECYCLE-DIRTY-MADE";
const AHEAD_MADE = "PROBE-LIFECYCLE-AHEAD-MADE";
const COMMIT = "Probe commit ahead of main";

const FINISH = "mcp__cawco__finish_item";
const WAIT = "mcp__cawco__wait_item";
/** How a delegate's report to its parent opens (core `reportMarker`). */
const REPORT = "[Report from delegate ";
/** The quiet-turn reminder (work-items.ts `quietTurn`). */
const STILL_OPEN = "Your work item is still open.";
/** What wait_item answers once the wait is declared (work-items.ts `waitItem`). */
const WAITING = " is waiting until ";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
const bash = (command: string): Reply =>
  useTool("Bash", { command, description: "Probe step" });
const blocked = (): Reply =>
  useTool(FINISH, {
    headline: "Stopped here for the probe.",
    summary: "Stopped here for the probe.",
    blocked: { command: "probe", error: "the probe ends this item here" },
  });

const reportsIn = (all: string): number => all.split(REPORT).length - 1;

/**
 * The waiter: declares a wait, answers three reports in words, answers the
 * fourth with a Bash call (work of its own), and finishes once reminded
 * that its item is still open.
 */
const waiter = (request: Seen): Reply => {
  if (request.all.includes(STILL_OPEN)) {
    return request.afterTool
      ? text("Finished.")
      : useTool(FINISH, { headline: "Waited.", summary: "Waited." });
  }
  const reports = reportsIn(request.all);
  if (reports === 0) {
    return request.all.includes(WAITING)
      ? text("Waiting.")
      : found(request, WAIT, {
          minutes: 30,
          reason: "the reports of the delegates I started",
        });
  }
  if (reports < 4 || request.all.includes(WORKED)) {
    return text("Read it; still waiting.");
  }
  return bash(`echo ${WORKED}`);
};

/** A leaf that changes its clone with `make`, then fails its item as blocked. */
const leaf =
  (make: string, made: string) =>
  (request: Seen): Reply => {
    if (request.all.includes(HANDED)) {
      return text("Got the hand-off.");
    }
    if (request.all.includes(BLOCKED)) {
      return text("Stopped.");
    }
    return request.all.includes(made) ? blocked() : bash(make);
  };

const dirtyLeaf = leaf(
  `echo dirty > dirty-probe.txt && echo ${DIRTY_MADE}`,
  DIRTY_MADE
);
const aheadLeaf = leaf(
  `echo ahead > ahead-probe.txt && git add ahead-probe.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm '${COMMIT}' && echo ${AHEAD_MADE}`,
  AHEAD_MADE
);

/** Every session's answer, by the tag its brief carries. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  if (request.all.includes(WAITER)) {
    return waiter(request);
  }
  if (request.all.includes(DIRTY)) {
    return dirtyLeaf(request);
  }
  if (request.all.includes(AHEAD)) {
    return aheadLeaf(request);
  }
  if (request.all.includes(CHILD) || request.all.includes(FROM)) {
    return request.afterTool
      ? text("Done.")
      : useTool(FINISH, { headline: "Done.", summary: "Done." });
  }
  return text("ok");
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

interface ItemRow {
  state: string;
  wait_until: number | null;
}

/** The parent's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: KitFleet, parent: string): Promise<string> =>
  (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** A CawCo tool called as the parent, through the door its MCP server and the CLI share. */
const callAs = async (
  fleet: KitFleet,
  parent: string,
  name: string,
  args: object
): Promise<{
  isError: boolean;
  structured: Record<string, unknown>;
  text: string;
}> => {
  const response = await fetch(`${fleet.base}/api/delegation/call/${parent}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await credentialOf(fleet, parent)}`,
    },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (!response.ok) {
    return {
      isError: true,
      structured: {},
      text: `${response.status} ${await response.text()}`,
    };
  }
  const result = (await response.json()) as {
    content?: { text?: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  return {
    isError: !!result.isError,
    structured: result.structuredContent ?? {},
    text: (result.content ?? []).map((block) => block.text ?? "").join("\n"),
  };
};

const itemOf = (fleet: KitFleet, id: string): ItemRow | undefined =>
  fleet.query<ItemRow>(
    "SELECT state, wait_until FROM work_items WHERE id = ?",
    id
  )[0];

/** A session at rest: no turn open on the hub, no busy pulse. */
const atRest = async (fleet: KitFleet, id: string): Promise<void> => {
  await until(
    `${id.slice(0, 8)} at rest`,
    async () => {
      const [row] = fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      );
      const pulses =
        await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses");
      return row?.turn_open_at === null && !pulses[id]?.busy;
    },
    Boolean,
    120_000
  );
};

/**
 * Cold by the hub's own reading (keep-alive.ts `promptCacheExpiresAt`): its
 * last request two hours back, on a 5-minute cache.
 */
const makeCold = (fleet: KitFleet, id: string): void => {
  fleet.write(
    "UPDATE instances SET cache_ttl = '5m', last_request_at = ?, cache_cold = NULL WHERE id = ?",
    Date.now() - 2 * 3_600_000,
    id
  );
};

/** The waiter's requests: its conversation carries its brief's tag. */
const waiterSeen = (fleet: KitFleet): Seen[] =>
  fleet.seen.filter((one) => one.tools && one.all.includes(WAITER));

/** (a) A declared wait outlives three reports' turns, and ends on work of its own. */
const waitOutlivesReports = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string
): Promise<void> => {
  const waiting = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Waiter probe",
    prompt: `${WAITER}: start your delegates, then wait for their reports.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
    canDelegate: true,
  });
  await until(
    "the waiter's wait declared",
    () => itemOf(fleet, waiting.workItemId)?.wait_until ?? null,
    (at) => at !== null,
    180_000
  );
  await atRest(fleet, waiting.instanceId);
  const report = async (n: number): Promise<void> => {
    const child = await fleet.api<Started>("/api/work-items", {
      parentInstanceId: waiting.instanceId,
      title: `Child ${n}`,
      prompt: `${CHILD} ${n}: finish at once.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
      lands: "none",
    });
    await until(
      `child ${n} done`,
      () => itemOf(fleet, child.workItemId)?.state,
      (state) => state === "done",
      180_000
    );
    await until(
      `the waiter's turn on report ${n}`,
      () => waiterSeen(fleet).some((one) => reportsIn(one.all) === n) || null,
      Boolean,
      120_000
    );
    await atRest(fleet, waiting.instanceId);
    // A reminder the hub sends goes out as the turn ends: a beat for it.
    await Bun.sleep(3000);
  };
  for (const n of [1, 2, 3]) {
    // biome-ignore lint/performance/noAwaitInLoops: one report, then its turn, then the next
    await report(n);
    const row = itemOf(fleet, waiting.workItemId);
    const reminded = waiterSeen(fleet).filter((one) =>
      one.all.includes(STILL_OPEN)
    ).length;
    check(
      `(a) after report ${n}, the waiter's item runs, its wait declared, with no still-open reminder`,
      row?.state === "running" && row.wait_until !== null && reminded === 0,
      `${row?.state}, wait_until ${row?.wait_until}, ${reminded} reminder(s)`
    );
  }
  await report(4);
  const ended = await until(
    "the waiter's wait ended by its own Bash call",
    () => itemOf(fleet, waiting.workItemId),
    (row) => row?.wait_until === null,
    60_000
  ).catch(() => undefined);
  check(
    "(a) a tool call of its own (Bash) ends the waiter's wait",
    ended?.wait_until === null &&
      waiterSeen(fleet).some((one) => one.all.includes(WORKED)),
    `wait_until ${ended?.wait_until}`
  );
  const finished = await until(
    "the waiter reminded, then finished",
    () => itemOf(fleet, waiting.workItemId)?.state,
    (state) => state === "done",
    180_000
  ).catch(() => undefined);
  check(
    "(a) once it worked, quiet turns count again: the still-open reminder reached it and it finished",
    finished === "done" &&
      waiterSeen(fleet).some((one) => one.all.includes(STILL_OPEN)),
    `${finished}`
  );
};

/** A leaf delegated, left as `made` says, its item failed as blocked, at rest, then cold. */
const coldLeaf = async (
  fleet: KitFleet,
  parent: string,
  src: string,
  tag: string,
  made: string
): Promise<Started> => {
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: `${tag.split("-").at(-1)} probe`,
    prompt: `${tag}: change your clone, then stop.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
  });
  await until(
    `${tag}'s clone changed`,
    () =>
      fleet.seen.some(
        (one) => one.all.includes(tag) && one.all.includes(made)
      ) || null,
    Boolean,
    180_000
  );
  await until(
    `${tag}'s item failed as blocked`,
    () => itemOf(fleet, started.workItemId)?.state,
    (state) => state === "failed",
    120_000
  );
  await atRest(fleet, started.instanceId);
  makeCold(fleet, started.instanceId);
  return started;
};

/** Jev's attach-or-fresh calls (jev.ts `jevAttach`: its state names the cache). */
const attachCalls = (jev: ReturnType<typeof jevMock>): number =>
  jev.calls.filter((call) => "cache" in call.state).length;

/** (b) A cold delegate whose clone holds uncommitted changes takes a hand-off. */
const dirtyTakesHandoff = async (
  { check }: Kit,
  fleet: KitFleet,
  jev: ReturnType<typeof jevMock>,
  parent: string,
  src: string
): Promise<void> => {
  const dirty = await coldLeaf(fleet, parent, src, DIRTY, DIRTY_MADE);
  const asked = attachCalls(jev);
  const handed = await callAs(fleet, parent, "handoff", {
    target: dirty.instanceId,
    message: `${HANDED}: land the file you left uncommitted.`,
  });
  check(
    "(b) a hand-off to a cold delegate with an uncommitted file is delivered, Jev not asked",
    !handed.isError &&
      handed.text.startsWith("Handed to") &&
      attachCalls(jev) === asked,
    `${handed.text.slice(0, 300)}; Jev asked ${attachCalls(jev) - asked} time(s)`
  );
  const reached = await until(
    "the hand-off reached the dirty delegate",
    () =>
      fleet.seen.some(
        (one) => one.all.includes(DIRTY) && one.all.includes(HANDED)
      ) || null,
    Boolean,
    120_000
  ).catch(() => null);
  check("(b) the cold delegate reads the hand-off", reached === true);
};

/** (c) A cold delegate with commits on no remote: refused naming `from`, and `from` carries them. */
const aheadGoesFrom = async (
  { check }: Kit,
  fleet: KitFleet,
  jev: ReturnType<typeof jevMock>,
  parent: string,
  src: string
): Promise<void> => {
  const ahead = await coldLeaf(fleet, parent, src, AHEAD, AHEAD_MADE);
  const asked = attachCalls(jev);
  const refused = await callAs(fleet, parent, "handoff", {
    target: ahead.instanceId,
    message: `${HANDED}: land your commit.`,
  });
  check(
    "(c) a hand-off to a cold delegate with a commit and a clean tree is refused naming delegate with from, Jev not asked",
    refused.isError &&
      refused.text.includes(`delegate with from: "${ahead.workspaceId}"`) &&
      refused.text.includes("1 commit on no remote") &&
      attachCalls(jev) === asked,
    `${refused.text.slice(0, 400)}; Jev asked ${attachCalls(jev) - asked} time(s)`
  );
  const cut = await callAs(fleet, parent, "delegate", {
    prompt: `${FROM}: finish the commit you start from.`,
    title: "From probe",
    harness: "claude",
    model: "claude-haiku-4-5",
    from: ahead.workspaceId,
    lands: "none",
  });
  const workspaceId = String(cut.structured.workspaceId ?? "");
  const [clone] = fleet.query<{ branch: string; path: string }>(
    "SELECT branch, path FROM workspaces WHERE id = ?",
    workspaceId
  );
  const git = (...args: string[]): Promise<string> =>
    Bun.$`git ${SAFE_GIT_FLAGS} -C ${clone?.path ?? "/nonexistent"} ${args}`
      .env({ ...process.env, ...SAFE_GIT_ENV })
      .quiet()
      .nothrow()
      .text()
      .then((out) => out.trim());
  const [log, head, upstream] = clone
    ? await Promise.all([
        git("log", "--format=%s", "-n", "5"),
        git("rev-parse", "--abbrev-ref", "HEAD"),
        git("rev-parse", "--abbrev-ref", "HEAD@{upstream}"),
      ])
    : ["", "", ""];
  check(
    "(c) delegate with from gets a new clone on its own ws/ branch whose git log holds the commit, tracking main",
    !cut.isError &&
      workspaceId !== ahead.workspaceId &&
      log.split("\n").includes(COMMIT) &&
      head === clone?.branch &&
      head.startsWith("ws/") &&
      upstream === "origin/main",
    `${cut.text.slice(0, 200)}; HEAD ${head}, upstream ${upstream}; log: ${log.replaceAll("\n", " | ")}`
  );
};

const spec: Spec = {
  name: "delegate-lifecycle",
  run: async (kit: Kit) => {
    const jev = jevMock();
    try {
      const fleet = await kit.fleet(respond);
      fleet.env.CAWCO_TYPESAFE_URL = jev.url;
      const home = fleet.env.HOME as string;
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      await jevOn(fleet.base);
      const src = join(fleet.sandbox, "src");
      await mkdir(src, { recursive: true });
      await writeFile(
        join(home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      await Bun.$`sh -c ${"git init -q -b main && echo lifecycle > README.md && git add -A && git commit -qm 'First commit'"}`
        .cwd(src)
        .env({ ...process.env, HOME: home })
        .quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Delegate lifecycle",
        machineId: MACHINE,
        cwd: src,
      });
      const parent = await fleet.spawn("claude", "Parent", src, {
        projectId: project.id,
      });
      await waitOutlivesReports(kit, fleet, parent, src);
      await dirtyTakesHandoff(kit, fleet, jev, parent, src);
      await aheadGoesFrom(kit, fleet, jev, parent, src);
    } finally {
      jev.stop();
    }
  },
};

export default spec;
