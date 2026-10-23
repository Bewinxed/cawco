/**
 * A container a session's work starts stops with the session (agent
 * session-containers.ts); one started outside every session is never
 * touched. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), with no workspace, against the machine's own
 * rootless Podman service, which every one of the spec's podman commands
 * reaches too.
 *
 * - (c1) A session's shell runs `podman run -d alpine sleep 6071`, and
 *   then the same with `--name`: each container is running and carries the
 *   session's label, put there by the session's door as podman created it.
 * - (c2) The spec starts `alpine sleep 6073` itself, outside every
 *   session (no `CONTAINER_HOST`, local podman): it carries no session label.
 * - (e1) The session is stopped: within {@link END_WAIT_MS} the unnamed
 *   container is gone, stopped and removed. `sleep` as a container's init
 *   ignores SIGTERM, so it ended at its stop timeout's SIGKILL.
 * - (e2) The named one is still there, stopped: stopped, not removed.
 * - (e3) The spec's own container still runs.
 * - (n1) The hub said what was stopped, in the notice's words, naming both.
 *
 * On main the session's podman reaches no door, its containers carry no
 * label, and both still run after the stop.
 *
 *   bun scripts/probe-kit/run.ts session-containers
 */
import { existsSync } from "node:fs";
import { SESSION_LABEL } from "../../../packages/agent/src/session-containers";
import { containerWords } from "../../../packages/core/src/words/containers";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How long the stop's ending has: the stop, the 10 s stop timeout, the removal, and room. */
const END_WAIT_MS = 90_000;
const IMAGE = "docker.io/library/alpine:3.20";
const RUN_TAG = "PROBE-CONTAINER-RUN";
const NAMED_TAG = "PROBE-CONTAINER-NAMED";
const SLEEP_SESSION = "6071";
const SLEEP_NAMED = "6072";
const SLEEP_OUTSIDE = "6073";
const NAMED = `cawco-probe-named-${crypto.randomUUID().slice(0, 8)}`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const bash = (command: string): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: {
      command,
      description: "Start a container",
      timeout: 300_000,
    },
  },
});

const ran = { run: false, named: false };
/** The session runs each tagged message's one command, then says it is done. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.afterTool) {
    return text("Done.");
  }
  if (request.last.includes(RUN_TAG) && !ran.run) {
    ran.run = true;
    return bash(`podman run -d ${IMAGE} sleep ${SLEEP_SESSION}`);
  }
  if (request.last.includes(NAMED_TAG) && !ran.named) {
    ran.named = true;
    return bash(`podman run -d --name ${NAMED} ${IMAGE} sleep ${SLEEP_NAMED}`);
  }
  return text("ok");
};

/** The spec's own environment for its podman: local, outside every session's door. */
const outside = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      !["CONTAINER_HOST", "CONTAINER_CONNECTION", "DOCKER_HOST"].includes(name)
    ) {
      env[name] = value;
    }
  }
  return env;
};

