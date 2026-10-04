/** Real clients against the production MCP endpoint and work-item engine on a scratch hub. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const scratch = process.env.PROOF_DIR ?? join(root, ".context/mcp-restart/runtime", crypto.randomUUID());
// Captured from bae338b4's stateful endpoint before its scratch-hub restart.
const preRestartSessionId = "2647fded-85b7-441f-a3d9-619c42436583.kM6Oh8tCOeciairCBeRoD4Z7elbcZkHje25i-cGxfvI";
const actorId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const credential = createHash("sha256").update(scratch).digest("base64url");
const baseline = process.argv.includes("--baseline");

async function serve() {
  const [{ Effect }, { Db, DbLayer }, { createDelegationMcp }, { createWorkItems }, { createSessionIdentities }] = await Promise.all([
    import("../../packages/hub/node_modules/effect/dist/index.js"),
    import("../../packages/hub/src/db/index.ts"),
    import(process.env.PROOF_OLD_MCP ?? "../../packages/hub/src/delegation-mcp.ts"),
    import("../../packages/hub/src/work-items.ts"),
    import("../../packages/hub/src/session-identity.ts"),
  ]);
  const db = Effect.runSync(Effect.provide(Db, DbLayer));
  db.upsertAgent({ machineId: "proof-machine", hostname: "scratch", os: "linux", auth: "authenticated" });
  for (const id of [parentId, actorId]) {
    if (!db.getInstancesByIds([id])[0]) {
      db.openInstance({ id, machineId: "proof-machine", cwd: scratch, kind: "main", harness: "claude", permissionMode: "bypassPermissions", sessionId: `proof-${id}`, ...(id === actorId ? { parentInstanceId: parentId, canDelegate: false } : {}) });
    }
  }
  db.stageSessionIdentity(actorId, createHash("sha256").update(credential).digest("hex"));
  const identities = createSessionIdentities(db);
  let checksRun = 0;
  let calls = 0;
  let lists = 0;
  let initializes = 0;
  let gets = 0;
  const work = createWorkItems({
    db,
    call: async () => 1,
    command: async (_machine, cwd, command) => {
      if (command.startsWith("echo ")) checksRun += 1;
      const child = Bun.spawn(["bash", "-c", command], { cwd, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { stdout, stderr, exitCode };
    },
    publish: () => undefined,
    report: () => undefined,
    send: () => ({ reason: null, state: "pending" }),
    spawn: () => { throw new Error("Proof must reuse its seeded session"); },
    types: () => [],
  });
  const mcp = createDelegationMcp({
    instances: () => db.listInstances(),
    instanceById: (id) => db.getInstancesByIds([id])[0],
    ...(process.env.PROOF_OLD_MCP ? { checked: (row: { workItemId: string | null }) => !!(row.workItemId && db.workItem(row.workItemId)?.checks) } : {}),
    credentialActor: (authorization) => {
      const identity = identities.resolve(authorization);
      return identity ? db.getInstancesByIds([identity.instanceId])[0] : undefined;
    },
    forward: async () => undefined,
  });
  Bun.serve({
    hostname: "127.0.0.1", port: Number(process.env.PROOF_PORT), idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      try {
        if (url.pathname === "/health") return Response.json({ ready: true });
        if (url.pathname === "/stats") return Response.json({ calls, lists, initializes, gets, checksRun, title: db.getInstancesByIds([actorId])[0]?.title });
        if (url.pathname === "/mcp/cawco") {
          if (request.method === "GET") gets += 1;
          const body = request.method === "POST" ? await request.json() : undefined;
          if (body?.method === "tools/call") calls += 1;
          if (body?.method === "tools/list") lists += 1;
          if (body?.method === "initialize") initializes += 1;
          return await mcp.handle(request, body);
        }
        if (url.pathname.endsWith("/title")) {
          const { title } = await request.json();
          db.nameInstance(actorId, title, "agent");
          return Response.json({ ok: true });
        }
        if (url.pathname === "/api/work-items/finish") {
          const { instanceId, ...submission } = await request.json();
          return Response.json({ text: await work.finishItem(instanceId, submission) });
        }
        if (url.pathname === "/proof/item") {
          if (!db.workspacesNamed(workspaceId).length) db.createWorkspace({ id: workspaceId, machineId: "proof-machine", repoRoot: root, path: scratch, branch: "proof", base: "main", state: "active", createdByInstanceId: parentId });
          const item = db.createWorkItem({ id: crypto.randomUUID(), workspaceId, instanceId: actorId, parentInstanceId: parentId, title: "Check scratch MCP lifecycle", brief: "proof", harness: "claude", state: "running" });
          db.patchInstance(actorId, { workItemId: item.id });
          return Response.json({ id: item.id });
        }
        if (url.pathname === "/proof/checks") return Response.json({ text: work.setChecks(actorId, parentId, [{ name: "Scratch command passes", command: "echo PROOF_CHECK", expect: "PROOF_CHECK" }]) });
        if (url.pathname === "/proof/follow-up") return Response.json(await work.start({ parentInstanceId: parentId, workspace: workspaceId, title: "Check follow up lifecycle", prompt: "proof follow-up", checks: [{ name: "Follow up passes", command: "echo FOLLOW_UP", expect: "FOLLOW_UP" }] }));
        return new Response("Not found", { status: 404 });
      } catch (error) { return new Response(String(error), { status: 409 }); }
    },
  });
  console.log("READY");
}

async function run() {
  await mkdir(scratch, { recursive: true });
  const port = Number(process.env.PROOF_PORT ?? 18971);
  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/mcp/cawco?instanceId=${actorId}`;
  const env = { ...process.env, PROOF_DIR: scratch, CAWCO_DB_PATH: join(scratch, baseline ? "baseline.db" : "proof.db"), CAWCO_SESSIOND_ENDPOINT: join(scratch, "sessiond.sock"), CAWCO_HUB_URL: `${base}/ws`, PROOF_PORT: String(port) };
  let hub: ReturnType<typeof Bun.spawn> | undefined;
  const start = async () => {
    hub = Bun.spawn([process.execPath, import.meta.path, "--hub"], { cwd: root, env, stdout: "pipe", stderr: Bun.file(join(scratch, "hub.log")) });
    const reader = hub.stdout.getReader();
    const deadline = AbortSignal.timeout(30_000);
    while (!deadline.aborted) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`Scratch hub exited; read ${scratch}/hub.log`);
      if (new TextDecoder().decode(value).includes("READY")) { reader.releaseLock(); return; }
    }
    throw new Error("Scratch hub did not start");
  };
  const restart = async () => { hub?.kill("SIGKILL"); await hub?.exited; await start(); };
  const stats = async () => await (await fetch(`${base}/stats`)).json();
  const post = async (path: string) => {
    const response = await fetch(`${base}${path}`, { method: "POST" });
    assert(response.ok, await response.text());
  };
  const raw = async (body: object, id?: string) => {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${credential}`, accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18", ...(id ? { "mcp-session-id": id } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", ...body }) });
    const text = await response.text();
    return { response, text };
  };
  let claude: { close: () => void } | undefined;
  let opencode: ReturnType<typeof Bun.spawn> | undefined;
  let client: { close: () => Promise<void> } | undefined;
  try {
    await start();
    const initial = await raw({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pre-restart", version: "1" } } });
    const oldId = initial.response.headers.get("mcp-session-id");
    if (baseline && oldId) await writeFile(join(scratch, "old-session-id.txt"), oldId);
    const { query } = await import("../../packages/agent/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs");
    const { InputStream } = await import("../../packages/agent/src/harnesses/claude.ts");
    const input = new InputStream();
    let turn = Promise.withResolvers<void>();
    const queryHandle = query({ prompt: input, options: { cwd: scratch, model: process.env.PROOF_CLAUDE_MODEL ?? "haiku", persistSession: false, permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, maxTurns: 2, tools: [], mcpServers: { cawco: { type: "http", url, headers: { Authorization: `Bearer ${credential}` } } } } });
    claude = queryHandle;
    const pumping = (async () => {
      for await (const message of queryHandle) {
        if (message.type === "result") {
          if (message.is_error) turn.reject(new Error(JSON.stringify(message)));
          else turn.resolve();
        }
      }
    })();
    const ask = async (title: string) => {
      turn = Promise.withResolvers<void>();
      input.push({ type: "user", message: { role: "user", content: `Call mcp__cawco__set_title exactly once with title "${title}". Do not call any other tools. Then say done.` }, parent_tool_use_id: null } as never);
      let timer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([turn.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Claude turn timed out")), 120_000); })]);
      } finally { clearTimeout(timer!); }
    };
    await ask("Check MCP before restart");
    assert.equal((await stats()).calls, 1, "Claude must execute the actual MCP tool");
    assert.equal((await stats()).title, "Check MCP before restart");
    await restart();
    await ask("Check MCP after restart");
    const after = await stats();
    assert.equal(after.calls, 1, "The same Claude Query must execute after hub restart");
    assert.equal(after.title, "Check MCP after restart");
    assert.equal(after.initializes, 0, "No client initialization/reconnect after restart");
    console.log(`(a) ${baseline ? "OLD" : "PASS"}: same Claude Query called CawCo before/after restart; post-restart initialize=${after.initializes}`);
    queryHandle.close();
    await pumping.catch(() => undefined);
    claude = undefined;
    if (baseline) { console.log("BASELINE_COMPLETE"); return; }

    const stale = await raw({ id: 2, method: "tools/call", params: { name: "set_title", arguments: { title: "Check retained MCP session" } } }, preRestartSessionId);
    assert.equal(stale.response.status, 200, stale.text);
    assert(!stale.text.includes('"isError":true'), stale.text);
    console.log("(b) PASS: pre-deploy Mcp-Session-Id accepted without initialization");

    const ocPort = port + 1;
    const ocConfig = join(scratch, "opencode-config");
    await mkdir(ocConfig, { recursive: true });
    const ocData = join(scratch, "opencode-data");
    await mkdir(join(ocData, "opencode"), { recursive: true });
    await writeFile(join(ocData, "opencode/auth.json"), await readFile(join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "opencode/auth.json")), { mode: 0o600 });
    opencode = Bun.spawn(["opencode", "serve", "--hostname=127.0.0.1", `--port=${ocPort}`], { cwd: scratch, env: { ...process.env, XDG_CONFIG_HOME: ocConfig, XDG_DATA_HOME: ocData, XDG_STATE_HOME: join(scratch, "opencode-state"), OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: "allow", mcp: { cawco: { type: "remote", url, headers: { Authorization: `Bearer ${credential}` }, oauth: false } } }) }, stdout: Bun.file(join(scratch, "opencode.log")), stderr: Bun.file(join(scratch, "opencode-error.log")) });
    await Bun.$`curl --silent --fail --retry 30 --retry-connrefused --retry-delay 1 ${`http://127.0.0.1:${ocPort}/global/health`}`.quiet();
    const { createOpencodeClient } = await import("../../packages/agent/node_modules/@opencode-ai/sdk/dist/v2/index.js");
    const oc = createOpencodeClient({ baseUrl: `http://127.0.0.1:${ocPort}` });
    const created = await oc.session.create({ directory: scratch });
    assert(created.data?.id, JSON.stringify(created.error));
    const ocAsk = async (title: string) => {
      const result = await oc.session.prompt({ sessionID: created.data!.id, directory: scratch, model: { providerID: "openai", modelID: process.env.PROOF_OPENCODE_MODEL ?? "gpt-6.1-sol" }, parts: [{ type: "text", text: `Call cawco_set_title exactly once with title "${title}". Do not call any other tool. Then say done.` }] });
      assert(!result.error, JSON.stringify(result.error));
    };
    const beforeOc = (await stats()).calls;
    await ocAsk("Check OpenCode before restart");
    assert.equal((await stats()).calls, beforeOc + 1);
    assert.equal((await stats()).title, "Check OpenCode before restart");
    await restart();
    await ocAsk("Check OpenCode after restart");
    assert.equal((await stats()).calls, 1);
    assert.equal((await stats()).title, "Check OpenCode after restart");
    console.log("(c) PASS: same OpenCode server/session called CawCo before/after restart");

    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
      import("../../packages/hub/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js"),
      import("../../packages/hub/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js"),
    ]);
    const delegate = new Client({ name: "delegate-fixed-tools", version: "1" });
    client = delegate;
    await delegate.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${credential}` } } }));
    const discovered = await delegate.listTools();
    assert(discovered.tools.some((tool) => tool.name === "finish_item"), "Delegate lists finish_item before an item/checks exist");
    const noItem = await delegate.callTool({ name: "finish_item", arguments: { summary: "No open item" } });
    assert(JSON.stringify(noItem).includes("No work item is open on this session."), JSON.stringify(noItem));
    await post("/proof/item");
    const refusal = await delegate.callTool({ name: "finish_item", arguments: { summary: "No checks" } });
    assert(JSON.stringify(refusal).includes("This item has no acceptance checks yet; your parent sets them with set_item_checks."), JSON.stringify(refusal));
    await post("/proof/checks");
    const finished = await delegate.callTool({ name: "finish_item", arguments: { summary: "Checks now run" } });
    assert(JSON.stringify(finished).includes("All 1 checks passed."), JSON.stringify(finished));
    assert.equal((await stats()).checksRun, 1);
    console.log("(d) PASS: same cached tool set refuses absent checks, then runs parent-set checks");
    await post("/proof/follow-up");
    const followed = await delegate.callTool({ name: "finish_item", arguments: { summary: "Follow-up checks run" } });
    assert(JSON.stringify(followed).includes("All 1 checks passed."), JSON.stringify(followed));
    assert.equal((await stats()).checksRun, 2);
    assert.equal((await stats()).lists, 1, "No tools/list re-read for d/e");
    console.log("(e) PASS: follow-up item in same workspace finished with cached tool set");
    console.log("PASS");
  } finally {
    claude?.close();
    await client?.close();
    opencode?.kill("SIGTERM");
    await opencode?.exited;
    if (opencode) await unlink(join(scratch, "opencode-data/opencode/auth.json"));
    hub?.kill("SIGKILL");
    await hub?.exited;
  }
}

if (process.argv.includes("--hub")) await serve();
else await run();
