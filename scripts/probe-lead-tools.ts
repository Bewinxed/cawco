/**
 * Probe: the project lead's tools that write for the person, on a scratch
 * fleet (real hub, agent and sessiond on loopback; the project's Caw a real
 * Claude Code session against a mock model that makes each tool call a
 * thread asks it for), so every call goes through the hub's MCP bridge as
 * the lead.
 *
 * 1. Delegate type (§5.1: "Caw can propose a new type as a file diff you
 *    approve"): Caw's `folder_write` of `delegates/writer.md` commits
 *    nothing; it is the person's ask, drawn as the file's diff ("Add
 *    delegates/writer.md") in his thread. Approved, it is committed as the
 *    person and the project's catalog (`GET /api/projects/{id}/delegate-types`,
 *    the types its sessions see) lists `writer`. A second type,
 *    `delegates/editor.md`, declined: no commit touches it and the catalog
 *    has no `editor`. A file that makes no type is refused with why, and
 *    parks nothing.
 * 2. Relay offer (§5.5: "Caw offers the relay when you connect a push-only
 *    service"): a stand-in Stripe connection (its MCP server in this
 *    process, signed in with no key) made with no project wakes no one; once
 *    it is granted to the project, Caw is woken exactly once, with words
 *    naming relay_create and the stripe provider. A connection to a service
 *    that is polled (`x`), granted the same way, wakes no one.
 *
 * Caw's session runs inside his place's boundary, so this runs where a
 * boundary can start: the host, outside every workspace.
 *
 * Run from the repo root:
 *   bun scripts/probe-lead-tools.ts [--keep]
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureDeps } from "./lib/deps";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { MACHINE, delay, scratchFleet, until } = await import("./scratch-fleet");
/** How long a probe waits for a wake that must not come. */
const QUIET_MS = 15_000;

const keep = process.argv.includes("--keep");
const LOGGED = /caw|decisions|lead|boundary|error/iu;

let failed = false;
const check = (name: string, passed: boolean, detail: string) => {
  failed ||= !passed;
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

// ── The mock model: each PROBE-CALL:<n> message is one tool call ─────────────
/** The tool call each numbered message asks of Caw. */
const toCall = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
/** What each numbered message's tool answered: the next request's last user text. */
const answered = new Map<string, string>();
const COMMAND = /PROBE-CALL:(\d+)/gu;
/** The words of each wake Caw read that offers a relay (caw.ts `offerRelay`). */
const relayWakes: string[] = [];
const RELAY_WAKE = "Event connection:";
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.last.includes(RELAY_WAKE) && !request.afterTool) {
    relayWakes.push(request.last);
    return text("noted");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? toCall.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** A stand-in for a service's MCP server: one read tool, enough to sign in by. */
const rpc = (id: unknown, result: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result });
const service = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const message = (await request.json()) as { id?: unknown; method?: string };
    if (message.id === undefined) {
      return new Response(null, { status: 202 });
    }
    switch (message.method) {
      case "initialize":
        return rpc(message.id, {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "probe-service", version: "1" },
        });
      case "tools/list":
        return rpc(message.id, {
          tools: [
            {
              name: "balance",
              description: "Reads the balance.",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        });
      default:
        return Response.json({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32_601, message: "no such method" },
        });
    }
  },
});

const fleet = await scratchFleet({ name: "probe-lead-tools", respond });
const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  return { status: response.status, text: await response.text() };
};
const ok = async <T>(method: string, path: string, body?: unknown) => {
  const answer = await send(method, path, body);
  if (answer.status >= 400) {
    throw new Error(`${method} ${path}: ${answer.status} ${answer.text}`);
  }
  return JSON.parse(answer.text) as T;
};

/** An ask parked for the person, as `/api/pending` lists it. */
interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    presentation?: { summary: string };
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}
const TYPE_PROPOSAL = "mcp__cawco__delegate_type_proposal";
const typeProposals = async (): Promise<Ask[]> =>
  (await fleet.api<Ask[]>("/api/pending")).filter(
    (ask) => ask.payload.toolName === TYPE_PROPOSAL
  );
/** The person's answer as the dashboard's card sends it: a `permission.answer` command naming the ask's own machine. */
const answer = (ask: Ask, result: object) =>
  fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: ask.machineId,
    sessionId: ask.instanceId,
    payload: {
      instanceId: ask.instanceId,
      requestId: ask.requestId,
      method: "resolvePermission",
      args: [ask.requestId, result],
    },
  });
/** A delegate type's file, as Caw writes one. */
const typeFile = (brief: string) =>
  `---\nharness: claude\nmodel: claude-haiku-4-5\neffort: low\nlands: none\n---\n${brief}\n`;

