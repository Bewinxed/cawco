/**
 * Every Claude session CawCo starts runs with Claude Code's silent-turn
 * reminder off (agent `CLAUDE_QUIET_ENV`), even when the person's own
 * environment turns it on: read on a scratch fleet with the real Claude Code
 * against the mock model.
 *
 * The agent and sessiond start with `CLAUDE_CODE_SILENT_TURN_REMINDER=1`, as
 * a person's shell might hand them. One session is spawned and given a turn;
 * asserted: the CLI process sessiond holds for it has
 * `CLAUDE_CODE_SILENT_TURN_REMINDER=0` in `/proc/<pid>/environ` (Linux only).
 *
 * Not shown here: the reminder's absence from a request. It fires only after
 * a run of tool-only turns and its default is a server flag the mock does not
 * serve, so a request without it proves nothing on its own.
 *
 *   bun scripts/probe-kit/run.ts claude-silent-reminder
 */
import { CLAUDE_QUIET_ENV } from "../../../packages/agent/src/claude-env";
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const NAME = "CLAUDE_CODE_SILENT_TURN_REMINDER";
/** The person's own setting, which CawCo's must override. */
const PERSON = { [NAME]: "1" };

const spec: Spec = {
  name: "claude-silent-reminder",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
    fleet.launch("sessiond", [], PERSON);
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], PERSON);
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const instanceId = await fleet.spawn(
      "claude",
      "silent reminder",
      fleet.workdir
    );
    const prompt = `Silent reminder ${crypto.randomUUID()}`;
    await fleet.send(instanceId, prompt);
    await until(
      "the mock receiving the session's turn",
      () => fleet.seen.find((seen) => seen.last.includes(prompt)),
      Boolean,
      120_000
    );
    const pid = await until(
      "sessiond holding the session's CLI",
      () => fleet.sessionPid(instanceId),
      (found) => found !== undefined,
      30_000
    );
    const value = (await Bun.file(`/proc/${pid}/environ`).text())
      .split("\0")
      .find((line) => line.startsWith(`${NAME}=`))
      ?.slice(NAME.length + 1);
    kit.note(`pid ${pid}: ${NAME}=${value ?? "(unset)"}`);
    check(
      `the session's Claude Code runs with ${NAME}=${CLAUDE_QUIET_ENV[NAME]} over the person's ${PERSON[NAME]}`,
      value === CLAUDE_QUIET_ENV[NAME],
      `read ${value ?? "unset"}`
    );
    await fleet.stopSession(instanceId);
  },
};

export default spec;
