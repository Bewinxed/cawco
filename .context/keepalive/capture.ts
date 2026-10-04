import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Integration observer only: it never starts a harness or reads authentication.
// wait_item owns the long wait; this process responds to socket events only.
const base = "http://127.0.0.1:3456";
const saved = await Bun.file(new URL("./baseline.json", import.meta.url)).json();
const id = saved.probe.id as string;
assert.match(id, /^[a-f0-9-]{36}$/);
assert.equal(saved.probe.directory, "/home/bewinxed/.worktrees/cockpit-2fbd52a5/.context/keepalive/probe-rerun-workdir");
const target = "65293f76-43b6-4848-aa44-6fe515b8d07e";
const path = new URL("./deployed.json", import.meta.url);
const api = async (route: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${base}${route}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
  }
  return await response.json();
};
const ownRow = async () => (await api("/api/instances")).find((row: { id: string }) => row.id === id);
const ownUsage = async () => (await api("/api/usage/limits")).machines.find((machine: any) => machine.machineId === saved.probe.baseline.machineId)?.limits;
const health = await api("/health");
const deployedCommit = execFileSync("git", ["rev-parse", health.build.commit], { encoding: "utf8" }).trim();
assert.match(deployedCommit, /^[a-f0-9]{40}$/);
const evidence: Record<string, any> = {
  deployedCommit,
  reportedDeployedVersion: health.build.commit,
  probe: { ...saved.probe, baseline: undefined, beforeTranscript: undefined, archived: false },
  baseline: saved.probe.baseline,
  frames: [],
  socketGaps: [],
  restarts: [],
  stateHistory: [],
  usageReadings: [{ receivedAt: Date.now(), limits: await ownUsage() }],
  pulsesDuringWait: [],
  before: { unread: false, news: false, turnsEnded: saved.probe.beforeTranscript.facts.turnsEnded },
};
const board = Promise.withResolvers<any>();
const result = Promise.withResolvers<any>();
let socket: WebSocket;
let complete = false;
let armed = false;
let finalizing = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let gap: { closedAt: number; openedAt?: number; code: number; reason: string } | undefined;
let sequence: number | undefined;
let hubStart: number | undefined;
let agentStart: number | undefined;
let beforePing: Promise<void> | undefined;
let observedResult: any;
let latestRow = saved.probe.baseline;
const results = new Set<string>();
const events = new Set<string>();
let writes = Promise.resolve(0);
const persist = () => {
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  writes = writes.then(() => Bun.write(path, body));
  return writes;
};

const observeBoard = (snapshot: any) => {
  const now = Date.now();
  const nextHub = snapshot.hubBuild?.startedAt;
  if (hubStart !== undefined && nextHub !== undefined && nextHub !== hubStart) {
    evidence.restarts.push({ kind: "hub", previousStartedAt: hubStart, startedAt: nextHub, observedAt: now, commit: snapshot.hubBuild.commit });
    sequence = undefined;
  }
  hubStart = nextHub ?? hubStart;
  const agent = snapshot.agents?.find((machine: any) => machine.machineId === evidence.baseline.machineId);
  const nextAgent = agent?.build?.startedAt;
  if (agentStart !== undefined && nextAgent !== undefined && nextAgent !== agentStart) {
    evidence.restarts.push({ kind: "agent", previousStartedAt: agentStart, startedAt: nextAgent, observedAt: now, commit: agent.build.commit });
  }
  agentStart = nextAgent ?? agentStart;
  if (snapshot.pulses?.[id]) {
    evidence.latestPulse = snapshot.pulses[id];
  }
  latestRow = (snapshot.instances ?? snapshot.upserts ?? []).find((row: any) => row.id === id) ?? latestRow;
  evidence.stateHistory.push({ receivedAt: now, status: latestRow.status, lastRequestAt: latestRow.lastRequestAt, keepAlive: latestRow.keepAlive });
};

