/**
 * Probe: the project lead's tools that write for the person, on a scratch
 * fleet (real hub, agent and sessiond on loopback; the project's Caw a real
 * Claude Code session against a mock model that makes each tool call a
 * thread asks it for), so every call goes through the hub's MCP bridge as
 * the lead.
 *
 * 1. Decision graph (Projects spec §5.8: "Caw edits the file or calls
 *    `decision_add`, `decision_link`, `decision_group`"): Caw puts two cards
 *    of a built decision page on the graph, links them and groups them; the
 *    hub's `GET /api/projects/{id}/decisions/graph` answers the two cards
 *    (named by their questions, on one row), the edge and the group, each
 *    change a commit as Caw; a link to a card not on the graph is refused.
 * 2. Delegate type (§5.1: "Caw can propose a new type as a file diff you
 *    approve"): Caw's `folder_write` of `delegates/writer.md` commits
 *    nothing; it is the person's ask, drawn as the file's diff ("Add
 *    delegates/writer.md") in his thread. Approved, it is committed as the
 *    person and the project's catalog (`GET /api/projects/{id}/delegate-types`,
 *    the types its sessions see) lists `writer`. A second type,
 *    `delegates/editor.md`, declined: no commit touches it and the catalog
 *    has no `editor`. A file that makes no type is refused with why, and
 *    parks nothing.
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
const { MACHINE, scratchFleet, until } = await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const LOGGED = /caw|decisions|lead|boundary|error/i;

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
const COMMAND = /PROBE-CALL:(\d+)/g;
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
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

/** A built decision page with two cards, as the decision-page kit draws them. */
const PAGE = `<!doctype html><html><head><title>Launch</title></head><body>
<section class="dp-hero"><h1>Launch</h1></section>
<article class="dp-card"><h2>Which stack?</h2><p class="dp-why">It sets the rest.</p>
<div data-cawco-choice="stack" role="group">
<button data-option="svelte"><b>SvelteKit</b><span>Ours already.</span></button>
<button data-option="astro"><b>Astro</b><span>Content first.</span></button>
</div></article>
<article class="dp-card"><h2>Where does it run?</h2>
<div data-cawco-choice="host" role="group">
<button data-option="hub"><b>The hub</b><span>Nothing new.</span></button>
<button data-option="edge"><b>An edge host</b><span>Closer to readers.</span></button>
</div></article>
</body></html>
`;

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

  // ── 1: the decision graph, drawn by Caw's tools ───────────────────────────
  await section("1: decision graph", async () => {
    await ok("PUT", `/api/projects/${projectId}/folder/file`, {
      path: "decisions/launch/index.html",
      content: PAGE,
    });
    const added = await cawCalls(projectId, "decision_add", {
      cards: [
        { page: "launch", card: "stack" },
        { page: "launch", card: "host" },
      ],
    });
    const linked = await cawCalls(projectId, "decision_link", {
      edges: [{ from: "stack", to: "host" }],
    });
    const grouped = await cawCalls(projectId, "decision_group", {
      name: "Build",
      cards: ["stack", "host"],
    });
    const graph = await ok<{
      cards: { id: string; name: string; page: string; x: number; y: number }[];
      edges: [string, string][];
      groups: { cards: string[]; id: string; name: string }[];
    }>("GET", `/api/projects/${projectId}/decisions/graph`).catch(
      (error: unknown) => {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; Caw heard ${JSON.stringify([added, linked, grouped])}`
        );
      }
    );
    const stack = graph.cards.find((card) => card.id === "stack");
    const host = graph.cards.find((card) => card.id === "host");
    check(
      "1a: decision_add puts both cards on the graph, named by their questions, on one row",
      graph.cards.length === 2 &&
        stack?.name === "Which stack?" &&
        host?.name === "Where does it run?" &&
        stack.page === "launch" &&
        stack.y === host.y &&
        stack.x !== host.x,
      `cards ${JSON.stringify(graph.cards)}; Caw heard ${added.slice(0, 200)}`
    );
    check(
      "1b: decision_link draws stack → host",
      JSON.stringify(graph.edges) === JSON.stringify([["stack", "host"]]),
      `edges ${JSON.stringify(graph.edges)}; Caw heard ${linked.slice(0, 200)}`
    );
    check(
      "1c: decision_group frames both as Build",
      JSON.stringify(graph.groups) ===
        JSON.stringify([
          { id: "build", name: "Build", cards: ["stack", "host"] },
        ]),
      `groups ${JSON.stringify(graph.groups)}; Caw heard ${grouped.slice(0, 200)}`
    );
    const history = await ok<{
      commits: { author: string; subject: string }[];
    }>(
      "GET",
      `/api/projects/${projectId}/folder/history?path=decisions/decisions.json`
    );
    check(
      "1d: each change is a commit as Caw",
      history.commits.length === 3 &&
        history.commits.every((commit) => commit.author === "Caw"),
      JSON.stringify(
        history.commits.map((commit) => [commit.author, commit.subject])
      )
    );
    const unknown = await cawCalls(projectId, "decision_link", {
      edges: [{ from: "stack", to: "budget" }],
    });
    check(
      "1e: a link to a card not on the graph is refused, saying so",
      unknown.includes("budget is not on the graph"),
      unknown.slice(0, 200)
    );
  });

  // ── 2: a delegate type, proposed by Caw and approved or declined ─────────
  await section("2: delegate type proposal", async () => {
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
      "2a: a file that makes no type is refused with why, and parks nothing",
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
      "2b: Caw's folder_write of delegates/writer.md parks a proposal in his thread and commits nothing",
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
      "2c: approved, writer is committed as the person and the project's catalog lists it",
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
      "2d: declined, nothing is committed to delegates/editor.md and the catalog has no editor",
      declined.length === 0 && !after.some((type) => type.name === "editor"),
      `commits ${JSON.stringify(declined)}; catalog ${JSON.stringify(after.map((type) => type.name))}`
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
  await fleet.clean(keep || failed);
}

console.log(failed ? "FAILED" : "ALL PASS");
process.exit(failed ? 1 : 0);
