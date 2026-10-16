/**
 * Every fleet document reaches exactly the sessions its scope names, on
 * every harness, and reaches them again after a compaction (core fleet.ts
 * `MemoryScope`, hub memory-scopes.ts and briefings.ts). On a scratch fleet
 * (real hub, agent and sessiond; each harness against the mock model) the
 * fleet keeps:
 *
 * - the user-scope CLAUDE.md, unscoped: every session;
 * - `orchestrator.md`, role orchestrator; `leaf.md`, role leaf: the fleet
 *   CLAUDE.md's split;
 * - `types/high.md`, the sessions started as a `high` delegate;
 * - `models/haiku.md`, the sessions whose model id contains `haiku` (the
 *   mock's Claude model), as the retired SessionStart hook keyed it;
 * - `briefing/high.md`, a briefer's: guidance for briefing a `high`
 *   delegate, for the session that calls `delegate`.
 *
 * For Claude Code, OpenCode and pi alike, each session's requests are read
 * where the harness sent them, at the mock model:
 *
 * 1. An orchestrator (a session started from the dashboard) loads exactly
 *    its documents.
 * 2. Its `delegate` call for a `high` delegate is held with the briefing
 *    guide before anything starts, and the guide is in its next request;
 *    the same call made again starts the delegate, and so does a call for a
 *    `low` delegate, which no guide is about. Both delegates run on the
 *    orchestrator's harness. The `high` delegate loads the leaf's, the
 *    type's (and the model's) documents and never the guide; the `low` one
 *    the leaf's alone.
 * 3. After a `/compact`, the orchestrator's and the `high` delegate's next
 *    requests still carry every document for them, their history replaced
 *    by the summary; and the orchestrator's next `high` delegate call is
 *    held with the guide again.
 *
 * Its delegates cut workspaces, so it runs as a `host` check (README, "A
 * spec that delegates is a `host` check").
 *
 *   bun scripts/probe-kit/run.ts document-scope
 */
