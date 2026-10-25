/**
 * A call CawCo cuts mid-run never reads as refused (core turn-cuts.ts, hub
 * machine-pause.ts `PauseCaller`). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model), one session shaped as an
 * orchestrator: top-level, in Full Send, so no call of its asks anyone.
 *
 * The owner, 23 Oct: "A rejected tool call still took effect: I rejected
 * your machine_pause at 20:23:42, and the hub paused the machine in that
 * same second." Nobody was asked: the orchestrator ran in Full Send. Its
 * machine_pause paused its own machine, the pause cut every turn there, its
 * own among them, under the call, and Claude Code wrote the call cut
 * mid-run as "The user doesn't want to proceed with this tool use. The tool
 * use was rejected …".
 *
 * Pause, the session's own machine paused by its own call:
 * p1. The transcript draws machine_pause answered with the pause's own
 *     words ("Paused … until …"), and its turn stops after that answer:
 *     the hub cuts it once the call is answered. Work the model asks for
 *     after the answer, if it gets that far, is cut by the pause.
 * p2. The call's result, as the model reads it (in the same turn if Claude
 *     Code asked the model again before the cut, else in the turn the
 *     pause's end starts), is the pause's own answer, not Claude Code's
 *     rejection.
 *
 * Stop, a long command cut by the person's Stop:
 * s1. The transcript draws the cut command as cut by your Stop, never
 *     "rejected", and the line after it "Interrupted by your Stop".
 * s2. The same after the hub restarts and builds the transcript again from
 *     the stored file: the cut is the hub's record (db `turn_cuts`).
 *
 *   bun scripts/probe-kit/run.ts cut-calls
 */
import { turnCutWords } from "../../../packages/core/src/words/cuts";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const PAUSE = "mcp__cawco__machine_pause";
const PAUSE_WORD = "PROBE-PAUSE";
const SLEEP_WORD = "PROBE-SLEEP";
/** What Claude Code writes for a call an interrupt cut mid-run (2.1.310's `KS`). */
const REJECTED = "The user doesn't want to proceed with this tool use";
/** A long command Claude Code runs: it refuses a standalone \`sleep\`. */
const LONG = "timeout 900 tail -f /dev/null";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** How far each leg has gone, as the mock answered it. */
const legs = {
  pause: "asked" as "asked" | "searched" | "called" | "answered" | "done",
  sleep: "asked" as "asked" | "sleeping" | "done",
};
/** The tool result the session read after its machine_pause: the request that carried it. */
let pauseAnswer: Seen | undefined;
/** Set once the probe ends the pause: what the model asks for then is no longer cut. */
let resumed = false;

const pauseReply = (request: Seen): Reply => {
  switch (legs.pause) {
    case "asked":
      if (request.toolNames.includes(PAUSE)) {
        legs.pause = "called";
        return useTool(PAUSE, { machine: MACHINE, minutes: 2 });
      }
      legs.pause = "searched";
      return useTool("ToolSearch", {
        query: `select:${PAUSE}`,
        max_results: 1,
      });
    case "searched":
      legs.pause = "called";
      return useTool(PAUSE, { machine: MACHINE, minutes: 2 });
    case "called":
      // Its answer, then more work while paused: a turn the hub did not cut
      // runs it.
      legs.pause = "answered";
      pauseAnswer = request;
      return resumed
        ? text("paused")
        : useTool("Bash", {
            command: LONG,
            description: "Work on after the pause",
            timeout: 600_000,
          });
    default:
      legs.pause = "done";
      return text("paused");
  }
};

const sleepReply = (): Reply => {
  if (legs.sleep === "asked") {
    legs.sleep = "sleeping";
    return useTool("Bash", {
      command: LONG,
      description: "A long command",
      timeout: 600_000,
    });
  }
  legs.sleep = "done";
  return text("stopped");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(SLEEP_WORD)) {
    return sleepReply();
  }
  if (request.all.includes(PAUSE_WORD)) {
    return pauseReply(request);
  }
  return text("ok");
};

interface Block {
  content?: string;
  metadata?: {
    noteTitle?: string;
    toolCut?: string;
    toolInput?: { command?: string };
    toolName?: string;
    toolResult?: string;
    toolStatus?: string;
  };
  type: string;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // An orchestrator's shape: top-level, Full Send, nothing asks.
  const id = await fleet.spawn("claude", "Orchestrator", undefined, {
    permissionMode: "fullSend",
  });
  const turnOpen = () =>
    fleet.instance(id)?.turn_open_at !== null &&
    fleet.instance(id)?.turn_open_at !== undefined;
  const blocks = async () =>
    (await fleet.api<{ blocks: Block[] }>(`/api/instances/${id}/transcript`))
      .blocks;
  const hubLines = async (needle: string) =>
    (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => line.includes(needle))
      .slice(-20)
      .join("\n");

