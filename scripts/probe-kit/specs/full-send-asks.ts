/**
 * A session in Full Send never puts an approval to the person: every admin
 * write it makes runs at once, whichever door it came in by and however
 * recently the mode was set (hub asks.ts). The owner's case of 2026-11-05:
 * his Caw session asked him to approve seven `admin_skills_write` installs,
 * and the three still open when he switched it to Full Send stayed open
 * until he approved each by hand.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), each session's admin write made through the REST door with
 * its own credential, as its MCP call reaches the hub, and its mode switched
 * with the very envelope the session card's mode control sends:
 *
 * (a) A session in Bypass asks the person to approve `admin_rules_write`.
 *     The card's mode control switches it to Full Send (the
 *     `set-permission-mode` command, applied). The open approval is gone
 *     from every screen (`/api/pending`), approved by Full Send, and its
 *     rule was made; the session is told Full Send approved it.
 * (b) Its very next `admin_rules_write` runs at once: its call answers the
 *     tool's own words, nothing is put to the person, and the rule is there.
 * (c) A session in Accept edits asks to approve a write; the card's mode
 *     control starts it again in Full Send (the dashboard's relaunch spawn).
 *     Its open approval is approved by Full Send and its rule made, and its
 *     next write runs at once.
 * (d) A write made while the switch is on its way (the call and the command
 *     sent together) leaves nothing open once the switch has applied, and
 *     its rule is made.
 *
 *   bun scripts/probe-kit/run.ts full-send-asks
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, MODEL, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const TAG = crypto.randomUUID().slice(0, 8);
/** What an approve ask's call answers (core asks.ts `askRecordedWords`). */
const RECORDED = "Recorded as";

interface Parked {
  instanceId?: string;
  payload: { toolName?: string };
  requestId?: string;
}

/** The approvals `instanceId` has on every screen now. */
const parkedOf = async (fleet: KitFleet, instanceId: string) =>
  (await fleet.api<Parked[]>("/api/pending")).filter(
    (one) => one.instanceId === instanceId && one.requestId?.startsWith("ask_")
  );

/** Whether a rule named `name` is among the fleet's rules. */
const ruleMade = async (fleet: KitFleet, name: string): Promise<boolean> =>
  (await fleet.api<{ rules: { name: string }[] }>("/api/rules")).rules.some(
    (rule) => rule.name === name
  );

/** `instanceId`'s `admin_rules_write` making a disabled rule named `name`: the call's words. */
const writeRule = async (fleet: KitFleet, instanceId: string, name: string) =>
  await toolWords(
    {
      base: fleet.base,
      id: instanceId,
      credential: await fleet.sessionCredential(instanceId),
    },
    "admin_rules_write",
    {
      action: "create",
      name,
      enabled: false,
      pattern: `full-send-asks-${TAG}`,
      reply: "Nothing to do.",
      reason: `The full-send-asks probe's rule ${name}.`,
    }
  );

/** The answer an ask's record keeps (`asks.record`), by its id. */
const answerOf = (fleet: KitFleet, id: string) => {
  const [row] = fleet.query<{ state: string; record: string }>(
    "SELECT state, record FROM asks WHERE id = ?",
    id
  );
  const record = row
    ? (JSON.parse(row.record) as {
        answer?: { by?: { via?: string; behavior?: string } };
      })
    : undefined;
  return { state: row?.state, by: record?.answer?.by };
};

/** The mode `instanceId`'s row reads. */
const modeOf = (fleet: KitFleet, instanceId: string) =>
  fleet.query<{ mode: string | null }>(
    "SELECT permission_mode AS mode FROM instances WHERE id = ?",
    instanceId
  )[0]?.mode ?? null;

/** Waits until `instanceId` has no approval open; answers how many it has then. */
const settledOpen = async (fleet: KitFleet, instanceId: string) =>
  await until(
    `${instanceId.slice(0, 8)} with no approval open`,
    async () => (await parkedOf(fleet, instanceId)).length,
    (open) => open === 0,
    30_000
  ).catch(async () => (await parkedOf(fleet, instanceId)).length);

