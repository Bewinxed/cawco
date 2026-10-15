/**
 * Every session the hub spawns has its CawCo MCP connected with a valid hub
 * credential from its first turn: its first call of a CawCo tool
 * (`set_title`) is answered by the hub as that session. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code, pi and OpenCode against the
 * mock model). Run it where a workspace boundary can start (a delegate's
 * session needs one).
 *
 * The retro of 383 sessions (2026-10-12 to 15) found 15 that saw a spawn
 * fail or start with "CawCo MCP is not connected". The case on record:
 * "The session's CawCo MCP credential could not be installed, so it was
 * stopped before its first turn: CawCo MCP is not connected (failed)."
 * (delegate cockpit-759ad776, 2026-10-15 07:23). The launch gate failed the
 * spawn at the slot's first `failed` reading (claude.ts
 * `#connectedCawcoSnapshot`), and the credential's ACK was one fetch: a hub
 * away for a moment failed either at once.
 *
 * Each case asserts, for every session in it: its first request offered
 * `mcp__cawco__set_title`; the call's tool result is the hub's "Named this
 * session …", not an error; and the hub's row carries the title it set.
 *
 * A. Ten sessions started at once from the dashboard; each names itself,
 *    then starts a child: five with `start_session`, five with `delegate`,
 *    so ten more launch together. All twenty name themselves.
 * B. The hub restarted mid-launch: a session is started, and the hub is
 *    stopped the moment it has minted the launch's credential (its pending
 *    hash is on the row), before the session's slot connects; started again
 *    2 s later. Once for each harness: Claude Code, pi, OpenCode.
 * C. The agent restarted with A's ten parents live: each is attached again,
 *    and its next turn names it again.
 * D. A sleeping session woken after a hub restart: two of A's parents are
 *    put to sleep, the hub restarts, and a message wakes each; the woken
 *    session names itself.
 *
 *   bun scripts/probe-kit/run.ts mcp-at-spawn
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Harness,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

/**
 * set_title as each harness offers it: Claude Code's MCP name, OpenCode's
 * (`cawco_<tool>`), pi's (the hub's own, registered by its host).
 */
const SET_TITLES = ["mcp__cawco__set_title", "cawco_set_title", "set_title"];
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
const START = "mcp__cawco__start_session";
const DELEGATE = "mcp__cawco__delegate";
/** A session's marker in what it was sent: its tag and the case it is in. */
const MARK = /MCPX-([a-z0-9]+)-([A-D])/g;
const NAMED = "Named this session";

/** What one session did in one case. */
interface Probe {
  /** Its set_title call went out. */
  asked: boolean;
  /** The tools its first request loaded, when set_title was not among them. */
  loaded?: string;
  /** Its first request of the case offered set_title. */
  offered?: boolean;
  /** The set_title call's tool result. */
  result?: { error: boolean; text: string };
}

/** What a parent starts after it names itself, and the child's tag. */
interface Parent {
  /** What the child's start (start_session or delegate) answered. */
  answer?: string;
  child: string;
  /** The start went out. */
  started: boolean;
  via: "start" | "delegate";
}

const titleOf = (tag: string, phase: string) => `MCP probe ${tag} ${phase}`;
const markOf = (tag: string, phase: string) => `MCPX-${tag}-${phase}`;
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The tool result the request answers, off its last message (Anthropic messages and chat completions alike). */
const resultOf = (body: string): { error: boolean; text: string } => {
  const parsed = JSON.parse(body) as {
    messages?: { role: string; content: unknown }[];
  };
  const last = parsed.messages?.at(-1);
  if (last?.role === "tool") {
    const said =
      typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content);
    return { error: !said.includes(NAMED), text: said };
  }
  const block = (Array.isArray(last?.content) ? last.content : []).find(
    (part: { type?: string }) => part.type === "tool_result"
  ) as { is_error?: boolean; content?: unknown } | undefined;
  const content = block?.content;
  const parts = Array.isArray(content) ? content : [];
  const said =
    typeof content === "string"
      ? content
      : parts.map((part: { text?: string }) => part.text ?? "").join(" ");
  return { error: block?.is_error === true || !block, text: said };
};