import {
  HARNESSES,
  type Harness,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
/** One mark per document: a request carries a document when it carries its mark. */
const MARK = {
  user: `DOCSCOPE-USER-${RUN}`,
  orchestrator: `DOCSCOPE-ORCHESTRATOR-${RUN}`,
  leaf: `DOCSCOPE-LEAF-${RUN}`,
  high: `DOCSCOPE-TYPE-HIGH-${RUN}`,
  haiku: `DOCSCOPE-MODEL-HAIKU-${RUN}`,
  briefer: `DOCSCOPE-BRIEFER-HIGH-${RUN}`,
} as const;
type Doc = keyof typeof MARK;
const DOCS = Object.keys(MARK) as Doc[];
/** What a held delegate call opens with (hub briefings.ts). */
const HELD = "Not started yet: the fleet keeps guidance for briefing";
/** What every delegate's brief carries, so the mock knows a delegate's requests. */
const DELEGATE_MARK = "DOCSCOPE-DELEGATE-";
const delegateToken = (type: string, harness: Harness) =>
  `${DELEGATE_MARK}${type}-${harness}-${RUN}`;

/** The documents each kind of session loads besides the CLAUDE.md and its model's. */
const OWN = {
  orchestrator: ["orchestrator"],
  high: ["leaf", "high"],
  low: ["leaf"],
} as const satisfies Record<string, readonly Doc[]>;

/** What a session on `harness` loads: its own, the CLAUDE.md, and the model's on Claude. */
const loads = (harness: Harness, own: readonly Doc[]): Doc[] => [
  "user",
  ...own,
  ...(MODEL[harness].includes("haiku") ? (["haiku"] as const) : []),
];

/** `delegate` as each harness offers it: Claude Code's MCP name, OpenCode's, pi's. */
const DELEGATES = ["mcp__cawco__delegate", "cawco_delegate", "delegate"];
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";

/** The turn the mock is answering now: one session's at a time. */
interface Step {
  /** A `delegate` turn: the call went out. */
  called?: boolean;
  /** The turn is a delegate's: only a delegate's requests answer it. */
  delegate?: boolean;
  /** The mock said its last words for the turn. */
  done?: boolean;
  /** What the mock does on the turn's first request. */
  kind: "say" | "delegate";
  /** The last message of the request that answered the call: its tool result. */
  result?: string;
  /** A `delegate` turn: Claude Code's ToolSearch went out first. */
  searched?: boolean;
  /** The delegate type a `delegate` turn asks for. */
  type?: string;
}

const say = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The request's last message, as sent: a tool call's result, on either API. */
const lastMessage = (body: string): string => {
  const parsed = JSON.parse(body) as { messages?: unknown[] };
  return JSON.stringify(parsed.messages?.at(-1) ?? null);
};

/** A delegate call for `type` on the orchestrator's own harness and model. */
const delegateInput = (type: string, harness: Harness, repo: string) => ({
  title: `Document scope ${type} ${harness} ${RUN}`,
  prompt: `${delegateToken(type, harness)}: say ok.`,
  type,
  harness,
  model: MODEL[harness],
  cwd: repo,
  checks: [{ name: "Nothing to check", command: "true" }],
  lands: "none",
});

type Turn = (
  session: string,
  text: string,
  next: Step,
  token?: string
) => Promise<Seen | undefined>;

const spec: Spec = {
  name: "document-scope",
  run: async (kit) => {
    let step: Step | undefined;
    let repo = "";
    let harnessNow: Harness = "claude";
    /** The `delegate` call of a turn, as this harness offers it. */
    const delegateCall = (request: Seen, now: Step): Reply => {
      const direct = request.toolNames.find((name) => DELEGATES.includes(name));
      const input = delegateInput(now.type ?? "high", harnessNow, repo);
      if (direct) {
        now.called = true;
        return call(direct, input);
      }
      if (!now.searched && request.toolNames.includes("ToolSearch")) {
        now.searched = true;
        return call("ToolSearch", {
          query: "select:mcp__cawco__delegate",
          max_results: 1,
        });
      }
      // OpenCode keeps MCP tools in Code Mode's catalog: `execute` runs a
      // script that calls them as `tools.<server>.<tool>(input)`.
      if (request.toolNames.includes(CODE_MODE)) {
        now.called = true;
        return call(CODE_MODE, {
          code: `return await tools.cawco.delegate(${JSON.stringify(input)});`,
        });
      }
      now.done = true;
      return say("No delegate tool is offered.");
    };
    const respond = (request: Seen): Reply => {
      const now = step;
      if (!request.tools) {
        return say("Probe title");
      }
      // A delegate's request: its brief is in its history, or (once it has
      // compacted) the turn the probe is driving is a delegate's.
      if (request.all.includes(DELEGATE_MARK) || now?.delegate) {
        if (now?.delegate) {
          now.done = true;
        }
        return say("Summary: the delegate's turns so far.");
      }
      if (!now) {
        return say("ok");
      }
      if (now.kind === "say" || now.done) {
        now.done = true;
        return say("Summary: the probe's turns so far.");
      }
      if (now.called && request.afterTool) {
        now.result = lastMessage(request.body);
        now.done = true;
        return say("Done.");
      }
      return delegateCall(request, now);
    };

    const fleet = await kit.fleet(respond);
    ({ repo } = fleet);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await keepDocuments(kit, fleet);

    /** One turn of a session: `text` sent, answered as `next` says; the turn's first request carrying `token`. */
    const turn: Turn = async (session, text, next, token = text) => {
      step = next;
      const from = fleet.seen.length;
      await fleet.send(session, text);
      const first = await until<Seen>(
        `the turn "${text.slice(0, 40)}" at the model`,
        () =>
          fleet.seen
            .slice(from)
            .find((seen) => seen.tools && seen.all.includes(token)),
        Boolean,
        180_000
      ).catch(() => undefined);
      await until(
        `the turn "${text.slice(0, 40)}" ended`,
        () => next.done === true && !fleet.instance(session)?.turn_open_at,
        Boolean,
        180_000
      ).catch(() => undefined);
      return first;
    };
    /** A `/compact`, answered with the mock's summary, and its end. */
    const compact = async (session: string, delegate: boolean) => {
      const next: Step = { kind: "say", delegate };
      step = next;
      const from = fleet.seen.length;
      await fleet.send(session, "/compact");
      await until(
        "the compaction's summary request",
        () => fleet.seen.length > from && next.done === true,
        Boolean,
        180_000
      ).catch(() => undefined);
      await until(
        "the compaction ended",
        () => !fleet.instance(session)?.turn_open_at,
        Boolean,
        180_000
      ).catch(() => undefined);
      await Bun.sleep(1500);
    };
    const exactly = (
      label: string,
      request: Seen | undefined,
      wanted: readonly Doc[]
    ) => {
      const got = DOCS.filter((doc) => request?.body.includes(MARK[doc]));
      const missing = wanted.filter((doc) => !got.includes(doc));
      const extra = got.filter((doc) => !wanted.includes(doc));
      kit.check(
        `${label}: carries ${wanted.join(", ")} and no other scoped document`,
        request !== undefined && missing.length === 0 && extra.length === 0,
        request
          ? `carried ${got.join(", ") || "none"}; missing ${missing.join(", ") || "none"}; not its own ${extra.join(", ") || "none"}`
          : "no request reached the model"
      );
    };
    /** A delegate's first request, by the brief it was given. */
    const delegateFirst = (type: string, harness: Harness) =>
      until<Seen>(
        `the ${type} delegate's first request`,
        () =>
          fleet.seen.find(
            (seen) =>
              seen.tools && seen.all.includes(delegateToken(type, harness))
          ),
        Boolean,
        180_000
      ).catch(() => undefined);

    for (const harness of HARNESSES) {
      harnessNow = harness;
      // 1. The orchestrator's first turn.
      // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, each read before the next
      const orchestrator = await fleet.spawn(
        harness,
        `Document scope ${harness} orchestrator`,
        fleet.workdir
      );
      const first = await turn(
        orchestrator,
        `DOCSCOPE-TURN-${harness}-${RUN}`,
        {
          kind: "say",
        }
      );
      exactly(
        `1: ${harness}, orchestrator`,
        first,
        loads(harness, OWN.orchestrator)
      );

      // 2. The briefer's guide reaches the session that calls delegate, and
      // the delegates its calls start load their own documents.
      await briefing(kit, fleet, harness, orchestrator, turn, "2");
      exactly(
        `2: ${harness}, the high delegate it started`,
        await delegateFirst("high", harness),
        loads(harness, OWN.high)
      );
      exactly(
        `2: ${harness}, the low delegate it started`,
        await delegateFirst("low", harness),
        loads(harness, OWN.low)
      );

      // 3. After a compaction: the orchestrator.
      const before = `DOCSCOPE-BEFORE-${harness}-${RUN}`;
      await turn(orchestrator, before, { kind: "say" });
      await compact(orchestrator, false);
      const after = await turn(
        orchestrator,
        `DOCSCOPE-AFTER-${harness}-${RUN}`,
        { kind: "say" }
      );
      kit.check(
        `3: ${harness}, orchestrator: the compaction replaced its history (an earlier turn's words are gone)`,
        after !== undefined && !after.all.includes(before),
        after ? `history ${after.all.length} chars` : "no request"
      );
      exactly(
        `3: ${harness}, orchestrator after a compaction`,
        after,
        loads(harness, OWN.orchestrator)
      );
      const handed = fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM memory_briefings WHERE instance_id = ?",
        orchestrator
      )[0]?.n;
      kit.check(
        `3: ${harness}, orchestrator: the compaction forgot the guide it was handed`,
        handed === 0,
        `memory_briefings rows ${handed}`
      );
      await briefing(kit, fleet, harness, orchestrator, turn, "3", true);

      // 3. After a compaction: the high delegate.
      const high = fleet.query<{ id: string }>(
        "SELECT id FROM instances WHERE parent_instance_id = ? AND delegate_type = 'high'",
        orchestrator
      )[0]?.id;
      if (high) {
        const leafBefore = `DOCSCOPE-LEAF-BEFORE-${harness}-${RUN}`;
        await turn(high, leafBefore, { kind: "say", delegate: true });
        await compact(high, true);
        const leafAfter = await turn(
          high,
          `DOCSCOPE-LEAF-AFTER-${harness}-${RUN}`,
          { kind: "say", delegate: true }
        );
        kit.check(
          `3: ${harness}, high delegate: the compaction replaced its history`,
          leafAfter !== undefined && !leafAfter.all.includes(leafBefore),
          leafAfter ? `history ${leafAfter.all.length} chars` : "no request"
        );
        exactly(
          `3: ${harness}, high delegate after a compaction`,
          leafAfter,
          loads(harness, OWN.high)
        );
      } else {
        kit.check(
          `3: ${harness}, high delegate after a compaction`,
          false,
          "the orchestrator has no high delegate to compact"
        );
      }
      const started = fleet.query<{ id: string }>(
        "SELECT id FROM instances WHERE id = ? OR parent_instance_id = ?",
        orchestrator,
        orchestrator
      );
      for (const { id } of started) {
        // biome-ignore lint/performance/noAwaitInLoops: one stop at a time
        await fleet.stopSession(id);
      }
    }
  },
};

