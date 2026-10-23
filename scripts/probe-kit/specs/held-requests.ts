/**
 * A request to a machine whose link drops while it waits is held, not
 * failed: it goes again, under its own id, on the machine's next register,
 * and fails only when its own deadline passes with the machine still away
 * (hub server.ts `onAgentLeft`, `resendHeld`, `awaitReply`; agent
 * request-record.ts). On a scratch fleet (real hub, two machines' agents
 * and sessiond; no session): the second machine reaches the hub through the
 * kit's relay (relay.ts), whose cut is the drop.
 *
 * - Back in time: its agent frozen, the machine is asked to inspect its
 *   config (10 s deadline); its link is cut while the ask waits and let back
 *   1 s later, and its agent thawed. The ask is answered, with the
 *   machine's inspection, and the hub says it sent the held request again.
 * - Away past the deadline: asked again, frozen, cut, and kept away. The ask
 *   (a read: it runs nothing) fails only at its deadline, as its machine
 *   away: 503 naming it (`X-Cawco-Machine`), never "whether it ran is not
 *   known" (a write's words, server.ts `asRead`) nor "Completion is
 *   unknown".
 * - Asked while away: its link cut first, the machine is asked while it is
 *   away inside its reconnecting window, and let back 1 s later. The ask is
 *   held from the moment it is made and answered once the machine is back,
 *   never "isn't connected".
 * - A git read dropped mid-read: the first machine's agent runs with a `git`
 *   first on its PATH that holds `git status` in the session's repo while a
 *   hold file stands. A session's continuation is sized (GET
 *   …/continue: the session's start, its continuation inputs, then its git
 *   changes, server.ts `gitChangesOf`); once the git read is held there, the
 *   agent is killed and kept away. The sizing answers at the read's deadline
 *   503 naming the machine, never "whether it ran is not known"; with the
 *   agent back, the same sizing answers.
 *
 *   bun scripts/probe-kit/run.ts held-requests
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { signal, spawnedPid } from "../../../packages/core/src/signal";
import { delay, MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { relay } from "../relay";

const OTHER = "held-requests-other";
/** What the hub says as it sends held requests again (server.ts `resendHeld`). */
const RESENT = "request(s) held for it sent again under their own ids";
/** The hub's words for a write whose deadline passed with its machine away: never a read's. */
const UNKNOWN = "whether it ran is not known";
/** The hub's read deadline (server.ts `READ_TIMEOUT_MS`). */
const READ_DEADLINE_MS = 10_000;
/** The git read leg's session, and its turn before it is sized. */
const GIT_TITLE = "PROBE-held git read";
const GIT_TURN = "PROBE-held-git-turn";

/** A route's answer as the hub gave it: its status, the machine it names away, and its words. */
interface Answered {
  ms: number;
  named: string | null;
  said: string;
  status: number;
}