const podman = async (
  args: string[]
): Promise<{ code: number; out: string }> => {
  const child = Bun.spawn(["podman", ...args], {
    env: outside(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: `${out}${code === 0 ? "" : err}`.trim() };
};

interface Listed {
  Id: string;
  Labels: Record<string, string> | null;
  Names: string[];
  State: string;
}

/** Every container whose command line is `sleep <arg>`, as podman lists it. */
const containersSleeping = async (arg: string): Promise<Listed[]> => {
  const { out } = await podman(["ps", "-a", "--format", "json"]);
  return (
    JSON.parse(out || "[]") as (Listed & { Command: string[] | null })[]
  ).filter((one) => (one.Command ?? []).join(" ") === `sleep ${arg}`);
};

const spec: Spec = {
  name: "session-containers",
  host: "it runs containers on the machine's Podman, which no workspace reaches",
  run: async (kit: Kit) => {
    const { check } = kit;
    const service = `/run/user/${process.getuid?.() ?? 0}/podman/podman.sock`;
    if (!existsSync(service)) {
      check(
        "(c0) the machine's rootless Podman service socket is there",
        false,
        `${service} is not there: run \`systemctl --user start podman.socket\` and run the spec again`
      );
      return;
    }
    const pulled = await podman(["pull", "-q", IMAGE]);
    check("(c0) the probe's image is here", pulled.code === 0, pulled.out);
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const outsideRun = await podman([
      "run",
      "-d",
      IMAGE,
      "sleep",
      SLEEP_OUTSIDE,
    ]);
    const outsideId = outsideRun.out.split("\n").at(-1) ?? "";
    try {
      // ── (c1), (c2) a session's containers, and one outside it ────────────
      const session = await fleet.spawn("claude", "Start containers");
      for (const tag of [RUN_TAG, NAMED_TAG]) {
        // biome-ignore lint/performance/noAwaitInLoops: one command at a time, each read back before the next
        await fleet.send(session, `${tag}: start a container.`);
        await until(
          `the ${tag} command's end`,
          () =>
            fleet.seen.filter((request) => request.afterTool).length >=
            (tag === RUN_TAG ? 1 : 2),
          Boolean,
          300_000
        ).catch(() => undefined);
      }
      const [unnamed] = await containersSleeping(SLEEP_SESSION);
      const [named] = await containersSleeping(SLEEP_NAMED);
      const said = (one: Listed | undefined) =>
        one
          ? `${one.Names.join(",")} ${one.State}, labelled ${JSON.stringify(one.Labels?.[SESSION_LABEL] ?? null)}`
          : "no such container";
      check(
        "(c1) the session's two containers run, each labelled with the session",
        [unnamed, named].every(
          (one) =>
            one?.State === "running" && one.Labels?.[SESSION_LABEL] === session
        ),
        `session ${session}: ${said(unnamed)}; ${said(named)}; the commands ran: ${JSON.stringify(ran)}`
      );
      const [mine] = await containersSleeping(SLEEP_OUTSIDE);
      check(
        "(c2) the spec's own container runs, with no session's label",
        mine?.State === "running" && !mine.Labels?.[SESSION_LABEL],
        `${outsideRun.out}: ${said(mine)}`
      );

      // ── (e1)–(e3), (n1) the session ends ─────────────────────────────────
      const hubBefore = await fleet.logMark("hub");
      await fleet.stopSession(session);
      const ended = await until(
        "the session's unnamed container gone",
        () => containersSleeping(SLEEP_SESSION),
        (left) => left.length === 0,
        END_WAIT_MS
      ).catch(() => undefined);
      check(
        "(e1) the session's unnamed container is stopped and removed",
        ended !== undefined,
        said((await containersSleeping(SLEEP_SESSION))[0])
      );
      const [kept] = await containersSleeping(SLEEP_NAMED);
      check(
        "(e2) the container it named is stopped and kept",
        kept?.State === "exited",
        said(kept)
      );
      const [still] = await containersSleeping(SLEEP_OUTSIDE);
      check(
        "(e3) the spec's own container still runs",
        still?.State === "running",
        said(still)
      );
      const told = await until(
        "the hub's notice of the ended containers",
        async () =>
          (await hubBefore.since())
            .split("\n")
            .find(
              (line) =>
                line.includes(containerWords.ended) && line.includes(session)
            ),
        Boolean,
        30_000
      ).catch(() => undefined);
      check(
        "(n1) the hub tells what was stopped, naming the removed one and the kept one",
        !!told?.includes(NAMED) && told.includes(IMAGE),
        told ?? "no such line in the hub's log"
      );
    } finally {
      // Only what this spec started: its two sessions' containers and its own.
      const own = [
        ...(await containersSleeping(SLEEP_SESSION)),
        ...(await containersSleeping(SLEEP_NAMED)),
      ]
        .map((one) => one.Id)
        .concat(outsideId ? [outsideId] : []);
      if (own.length > 0) {
        await podman(["rm", "-f", "-t", "0", ...own]);
      }
    }
  },
};

export default spec;
