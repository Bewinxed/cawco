/**
 * A CawCo tool call from an OpenCode or pi session runs as long as the same
 * call from Claude Code: to CawCo's one long-call wall clock (core
 * long-calls.ts `LONG_CALL_WALL_MS`), never to a shorter clock of the
 * harness's door. OpenCode's door is its server's `timeout.execution`
 * (agent opencode.ts `cawcoMcp`), which 2.0.29's client hands the MCP SDK's
 * `callTool` without `resetTimeoutOnProgress`, so the hub's progress
 * heartbeat does not stretch it; pi's door is its read deadline (agent
 * delegation.ts `callDelegationTool`).
 *
 * On a scratch fleet (real hub, agent and sessiond; OpenCode 2.0 and pi
 * against the mock model), an OpenCode session and a pi session, each in
 * Bypass, call `admin_memory_write` through their own door to CawCo's MCP
 * server. Each call parks an ask for the person (hub admin-asks.ts), the
 * call held open meanwhile; the person answers both {@link HOLD_MS} in,
 * past the 11 minutes OpenCode's door was given before (image generation's
 * 10 minutes, plus one). Each call then returns its own result to the model,
 * not failed: the memory's new hash.
 *
 *   bun scripts/probe-kit/run.ts long-call-parity
 */
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

/** How long the person takes to answer: past OpenCode's old 11-minute door. */
const HOLD_MS = 12 * 60_000;
const TOOL = "admin_memory_write";
/** A memory write's words, naming the hash the next write takes (hub presenters/fleet-settings.ts `memorySettingsWords`). */
const KEPT_HASH = "the next write's expectedHash takes";
const HARNESSES = ["opencode", "pi"] as const;
type Leg = (typeof HARNESSES)[number];
const TAG = /PROBE-LONG-(opencode|pi)/;

const inputOf = (leg: Leg) => ({
  action: "set",
  content: `Memory written by the ${leg} leg of long-call-parity.\n`,
  reason: `The probe holds a ${leg} session's CawCo call past 11 minutes.`,
});

/** One leg's call, as the mock plays it. */
interface Step {
  called: boolean;
  result?: { body: string; failed: boolean; at: number };
}
const steps = new Map<Leg, Step>();

const words = (said: string): Reply => ({ everyMs: 5, words: [said] });
const calling = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Each leg's session calls the tool once, by the name its harness offers (OpenCode's Code Mode catalog when not offered direct), and records what came back. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const leg = TAG.exec(request.all)?.[1] as Leg | undefined;
  if (!leg) {
    return words("ok");
  }
  const step = steps.get(leg) ?? { called: false };
  steps.set(leg, step);
  if (step.result) {
    return words("ok");
  }
  if (step.called) {
    if (request.afterTool) {
      step.result = {
        body: request.last,
        failed: request.toolFailed,
        at: Date.now(),
      };
      return words("done");
    }
    return words("ok");
  }
  step.called = true;
  const names = [TOOL, `mcp__cawco__${TOOL}`, `cawco_${TOOL}`];
  const offered = request.toolNames.find((name) => names.includes(name));
  if (offered) {
    return calling(offered, inputOf(leg));
  }
  if (request.toolNames.includes("execute")) {
    return calling("execute", {
      code: `return await tools.cawco.${TOOL}(${JSON.stringify(inputOf(leg))});`,
    });
  }
  return words(`${TOOL} is not offered: ${request.toolNames.join(", ")}`);
};

interface Ask {
  instanceId: string;
  machineId: string;
  payload: { toolName?: string };
  requestId: string;
}

const spec: Spec = {
  name: "long-call-parity",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const pending = () => fleet.api<Ask[]>("/api/pending");
    /** One leg: its session started, its call made and parked, the person's answer {@link HOLD_MS} after it parked, and what came back. */
    const leg = async (harness: Leg) => {
      const id = await fleet.spawn(harness, `Long call on ${harness}`);
      await fleet.send(id, `Run step PROBE-LONG-${harness}.`);
      const ask = await until(
        `${harness}'s ${TOOL} parked for the person`,
        async () =>
          (await pending()).find(
            (one) =>
              one.instanceId === id &&
              one.payload.toolName === `mcp__cawco__${TOOL}`
          ),
        Boolean,
        180_000
      ).catch(() => undefined);
      kit.check(
        `${harness}: its ${TOOL} call parks an ask for the person`,
        ask !== undefined,
        `step ${JSON.stringify(steps.get(harness))}`
      );
      if (!ask) {
        return;
      }
      const parked = Date.now();
      await Bun.sleep(HOLD_MS);
      // Nothing came back while the person had not answered: no door cut the call.
      const early = steps.get(harness)?.result;
      kit.check(
        `${harness}: nothing came back before the person answered, ${HOLD_MS / 60_000} minutes in`,
        early === undefined,
        early
          ? `${Math.round((early.at - parked) / 1000)} s after it parked: ${early.body.slice(0, 400)}`
          : ""
      );
      await fleet.post({
        type: "command",
        commandId: crypto.randomUUID(),
        kind: "permission.answer",
        machineId: ask.machineId,
        sessionId: ask.instanceId,
        payload: {
          requestId: ask.requestId,
          args: [ask.requestId, { behavior: "allow", updatedInput: {} }],
        },
      });
      const result = await until(
        `${harness}'s call answered`,
        () => steps.get(harness)?.result,
        Boolean,
        120_000
      ).catch(() => steps.get(harness)?.result);
      const after = result ? Math.round((result.at - parked) / 1000) : -1;
      kit.check(
        `${harness}: the call held ${HOLD_MS / 60_000} minutes returns its own result to the model, not failed: the memory's new hash`,
        result !== undefined &&
          !result.failed &&
          result.body.includes(KEPT_HASH) &&
          after * 1000 >= HOLD_MS,
        `${after} s after it parked; failed ${result?.failed}; came back ${result?.body.slice(0, 400)}`
      );
    };
    await Promise.all(HARNESSES.map(leg));
  },
};
export default spec;
