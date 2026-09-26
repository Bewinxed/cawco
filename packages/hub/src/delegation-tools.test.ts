import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Envelope, SendPayload } from "@whiffle/core";
import { DEFAULT_DELEGATE_TYPES, WHIFFLE_ENV } from "@whiffle/core";
import { fetchDelegateTypes } from "./delegation-actions";
import { handoffInstructions, handoffTools } from "./delegation-tools";

/**
 * A stand-in hub, so the tools are exercised against a real fetch of a real
 * `/api/instances` shape rather than a mocked roster.
 */
const rows = [
  { id: "self", machineId: "m1", cwd: "/home/o/center.ai", status: "running" },
  { id: "kee-1", machineId: "m2", cwd: "/Users/o/keeboard", status: "running" },
  {
    id: "router",
    machineId: "m1",
    cwd: "/home/o/locallm-router",
    status: "running",
  },
  { id: "dead", machineId: "m1", cwd: "/home/o/old", status: "error" },
  { id: "twin-a", machineId: "m1", cwd: "/home/o/twins", status: "running" },
  { id: "twin-b", machineId: "m2", cwd: "/other/twins", status: "running" },
];

let hub: ReturnType<typeof Bun.serve>;
let catalogResponse = () => Response.json({ types: DEFAULT_DELEGATE_TYPES });

beforeAll(() => {
  hub = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/api/delegate-types"
        ? catalogResponse()
        : Response.json(rows),
  });
  process.env[WHIFFLE_ENV.hubUrl] = `ws://localhost:${hub.port}/ws`;
});

afterAll(() => hub.stop(true));

type Handler = (
  args: Record<string, string>,
  extra: unknown
) => Promise<{ content: unknown[] }>;

const build = () => {
  const sent: Envelope[] = [];
  const tools = handoffTools({
    instanceId: "self",
    cwd: "/home/o/center.ai",
    emit: (envelope) => sent.push(envelope),
  });
  // By name, not by position: a tool added later must not silently renumber
  // what these assertions are pointed at.
  const handlerOf = (name: string): Handler => {
    const found = tools.find((candidate) => candidate.name === name);
    if (!found) {
      throw new Error(`no ${name} tool`);
    }
    return found.handler as unknown as Handler;
  };
  return {
    list: handlerOf("list_sessions"),
    listTypes: handlerOf("list_delegate_types"),
    handoff: handlerOf("handoff"),
    start: handlerOf("start_session"),
    sendToUser: handlerOf("send_to_user"),
    sent,
  };
};

const textOf = (result: { content: unknown[] }): string =>
  (result.content[0] as { text: string }).text;

test("delegate catalog tool reads current mappings each time, without spawning", async () => {
  const { listTypes, sent } = build();
  const type = {
    name: "code",
    description: "Implement a clear specification",
    harness: "opencode",
    model: "openai/gpt-5.6-sol",
    effort: "medium",
  };
  try {
    catalogResponse = () => Response.json({ types: [type] });
    expect(JSON.parse(textOf(await listTypes({}, {})))).toEqual({
      types: [type],
    });
    type.model = "openai/gpt-5.6-terra";
    expect(JSON.parse(textOf(await listTypes({}, {}))).types[0].model).toBe(
      type.model
    );
    catalogResponse = () => Response.json({ types: [] });
    expect(JSON.parse(textOf(await listTypes({}, {})))).toEqual({ types: [] });
    catalogResponse = () => new Response("unavailable", { status: 503 });
    await expect(listTypes({}, {})).rejects.toThrow("HTTP 503");
    catalogResponse = () => Response.json({ unexpected: [] });
    await expect(listTypes({}, {})).rejects.toThrow(
      "Invalid delegate catalog response"
    );
    expect(sent).toEqual([]);
    expect(
      handoffTools({
        instanceId: "leaf",
        cwd: "/tmp",
        emit: () => undefined,
        canDelegate: false,
      }).some((tool) => tool.name === "list_delegate_types")
    ).toBe(true);
  } finally {
    catalogResponse = () => Response.json({ types: DEFAULT_DELEGATE_TYPES });
  }
});

