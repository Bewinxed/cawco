/**
 * The mock model sees words a person sent while a turn ran. Claude Code
 * reads them mid-turn and sends them beside the next tool result, or as a
 * system message of their own (scratch-fleet.ts `MID_TURN`), and the mock's
 * `Seen` carries them: as `last`, marked `lastMidTurn`, and in `all` after
 * the prompt. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock):
 *
 * 1. A prompt whose turn runs a slow tool (Bash `sleep 8`); a second message
 *    sent while it runs reaches the next request as its `last`, opening
 *    with `MID_TURN`, `lastMidTurn` set.
 * 2. That request's `all` holds the prompt and then the mid-turn words.
 *
 *   bun scripts/probe-kit/run.ts mid-turn
 */
import { MID_TURN, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const FIRST = "PROBE-MID-FIRST run the slow tool";
const SECOND = "PROBE-MID-SECOND words sent while you work";
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.lastMidTurn) {
    return text("Read your words.");
  }
  if (request.last.includes(FIRST) && !request.afterTool) {
    return request.toolNames.includes("Bash")
      ? {
          everyMs: 5,
          words: [],
          tool: {
            name: "Bash",
            input: { command: "sleep 8", description: "Wait a while" },
          },
        }
      : text("Bash is not offered");
  }
  return text("ok");
};

const spec: Spec = {
  name: "mid-turn",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const session = await fleet.spawn("claude", "Mid-turn probe");
    await fleet.send(session, FIRST);
    // The tool call answered: the turn is in its `sleep 8`.
    await until(
      "the turn's slow tool call",
      () =>
        fleet.seen.find(
          (one) => one.tools && one.last.includes(FIRST) && !one.afterTool
        ),
      Boolean,
      120_000
    );
    await fleet.send(session, SECOND);
    const read = await until(
      "a request whose newest words are the mid-turn ones",
      () => fleet.seen.find((one) => one.last.includes(SECOND)),
      Boolean,
      60_000
    ).catch(() => undefined);
    const shown = fleet.seen.slice(-4).map((one) => ({
      afterTool: one.afterTool,
      last: one.last.slice(0, 160),
      lastMidTurn: one.lastMidTurn,
    }));
    kit.check(
      "words sent while the turn runs are the next request's last, marked mid-turn",
      read?.lastMidTurn === true && read.last.startsWith(MID_TURN),
      JSON.stringify(shown)
    );
    const at = read?.all.indexOf(SECOND) ?? -1;
    kit.check(
      "its all holds the prompt, then the mid-turn words",
      at > 0 &&
        (read?.all.indexOf(FIRST) ?? -1) >= 0 &&
        (read?.all.indexOf(FIRST) ?? at) < at,
      read?.all.slice(-400)
    );
  },
};

export default spec;
