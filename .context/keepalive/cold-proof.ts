import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { stack } from "./restart-proof";
import { withPromptWrites } from "../../packages/agent/src/prompt-writes";
import { writeAtomic, writeSkill, writeVendoredMarketplace } from "../../packages/agent/src/fleet";
import { workflowSkill } from "../../packages/hub/src/workflows/skills";

const root = Bun.fileURLToPath(new URL("./cold-files/", import.meta.url));
await mkdir(root, { recursive: true });
const until = (at: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, at - Date.now())));
const payload = (name: string) => ({ name, hash: "private-content", files: [{ path: "SKILL.md", contentBase64: Buffer.from(`---\nname: ${name}\ndescription: private fixture\n---\n`).toString("base64"), executable: false }] });
const records: unknown[] = [];
const writes: [string, () => Promise<unknown>][] = [
  ["skills", () => writeSkill(payload("private-skill"), `${root}/skills`)],
  ["plugins", () => writeVendoredMarketplace([{ ...payload("private-plugin"), marketplace: "private" }], `${root}/plugins`)],
  ["user CLAUDE.md", () => writeAtomic(`${root}/CLAUDE.md`, "private instructions", "user CLAUDE.md")],
  ["memory docs", () => writeAtomic(`${root}/memories/model.md`, "private model instructions", "memory doc model.md")],
  ["MCP servers", () => writeAtomic(`${root}/claude.json`, JSON.stringify({ mcpServers: {} }), "MCP servers")],
  ["hooks", () => writeAtomic(`${root}/hook.sh`, "#!/bin/sh\nexit 0\n", "hook private")],
  ["hook registration", () => writeAtomic(`${root}/settings.json`, JSON.stringify({ hooks: {} }), "hooks registration")],
  ["model memory hook", () => writeAtomic(`${root}/model-memory.sh`, "#!/bin/sh\nexit 0\n", "model memory hook")],
  ["agent definitions", () => writeAtomic(`${root}/agents/private.md`, "private agent definition", "agent definitions")],
];
for (const [kind, write] of writes) {
  const due = Date.now() + 2_000;
  const s = await stack(`cold-${kind}`, due);
  try {
    await s.start();
    await s.arm();
    await withPromptWrites(notice => s.emit({ kind: "cache_invalidated", reason: notice.reason, at: notice.at }), write);
    const row = await s.row();
    assert.equal(row.keepAlive.state, "cold");
    assert.ok(row.keepAlive.cold.reason.startsWith("prompt changed:"));
    await until(due + 100);
    assert.equal(s.sends.length, 0);
    records.push({ kind, cold: row.keepAlive.cold, sends: s.sends.length });
    console.log(`PASS ${kind} write makes warm cache cold; no due ping`);
  } finally { await s.stop(); }
}
{
  const due = Date.now() + 2_000;
  const s = await stack("hidden-workflow", due);
  try {
    await s.start(); await s.arm();
    await withPromptWrites(notice => s.emit({ kind: "cache_invalidated", reason: notice.reason, at: notice.at }), () => writeSkill(workflowSkill({ id: "private-workflow", name: "Private workflow", slug: "private-workflow" }, []), `${root}/skills`));
    assert.equal((await s.row()).keepAlive.state, "waiting");
    await s.waitSend();
    assert.equal(s.sends.length, 1);
    console.log("PASS saved workflow stub does not change Claude prompt since d15e919d");
  } finally { await s.stop(); }
}
{
  const due = Date.now() + 2_000;
  const s = await stack("backstop", due);
  try {
    await s.start(); await s.arm();
    await s.waitSend();
    s.emit({ kind: "frame", instanceId: s.id, harness: "claude", message: { type: "result", uuid: crypto.randomUUID(), is_error: false, subtype: "success", keepAlive: true, lastRequestAt: Date.now(), usage: { input_tokens: 2 }, cache: { read: 26234, write: 40941, write1h: 40941, write5m: 0 }, result: "ok" } });
    const row = await s.row();
    assert.equal(row.keepAlive.state, "cold");
    assert.equal(row.keepAlive.cold.reason, "ping read 39%");
    assert.deepEqual({ input: row.keepAlive.lastPingUsage.input, read: row.keepAlive.lastPingUsage.read, write: row.keepAlive.lastPingUsage.write }, { input: 67177, read: 26234, write: 40941 });
    await until(Date.now() + 100);
    assert.equal(s.sends.length, 1);
    console.log("PASS below-90% backstop stores counts and prevents a second rebuild");
    const nextDue = Date.now() + 1_000;
    s.emit({ kind: "frame", instanceId: s.id, harness: "claude", message: { type: "result", uuid: crypto.randomUUID(), is_error: false, subtype: "success", cacheReusable: true, lastRequestAt: nextDue - 240_000, cache: { read: 9900, write: 100, write5m: 100, write1h: 0 }, usage: { input_tokens: 0 }, result: "real turn" } });
    assert.equal((await s.row()).keepAlive.state, "waiting");
    await until(nextDue + 300);
    assert.equal(s.sends.length, 2);
    console.log("PASS cold cache can ping again after a completed real turn");
  } finally { await s.stop(); }
}
await Bun.write(new URL("./cold-private-proof.json", import.meta.url), JSON.stringify(records, null, 2));