test("an existing delegate handler dispatches the current model and effort instead of its startup snapshot", async () => {
  const sent: Envelope[] = [];
  const original = DEFAULT_DELEGATE_TYPES.find(
    (type) => type.name === "medium"
  );
  if (!original) {
    throw new Error("Missing medium fixture");
  }
  const handler = handoffTools({
    instanceId: "self",
    cwd: "/tmp",
    delegateTypes: [original],
    emit: (envelope) => sent.push(envelope),
  }).find((tool) => tool.name === "delegate")?.handler as unknown as Handler;
  try {
    catalogResponse = () =>
      Response.json({
        types: [
          {
            ...original,
            harness: "opencode",
            model: "openai/gpt-5.6-terra",
            effort: "medium",
            denyTools: undefined,
          },
        ],
      });
    await handler({ type: "medium", prompt: "first" }, {});
    expect(sent[0].payload).toMatchObject({
      model: "openai/gpt-5.6-terra",
      effort: "medium",
      harness: "opencode",
    });
    sent.length = 0;
    catalogResponse = () =>
      Response.json({
        types: [
          {
            ...original,
            harness: "opencode",
            model: "openai/gpt-5.6-sol",
            effort: "high",
            denyTools: undefined,
          },
        ],
      });
    await handler({ type: "medium", prompt: "second" }, {});
    expect(sent[0].payload).toMatchObject({
      model: "openai/gpt-5.6-sol",
      effort: "high",
    });
    sent.length = 0;
    catalogResponse = () => new Response("unavailable", { status: 503 });
    await expect(
      handler({ type: "medium", prompt: "third" }, {})
    ).rejects.toThrow("HTTP 503");
    expect(sent).toEqual([]);
  } finally {
    catalogResponse = () => Response.json({ types: DEFAULT_DELEGATE_TYPES });
  }
});

test("the roster lists other running sessions, not this one and not the dead", async () => {
  const { list } = build();
  const text = textOf(await list({}, {}));
  expect(text).toContain("keeboard");
  expect(text).toContain("locallm-router");
  expect(text).not.toContain("/home/o/center.ai"); // itself
  expect(text).not.toContain("/home/o/old"); // errored
});

test("a hand-off emits a send addressed at the target and its machine", async () => {
  const { handoff, sent } = build();
  await handoff(
    { target: "keeboard", message: "auth double-encodes the token" },
    {}
  );

  expect(sent).toHaveLength(1);
  const [envelope] = sent;
  expect(envelope.verb).toBe("send");
  // Routed at the *target's* machine, which is how it crosses machines at all.
  expect(envelope.machineId).toBe("m2");
  expect(envelope.instanceId).toBe("kee-1");
});

test("the message is marked as a peer and does not start a turn", async () => {
  const { handoff, sent } = build();
  await handoff({ target: "keeboard", message: "the finding" }, {});

  const payload = sent[0].payload as SendPayload;
  const message = payload.message as {
    origin?: {
      kind: string;
      from: string;
      name?: string;
      fromSession?: string;
    };
    shouldQuery?: boolean;
    message: { content: string };
  };

  // Reported speech, not the reader's authority.
  expect(message.origin?.kind).toBe("peer");
  expect(message.origin?.from).toBe("self");
  expect(message.origin?.name).toBe("center.ai");
  expect(message.origin?.fromSession).toBe("self");
  // Queued, so the target finishes what it is doing first.
  expect(message.shouldQuery).toBe(false);
  // The body carries the attribution too: the stored transcript does not keep
  // `origin`, so without this a reload shows another agent's words as the user's.
  expect(message.message.content).toContain("the finding");
  expect(message.message.content).toContain("center.ai");
  expect(message.message.content).toContain("not the user");
});