/** Why a workspace boundary cannot start here (bwrap inside another sandbox); nothing when it can. */
const nestingRefused = async (): Promise<string | undefined> => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  return nested.exitCode === 0
    ? undefined
    : nested.stderr.toString().trim() || `bwrap exited ${nested.exitCode}`;
};

/** What a session's case fell short of, or nothing when its set_title was offered, answered and applied. */
const shortfall = (
  probe: Probe | undefined,
  titled: boolean
): string | undefined => {
  if (!probe) {
    return "its session never sent a request";
  }
  if (probe.offered && probe.result && !probe.result.error && titled) {
    return;
  }
  const result = probe.result
    ? `${probe.result.error ? "error" : "ok"} "${probe.result.text.slice(0, 160)}"`
    : "none";
  const loaded = probe.loaded ? `, loaded ${probe.loaded}` : "";
  return `offered ${probe.offered ?? "never asked"}, result ${result}, row titled ${titled}${loaded}`;
};

const newTag = () => crypto.randomUUID().replaceAll("-", "").slice(0, 8);

/**
 * Whose request this is: its own tag is the first marker it was sent; its
 * case, the last marker with that tag (a later message moves it on).
 */
const markedBy = (
  request: Seen
): { own: string; phase: string } | undefined => {
  const marks = [...request.all.matchAll(MARK)];
  const own = marks[0]?.[1];
  const phase = marks.filter((mark) => mark[1] === own).at(-1)?.[2];
  return own && phase ? { own, phase } : undefined;
};

/** What a request loaded when set_title was not offered, once, for a failure to say. */
const noteLoaded = (probe: Probe, request: Seen): void => {
  probe.loaded ??= `${request.toolNames.join(",")}; body names set_title: ${request.body.includes("set_title")}`;
};

/** A case's first request: set_title once, when it is offered; noted either way. */
const ask = (probe: Probe, request: Seen, title: string): Reply => {
  const direct = request.toolNames.find((name) => SET_TITLES.includes(name));
  // OpenCode keeps MCP tools in Code Mode's catalog: `execute` runs a script
  // that calls them as `tools.<server>.<tool>(input)` (opencode
  // packages/opencode/src/tool/code-mode.ts, `Parameters = { code }`).
  const coded =
    !direct &&
    request.toolNames.includes(CODE_MODE) &&
    request.body.includes("set_title");
  probe.offered ??= Boolean(direct || coded);
  if (!(direct || coded)) {
    noteLoaded(probe, request);
  }
  if (probe.asked || !(direct || coded)) {
    return text(probe.asked ? "Done." : "No CawCo tools are offered.");
  }
  probe.asked = true;
  return direct
    ? call(direct, { title })
    : call(CODE_MODE, {
        code: `return await tools.cawco.set_title(${JSON.stringify({ title })});`,
      });
};

/** What a parent's turn calls once its set_title is answered: its child's start. */
const startChild = (parent: Parent, workdir: string, repo: string): Reply => {
  const prompt = `${markOf(parent.child, "A")}: name yourself.`;
  const title = `MCPX child ${parent.child}`;
  return parent.via === "start"
    ? call(START, { cwd: workdir, prompt, title })
    : call(DELEGATE, {
        title,
        prompt,
        cwd: repo,
        checks: [{ name: "Nothing to check", command: "true" }],
        lands: "none",
      });
};

