/**
 * A stored OpenCode session goes on in OpenCode: every session row carries
 * its harness, and nothing reads a missing one as Claude. Read per commit on
 * a scratch fleet with OpenCode on the mock.
 *
 * An OpenCode session answers a turn and is stopped, its conversation stored.
 * A message to it wakes it: its row still names `opencode` and the same
 * `ses_…` conversation, and the woken turn's request is OpenCode's (its
 * model, `mock-oc`) and carries the first turn's words, its history. A start
 * of that row on Claude is refused in the hub's words, and no Claude request
 * reaches the mock.
 *
 *   bun scripts/probe-kit/run.ts harness-resume
 */
import { MACHINE, MODEL, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const FIRST = "Remember the word heron.";
const SECOND = "Which word did I ask you to remember?";

const spec: Spec = {
  name: "harness-resume",
  async run(kit) {
    const { check } = kit;
    const turns: Seen[] = [];
    const fleet = await kit.fleet((request) => {
      if (request.tools) {
        turns.push(request);
      }
      return { everyMs: 5, words: [request.tools ? "Noted." : "Title"] };
    });
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    const row = (id: string) =>
      fleet.query<{
        harness: string | null;
        session_id: string | null;
        status: string;
      }>("SELECT harness, session_id, status FROM instances WHERE id = ?", id)[0];

    const instanceId = await fleet.spawn("opencode", "Stored");
    await fleet.send(instanceId, FIRST);
    await until(
      "the first turn's request at the mock",
      () => turns.find((turn) => turn.last.includes(FIRST)),
      (turn) => turn !== undefined,
      180_000
    );
    const before = await until(
      "the session's conversation on its row",
      () => row(instanceId),
      (now) => Boolean(now?.session_id),
      60_000
    );
    kit.note(`before: ${JSON.stringify(before)}`);
    check(
      "the session's row names opencode and its OpenCode conversation",
      before?.harness === "opencode" &&
        (before.session_id?.startsWith("ses_") ?? false),
      JSON.stringify(before)
    );

    // Stopped: its process gone, its conversation stored.
    await fleet.stopSession(instanceId);
    await until(
      "the session stopped",
      () => row(instanceId),
      (now) => now?.status === "stopped",
      120_000
    );

    // A message wakes it, on the harness its row names.
    await fleet.send(instanceId, SECOND);
    const woken = await until(
      "the woken turn's request at the mock",
      () => turns.find((turn) => turn.last.includes(SECOND)),
      (turn) => turn !== undefined,
      180_000
    );
    const after = row(instanceId);
    kit.note(`after: ${JSON.stringify(after)}`);
    check(
      "the woken session's row still names opencode and the same conversation",
      after?.harness === "opencode" &&
        after.session_id === before?.session_id,
      `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`
    );
    check(
      "the woken turn is OpenCode's, on its model",
      woken?.body.includes(MODEL.opencode.split("/")[1] ?? "") ?? false,
      woken?.body.slice(0, 300) ?? "no request"
    );
    check(
      "the woken turn carries the first turn's words: it went on in the stored conversation",
      woken?.all.includes(FIRST) ?? false,
      woken?.all ?? "no request"
    );

    // A start of the row on another harness is refused, and runs nothing.
    const claudeTurns = () =>
      turns.filter((turn) => turn.body.includes(MODEL.claude)).length;
    const claudeBefore = claudeTurns();
    await fleet.post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: { instanceId, cwd: fleet.workdir, harness: "claude" },
    });
    const refused = await until(
      "the hub's refusal of a start on claude",
      async () => (await fleet.logs("hub")).split("\n"),
      (lines) =>
        lines.some((line) =>
          line.includes(
            `instance ${instanceId} runs on opencode; refusing to start it on claude`
          )
        ),
      60_000
    );
    kit.note(
      `hub: ${refused.find((line) => line.includes("refusing to start it on claude"))}`
    );
    check(
      "a start of the row on claude is refused, and the row keeps opencode",
      row(instanceId)?.harness === "opencode" &&
        claudeTurns() === claudeBefore,
      JSON.stringify(row(instanceId))
    );
  },
};

export default spec;