/** `path` asked of the hub (POST with `body`), answered or refused, with when. */
const ask = async (
  fleet: KitFleet,
  path: string,
  body?: unknown
): Promise<Answered> => {
  const asked = Date.now();
  const response = await fetch(`${fleet.base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  return {
    ms: Date.now() - asked,
    status: response.status,
    named: response.headers.get("x-cawco-machine"),
    said: await response.text(),
  };
};

/** An answer as a check's detail says it. */
const told = (got: Answered) =>
  `${got.status} in ${Math.round(got.ms / 1000)} s, X-Cawco-Machine ${got.named ?? "(none)"}: ${got.said.slice(0, 300)}`;

/** A read whose machine was away at its deadline, as the hub must answer it. */
const awayAnswer = (got: Answered, machineId: string) =>
  got.status === 503 &&
  got.named === machineId &&
  !got.said.includes(UNKNOWN) &&
  !got.said.includes("Completion is unknown") &&
  got.ms >= READ_DEADLINE_MS - 500;

/**
 * A `git` that holds `git status` in `repo` while `hold` stands, saying so
 * in `reached`, then runs the real one: the git read caught mid-read.
 */
const holdingGit = async (
  dir: string,
  repo: string,
  hold: string,
  reached: string
): Promise<void> => {
  const real = Bun.which("git");
  if (!real) {
    throw new Error("no git on this PATH to stand in front of");
  }
  await mkdir(dir, { recursive: true });
  const script = join(dir, "git");
  await writeFile(
    script,
    `#!/bin/sh
case " $* " in
  *" status "*)
    if [ -e '${hold}' ] && [ "$(pwd -P)" = "$(cd '${repo}' && pwd -P)" ]; then
      : > '${reached}'
      while [ -e '${hold}' ]; do sleep 0.1; done
    fi
    ;;
esac
exec '${real}' "$@"
`
  );
  await chmod(script, 0o755);
};

const spec: Spec = {
  name: "held-requests",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    const hold = join(fleet.sandbox, "held-git.hold");
    const reached = join(fleet.sandbox, "held-git.reached");
    const shims = join(fleet.sandbox, "held-git-bin");
    await holdingGit(shims, fleet.repo, hold, reached);
    const agentEnv = {
      PATH: `${shims}:${fleet.env.PATH ?? process.env.PATH ?? ""}`,
    };
    fleet.launch("agent", [], agentEnv);
    await fleet.agentUp();
    const between = relay(fleet.base);
    const other = await fleet.launchMachine(OTHER, {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    const { agent } = other;
    const pid = spawnedPid(agent);
    if (pid === undefined) {
      throw new Error(`${OTHER}'s agent has no pid to freeze`);
    }
    const freeze = (frozen: boolean) =>
      signal(pid, frozen ? "SIGSTOP" : "SIGCONT");
    const inspect = () =>
      fleet.api<{ cwd?: string }>(`/api/agents/${OTHER}/inspect`, {});
    // Back in time.
    const before = await fleet.logMark("hub");
    freeze(true);
    const asked = Date.now();
    const answer = inspect().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: String(error) })
    );
    await delay(500);
    between.cut();
    await delay(1000);
    between.release();
    freeze(false);
    const got = await answer;
    check(
      "a request held across its machine's dropped link is answered once the machine is back",
      got.ok && typeof got.value === "object",
      `${Math.round((Date.now() - asked) / 1000)} s; ${got.ok ? JSON.stringify(got.value).slice(0, 200) : got.error.slice(0, 400)}`
    );
    const said = await before.since();
    check(
      "the hub sent the held request again on the machine's register",
      said.includes(RESENT),
      said
        .split("\n")
        .filter((line) => line.includes(OTHER) || line.includes("held"))
        .slice(-5)
        .join(" | ")
    );

    // Away past the deadline.
    freeze(true);
    const late = ask(fleet, `/api/agents/${OTHER}/inspect`, {});
    await delay(500);
    between.cut();
    const failed = await late;
    between.release();
    freeze(false);
    check(
      "a read whose machine stays away fails at its own deadline as its machine away: 503 naming it, never “whether it ran is not known”",
      awayAnswer(failed, OTHER),
      told(failed)
    );

    // Asked while away. The machine is back first: its next register ends
    // the reconnect the last leg left it in.
    await until(
      "the second machine is back",
      async () =>
        (
          await fleet.api<{ machineId: string; status: string }[]>(
            "/api/agents"
          )
        ).find((one) => one.machineId === OTHER)?.status === "online" ||
        undefined,
      Boolean,
      60_000
    );
    const beforeAway = await fleet.logMark("hub");
    between.cut();
    await delay(500);
    const askedAway = Date.now();
    const whileAway = inspect().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: String(error) })
    );
    await delay(1000);
    between.release();
    const gotAway = await whileAway;
    check(
      "a request made while its machine is away is held from then and answered once the machine is back",
      gotAway.ok && typeof gotAway.value === "object",
      `${Math.round((Date.now() - askedAway) / 1000)} s; ${gotAway.ok ? JSON.stringify(gotAway.value).slice(0, 200) : gotAway.error.slice(0, 400)}`
    );
    check(
      "the hub sent the request held from its making on the machine's register",
      (await beforeAway.since()).includes(RESENT)
    );
    between.stop();

    // A git read dropped mid-read.
    const id = await fleet.spawn("claude", GIT_TITLE, fleet.repo);
    await fleet.send(id, GIT_TURN);
    await until(
      "the git leg's turn read",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM sent_messages WHERE body LIKE ?",
          `%${GIT_TURN}%`
        ),
      (rows) => rows.some((one) => one.state === "read"),
      60_000
    );
    const sizing = `/api/instances/${id}/continue?asks=true`;
    const sized = await ask(fleet, sizing);
    check(
      "the session's continuation is sized while its machine is here",
      sized.status === 200,
      told(sized)
    );
    await writeFile(hold, "");
    const held = ask(fleet, sizing);
    await until(
      "the git read held on the machine",
      () => Bun.file(reached).exists(),
      Boolean,
      30_000
    );
    // The continuation inputs read beside it answer in milliseconds: only
    // the git read is out when the agent goes.
    await delay(1000);
    await fleet.stop("agent", "SIGKILL");
    const dropped = await held;
    await Bun.file(hold).delete();
    check(
      "a git read whose agent went mid-read answers at its deadline as its machine away: 503 naming it, never “whether it ran is not known”",
      awayAnswer(dropped, MACHINE),
      told(dropped)
    );
    fleet.launch("agent", [], agentEnv);
    await fleet.agentUp();
    const again = await until(
      "the sizing answers with the agent back",
      () => ask(fleet, sizing),
      (back) => back.status === 200,
      60_000
    ).catch(() => ask(fleet, sizing));
    check(
      "with its machine back, the same sizing reads again and answers",
      again.status === 200,
      told(again)
    );
  },
};

export default spec;