const spec: Spec = {
  name: "mcp-at-spawn",
  run: async (kit) => {
    const probes = new Map<string, Probe>();
    const parents = new Map<string, Parent>();
    let workdir = "";
    let repo = "";

    const respond = (request: Seen): Reply => {
      if (!request.tools) {
        return text("Probe title");
      }
      const marked = markedBy(request);
      if (!marked) {
        return text("ok");
      }
      const { own, phase } = marked;
      const key = `${own}-${phase}`;
      const probe = probes.get(key) ?? { asked: false };
      probes.set(key, probe);
      if (!request.afterTool) {
        return ask(probe, request, titleOf(own, phase));
      }
      const parent = phase === "A" ? parents.get(own) : undefined;
      // The child's start answered: kept for a failure to say.
      if (parent?.started && parent.answer === undefined) {
        parent.answer = resultOf(request.body).text;
      }
      if (!probe.asked || probe.result) {
        return text("Done.");
      }
      probe.result = resultOf(request.body);
      if (!parent || parent.started) {
        return text("Done.");
      }
      parent.started = true;
      return startChild(parent, workdir, repo);
    };

    const fleet: KitFleet = await kit.fleet(respond);
    ({ workdir, repo } = fleet);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const restartHub = async () => {
      await fleet.stop("hub");
      await Bun.sleep(2000);
      fleet.launch("hub");
      await fleet.hubUp();
    };
    const statusOf = (id: string) => fleet.instance(id)?.status;
    /**
     * How long after now the hub staged the launch's credential (its pending
     * hash on the row), read every 10 ms so the hub's stop lands before the
     * session's slot connects; undefined when it never did.
     */
    const mintOf = async (instanceId: string): Promise<number | undefined> => {
      const from = Date.now();
      while (Date.now() - from < 120_000) {
        const pending = fleet.query<{ pending: string | null }>(
          "SELECT pending_hash AS pending FROM session_identities WHERE instance_id = ?",
          instanceId
        )[0]?.pending;
        if (pending) {
          return Date.now() - from;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one reading at a time, as close to the mint as the db allows
        await Bun.sleep(10);
      }
      return undefined;
    };

    /** Waits for every key's set_title result (or the bound), then checks them in one line. */
    const settle = async (label: string, keys: string[]) => {
      await until(
        `${label}: every session's set_title answered`,
        () => keys.every((key) => probes.get(key)?.result !== undefined),
        Boolean,
        5 * 60_000
      ).catch(() => undefined);
      const titles = new Set(
        (await fleet.api<{ title?: string | null }[]>("/api/instances")).map(
          (row) => row.title
        )
      );
      const failed = keys.flatMap((key) => {
        const [own, phase] = key.split("-");
        const why = shortfall(probes.get(key), titles.has(titleOf(own, phase)));
        return why ? [`${key}: ${why}`] : [];
      });
      if (
        !kit.check(
          label,
          failed.length === 0,
          failed.length === 0 ? `${keys.length} sessions` : failed.join("; ")
        )
      ) {
        failedCases.push(label);
      }
    };
    const failedCases: string[] = [];
    /** What a failure leaves to read: the children's starts and rows, and the services' logs. */
    const leaveEvidence = async () => {
      const starts = [...parents].map(
        ([one, parent]) =>
          `${one} ${parent.via} ${parent.child}: ${parent.answer?.slice(0, 300) ?? "no answer"}`
      );
      const rows = fleet
        .query<{ title: string; status: string; error: string | null }>(
          "SELECT title, status, last_error AS error FROM instances WHERE title LIKE 'MCP%'"
        )
        .map(
          (row) =>
            `${row.title}: ${row.status}${row.error ? ` — ${row.error}` : ""}`
        );
      await mkdir(kit.out, { recursive: true });
      await writeFile(
        join(kit.out, "evidence.txt"),
        [
          `Failed: ${failedCases.join(" | ")}`,
          "",
          "Child starts:",
          ...starts,
          "",
          "Rows:",
          ...rows,
          "",
          "Agent log:",
          await fleet.logs("agent"),
          "",
          "Hub log:",
          await fleet.logs("hub"),
        ].join("\n")
      );
      kit.note(`evidence for the failure: ${join(kit.out, "evidence.txt")}`);
    };

    // A. Ten at once, each starting a child.
    const tagsA = Array.from({ length: 10 }, newTag);
    const childrenA = tagsA.map(() => newTag());
    for (const [i, one] of tagsA.entries()) {
      parents.set(one, {
        child: childrenA[i],
        started: false,
        via: i % 2 === 0 ? "start" : "delegate",
      });
    }
    const idsA = await Promise.all(
      tagsA.map((one) => fleet.spawn("claude", `MCPX parent ${one}`))
    );
    await Promise.all(
      idsA.map((id, i) =>
        fleet.send(
          id,
          `${markOf(tagsA[i], "A")}: name yourself, then start your child.`
        )
      )
    );
    const viaStart = childrenA.filter((_, i) => i % 2 === 0);
    const viaDelegate = childrenA.filter((_, i) => i % 2 === 1);
    await settle(
      "A: ten sessions started at once and the five children they start with start_session each call set_title, answered by the hub",
      [...tagsA, ...viaStart].map((one) => `${one}-A`)
    );
    // A delegate runs in its workspace's boundary, which cannot start inside
    // another one (spec boundary-quiet's own check).
    const refused = await nestingRefused();
    if (refused === undefined) {
      await settle(
        "A: the five children they start with delegate each call set_title, answered by the hub",
        viaDelegate.map((one) => `${one}-A`)
      );
    } else {
      kit.check(
        "A: a workspace boundary can start here, for the five delegates (run this spec on the host, not inside a workspace)",
        false,
        refused
      );
      failedCases.push("A: delegates need a boundary");
    }

    // B. The hub restarted between the launch's credential and its slot.
    const keysB: string[] = [];
    const mintsB: string[] = [];
    for (const harness of ["claude", "pi", "opencode"] as Harness[]) {
      const one = newTag();
      const instanceId = crypto.randomUUID();
      // biome-ignore lint/performance/noAwaitInLoops: one hub restart per harness, each mid-launch
      await fleet.post({
        verb: "spawn",
        machineId: MACHINE,
        instanceId,
        requestId: crypto.randomUUID(),
        payload: {
          instanceId,
          cwd: workdir,
          harness,
          model: MODEL[harness],
          title: `MCPX restart ${one}`,
          ...(harness === "pi" ? {} : { permissionMode: "bypassPermissions" }),
        },
      });
      const minted = await mintOf(instanceId);
      mintsB.push(
        `${harness} ${minted === undefined ? "never minted" : `minted ${minted} ms after its spawn`}`
      );
      await restartHub();
      await until(
        `${harness}: the session started across the hub's restart`,
        () => statusOf(instanceId),
        (status) => status === "running",
        180_000
      ).catch(() => undefined);
      await fleet.send(instanceId, `${markOf(one, "B")}: name yourself.`);
      keysB.push(`${one}-B`);
      // Its turn answered before the next case stops the hub under it.
      await until(
        `${harness}: its set_title answered`,
        () => probes.get(`${one}-B`)?.result,
        Boolean,
        180_000
      ).catch(() => undefined);
    }
    kit.note(`B: ${mintsB.join(", ")} before each hub stop`);
    const redials = (await fleet.logs("agent"))
      .split("\n")
      .filter((line) => line.includes("dialled again"));
    kit.note(
      `B: the agent's lines on a slot dialled again (${redials.length}): ${redials.slice(0, 4).join(" | ") || "none"}`
    );
    await settle(
      "B: a session whose hub restarted between its credential's mint and its slot's connect calls set_title on its first turn, answered by the hub (Claude Code, pi, OpenCode)",
      keysB
    );

    // C. The agent restarted with A's parents live.
    await fleet.stop("agent");
    fleet.launch("agent");
    await fleet.agentUp();
    await until(
      "A's parents attached again",
      () => idsA.map(statusOf),
      (statuses) => statuses.every((status) => status === "running"),
      180_000
    ).catch(() => undefined);
    await Promise.all(
      idsA.map((id, i) =>
        fleet.send(id, `${markOf(tagsA[i], "C")}: name yourself again.`)
      )
    );
    await settle(
      "C: after the agent restarts with ten sessions live, each one's next turn calls set_title, answered by the hub",
      tagsA.map((one) => `${one}-C`)
    );

    // D. Asleep across a hub restart, then woken.
    const sleepers = idsA.slice(0, 2);
    for (const id of sleepers) {
      // biome-ignore lint/performance/noAwaitInLoops: one sleep at a time, each settled
      await fleet.control(id, "sleep");
    }
    await until(
      "two sessions asleep",
      () => sleepers.map(statusOf),
      (statuses) => statuses.every((status) => status === "sleeping"),
      120_000
    ).catch(() => undefined);
    await restartHub();
    await Promise.all(
      sleepers.map((id, i) =>
        fleet.send(id, `${markOf(tagsA[i], "D")}: name yourself once more.`)
      )
    );
    await settle(
      "D: a session asleep across a hub restart, woken by a message, calls set_title on its first turn, answered by the hub",
      sleepers.map((_, i) => `${tagsA[i]}-D`)
    );
    if (failedCases.length > 0) {
      await leaveEvidence();
    }
  },
};

export default spec;