let sent = 0;
/** One tool call by the project's Caw, asked for in a thread of yours; what the tool answered him. */
const cawCalls = async (
  projectId: string,
  name: string,
  input: object
): Promise<string> => {
  sent += 1;
  const marker = String(sent);
  toCall.set(marker, { name: `mcp__cawco__${name}`, input });
  await ok("POST", `/api/projects/${projectId}/threads`, {
    body: `PROBE-CALL:${marker}`,
  });
  return await until(
    `Caw's ${name} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  );
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Lead tools",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: true,
  });
  const projectId = project.id;

  // ── 2: a delegate type, proposed by Caw and approved or declined ─────────
  await section("1: delegate type proposal", async () => {
    const commitsTo = async (path: string) =>
      (
        await ok<{ commits: { author: string; subject: string }[] }>(
          "GET",
          `/api/projects/${projectId}/folder/history?path=${encodeURIComponent(path)}`
        )
      ).commits;
    const catalog = async () =>
      (
        await ok<{ types: { name: string; source: string }[] }>(
          "GET",
          `/api/projects/${projectId}/delegate-types`
        )
      ).types;

    const broken = await cawCalls(projectId, "folder_write", {
      path: "delegates/broken.md",
      content: "No front matter here.\n",
    });
    check(
      "1a: a file that makes no type is refused with why, and parks nothing",
      broken.includes("was not proposed") &&
        broken.includes("front matter") &&
        (await typeProposals()).length === 0,
      broken.slice(0, 200)
    );

    const proposed = await cawCalls(projectId, "folder_write", {
      path: "delegates/writer.md",
      content: typeFile("Draft posts in the brand voice."),
    });
    const [writer] = await until(
      "writer's proposal parked",
      typeProposals,
      (asks) => asks.length === 1,
      30_000
    );
    check(
      "1b: Caw's folder_write of delegates/writer.md parks a proposal in his thread and commits nothing",
      writer?.payload.input.path === "delegates/writer.md" &&
        writer.payload.presentation?.summary === "Add delegates/writer.md" &&
        typeof writer.payload.threadId === "string" &&
        (await commitsTo("delegates/writer.md")).length === 0 &&
        !(await catalog()).some((type) => type.name === "writer"),
      `Caw heard ${proposed.slice(0, 200)}; ask ${JSON.stringify(writer?.payload.presentation)} in thread ${writer?.payload.threadId}`
    );
    if (!writer) {
      return;
    }
    await answer(writer, { behavior: "allow", updatedInput: {} });
    await until(
      "writer's proposal answered",
      typeProposals,
      (asks) => asks.length === 0,
      30_000
    );
    const approved = await commitsTo("delegates/writer.md");
    const listed = await catalog();
    check(
      "1c: approved, writer is committed as the person and the project's catalog lists it",
      approved.length === 1 &&
        approved[0]?.author !== "Caw" &&
        listed.some(
          (type) => type.name === "writer" && type.source === "project"
        ),
      `commits ${JSON.stringify(approved)}; catalog ${JSON.stringify(listed.map((type) => `${type.name}:${type.source}`))}`
    );

    await cawCalls(projectId, "folder_write", {
      path: "delegates/editor.md",
      content: typeFile("Edit drafts for length and tone."),
    });
    const [editor] = await until(
      "editor's proposal parked",
      typeProposals,
      (asks) => asks.length === 1,
      30_000
    );
    if (!editor) {
      return;
    }
    await answer(editor, { behavior: "deny", message: "Not this one" });
    await until(
      "editor's proposal answered",
      typeProposals,
      (asks) => asks.length === 0,
      30_000
    );
    const declined = await commitsTo("delegates/editor.md");
    const after = await catalog();
    check(
      "1d: declined, nothing is committed to delegates/editor.md and the catalog has no editor",
      declined.length === 0 && !after.some((type) => type.name === "editor"),
      `commits ${JSON.stringify(declined)}; catalog ${JSON.stringify(after.map((type) => type.name))}`
    );
  });

  // ── 3: a push-only service connected, and Caw woken once to offer a relay ─
  await section("2: relay offer", async () => {
    const made = await ok<{ state: string }>("POST", "/api/connections", {
      name: "stripe-shop",
      service: "stripe",
      account: "@shop",
      transport: "http",
      url: `http://127.0.0.1:${service.port}/mcp`,
      auth: "none",
      projects: [],
    });
    await delay(QUIET_MS);
    check(
      "2a: a Stripe connection signed in with no project wakes no one",
      made.state === "signed-in" && relayWakes.length === 0,
      `state ${made.state}; wakes ${relayWakes.length}`
    );
    await ok("PATCH", "/api/connections/stripe-shop", {
      projects: [projectId],
    });
    await until(
      "Caw woken to offer a relay",
      () => relayWakes.length,
      (count) => count > 0,
      120_000
    );
    await delay(QUIET_MS);
    const [words = ""] = relayWakes;
    check(
      "2b: granted to the project, it wakes Caw exactly once, naming relay_create and the stripe provider",
      relayWakes.length === 1 &&
        words.includes("stripe-shop") &&
        words.includes('relay_create({ provider: "stripe" })'),
      `wakes ${relayWakes.length}: ${words.slice(0, 400)}`
    );
    await ok("POST", "/api/connections", {
      name: "x-brand",
      service: "x",
      account: "@brand",
      transport: "http",
      url: `http://127.0.0.1:${service.port}/mcp`,
      auth: "none",
      projects: [projectId],
    });
    await delay(QUIET_MS);
    check(
      "2c: a polled service's connection, granted the same way, wakes no one",
      relayWakes.length === 1,
      `wakes ${relayWakes.length}`
    );
  });
} catch (error) {
  check(
    "the run",
    false,
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  );
} finally {
  if (failed) {
    const logs = (await readdir(fleet.sandbox))
      .filter((name) => name.endsWith(".log") || name.endsWith(".err"))
      .sort();
    for (const name of logs) {
      // biome-ignore lint/performance/noAwaitInLoops: one log at a time, in order
      const lines = (await Bun.file(join(fleet.sandbox, name)).text())
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-40);
      console.log(`── ${name}\n${lines.join("\n").slice(0, 8000)}`);
    }
  }
  await fleet.close();
  service.stop(true);
  await fleet.clean(keep || failed);
}

console.log(failed ? "FAILED" : "ALL PASS");
process.exit(failed ? 1 : 0);