const captureBeforePing = () => {
  if (beforePing) return;
  beforePing = Promise.all([ownRow(), api(`/api/instances/${id}/transcript`), ownUsage()]).then(([row, transcript, usage]) => {
    evidence.beforePing = { row, transcript, usage, observedAt: Date.now() };
    const news = evidence.latestPulse?.activity === "idle" && evidence.latestPulse.at > Date.parse(row.seenAt);
    evidence.before = { unread: !!news, news: !!news, turnsEnded: transcript.facts.turnsEnded };
  });
};

const notify = async (message: string) => {
  const answer = await api(`/api/delegation/call/${id}`, "POST", { name: "handoff", arguments: { target, message } });
  console.log("Notification:", JSON.stringify(answer));
};

const finalize = async () => {
  if (!armed || !observedResult || complete || finalizing) return;
  finalizing = true;
  try {
    if (beforePing) await beforePing;
    evidence.pingResultAt = observedResult.receivedAt;
    evidence.after = await ownRow();
    evidence.afterTranscript = await api(`/api/instances/${id}/transcript`);
    evidence.usageReadings.push({ receivedAt: Date.now(), limits: await ownUsage() });
    const due = evidence.enabled.keepAlive.nextAt;
    evidence.usageBeforeDue = evidence.usageReadings.filter((reading: any) => reading.receivedAt < due).at(-1);
    evidence.usageAfterDue = evidence.usageReadings.find((reading: any) => reading.receivedAt >= due);
    evidence.stateBeforeDue = evidence.stateHistory.filter((reading: any) => reading.receivedAt < due).at(-1);
    evidence.stateAfterDue = evidence.stateHistory.find((reading: any) => reading.receivedAt >= due) ?? { receivedAt: Date.now(), status: evidence.after.status, lastRequestAt: evidence.after.lastRequestAt, keepAlive: evidence.after.keepAlive };
    const pulse = evidence.latestPulse;
    const news = pulse?.activity === "idle" && pulse.at > Date.parse(evidence.after.seenAt);
    evidence.observed = { unread: !!news, news: !!news, turnsEnded: evidence.afterTranscript.facts.turnsEnded };
    // Only an observed result permits early cleanup. Without one, leave it on
    // until wait_item wakes the operator beyond due + two minutes.
    evidence.disabledPatch = await api(`/api/instances/${id}`, "PATCH", { keepAlive: false });
    evidence.disabled = await ownRow();
    await persist();
    const ping = observedResult.message;
    const input = (ping.usage?.input_tokens ?? 0) + (ping.cache?.read ?? 0) + (ping.cache?.write ?? 0);
    const firstSend = evidence.frames.find((frame: any) => frame.kind === "send" && frame.record?.keepAlive);
    console.log(`RESULT ${id}: sent ${firstSend?.record.acceptedAt}; received ${new Date(evidence.pingResultAt).toISOString()}; input ${input}; read ${ping.cache?.read}; write ${ping.cache?.write}; sent ${evidence.after.keepAlive.sent}`);
    complete = true;
    if (retry) clearTimeout(retry);
    socket.close();
    await notify(`Keep-alive authorized rerun completed for ${id}. Evidence is .context/keepalive/deployed.json in /home/bewinxed/.worktrees/cockpit-2fbd52a5. Ping send ${firstSend?.record.acceptedAt}, result ${new Date(evidence.pingResultAt).toISOString()}, input ${input}, cache read ${ping.cache?.read}, cache write ${ping.cache?.write}, sent ${evidence.after.keepAlive.sent}. Probe is off. Inspect and archive only this probe, run the gate and land evidence. No further run.`);
  } catch (error) {
    evidence.finalizeErrors ??= [];
    evidence.finalizeErrors.push({ at: Date.now(), error: String(error) });
    await persist();
    console.error(error);
    // A hub restart during these receipts is resumed on its next snapshot.
  } finally {
    finalizing = false;
  }
};

