/**
 * A send that reaches a session while a foreground shell command holds its
 * turn is read within seconds: the command is moved to the background, not
 * stopped, and its end reaches the session later. On a scratch fleet (real
 * hub, agent and sessiond; Claude Code and OpenCode against the mock), per
 * harness:
 *
 * 1. A prompt whose turn runs a foreground shell loop of ~90 s; 5 s into
 *    it, a person's send. The request that answers the send reaches the
 *    model within 20 s of the send.
 * 2. The call returned as moved to the background: its result says so, in
 *    the request the model was sent and in the hub's stored transcript.
 * 3. The loop is still running after that reply, and its end reaches the
 *    session as a later request whose newest words name it.
 *
 * Claude Code's Bash runs only outside a workspace boundary, so this runs on
 * the host:
 *
 *   bun scripts/probe-kit/run.ts send-backgrounds
 */
import type { Harness, Reply, Seen } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

/** How long the foreground loop runs. */
const LOOP_S = 90;
/** How far into the loop the send goes. */
const SEND_AFTER_MS = 5000;
/** The longest the reply to the send may take to start. */
const REPLY_WITHIN_MS = 20_000;

/** A foreground wait of {@link LOOP_S} seconds whose command line names `loop`. */
const loopCommand = (loop: string) =>
  `i=0; while [ $i -lt ${LOOP_S} ]; do sleep 1; i=$((i+1)); done; echo ${loop}-DONE`;

interface Case {
  harness: Harness;
  /**
   * The harness's shell tool and its input. Claude Code's notice of a
   * task's end names the call's `description`, not its command, so the
   * loop's mark goes in both.
   */
  tool: (loop: string) => { name: string; input: object };
}

const CASES: Case[] = [
  {
    harness: "claude",
    tool: (loop) => ({
      name: "Bash",
      input: {
        command: loopCommand(loop),
        description: `${loop} wait`,
        timeout: 600_000,
      },
    }),
  },
  {
    harness: "opencode",
    tool: (loop) => ({
      name: "shell",
      input: { command: loopCommand(loop), timeout: 600_000 },
    }),
  },
];

const marks = (harness: Harness) => ({
  first: `PROBE-SBG-${harness}-FIRST run the wait loop`,
  second: `PROBE-SBG-${harness}-SECOND words sent while the loop runs`,
  reply: `PROBE-SBG-${harness}-REPLY read your words`,
  /** In the loop's command line, its output and its notice: what `pgrep -f` finds. */
  loop: `PROBE-SBG-${harness}-LOOP`,
});

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  for (const { harness, tool } of CASES) {
    const mark = marks(harness);
    if (!request.all.includes(mark.first)) {
      continue;
    }
    if (request.last.includes(mark.second)) {
      return text(mark.reply);
    }
    if (request.last.includes(mark.first) && !request.afterTool) {
      const call = tool(mark.loop);
      return request.toolNames.includes(call.name)
        ? { everyMs: 5, words: [], tool: call }
        : text(`${call.name} is not offered`);
    }
  }
  return text("ok");
};

/** Whether a process whose command line names `loop` is running. */
const looping = async (loop: string): Promise<boolean> =>
  (await Bun.$`pgrep -f ${loop}`.nothrow().quiet()).exitCode === 0;

/** A tool result that says its call went on in the background: OpenCode's and Claude Code's words. */
const BACKGROUNDED = /moved to the background|manually backgrounded/;
/** Where a reader finds those words in a request or a transcript. */
const AROUND_BACKGROUND = /.{0,300}background.{0,300}/;
/** The agent's lines for a send that moved a call (claude.ts, opencode-session.ts `#moveToBackground`). */
const CLAUDE_MOVED = /\[claude\] .*moved it to the background/;
const OPENCODE_MOVED =
  /\[opencode\] .*asked OpenCode to move them to the background/;

const spec: Spec = {
  name: "send-backgrounds",
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

    for (const { harness } of CASES) {
      const mark = marks(harness);
      // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, each its own session
      const session = await fleet.spawn(harness, `Send-backgrounds ${harness}`);
      await fleet.send(session, mark.first);
      // The tool call answered: the turn is in its loop.
      await until(
        `${harness}: the turn's loop started`,
        () => looping(mark.loop),
        Boolean,
        120_000
      );
      await Bun.sleep(SEND_AFTER_MS);
      const sentAt = Date.now();
      await fleet.send(session, mark.second);
      const reply = await until(
        `${harness}: a request whose newest words are the send`,
        () =>
          fleet.seen.find(
            (one) => one.at >= sentAt && one.last.includes(mark.second)
          ),
        Boolean,
        LOOP_S * 1000
      ).catch(() => undefined);
      const took = reply ? reply.at - sentAt : undefined;
      kit.check(
        `${harness}: the reply to a send made 5 s into a ${LOOP_S} s foreground loop starts within ${REPLY_WITHIN_MS / 1000} s`,
        took !== undefined && took <= REPLY_WITHIN_MS,
        `took ${took ?? "no reply"} ms; last requests: ${JSON.stringify(
          fleet.seen.slice(-4).map((one) => ({
            at: one.at - sentAt,
            afterTool: one.afterTool,
            last: one.last.slice(0, 160),
          }))
        )}`
      );
      kit.check(
        `${harness}: the loop is still running after the reply`,
        await looping(mark.loop)
      );
      kit.check(
        `${harness}: the model was told the call moved to the background`,
        reply !== undefined && BACKGROUNDED.test(reply.body),
        reply?.body.match(AROUND_BACKGROUND)?.[0]
      );
      const transcript = JSON.stringify(
        await fleet
          .api<unknown>(`/api/instances/${session}/transcript?limit=200`)
          .catch((error: unknown) => String(error))
      );
      kit.check(
        `${harness}: the stored transcript shows the call returned as moved to the background`,
        BACKGROUNDED.test(transcript),
        transcript.match(AROUND_BACKGROUND)?.[0] ?? transcript.slice(-600)
      );
      const replyAt = reply?.at ?? sentAt;
      const notice = await until(
        `${harness}: the loop's end reaching the session`,
        () =>
          fleet.seen.find(
            (one) =>
              one.at > replyAt &&
              one.last.includes(mark.loop) &&
              !one.last.includes(mark.second)
          ),
        Boolean,
        (LOOP_S + 60) * 1000
      ).catch(() => undefined);
      kit.check(
        `${harness}: the loop's completion reaches the session after it ends`,
        notice !== undefined && !(await looping(mark.loop)),
        notice
          ? `at +${notice.at - sentAt} ms: ${notice.last.slice(0, 300)}`
          : `none; last requests: ${JSON.stringify(
              fleet.seen.slice(-3).map((one) => ({
                at: one.at - sentAt,
                last: one.last.slice(0, 200),
              }))
            )}`
      );
    }
    const agentLog = await fleet.logs("agent");
    kit.check(
      "the agent says it moved each call to the background for a send",
      CLAUDE_MOVED.test(agentLog) && OPENCODE_MOVED.test(agentLog),
      agentLog
        .split("\n")
        .filter((line) => line.includes("to the background"))
        .slice(-6)
        .join("\n")
    );
  },
};

export default spec;