test("an @ prefix and a partial name both resolve", async () => {
  for (const target of ["@keeboard", "keeb", "KEEBOARD"]) {
    const { handoff, sent } = build();
    // biome-ignore lint/performance/noAwaitInLoops: each form gets its own stand-in hub; sequential keeps a failure's output pointing at one target
    await handoff({ target, message: "x" }, {});
    expect(sent[0].instanceId).toBe("kee-1");
  }
});

test("an id resolves directly", async () => {
  const { handoff, sent } = build();
  await handoff({ target: "router", message: "x" }, {});
  expect(sent[0].instanceId).toBe("router");
});

const UNKNOWN_TARGET_ERROR = /keeboard/;
const AMBIGUOUS_TARGET_ERROR = /matches 2 sessions/;

test("an unknown target is refused, and says what is running", async () => {
  const { handoff, sent } = build();
  await expect(
    handoff({ target: "nowhere", message: "x" }, {})
  ).rejects.toThrow(UNKNOWN_TARGET_ERROR);
  expect(sent).toHaveLength(0);
});

test("an ambiguous name is refused rather than guessed", async () => {
  const { handoff, sent } = build();
  // Two sessions are both called "twins" — sending to either silently is how a
  // hand-off lands somewhere nobody looks again.
  await expect(handoff({ target: "twins", message: "x" }, {})).rejects.toThrow(
    AMBIGUOUS_TARGET_ERROR
  );
  expect(sent).toHaveLength(0);
});

test("starting a session spawns it and gives it its opening turn", async () => {
  const { start, sent } = build();
  await start(
    {
      cwd: "/home/o/center.ai",
      prompt: "audit the extension manifest",
    } as never,
    {}
  );

  expect(sent.map((envelope) => envelope.verb)).toEqual(["spawn", "send"]);
  const [spawn, opening] = sent;
  // Same new session on both, so the prompt lands in the session just made.
  expect(spawn.instanceId).toBe(opening.instanceId);
  expect((spawn.payload as { cwd: string }).cwd).toBe("/home/o/center.ai");

  // The opening instruction *should* run — this is the one peer message that
  // is not queued, because the session exists to answer it.
  const { message } = opening.payload as { message: Record<string, unknown> };
  expect(message.shouldQuery).toBeUndefined();
  expect((message.origin as { kind: string }).kind).toBe("peer");
});

test("a side quest is spawned as scratch, with its worktree flag", async () => {
  const { start, sent } = build();
  await start(
    { cwd: "/home/o/center.ai", prompt: "try it", sideQuest: true } as never,
    {}
  );
  const { scratch } = sent[0].payload as {
    scratch?: { worktree?: boolean; baseCwd?: string };
  };
  // No worktree: the quest works in the checkout, nested under its parent.
  expect(scratch).toEqual({ baseCwd: "/home/o/center.ai" });
});

test("a plain session carries no scratch tag", async () => {
  const { start, sent } = build();
  await start({ cwd: "/home/o/center.ai", prompt: "x" } as never, {});
  expect((sent[0].payload as { scratch?: unknown }).scratch).toBeUndefined();
});

test("a user message goes up as a frames envelope with no target and no ask", async () => {
  const { sendToUser, sent } = build();
  const text = textOf(await sendToUser({ message: "the build passed" }, {}));

  expect(sent).toHaveLength(1);
  const [envelope] = sent;
  // Frames travel session → hub, so the hub routes them on `kind`, not a verb
  // like `send`. No machine and no peer: this is the session's own word.
  expect(envelope.verb).toBe("frames");
  expect(envelope.machineId).toBe("");
  expect(envelope.instanceId).toBe("self");
  expect(envelope.payload).toEqual({
    kind: "user_message",
    instanceId: "self",
    text: "the build passed",
  });
  expect(text).toContain("Sent to the user");
});

