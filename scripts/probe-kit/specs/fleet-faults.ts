/**
 * A machine's "sync failed" names something that needs the owner, and each
 * fault in it is real and current. On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model):
 *
 * (a) A slow server reads connected. A stub http MCP whose `initialize`
 *     answers a harness after {@link SLOW_MS} (the hub's own probe at once,
 *     so the hub settles it) is reported `applied` by every harness that
 *     reports MCP state, and is no fault (dashboard fleet-faults.ts
 *     `machineFaults`). Unset, Claude Code's `MCP_TIMEOUT` failed an
 *     `initialize` of 25 s ("Request timed out"); every Claude Code CawCo
 *     starts now gets the fleet's window (agent mcp-status.ts
 *     `MCP_CONNECT_MS`), and OpenCode the same as its `startup`/`catalog`.
 * (b) A real failure still shows. A stub that never answers a harness's
 *     `initialize` is reported `failed` by Claude Code in its own words, read
 *     as `timed-out` (a machine with only such faults reads "sync slow").
 * (c) A server scoped to a platform the machine is not
 *     (`FleetMcpServer.platforms`) is neither installed (absent from
 *     `~/.claude.json`) nor reported; one scoped to the machine's own
 *     platform is installed and reported, here `failed` (`/bin/false` exits
 *     at once), so the scope narrows and does not hide.
 * (d) A project skill placed in a delegate workspace leaves with it. A
 *     project of the `code` template (starter skill `review-attempt`) and one
 *     delegate: its workspace holds `.claude/skills/review-attempt` and the
 *     machine's sidecar records it under that cwd. Archived
 *     (POST /api/workspaces/:id/archive), the place row is gone, the sidecar
 *     records nothing at that cwd, and the machine's report reads
 *     `review-attempt` failed nowhere.
 *
 *   bun scripts/probe-kit/run.ts fleet-faults
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  causeOf,
  machineFaults,
} from "../../../apps/dashboard/src/lib/cawco/fleet-faults";
import {
  CLAUDE_DIR_NAME,
  CLAUDE_JSON_LABEL,
  CLAUDE_JSON_NAME,
  projectClaudeRelative,
} from "../../../packages/core/src/claude-dirs";
import type { FleetSyncReport } from "../../../packages/core/src/fleet";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SLOW = "probe-slow";
const HUNG = "probe-hung";
const HERE = "probe-here";
const ELSEWHERE = "probe-elsewhere";
/** How long the slow stub keeps a harness's `initialize` waiting. */
const SLOW_MS = 25_000;
const TAG = "PROBE-FAULTS-DELEGATE";
const FINISH = "mcp__cawco__finish_item";

interface AgentRow {
  fleet?: FleetSyncReport;
  machineCapabilities?: { platform: string };
  machineId: string;
}

/** The stub MCP: `/slow` answers a harness after {@link SLOW_MS}, `/hung` never; the hub's probe at once. */
const stub = () => {
  const waited: { path: string; client: string; ms: number }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (request.method !== "POST") {
        return new Response(null, {
          status: request.method === "DELETE" ? 200 : 405,
        });
      }
      const message = (await request.json()) as {
        id?: number | string;
        method: string;
        params?: { clientInfo?: { name?: string } };
      };
      const rpc = (reply: object, init?: ResponseInit) =>
        Response.json({ jsonrpc: "2.0", id: message.id, ...reply }, init);
      if (message.method === "initialize") {
        const client = message.params?.clientInfo?.name ?? "";
        const hub = client === "CawCo fleet";
        const started = Date.now();
        if (!hub && pathname === "/hung") {
          waited.push({ path: pathname, client, ms: -1 });
          await new Promise<void>((done) =>
            request.signal.addEventListener("abort", () => done(), {
              once: true,
            })
          );
          return new Response(null, { status: 499 });
        }
        if (!hub) {
          await Bun.sleep(SLOW_MS);
          waited.push({ path: pathname, client, ms: Date.now() - started });
        }
        return rpc(
          {
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "probe-faults", version: "1" },
            },
          },
          { headers: { "Mcp-Session-Id": crypto.randomUUID() } }
        );
      }
      if (message.id === undefined) {
        return new Response(null, { status: 202 });
      }
      if (message.method === "tools/list") {
        return rpc({
          result: {
            tools: [
              {
                name: "probe_tool",
                description: "A stub tool.",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        });
      }
      return rpc({
        error: {
          code: -32_601,
          message: `Method not found: ${message.method}`,
        },
      });
    },
  });
  return { server, origin: `http://127.0.0.1:${server.port}`, waited };
};

const steps: { finish: boolean; searched: boolean } = {
  finish: false,
  searched: false,
};

