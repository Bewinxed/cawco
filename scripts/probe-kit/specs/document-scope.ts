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
 * 3. After a `/compact` (its boundary in the session's transcript), the
 *    orchestrator's and the `high` delegate's next requests still carry
 *    every document for them; and the orchestrator's next `high` delegate call is
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
  MACHINE,
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
/** A long turn's words, about 25,000 tokens at four characters a token, past pi's 20,000-token kept tail. */
const FILLER =
  "The probe fills its history so the harness has a turn to compact. ".repeat(
    1500
  );
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
  /**
   * A compaction's turn: its summarizing request ({@link SUMMARIZING}) is
   * answered with these words, which then stand for the history it replaced.
   */
  summary?: string;
  /** The delegate type a `delegate` turn asks for. */
  type?: string;
}

const say = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The request's message `back` from its last, as sent: `1`, a tool call's result; `2`, the call. */
const messageBack = (body: string, back = 1): string => {
  const parsed = JSON.parse(body) as { messages?: unknown[] };
  return JSON.stringify(parsed.messages?.at(-back) ?? null);
};
const lastMessage = (body: string): string => messageBack(body);

/**
 * Each harness's instruction to summarize a conversation, which only its
 * summarizing request carries: Claude Code's (its bundled CLI, SDK
 * 0.3.296), OpenCode's (its binary) and pi's (`SUMMARIZATION_SYSTEM_PROMPT`,
 * pi-coding-agent 1.0.1 compaction/utils.js).
 */
const SUMMARIZING = [
  "Your task is to create a detailed summary of the conversation so far",
  "You MUST summarize the conversation above into a structured summary",
  "You are a context summarization assistant",
];

/**
 * What the hub tells a work item's session whose turn ended without
 * `finish_item` (work-items.ts `quietTurn`, and the sweep's wake): a
 * delegate's request, whatever its compaction left of its brief.
 */
const STILL_OPEN = "Your work item is still open";
/** `wait_item` as each harness offers it. */
const WAITS = ["mcp__cawco__wait_item", "cawco_wait_item", "wait_item"];
const WAIT_INPUT = { minutes: 60, reason: "The probe drives this delegate." };

/**
 * A delegate's request: its brief is in its history, or the hub's word to a
 * work item is, or (once it has compacted) the turn the probe is driving is
 * a delegate's.
 */
const delegates = (request: Seen, now: Step | undefined): boolean =>
  request.all.includes(DELEGATE_MARK) ||
  request.all.includes(STILL_OPEN) ||
  now?.delegate === true;

/**
 * A delegate's turn: a `wait_item` call, then its words. A work item whose
 * session ends three turns in a row without `finish_item` fails (hub
 * work-items.ts `QUIET_TURNS`), and a declared wait keeps it running
 * without those reminders, so the probe's delegates stay live to be read
 * and compacted. On Claude Code the tool is deferred: ToolSearch first.
 */