test("startup instructions expose routing and catalog before tool discovery", () => {
  const deps = {
    instanceId: "self",
    cwd: "/tmp",
    emit: () => {
      throw new Error("Must not spawn");
    },
    delegateTypes: DEFAULT_DELEGATE_TYPES,
  };
  const instructions = handoffInstructions(deps);
  expect(instructions).toContain(
    'ToolSearch(query="select:mcp__whiffle__delegate")'
  );
  expect(instructions).toContain(
    "Native harness subagents are a separate mechanism"
  );
  expect(instructions).toContain("Delegate substantial bounded work");
  for (const type of DEFAULT_DELEGATE_TYPES) {
    expect(instructions).toContain(`'${type.name}'`);
    expect(instructions).toContain(type.description);
    expect(instructions).toContain(
      `model: ${type.model}; effort: ${type.effort}`
    );
  }
  const leaf = { ...deps, canDelegate: false };
  expect(handoffInstructions(leaf)).toContain("Do the assigned work yourself");
  expect(handoffInstructions(leaf)).not.toContain("ToolSearch");
  expect(handoffTools(leaf).some((tool) => tool.name === "delegate")).toBe(
    false
  );
});

test("catalog errors reach startup instructions and failed delegation; valid empty is distinct", async () => {
  const deps = {
    instanceId: "self",
    cwd: "/tmp",
    emit: () => {
      throw new Error("Must not spawn");
    },
  };
  try {
    for (const response of [
      () => new Response("unavailable", { status: 503 }),
      () => Response.json({ unexpected: [] }),
      () => Response.json({ types: [{ name: "broken" }] }),
    ]) {
      catalogResponse = response;
      let failure: string | undefined;
      // biome-ignore lint/performance/noAwaitInLoops: each case changes the shared fake hub response
      const types = await fetchDelegateTypes((message) => {
        failure = message;
      });
      expect(types).toEqual([]);
      expect(failure).toContain("Could not load delegate types:");
      const instructions = handoffInstructions({
        ...deps,
        delegateTypes: types,
        delegateTypesError: failure,
      });
      if (!failure) {
        throw new Error("Expected a catalog failure");
      }
      expect(instructions).toContain(failure);
      expect(instructions).toContain("unavailable, not empty");
      const delegate = handoffTools({ ...deps, delegateTypes: types }).find(
        (tool) => tool.name === "delegate"
      );
      if (!delegate) {
        throw new Error("Expected delegate tool");
      }
      await expect(
        (delegate.handler as unknown as Handler)(
          { prompt: "Read files", type: "explore" },
          {}
        )
      ).rejects.toThrow("Could not load delegate types:");
    }
    catalogResponse = () => Response.json({ types: [] });
    const errors: string[] = [];
    expect(await fetchDelegateTypes((message) => errors.push(message))).toEqual(
      []
    );
    expect(errors).toEqual([]);
    expect(handoffInstructions({ ...deps, delegateTypes: [] })).toContain(
      "list_delegate_types"
    );
    catalogResponse = () => Response.json({ types: DEFAULT_DELEGATE_TYPES });
    expect(await fetchDelegateTypes()).toEqual(DEFAULT_DELEGATE_TYPES);
  } finally {
    catalogResponse = () => Response.json({ types: DEFAULT_DELEGATE_TYPES });
  }
});

test("an initially unavailable catalog recovers a named route without model overrides", async () => {
  const sent: Envelope[] = [];
  const delegate = handoffTools({
    instanceId: "self",
    cwd: "/tmp",
    delegateTypes: [],
    delegateTypesError: "Could not load delegate types: HTTP 503",
    emit: (envelope) => sent.push(envelope),
  }).find((tool) => tool.name === "delegate");
  if (!delegate) {
    throw new Error("Expected delegate tool");
  }
  await (delegate.handler as unknown as Handler)(
    { prompt: "Inspect the parser", type: "low" },
    {}
  );
  expect(sent.map((envelope) => envelope.verb)).toEqual(["spawn", "send"]);
  expect(sent[0].payload).toMatchObject({
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "low",
    canDelegate: false,
    denyTools: ["mcp__claude-in-chrome__*"],
  });
});
