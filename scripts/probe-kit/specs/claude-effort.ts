/**
 * Every Claude session CawCo starts runs at the effort its spawn names, and
 * CawCo reads back the effort the CLI applied, every time: read on a scratch
 * fleet with the real Claude Code against the mock model.
 *
 * For each level, on a model with effort (Opus 5.5) and one without (Haiku
 * 4.5, which takes no effort parameter: it reads back none), one session is
 * spawned at that level and given a turn. Asserted per session:
 *
 *   - the request the mock received carries the level CawCo asked for, as
 *     `output_config.effort` (none at all on Haiku 4.5);
 *   - the hub's row holds the agent's `EFFORT_READ`, the CLI's own
 *     `get_settings` `applied.effort`, and it is that level (`none` on
 *     Haiku 4.5);
 *   - stopped in the middle of a second turn, the read the interrupted
 *     turn's end makes still lands: the agent never logs "effort read
 *     failed" for it ("Query closed before response received", the SDK's
 *     answer to a request still open when the query closes).
 *
 *   bun scripts/probe-kit/run.ts claude-effort
 */
import { EFFORT_LEVELS, EFFORT_NONE } from "../../../packages/core/src/harness";
import { delay, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

/** A turn the mock answers slowly: the stop lands in the middle of it. */
const SLOW = "Take your time over this one.";

const CASES = [
  ...EFFORT_LEVELS.map((level) => ({
    model: "claude-opus-5-5",
    asked: level,
    sent: level as string | undefined,
    read: level as string,
  })),
  ...EFFORT_LEVELS.map((level) => ({
    model: "claude-haiku-4-5",
    asked: level,
    sent: undefined,
    read: EFFORT_NONE as string,
  })),
];

/** The effort a request carries: its top-level `output_config.effort`, else the last message's. */
const sentEffort = (request: Seen): string | undefined => {
  const body = JSON.parse(request.body) as {
    messages?: { output_config?: { effort?: string } }[];
    output_config?: { effort?: string };
  };
  return (
    body.output_config?.effort ??
    body.messages?.findLast((message) => message.output_config?.effort)
      ?.output_config?.effort
  );
};

const spec: Spec = {
  name: "claude-effort",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet((request) =>
      request.last.includes(SLOW)
        ? { everyMs: 500, words: Array.from({ length: 120 }, () => "slow ") }
        : { everyMs: 5, words: ["done"] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    for (const { model, asked, sent, read } of CASES) {
      const label = `${model} at ${asked}`;
      const prompt = `Effort ${model} ${asked} ${crypto.randomUUID()}`;
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time, so each log line is its own
      const instanceId = await fleet.spawn("claude", label, fleet.workdir, {
        model,
        effort: asked,
      });
      await fleet.send(instanceId, prompt);
      const request = await until(
        `${label}: the mock receiving its turn`,
        () =>
          fleet.seen.find((seen) => seen.tools && seen.last.includes(prompt)),
        Boolean,
        120_000
      );
      const effort = sentEffort(request);
      const body = JSON.parse(request.body) as { thinking?: unknown };
      kit.note(
        `${label}: the mock saw output_config.effort ${effort ?? "(none)"}, thinking ${JSON.stringify(body.thinking ?? null)}`
      );
      check(
        `${label}: the CLI sends the effort CawCo asked for`,
        effort === sent,
        `sent ${effort ?? "none"}, expected ${sent ?? "none"}`
      );
      const row = await until(
        `${label}: the hub holding its EFFORT_READ`,
        () =>
          fleet.query<{ effort: string | null }>(
            "SELECT effort FROM instances WHERE id = ?",
            instanceId
          )[0],
        (found) => found.effort !== null,
        60_000
      );
      kit.note(`${label}: get_settings applied.effort read ${row.effort}`);
      check(
        `${label}: EFFORT_READ carries the effort the CLI applied`,
        row.effort === read,
        `read ${row.effort}, expected ${read}`
      );

      // Stopped in the middle of a turn: the interrupted turn's end reads
      // the effort again while the stop closes the query.
      await fleet.send(instanceId, SLOW);
      await until(
        `${label}: the mock receiving the slow turn`,
        () =>
          fleet.seen.find(
            (seen) =>
              seen.tools && seen.last.includes(SLOW) && seen.at > request.at
          ),
        Boolean,
        120_000
      );
      await fleet.stopSession(instanceId);
      await until(
        `${label}: the session stopped`,
        () => fleet.instance(instanceId),
        (found) => found.status === "stopped",
        60_000
      );
      // The read the stop's interrupt set off answers, or fails, within it.
      await delay(2000);
      const failed = (await fleet.logs("agent"))
        .split("\n")
        .filter(
          (line) =>
            line.includes(instanceId) && line.includes("effort read failed")
        );
      check(
        `${label}: every effort read lands, the stop's included`,
        failed.length === 0,
        failed.join(" | ")
      );
    }
  },
};

export default spec;