const delegateTurn = (request: Seen, owned: Step | undefined): Reply => {
  const done = () => {
    if (owned) {
      owned.done = true;
    }
    return say("Waiting for the probe.");
  };
  const wait = request.toolNames.find((name) => WAITS.includes(name));
  if (request.afterTool) {
    // The call this answers was the wait itself: the turn's words.
    if (!messageBack(request.body, 2).includes("ToolSearch")) {
      return done();
    }
    return wait ? call(wait, WAIT_INPUT) : done();
  }
  if (wait) {
    return call(wait, WAIT_INPUT);
  }
  if (request.toolNames.includes("ToolSearch")) {
    return call("ToolSearch", {
      query: "select:mcp__cawco__wait_item",
      max_results: 1,
    });
  }
  if (request.toolNames.includes(CODE_MODE)) {
    return call(CODE_MODE, {
      code: `return await tools.cawco.wait_item(${JSON.stringify(WAIT_INPUT)});`,
    });
  }
  return done();
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
      // A harness's summarizing request, known by its own instruction: it
      // gets the compaction's summary, and nothing else does.
      if (SUMMARIZING.some((words) => request.body.includes(words))) {
        if (now?.summary) {
          now.done = true;
        }
        return say(now?.summary ?? "DOCSCOPE-SUMMARY-unasked");
      }
      if (!request.tools) {
        return say("Probe title");
      }
      // A delegate's turn, the hub's quiet-turn word to it included, is
      // answered with its wait: three quiet turns in a row fail its item
      // (work-items.ts `QUIET_TURNS`), and the mock answers in milliseconds.
      if (delegates(request, now)) {
        return delegateTurn(
          request,
          now?.delegate && !now.summary ? now : undefined
        );
      }
      return orchestratorTurn(request, now);
    };
    /** An orchestrator's turn: words, or its `delegate` call and then words. */
    const orchestratorTurn = (request: Seen, now: Step | undefined): Reply => {
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
    /** The compactions a session's transcript shows: its `compact_boundary` blocks. */
    const compactions = async (session: string): Promise<number> => {
      const response = await fetch(
        `${fleet.base}/api/instances/${session}/transcript?limit=1000`,
        { signal: AbortSignal.timeout(30_000) }
      ).catch(() => undefined);
      const text = response?.ok ? await response.text() : "";
      return text.split('"system.compact_boundary"').length - 1;
    };
    /**
     * A `/compact`, answered with a summary of the mock's, waited for until
     * the session's transcript shows its boundary: whether it compacted. A
     * harness sends the boundary as its compaction ends, and pi refuses a
     * prompt before that ("Cannot submit a prompt while compaction is in
     * progress", pi-coding-agent 1.0.1 agent-session.js). On pi two long
     * turns go first: it compacts only what lies before its kept tail
     * ("Nothing to compact (session too small)", `keepRecentTokens: 20000`).
     * The others get none, so nothing of theirs compacts on its own first.
     */
    const compact = async (
      session: string,
      delegate: boolean
    ): Promise<boolean> => {
      if (harnessNow === "pi") {
        for (const part of ["A", "B"]) {
          const token = `DOCSCOPE-FILLER-${part}-${crypto.randomUUID().slice(0, 8)}`;
          // biome-ignore lint/performance/noAwaitInLoops: one turn after the other
          await turn(
            session,
            `${token} ${FILLER}`,
            { kind: "say", delegate },
            token
          );
        }
      }
      const before = await compactions(session);
      step = {
        kind: "say",
        delegate,
        // A delegate's summary carries its mark: the brief that did is
        // summarized away on Claude Code and pi.
        summary: `${delegate ? DELEGATE_MARK : "DOCSCOPE-"}SUMMARY-${crypto.randomUUID().slice(0, 8)}`,
      };
      await fleet.send(session, "/compact");
      const compacted = await until(
        "the compaction's boundary in the transcript",
        () => compactions(session),
        (count) => count > before,
        180_000
      )
        .then(() => true)
        .catch(() => false);
      await until(
        "the compaction's turn ended",
        () => !fleet.instance(session)?.turn_open_at,
        Boolean,
        60_000
      ).catch(() => undefined);
      step = undefined;
      return compacted;
    };
    /**
     * The request carries exactly `wanted` of the scoped documents; `kept`
     * may also be there, handed to the session in a turn its harness kept
     * through a compaction (OpenCode keeps its latest turns as they were).
     */
    const exactly = (
      label: string,
      request: Seen | undefined,
      wanted: readonly Doc[],
      kept: readonly Doc[] = []
    ) => {
      const got = DOCS.filter((doc) => request?.body.includes(MARK[doc]));
      const missing = wanted.filter((doc) => !got.includes(doc));
      const extra = got.filter(
        (doc) => !(wanted.includes(doc) || kept.includes(doc))
      );
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
      await turn(orchestrator, `DOCSCOPE-BEFORE-${harness}-${RUN}`, {
        kind: "say",
      });
      const compacted = await compact(orchestrator, false);
      kit.check(
        `3: ${harness}, orchestrator: it compacted (its transcript shows the boundary)`,
        compacted,
        compacted ? "compacted" : "no compact_boundary within 180s"
      );
      const after = await turn(
        orchestrator,
        `DOCSCOPE-AFTER-${harness}-${RUN}`,
        { kind: "say" }
      );
      exactly(
        `3: ${harness}, orchestrator after a compaction`,
        after,
        loads(harness, OWN.orchestrator),
        ["briefer"]
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
        await turn(high, `DOCSCOPE-LEAF-BEFORE-${harness}-${RUN}`, {
          kind: "say",
          delegate: true,
        });
        const leafCompacted = await compact(high, true);
        kit.check(
          `3: ${harness}, high delegate: it compacted (its transcript shows the boundary)`,
          leafCompacted,
          leafCompacted ? "compacted" : "no compact_boundary within 180s"
        );
        const leafAfter = await turn(
          high,
          `DOCSCOPE-LEAF-AFTER-${harness}-${RUN}`,
          { kind: "say", delegate: true }
        );
        exactly(
          `3: ${harness}, high delegate after a compaction`,
          leafAfter,
          loads(harness, OWN.high)
        );
        {
          // What the delegate is when its next turn is due: said whole when
          // that turn never reached the model.
          const [row] = fleet.query<{
            status: string;
            last_error: string | null;
            turn_open_at: number | null;
          }>(
            "SELECT status, last_error, turn_open_at FROM instances WHERE id = ?",
            high
          );
          const [item] = fleet.query<{ state: string; error: string | null }>(
            "SELECT state, error FROM work_items WHERE instance_id = ?",
            high
          );
          kit.check(
            `3: ${harness}, high delegate takes its next turn after a compaction`,
            leafAfter !== undefined,
            JSON.stringify({
              row,
              item,
              lastAsked: fleet.seen.at(-1)?.last.slice(0, 200),
            })
          );
        }
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
  // The user-scope CLAUDE.md is on the machine before any session starts:
  // each harness reads it off disk as it launches.
  await until(
    "the user-scope CLAUDE.md on the machine",
    () =>
      fleet.query<{ fleet: string | null }>(
        "SELECT fleet FROM agents WHERE machine_id = ?",
        MACHINE
      )[0]?.fleet,
    (report) => report?.includes('"memory":{"state":"applied"') === true,
    60_000
  ).catch(() => undefined);
};

export default spec;