/** The delegate calls finish_item; everything else answers in a word. */
const respond = (request: Seen): Reply => {
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!(request.tools && request.all.includes(TAG))) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (!steps.finish && request.toolNames.includes(FINISH)) {
    steps.finish = true;
    return tool(FINISH, {
      headline: "Nothing to change.",
      summary: "Nothing to change.",
    });
  }
  if (
    !(steps.finish || steps.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    steps.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return { everyMs: 5, words: ["done"] };
};

const spec: Spec = {
  name: "fleet-faults",
  run: async (kit) => {
    const { check } = kit;
    const upstream = stub();
    const fleet = await kit.fleet(respond);
    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      const hub = async <T>(method: string, path: string, body?: unknown) => {
        const response = await fetch(`${fleet.base}${path}`, {
          method,
          ...(body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }),
          signal: AbortSignal.timeout(60_000),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`${method} ${path}: ${response.status} ${text}`);
        }
        return (text ? JSON.parse(text) : undefined) as T;
      };
      const machine = async () =>
        (await fleet.api<AgentRow[]>("/api/agents")).find(
          (row) => row.machineId === MACHINE
        );
      /** The machine's report, once one made after `since` satisfies `done`. */
      const reportAfter = (
        what: string,
        since: number,
        done: (report: FleetSyncReport) => boolean,
        ms = 240_000
      ) =>
        until(
          what,
          async () => (await machine())?.fleet,
          (report) => report !== undefined && report.at > since && done(report),
          ms
        ).catch(async () => (await machine())?.fleet);
      const settled = (report: FleetSyncReport, name: string) =>
        report.mcp[name] !== undefined && report.mcp[name].state !== "pending";
      const readings = (report: FleetSyncReport | undefined, name: string) =>
        Object.entries(report?.mcpByHarness ?? {}).flatMap(([harness, rows]) =>
          rows?.[name] ? [{ harness, ...rows[name] }] : []
        );

      const platform = (await machine())?.machineCapabilities?.platform ?? "";
      const other = platform === "darwin" ? "linux" : "darwin";

      // (a) and (b): the slow server and the one that never answers.
      const t0 = Date.now();
      await hub("PUT", `/api/fleet/mcp/${SLOW}`, {
        config: { type: "http", url: `${upstream.origin}/slow` },
      });
      await hub("PUT", `/api/fleet/mcp/${HUNG}`, {
        config: { type: "http", url: `${upstream.origin}/hung` },
      });
      const both = await reportAfter(
        `${SLOW} and ${HUNG} settled in a report`,
        t0,
        (report) => settled(report, SLOW) && settled(report, HUNG)
      );
      // pi runs no MCP and says so of every server (`unsupported`): it is
      // judged by the faults below, which must not count it.
      const slow = readings(both, SLOW).filter((one) => one.harness !== "pi");
      const faults = both ? machineFaults(MACHINE, both) : [];
      check(
        `(a) ${SLOW}, ${SLOW_MS / 1000} s to answer a harness, is applied by Claude Code and OpenCode`,
        ["claude", "opencode"].every((harness) =>
          slow.some((one) => one.harness === harness)
        ) && slow.every((one) => one.state === "applied"),
        `${JSON.stringify(slow)}; stub waits: ${JSON.stringify(upstream.waited)}`
      );
      check(
        `(a) ${SLOW} is no fault on the machine`,
        !faults.some((fault) => fault.key === SLOW),
        JSON.stringify(faults)
      );
      const hung = readings(both, HUNG);
      check(
        `(b) ${HUNG}, never answering, is failed by Claude Code and OpenCode in their own words, each read as timed-out`,
        ["claude", "opencode"].every((harness) =>
          hung.some(
            (one) =>
              one.harness === harness &&
              one.state === "failed" &&
              causeOf(one.detail) === "timed-out"
          )
        ),
        JSON.stringify(hung)
      );
      check(
        `(b) every fault on the machine is ${HUNG}'s, each timed-out (pi's "unsupported" none), so its badge reads "sync slow"`,
        faults.length > 0 &&
          faults.every(
            (fault) => fault.key === HUNG && fault.cause === "timed-out"
          ),
        JSON.stringify(faults)
      );
      await hub("DELETE", `/api/fleet/mcp/${SLOW}`);
      await hub("DELETE", `/api/fleet/mcp/${HUNG}`);

      // (c) Scoped to a platform.
      const t1 = Date.now();
      await hub("PUT", `/api/fleet/mcp/${ELSEWHERE}`, {
        config: { command: `/nonexistent/${ELSEWHERE}` },
        platforms: [other],
      });
      await hub("PUT", `/api/fleet/mcp/${HERE}`, {
        config: { command: "/bin/false" },
        platforms: [platform],
      });
      const scoped = await reportAfter(
        `${HERE} settled in a report`,
        t1,
        (report) => settled(report, HERE)
      );
      const claudeJson = JSON.parse(
        await readFile(join(fleet.home, CLAUDE_JSON_NAME), "utf8").catch(
          () => "{}"
        )
      ) as { mcpServers?: Record<string, unknown> };
      check(
        `(c) ${ELSEWHERE}, scoped to ${other}, is not in ${platform}'s ${CLAUDE_JSON_LABEL} and not in its report`,
        claudeJson.mcpServers?.[ELSEWHERE] === undefined &&
          scoped?.mcp[ELSEWHERE] === undefined &&
          readings(scoped, ELSEWHERE).length === 0,
        `claude.json: ${Object.keys(claudeJson.mcpServers ?? {}).join(", ")}; report: ${JSON.stringify(scoped?.mcp[ELSEWHERE])}`
      );
      check(
        `(c) ${HERE}, scoped to ${platform}, is installed and reported failed, its command exiting at once`,
        claudeJson.mcpServers?.[HERE] !== undefined &&
          scoped?.mcp[HERE]?.state === "failed",
        `${JSON.stringify(scoped?.mcp[HERE])}`
      );
      await hub("DELETE", `/api/fleet/mcp/${ELSEWHERE}`);
      await hub("DELETE", `/api/fleet/mcp/${HERE}`);

      // (d) A skill placed in a delegate workspace leaves with it.
      const src = join(fleet.sandbox, "src");
      await mkdir(src, { recursive: true });
      await writeFile(
        join(fleet.home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      await Bun.$`sh -c ${"git init -q -b main && echo faults > README.md && git add -A && git commit -qm 'First commit'"}`
        .cwd(src)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Faults",
        machineId: MACHINE,
        cwd: src,
      });
      fleet.write(
        "UPDATE projects SET template = 'code' WHERE id = ?",
        project.id
      );
      const parent = await fleet.spawn("claude", "Parent", src, {
        projectId: project.id,
      });
      const started = await fleet.api<{
        instanceId: string;
        workItemId: string;
        workspaceId: string;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title: "End at once",
        prompt: `${TAG}: call finish_item.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
      });
      const workspace = fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        started.workspaceId
      )[0] as { path: string };
      // The parent's preview of its server holds the workspace once its work
      // lands (hub work-items.ts `settle`), so it stands until the archive.
      const now = Date.now();
      fleet.write(
        "INSERT INTO artifacts (id, instance_id, project_id, kind, name, machine_id, source_port, source_workspace, revision, seq, delivered_seq, created_at, updated_at, shown_at) VALUES (?, ?, ?, 'preview', 'faults-preview', ?, 5199, ?, 1, 0, 0, ?, ?, ?)",
        crypto.randomUUID(),
        parent,
        project.id,
        MACHINE,
        started.workspaceId,
        now,
        now,
        now
      );
      await until(
        "the delegate's item ended",
        () =>
          fleet.query<{ state: string }>(
            "SELECT state FROM work_items WHERE id = ?",
            started.workItemId
          )[0]?.state,
        (state) => ["done", "failed", "cancelled"].includes(state ?? ""),
        300_000
      );
      const sidecar = async () =>
        JSON.parse(
          await readFile(
            join(fleet.home, CLAUDE_DIR_NAME, "cawco-fleet.json"),
            "utf8"
          ).catch(() => "{}")
        ) as {
          placedSkills?: Record<string, { cwd: string; name: string }>;
        };
      const atWorkspace = async () =>
        Object.values((await sidecar()).placedSkills ?? {}).filter(
          (record) =>
            record.cwd === workspace.path && record.name === "review-attempt"
        );
      await until(
        "review-attempt placed in the workspace",
        atWorkspace,
        (records) => records.length === 1,
        120_000
      ).catch(atWorkspace);
      check(
        "(d) review-attempt is placed in the delegate's workspace and the sidecar records it at that cwd",
        existsSync(
          join(
            workspace.path,
            projectClaudeRelative("skills", "review-attempt")
          )
        ) && (await atWorkspace()).length === 1,
        `${workspace.path}: ${JSON.stringify((await sidecar()).placedSkills)}`
      );
      const t2 = Date.now();
      const archived = await hub<{ state: string }>(
        "POST",
        `/api/workspaces/${started.workspaceId}/archive`,
        {}
      );
      const after = await reportAfter(
        "a report after the archive",
        t2,
        (report) => report.skills?.["review-attempt"] !== undefined
      );
      const left = await until(
        "the sidecar dropping the workspace's copy",
        atWorkspace,
        (records) => records.length === 0,
        60_000
      ).catch(atWorkspace);
      const places = fleet.query<{ id: string }>(
        "SELECT id FROM project_places WHERE path = ?",
        workspace.path
      );
      check(
        "(d) archived, the workspace's place row is gone and the sidecar records nothing at its cwd",
        archived.state === "archived" &&
          places.length === 0 &&
          left.length === 0,
        `state ${archived.state}; places ${JSON.stringify(places)}; sidecar ${JSON.stringify(left)}`
      );
      check(
        "(d) the machine's report reads review-attempt failed nowhere",
        after?.skills?.["review-attempt"]?.state !== "failed",
        JSON.stringify(after?.skills?.["review-attempt"])
      );
    } finally {
      await upstream.server.stop(true);
    }
  },
};

export default spec;