/**
 * The orchestrator's `high` delegate call is held with the guide, which its
 * next request carries; with `heldOnly` (after a compaction) that is all.
 * Otherwise the same call again starts its delegate, as a `low` call does.
 */
const briefing = async (
  kit: Kit,
  fleet: KitFleet,
  harness: Harness,
  orchestrator: string,
  turn: Turn,
  label: string,
  heldOnly = false
): Promise<void> => {
  const token = `DOCSCOPE-BRIEF-${label}-${harness}-${RUN}`;
  const first: Step = { kind: "delegate", type: "high" };
  await turn(orchestrator, `${token}: delegate it.`, first, token);
  kit.check(
    `${label}: ${harness}, orchestrator: its high delegate call is held with the briefing guide, nothing started`,
    first.result?.includes(HELD) === true &&
      first.result.includes(MARK.briefer),
    first.result?.slice(0, 300) ??
      (first.called ? "the call had no answer" : "the call never went out")
  );
  const carriedNext = fleet.seen.some(
    (seen) =>
      seen.afterTool &&
      seen.body.includes(MARK.briefer) &&
      seen.all.includes(token)
  );
  kit.check(
    `${label}: ${harness}, orchestrator: the guide is in its context at its next request`,
    carriedNext,
    carriedNext ? "carried" : "no request carried it"
  );
  if (heldOnly) {
    return;
  }
  const again: Step = { kind: "delegate", type: "high" };
  const againToken = `DOCSCOPE-AGAIN-${harness}-${RUN}`;
  await turn(
    orchestrator,
    `${againToken}: delegate it again.`,
    again,
    againToken
  );
  kit.check(
    `${label}: ${harness}, orchestrator: the same call made again is not held`,
    again.result !== undefined && !again.result.includes(HELD),
    again.result?.slice(0, 300) ?? "the call had no answer"
  );
  const low: Step = { kind: "delegate", type: "low" };
  const lowToken = `DOCSCOPE-LOW-${harness}-${RUN}`;
  await turn(orchestrator, `${lowToken}: delegate a low one.`, low, lowToken);
  kit.check(
    `${label}: ${harness}, orchestrator: a low delegate call is not held (the guide is about high delegates)`,
    low.result !== undefined && !low.result.includes(HELD),
    low.result?.slice(0, 300) ?? "the call had no answer"
  );
};