/** Waits until a rule named `name` is made; answers whether it was. */
const madeWithin = async (fleet: KitFleet, name: string) =>
  await until(
    `rule ${name} made`,
    () => ruleMade(fleet, name),
    (made) => made,
    30_000
  ).catch(() => false);

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const cwd = join(fleet.sandbox, "full-send");
  await mkdir(cwd, { recursive: true });

  // (a) Bypass, an approval open, then Full Send from the card's control.
  const bypass = await fleet.spawn("claude", "Full Send by control", cwd);
  const firstName = `fs-a-${TAG}`;
  const first = await writeRule(fleet, bypass, firstName);
  const [firstAsk] = await parkedOf(fleet, bypass);
  const switched = await fleet.command(
    bypass,
    "set-permission-mode",
    "setPermissionMode",
    ["fullSend"]
  );
  const openAfter = await settledOpen(fleet, bypass);
  const firstMade = await madeWithin(fleet, firstName);
  const firstAnswer = firstAsk?.requestId
    ? answerOf(fleet, firstAsk.requestId)
    : undefined;
  check(
    "(a) an approval a session in Bypass had open is approved by Full Send as the card's mode control switches it, and its write runs",
    first.text.includes(RECORDED) &&
      !!firstAsk &&
      switched.stage === "applied" &&
      modeOf(fleet, bypass) === "fullSend" &&
      openAfter === 0 &&
      firstMade &&
      firstAnswer?.by?.via === "fullSend" &&
      firstAnswer.by.behavior === "allow",
    `the write said: ${first.text.slice(0, 160)}; its ask: ${firstAsk?.requestId ?? "none"}; the switch: ${JSON.stringify(switched)}, row mode ${modeOf(fleet, bypass)}; open after: ${openAfter}; rule made: ${firstMade}; the ask's answer: ${JSON.stringify(firstAnswer)}`
  );

  // (b) Its very next write runs at once.
  const nextName = `fs-b-${TAG}`;
  const next = await writeRule(fleet, bypass, nextName);
  const nextOpen = (await parkedOf(fleet, bypass)).length;
  const nextMade = await ruleMade(fleet, nextName);
  check(
    "(b) the very next admin write of a session switched to Full Send runs at once, putting nothing to the person",
    !(next.refused || next.text.includes(RECORDED)) &&
      nextOpen === 0 &&
      nextMade,
    `the write said: ${next.text.slice(0, 160)}; open: ${nextOpen}; rule made: ${nextMade}`
  );

  // (c) Accept edits, an approval open, then Full Send: the card starts it
  // again in place (SessionDetails `changePermission`, client.svelte.ts
  // `relaunchSession`).
  const edits = await fleet.spawn("claude", "Full Send by relaunch", cwd, {
    permissionMode: "acceptEdits",
  });
  const relaunchName = `fs-c-${TAG}`;
  const asked = await writeRule(fleet, edits, relaunchName);
  const [relaunchAsk] = await parkedOf(fleet, edits);
  const sessionKey = fleet.query<{ key: string | null }>(
    "SELECT session_id AS key FROM instances WHERE id = ?",
    edits
  )[0]?.key;
  const spawnedBefore = fleet.instance(edits)?.spawned_at ?? 0;
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: edits,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: edits,
      cwd,
      harness: "claude",
      ...(sessionKey ? { resume: { sessionKey } } : {}),
      relaunch: true,
      permissionMode: "fullSend",
      model: MODEL.claude,
    },
  });
  const relaunchedMode = await until(
    "the relaunched row in Full Send",
    () => modeOf(fleet, edits),
    (mode) => mode === "fullSend",
    60_000
  ).catch(() => modeOf(fleet, edits));
  // Its next write is its new process's, on the credential that launch holds.
  await until(
    "the relaunched session running",
    () => fleet.instance(edits),
    (row) => row?.status === "running" && (row.spawned_at ?? 0) > spawnedBefore,
    180_000
  ).catch(() => undefined);
  const relaunchOpen = await settledOpen(fleet, edits);
  const relaunchMade = await madeWithin(fleet, relaunchName);
  const relaunchAnswer = relaunchAsk?.requestId
    ? answerOf(fleet, relaunchAsk.requestId)
    : undefined;
  const afterName = `fs-c2-${TAG}`;
  const after = await writeRule(fleet, edits, afterName);
  check(
    "(c) an approval a session in Accept edits had open is approved by Full Send as the card starts it again in Full Send, and its next write runs at once",
    asked.text.includes(RECORDED) &&
      !!relaunchAsk &&
      relaunchedMode === "fullSend" &&
      relaunchOpen === 0 &&
      relaunchMade &&
      relaunchAnswer?.by?.via === "fullSend" &&
      !(after.refused || after.text.includes(RECORDED)) &&
      (await ruleMade(fleet, afterName)),
    `the write said: ${asked.text.slice(0, 160)}; its ask: ${relaunchAsk?.requestId ?? "none"}; row mode ${relaunchedMode}; open after: ${relaunchOpen}; rule made: ${relaunchMade}; the ask's answer: ${JSON.stringify(relaunchAnswer)}; the next write said: ${after.text.slice(0, 160)}`
  );

  // (d) A write and the switch at once.
  const racing = await fleet.spawn("claude", "Full Send mid-call", cwd);
  const raceName = `fs-d-${TAG}`;
  const [raced, raceSwitch] = await Promise.all([
    writeRule(fleet, racing, raceName),
    fleet.command(racing, "set-permission-mode", "setPermissionMode", [
      "fullSend",
    ]),
  ]);
  const raceOpen = await settledOpen(fleet, racing);
  const raceMade = await madeWithin(fleet, raceName);
  check(
    "(d) a write made while the switch to Full Send is on its way leaves nothing open once it applies, and runs",
    raceSwitch.stage === "applied" && raceOpen === 0 && raceMade,
    `the write said: ${raced.text.slice(0, 160)}; the switch: ${JSON.stringify(raceSwitch)}; open after: ${raceOpen}; rule made: ${raceMade}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "full-send-asks",
  run,
};

export default spec;