const connect = () => {
  socket = new WebSocket("ws://127.0.0.1:3456/ws/dashboard");
  let subscribed = false;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.payload?.kind === "instances" || message.payload?.kind === "instances_delta") {
      observeBoard(message.payload);
      board.resolve(message.payload);
      if (!subscribed) {
        subscribed = true;
        socket.send(JSON.stringify({ type: "stream.subscribe", sessionId: id, ...(sequence === undefined ? {} : { afterSeq: sequence }) }));
        if (gap) {
          gap.openedAt = Date.now();
          gap = undefined;
        }
      }
      void persist();
      void finalize();
    }
    if (message.type === "stream.reset" && message.sessionId === id) {
      evidence.socketGaps.push({ at: Date.now(), kind: "stream-reset", nextSeq: message.nextSeq });
      sequence = message.nextSeq - 1;
      socket.send(JSON.stringify({ type: "stream.subscribe", sessionId: id, afterSeq: sequence }));
    }
    const incoming = message.type === "stream.event" ? [message.event] : message.type === "stream.backlog" ? message.events : [];
    for (const entry of incoming) {
      if (entry.sessionId !== id) continue;
      sequence = entry.seq;
      const key = `${hubStart}:${entry.seq}`;
      if (events.has(key)) continue;
      events.add(key);
      const frame = structuredClone(entry.frame);
      if (frame.message) delete frame.message.raw;
      const captured = { ...frame, receivedAt: Date.now(), seq: entry.seq, hubStartedAt: hubStart };
      evidence.frames.push(captured);
      if (frame.kind === "send" && frame.record?.keepAlive) captureBeforePing();
      if (frame.kind === "frame" && frame.message.type === "result" && !results.has(frame.message.uuid)) {
        results.add(frame.message.uuid);
        observedResult = captured;
        result.resolve(captured);
        void finalize();
      }
    }
    if (message.payload?.kind === "pulse" && message.instanceId === id) {
      evidence.latestPulse = message.payload.pulse;
      evidence.pulsesDuringWait.push({ ...message.payload.pulse, receivedAt: Date.now() });
    }
    if (message.payload?.kind === "usage") {
      const reading = message.payload.limits.find((reading: any) => reading.machineId === evidence.baseline.machineId);
      if (reading) evidence.usageReadings.push({ receivedAt: Date.now(), limits: reading.payload });
      void persist();
    }
  });
  socket.addEventListener("close", (event) => {
    if (complete) return;
    gap = { closedAt: Date.now(), code: event.code, reason: event.reason };
    evidence.socketGaps.push(gap);
    console.log(`SOCKET_GAP ${new Date(gap.closedAt).toISOString()}: ${event.code} ${event.reason}`);
    void persist();
    // Event-driven reconnect, not a polling loop or a deadline wait timer.
    retry = setTimeout(connect, 500);
  });
  socket.addEventListener("error", (event) => {
    evidence.socketErrors ??= [];
    evidence.socketErrors.push({ at: Date.now(), message: (event as ErrorEvent).message });
  });
};

connect();
const snapshot = await board.promise;
evidence.beforePulse = snapshot.pulses?.[id];
evidence.enabledPatch = await api(`/api/instances/${id}`, "PATCH", { keepAlive: true });
evidence.enabled = await ownRow();
evidence.enabledAt = Date.now();
assert.equal(evidence.enabled.keepAlive.state, "waiting");
assert.equal(evidence.enabled.keepAlive.ttl, "1h");
assert.equal(evidence.enabled.keepAlive.nextAt, Date.parse(evidence.enabled.lastRequestAt) + 50 * 60_000);
armed = true;
await persist();
console.log(`WAITING ${id}: requested ${evidence.enabled.lastRequestAt}; due ${new Date(evidence.enabled.keepAlive.nextAt).toISOString()}`);
await result.promise;
