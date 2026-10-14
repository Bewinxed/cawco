/**
 * A connector poll's write never overwrites an edit made while its call was
 * out (ingress.ts `pollConnector`).
 *
 * A scratch fleet's hub alone, and a `feed` connection: a stdio MCP stub
 * with one read-only tool, `list_items`, answering the items in a file of
 * the sandbox, slowly while a `slow` file is there, each call logged. Each
 * item carries two keyings: `id`/`version` and `uid`/`rev`.
 *
 * (a) The poll's first call only looks: it keeps 3 items seen, no events.
 * (b) A slow call goes out; while it is out the owner moves the poll to
 *     `uid`/`rev` (which resets what it saw). The call's answer is dropped:
 *     the poll still has nothing seen when the call returns.
 * (c) The next call, on the new keying, is a first look: no inbound events.
 * (d) One item's `rev` changes: the call after ingests exactly that one.
 *
 *   bun scripts/probe-kit/run.ts connector-poll-edit
 */
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The stub's answer delay while `slow` is there: long enough to edit under. */
const SLOW_MS = 4000;

const STUB = `
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const [, , items, slow, log] = process.argv;
let buffer = "";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf("\\n"); at >= 0; at = buffer.indexOf("\\n")) {
    const line = buffer.slice(0, at);
    buffer = buffer.slice(at + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "feed-stub", version: "1" } } });
    } else if (m.method === "tools/list") {
      send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "list_items", description: "The feed's items.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }] } });
    } else if (m.method === "tools/call") {
      const answer = readFileSync(items, "utf8");
      const delay = existsSync(slow) ? ${SLOW_MS} : 0;
      appendFileSync(log, JSON.stringify({ at: Date.now(), delay }) + "\\n");
      setTimeout(() => send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: answer }] } }), delay);
    } else if (m.id !== undefined) {
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    }
  }
});
`;

interface Item {
  id: string;
  rev: string;
  uid: string;
  version: string;
}

const ITEMS: Item[] = [1, 2, 3].map((n) => ({
  id: `i${n}`,
  version: `v${n}`,
  uid: `u${n}`,
  rev: `r${n}`,
}));

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("hub");
    await fleet.hubUp();

    const http = async (method: string, path: string, body?: object) => {
      const response = await fetch(`${fleet.base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, text: await response.text() };
    };

    const stub = join(fleet.sandbox, "feed-stub.cjs");
    const items = join(fleet.sandbox, "feed-items.json");
    const slow = join(fleet.sandbox, "feed-slow");
    const calls = join(fleet.sandbox, "feed-calls.log");
    await writeFile(stub, STUB);
    await writeFile(items, JSON.stringify({ items: ITEMS }));
    await writeFile(calls, "");
    const callCount = async () =>
      (await Bun.file(calls).text()).split("\n").filter(Boolean).length;

    const conn = await http("POST", "/api/connections", {
      name: "feed",
      service: "Feed",
      account: "probe",
      transport: "stdio",
      command: process.execPath,
      args: [stub, items, slow, calls],
      auth: "none",
    });
    const made = await fleet.api<{ id?: string; project?: { id: string } }>(
      "/api/projects",
      { name: "Poll probe", caw: false }
    );
    const projectId = made.project?.id ?? made.id ?? "";
    const created = await http("POST", "/api/connector-polls", {
      projectId,
      connection: "feed",
      tool: "list_items",
      intervalS: 3600,
      itemsPath: "items",
      idPath: "id",
      versionPath: "version",
    });
    const pollId = (JSON.parse(created.text) as { id?: string }).id ?? "";
    kit.check(
      "setup: the feed connection, a project and its poll are made",
      conn.status === 200 && created.status === 200 && pollId !== "",
      `${conn.status} ${conn.text.slice(0, 120)} / ${created.status} ${created.text.slice(0, 200)}`
    );

    const row = () =>
      fleet.query<{
        id_path: string;
        polled_at: number | null;
        reason: string | null;
        seen: string | null;
      }>(
        "SELECT seen, id_path, polled_at, reason FROM connector_polls WHERE id = ?",
        pollId
      )[0];
    const events = () =>
      fleet.query<{ delivery_key: string }>(
        "SELECT delivery_key FROM inbound_events WHERE source = 'conn:feed:list_items'"
      );
    const seenCount = () => {
      const seen = row()?.seen;
      return seen ? Object.keys(JSON.parse(seen) as object).length : null;
    };

    // (a) the first call only looks. The pollers' clock calls it at once
    // (never polled); "poll now" joins that call or makes it.
    await http("POST", `/api/connector-polls/${pollId}/poll`);
    kit.check(
      "a: the first call only looks: 3 items seen, no inbound events",
      seenCount() === 3 && events().length === 0,
      `seen ${seenCount()}, events ${events().length}, reason ${row()?.reason}`
    );

    // (b) a slow call, edited under
    await writeFile(slow, "");
    const before = await callCount();
    const call = http("POST", `/api/connector-polls/${pollId}/poll`);
    await until(
      "b: the slow call reaches the stub",
      callCount,
      (n) => n > before,
      10_000
    );
    const edit = await http("PATCH", `/api/connector-polls/${pollId}`, {
      intervalS: 3600,
      idPath: "uid",
      versionPath: "rev",
    });
    const editedSeen = seenCount();
    const answered = await call;
    await rm(slow);
    const after = row();
    kit.check(
      "b: an edit lands while the call is out (paths moved, seen reset)",
      edit.status === 200 && editedSeen === null,
      `${edit.status} ${edit.text.slice(0, 200)}; seen right after the edit ${editedSeen}`
    );
    kit.check(
      "b: the call's answer is dropped: the poll keeps the edit, nothing seen",
      answered.status === 200 &&
        after?.id_path === "uid" &&
        after.seen === null,
      `poll answered ${answered.status}; id_path ${after?.id_path}; seen ${after?.seen}`
    );

    // (c) the next call is a first look on the new keying
    await http("POST", `/api/connector-polls/${pollId}/poll`);
    kit.check(
      "c: the next call ingests no duplicates: 0 inbound events, 3 seen by uid",
      events().length === 0 &&
        seenCount() === 3 &&
        Object.keys(JSON.parse(row()?.seen ?? "{}") as object).every((key) =>
          key.startsWith("u")
        ),
      `events ${events().length} (${events()
        .map((one) => one.delivery_key)
        .join(", ")}); seen ${row()?.seen}`
    );

    // (d) a real change still lands, once
    await writeFile(
      items,
      JSON.stringify({
        items: ITEMS.map((one) =>
          one.uid === "u2" ? { ...one, rev: "r2-next" } : one
        ),
      })
    );
    await http("POST", `/api/connector-polls/${pollId}/poll`);
    const landed = events().map((one) => one.delivery_key);
    kit.check(
      "d: one changed item is ingested once",
      landed.length === 1 && landed[0] === "u2:r2-next",
      landed.join(", ") || "none"
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "connector-poll-edit", run } satisfies Spec;