  // p1
  await fleet.send(id, `${PAUSE_WORD}: pause this machine for two minutes.`);
  const answered = await until(
    "the transcript's machine_pause answered",
    async () =>
      (await blocks()).findLast((block) => block.metadata?.toolName === PAUSE),
    (block) => block.metadata?.toolStatus !== "pending",
    120_000
  ).catch(() => undefined);
  check(
    "p1: the transcript draws machine_pause answered with the pause's words",
    answered?.metadata?.toolStatus === "success" &&
      answered.metadata.toolResult?.startsWith("Paused ") === true &&
      answered.metadata.toolCut === undefined,
    JSON.stringify(answered?.metadata ?? null).slice(0, 400)
  );
  await until("its turn cut", () => !turnOpen(), Boolean, 30_000).catch(
    () => undefined
  );
  check(
    "p1: its turn stops after that answer",
    !turnOpen(),
    `turn open ${turnOpen()}, the mock's leg ${legs.pause}; hub: ${await hubLines("[pause]")}`
  );
  const after = (await blocks()).findLast(
    (block) =>
      block.metadata?.toolName === "Bash" &&
      block.metadata.toolInput?.command === LONG
  );
  check(
    "p1: what its turn ran on after the answer, if it got that far, reads as cut by the pause, not rejected",
    after === undefined ||
      (after.metadata?.toolCut !== undefined &&
        after.metadata.toolCut !== turnCutWords.stop &&
        !after.metadata.toolResult?.includes(REJECTED)),
    JSON.stringify(after?.metadata ?? null).slice(0, 400)
  );

  // p2
  resumed = true;
  await fleet.api(`/api/machines/${MACHINE}/resume`, {});
  await until(
    "the model reading machine_pause's answer",
    () => pauseAnswer,
    Boolean,
    60_000
  ).catch(() => undefined);
  const answer = pauseAnswer?.last ?? "";
  check(
    "p2: the model reads its machine_pause's answer as the pause's own words, not a rejection",
    pauseAnswer?.afterTool === true &&
      !pauseAnswer.toolFailed &&
      answer.startsWith("Paused ") &&
      answer.includes(" until ") &&
      !answer.includes(REJECTED),
    `${pauseAnswer ? `afterTool ${pauseAnswer.afterTool}, failed ${pauseAnswer.toolFailed}: ` : "no answer read; "}${JSON.stringify(answer.slice(0, 300))}`
  );

  // s1
  await until(
    "the session at rest after the pause",
    () => !turnOpen(),
    Boolean,
    60_000
  );
  await fleet.send(id, `${SLEEP_WORD}: run the long command.`);
  await until(
    "its long command running",
    () => legs.sleep === "sleeping" && turnOpen(),
    Boolean,
    120_000
  );
  await Bun.sleep(3000);
  await fleet.control(id, "interrupt");
  await until("its turn stopped", () => !turnOpen(), Boolean, 60_000).catch(
    () => undefined
  );
  const cutRead = async () => {
    const all = await blocks();
    const at = all.findLastIndex(
      (block) =>
        block.metadata?.toolName === "Bash" &&
        block.metadata.toolInput?.command === LONG
    );
    return {
      cut: all[at],
      line: all.slice(at + 1).find((block) => block.type === "ui.interrupted"),
    };
  };
  const holds = (
    seen: Awaited<ReturnType<typeof cutRead>>
  ): { line: boolean; call: boolean } => {
    const cut = seen.cut?.metadata;
    const said = turnCutWords.line(turnCutWords.stop);
    return {
      call:
        cut?.toolCut === turnCutWords.stop &&
        cut.toolResult === turnCutWords.call(turnCutWords.stop),
      line:
        seen.line?.metadata?.noteTitle === said && seen.line.content === said,
    };
  };
  const live = await until(
    "the cut drawn",
    cutRead,
    (seen) => holds(seen).call,
    30_000
  ).catch(cutRead);
  check(
    "s1: the command the Stop cut reads as cut by your Stop, not rejected",
    holds(live).call,
    JSON.stringify(live.cut?.metadata ?? null).slice(0, 400)
  );
  check(
    "s1: the line after it reads Interrupted by your Stop",
    holds(live).line,
    JSON.stringify(live.line ?? null).slice(0, 300)
  );

  // s2
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const stored = await until(
    "the transcript built again",
    cutRead,
    (seen) => seen.cut !== undefined,
    60_000
  );
  check(
    "s2: built again from the stored file after a hub restart, the cut call and its line say your Stop",
    holds(stored).call && holds(stored).line,
    `${JSON.stringify(stored.cut?.metadata ?? null).slice(0, 300)}; line ${JSON.stringify(stored.line ?? null).slice(0, 200)}`
  );
};

export default {
  name: "cut-calls",
  run,
} satisfies Spec;
