/**
 * The task-review probe's mock model (probe-kit specs/web/task-review.ts):
 * what each session's turn answers.
 * - An attempt's session (its brief opens "Your work item is an attempt at
 *   tsk-N, “Title”"): a Glob, then its result (results.ts) through the real
 *   `task_result` and `finish_item` when it is offered them (a delegate the
 *   hub started), else the result's words (a plain session standing in).
 * - A driver told "PREVIEW start tsk-N": the real `task_start`.
 * - "Schedule the launch posts": a Bash call, a real permission ask.
 */
import type { Reply, Seen } from "../scratch-fleet";
import { RESULTS } from "./results";

const ATTEMPT = /attempt at (tsk-\d+), “([^”]+)”/;
const TOOL_RESULTS = /"type":"tool_result"/g;
const START = /PREVIEW start (tsk-\d+)/;
/** The name the harness lists a tool under, bare or behind its MCP prefix. */
const listedAs = (names: string[], tool: string) =>
  names.find((name) => name === tool || name.endsWith(`__${tool}`));
const say = (words: string): Reply => ({ everyMs: 20, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 20,
  words: [],
  tool: { name, input },
});

/** An attempt's session on the task titled `title`: a Glob, then its result. */
function attemptTurn(seen: Seen, title: string): Reply {
  const plan = RESULTS[title];
  if (!plan) {
    return say("On it.");
  }
  const result =
    plan.again && seen.all.includes("Comments since the last attempt")
      ? plan.again
      : plan.first;
  const step = (seen.body.match(TOOL_RESULTS) ?? []).length;
  if (step === 0) {
    return call("Glob", { pattern: "*" });
  }
  const handIn = listedAs(seen.toolNames, "task_result");
  const finish = listedAs(seen.toolNames, "finish_item");
  if (step === 1) {
    return handIn ? call(handIn, result) : say(result.summary);
  }
  if (step === 2 && handIn && finish) {
    return call(finish, { summary: result.summary });
  }
  return say(handIn ? "Handed in." : result.summary);
}

export function respond(seen: Seen): Reply {
  if (!seen.tools) {
    return say("Preview");
  }
  const attempt = ATTEMPT.exec(seen.all);
  if (attempt) {
    return attemptTurn(seen, attempt[2] ?? "");
  }
  const start = START.exec(seen.last);
  if (start && !seen.afterTool) {
    const name = listedAs(seen.toolNames, "task_start");
    return name
      ? call(name, { id: start[1] })
      : say("task_start is not offered.");
  }
  if (!seen.afterTool && seen.last.includes("Schedule the launch posts")) {
    return call("Bash", {
      command: "bun scripts/schedule.ts --at 2026-10-16T09:00",
      description: "Schedule the launch posts for Thursday 09:00",
    });
  }
  return say("On it.");
}