/** The fleet's memory through the hub's own routes (admin_memory_write's). */
const keepDocuments = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const hub = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path}: ${response.status} ${text}`);
    }
    return JSON.parse(text) as unknown;
  };
  await hub("PUT", "/api/fleet/memory", {
    content: `# Fleet\n\n${MARK.user}\n`,
  });
  const put = (path: string, doc: Doc, scope: object) =>
    hub("PUT", "/api/fleet/memory/docs", {
      path,
      content: `# ${doc}\n\n${MARK[doc]}\n`,
      scope,
    });
  await put("orchestrator.md", "orchestrator", { role: "orchestrator" });
  await put("leaf.md", "leaf", { role: "leaf" });
  await put("types/high.md", "high", { delegateTypes: ["high"] });
  await put("models/haiku.md", "haiku", { model: "haiku" });
  await put("briefing/high.md", "briefer", {
    briefer: true,
    delegateTypes: ["high"],
  });
  const refused = await fetch(`${fleet.base}/api/fleet/memory/docs`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: "briefing/wrong.md",
      content: "x",
      scope: { briefer: true, role: "leaf" },
    }),
  });
  kit.check(
    "0: a briefer document with a role is refused",
    refused.status === 400,
    `${refused.status} ${await refused.text()}`
  );
  const listed = (await hub("GET", "/api/fleet")) as {
    memoryDocs: { path: string; scope?: Record<string, unknown> }[];
  };
  const briefer = listed.memoryDocs.find(
    (doc) => doc.path === "briefing/high.md"
  )?.scope;
  kit.check(
    "0: the hub keeps each document with its scope",
    briefer?.briefer === true &&
      JSON.stringify(briefer.delegateTypes) === '["high"]' &&
      listed.memoryDocs.find((doc) => doc.path === "models/haiku.md")?.scope
        ?.model === "haiku",
    JSON.stringify(
      listed.memoryDocs.map(({ path, scope }) => ({ path, scope }))
    )
  );
};

export default spec;
