import assert from "node:assert/strict";

interface Instance {
  id: string;
  cwd: string;
  title: string | null;
  derivedTitle: string | null;
  updatedAt: string;
  lastRequestAt: string;
  keepAlive: {
    on: boolean;
    state: string;
    ttl: string | null;
    nextAt: number | null;
    sent: number;
  };
}

interface Frame {
  kind: string;
  keepAlive?: boolean;
  record?: {
    uuid: string;
    keepAlive?: boolean;
    body: { origin: { kind: string; name?: string } };
  };
  message?: {
    type: string;
    keepAlive?: boolean;
    is_error?: boolean;
    result?: string;
    usage?: { input_tokens: number };
    cache?: { read: number; write: number };
  };
}

interface Evidence {
  deployedCommit: string;
  probe: {
    id: string;
    directory: string;
    directoryFieldBeforeStart: string;
    startedFromNewSessionModal: boolean;
    archived: boolean;
  };
  baseline: Instance;
  beforePing: { row: Instance };
  enabled: Instance;
  after: Instance;
  disabled: Instance;
  frames: Frame[];
  before: { unread: boolean; news: boolean; turnsEnded: number };
  observed: { unread: boolean; news: boolean; turnsEnded: number };
  enabledAt: number;
  pingResultAt: number;
}

const evidence = await Bun.file(new URL("./deployed.json", import.meta.url)).json() as Evidence;
assert.match(evidence.deployedCommit, /^[a-f0-9]{40}$/);
assert.equal(evidence.probe.startedFromNewSessionModal, true);
assert.equal(evidence.probe.directoryFieldBeforeStart, evidence.probe.directory);
assert.equal(evidence.probe.archived, true);
for (const row of [evidence.baseline, evidence.enabled, evidence.after, evidence.disabled]) {
  assert.equal(row.id, evidence.probe.id);
  assert.equal(row.cwd, evidence.probe.directory);
  assert.equal(row.title ?? row.derivedTitle, evidence.baseline.title ?? evidence.baseline.derivedTitle);
  assert.equal(row.derivedTitle, evidence.baseline.derivedTitle);
}
assert.equal(evidence.after.updatedAt, evidence.beforePing.row.updatedAt);
assert.equal(evidence.disabled.updatedAt, evidence.after.updatedAt);
assert.equal(evidence.enabled.keepAlive.on, true);
assert.equal(evidence.enabled.keepAlive.state, "waiting");
assert.equal(evidence.enabled.keepAlive.ttl, "1h");
const requestAt = Date.parse(evidence.enabled.lastRequestAt);
assert.ok(Number.isFinite(requestAt));
assert.equal(evidence.enabled.keepAlive.nextAt, requestAt + 50 * 60_000);
assert.ok(evidence.enabledAt < requestAt + 50 * 60_000);
assert.ok(evidence.pingResultAt >= requestAt + 50 * 60_000);
const sends = evidence.frames.filter((frame) => frame.kind === "send" && frame.record?.body.origin.name === "keepalive");
assert.equal(new Set(sends.map((frame) => frame.record?.uuid)).size, 2);
assert.ok(sends.every((frame) => frame.keepAlive === true && frame.record?.keepAlive === true));
const replies = evidence.frames.filter((frame) => frame.kind === "frame");
assert.ok(replies.length > 0);
assert.ok(replies.every((frame) => frame.keepAlive === true && frame.message?.keepAlive === true));
const results = replies.filter((frame) => frame.message?.type === "result");
assert.equal(results.length, 2);
for (const frame of results) {
const result = frame.message;
assert.ok(result?.cache && result.usage);
assert.equal(result.is_error, false);
assert.equal(result.result?.trim(), "ok");
const input = result.usage.input_tokens + result.cache.read + result.cache.write;
assert.ok(input > 0);
assert.ok(result.cache.read / input >= 0.9, `Cache read ${result.cache.read} / input ${input} is below 90%`);
}
assert.ok(evidence.after.keepAlive.sent >= 1 && evidence.after.keepAlive.sent <= 2);
assert.equal(evidence.before.unread, false);
assert.equal(evidence.before.news, false);
assert.equal(evidence.observed.unread, false);
assert.equal(evidence.observed.news, false);
assert.equal(evidence.observed.turnsEnded, evidence.before.turnsEnded);
assert.equal(evidence.disabled.keepAlive.on, false);
assert.equal(evidence.disabled.keepAlive.state, "off");
console.log(`PASS: ${evidence.probe.id}; ttl 1h; two pings each read at least 90% from cache; switched off and archived`);
