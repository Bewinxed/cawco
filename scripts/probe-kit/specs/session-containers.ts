/**
 * A container a session's work starts stops with the session (agent
 * session-containers.ts); one started outside every session is never
 * touched. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), with no workspace, against the machine's own
 * rootless Podman service, which every one of the spec's podman commands
 * reaches too. The agent's `DOCKER_HOST` is `tcp://127.0.0.1:9`, an endpoint
 * no door reaches; its Podman is the machine's.
 *
 * - (u1) As the session launches, the hub tells it that containers it starts
 *   at `tcp://127.0.0.1:9` will not stop when it ends.
 * - (c1) The session's shell starts, each through its door: `sleep 6071`;
 *   `sleep 6072` with `--name`; `sleep 6074` named and labelled
 *   `com.docker.compose.project`, as Compose creates one; `sleep 6075` in a
 *   pod `podman pod create` made; a kube play's pod running `sleep 6076`;
 *   `sleep 6078` and `sleep 6079`. Each runs, labelled with the session.
 * - (c2) The spec's own `sleep 6073`, started outside every session (no
 *   `CONTAINER_HOST`, local podman), carries no session label.
 * - (c3) Both pods (the `podman pod create` one and the kube play's) carry
 *   the session's label.
 * - (s1) The agent is killed, and an ending of the session is left as an
 *   agent that died midway leaves one, naming only `sleep 6078`: everything
 *   else of the session's was started after it was written down, as a
 *   session woken since starts them. The agent starts again: within
 *   {@link END_WAIT_MS} `sleep 6078` is gone and the ending is crossed off.
 * - (s2) Every other container of the session's still runs.
 * - The session is stopped. Within {@link END_WAIT_MS}:
 *   - (e1) `sleep 6071` is gone, stopped and removed (`sleep` as a
 *     container's init ignores SIGTERM: it ended at its stop timeout's
 *     SIGKILL); so is `sleep 6079`.
 *   - (e2) the `--name` one is stopped and kept.
 *   - (k1) the Compose one is gone: Compose's names are not the person's.
 *   - (p1) the `podman pod create` pod is gone, its infra container with it,
 *     and `sleep 6075`.
 *   - (q1) the kube play's pod is gone, and `sleep 6076`.
 *   - (e3) the spec's own container still runs.
 *   - (n1) the hub said what was stopped, naming the kept one.
 *
 *   bun scripts/probe-kit/run.ts session-containers
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ENDING_DIR_NAME,
  type EndingRecord,
  SESSION_LABEL,
} from "../../../packages/agent/src/session-containers";
import { containerWords } from "../../../packages/core/src/words/containers";
import { type Fleet, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How long an ending has: the stop, the 10 s stop timeout, the removal, and room. */
const END_WAIT_MS = 90_000;
const IMAGE = "docker.io/library/alpine:3.20";
/** The agent's Docker endpoint: one no door reaches (the discard port, which nothing here serves). */
const UNTRACKED = "tcp://127.0.0.1:9";
const RUN = "6071";
const NAMED = "6072";
const OUTSIDE = "6073";
const COMPOSED = "6074";
const IN_POD = "6075";
const KUBE = "6076";
const ENDED_EARLIER = "6078";
const STARTED_SINCE = "6079";
const tag = crypto.randomUUID().slice(0, 8);
const NAMED_NAME = `cawco-probe-named-${tag}`;
const COMPOSE_NAME = `cawco-probe-compose-${tag}-web-1`;
const KUBE_POD = `cawco-probe-kube-${tag}`;

/** Each command the session runs, one a turn, in this order: the tag its message carries, and the command. */
const COMMANDS: readonly (readonly [string, string])[] = [
  ["PROBE-RUN", `podman run -d ${IMAGE} sleep ${RUN}`],
  ["PROBE-NAMED", `podman run -d --name ${NAMED_NAME} ${IMAGE} sleep ${NAMED}`],
  [
    "PROBE-COMPOSE",
    `podman run -d --name ${COMPOSE_NAME} --label com.docker.compose.project=cawco-probe-${tag} ${IMAGE} sleep ${COMPOSED}`,
  ],
  [
    "PROBE-POD",
    `P=$(podman pod create) && podman run -d --pod "$P" ${IMAGE} sleep ${IN_POD}`,
  ],
  [
    "PROBE-KUBE",
    `printf '%s\\n' 'apiVersion: v1' 'kind: Pod' 'metadata:' '  name: ${KUBE_POD}' 'spec:' '  containers:' '  - name: s' '    image: ${IMAGE}' '    command: ["sleep", "${KUBE}"]' > "./${KUBE_POD}.yaml" && podman kube play "./${KUBE_POD}.yaml"`,
  ],
  ["PROBE-EARLIER", `podman run -d ${IMAGE} sleep ${ENDED_EARLIER}`],
  ["PROBE-SINCE", `podman run -d ${IMAGE} sleep ${STARTED_SINCE}`],
];

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const bash = (command: string): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: { command, description: "Start a container", timeout: 300_000 },
  },
});

const ran = new Set<string>();
/** The session runs each tagged message's one command, then says it is done. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.afterTool) {
    return text("Done.");
  }
  const command = COMMANDS.find(
    ([name]) => request.last.includes(name) && !ran.has(name)
  );
  if (command) {
    ran.add(command[0]);
    return bash(command[1]);
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

interface ListedPod {
  Id: string;
  Labels: Record<string, string> | null;
  Name: string;
  Status: string;
}

/** The container whose command line is `sleep <arg>`, as podman lists it. */
const sleeping = async (arg: string): Promise<Listed | undefined> => {
  const { out } = await podman(["ps", "-a", "--format", "json"]);
  return (
    JSON.parse(out || "[]") as (Listed & { Command: string[] | null })[]
  ).find((one) => (one.Command ?? []).join(" ") === `sleep ${arg}`);
};

/** The pods labelled with session `session`. */
const podsOf = async (session: string): Promise<ListedPod[]> => {
  const { out } = await podman([
    "pod",
    "ps",
    "--filter",
    `label=${SESSION_LABEL}=${session}`,
    "--format",
    "json",
  ]);
  return JSON.parse(out || "[]") as ListedPod[];
};

const said = (one: Listed | undefined): string =>
  one
    ? `${one.Names.join(",")} ${one.State}, labelled ${JSON.stringify(one.Labels?.[SESSION_LABEL] ?? null)}`
    : "no such container";

/** Waits until `sleep <arg>` is gone; whether it went. */
const gone = (arg: string): Promise<boolean> =>
  until(
    `sleep ${arg} gone`,
    async () => ((await sleeping(arg)) ? undefined : true),
    Boolean,
    END_WAIT_MS
  ).then(
    () => true,
    () => false
  );

const SESSION_SLEEPS = [
  RUN,
  NAMED,
  COMPOSED,
  IN_POD,
  KUBE,
  ENDED_EARLIER,
  STARTED_SINCE,
];

/**
 * (s1), (s2): the agent killed, an ending of `session` left as an agent that
 * died midway leaves one, naming only `earlier`; the agent started again
 * ends that one alone and crosses the ending off.
 */
const endingLeft = async (
  kit: Kit,
  fleet: Fleet,
  session: string,
  earlier: Listed | undefined,
  agentEnv: Record<string, string>
): Promise<void> => {
  await fleet.stop("agent", "SIGKILL");
  const endings = join(fleet.env.XDG_DATA_HOME ?? "", "cawco", ENDING_DIR_NAME);
  const ending = join(endings, session);
  const record: EndingRecord = {
    containers: earlier ? [earlier.Id] : [],
    pods: [],
  };
  await mkdir(endings, { recursive: true });
  await writeFile(ending, `${JSON.stringify(record)}\n`);
  fleet.launch("agent", [], agentEnv);
  await fleet.agentUp();
  const earlierGone = await gone(ENDED_EARLIER);
  const crossedOff = await until(
    "the ending crossed off",
    () => (existsSync(ending) ? undefined : true),
    Boolean,
    30_000
  ).then(
    () => true,
    () => false
  );
  kit.check(
    "(s1) the agent, started again, ends what the ending wrote down, and crosses it off",
    earlierGone && crossedOff,
    `sleep ${ENDED_EARLIER}: ${said(await sleeping(ENDED_EARLIER))}; the ending ${crossedOff ? "is crossed off" : `is still at ${ending}`}`
  );
  const others = SESSION_SLEEPS.filter((arg) => arg !== ENDED_EARLIER);
  const still = await Promise.all(others.map(sleeping));
  kit.check(
    "(s2) every container the ending did not name still runs",
    still.every((one) => one?.State === "running"),
    others.map((arg, at) => `sleep ${arg}: ${said(still[at])}`).join("; ")
  );
};

/** Only what this spec started goes: its session's pods and containers, and its own. */
const cleanUp = async (session: string, outsideId: string): Promise<void> => {
  if (session) {
    const pods = (await podsOf(session)).map((pod) => pod.Id);
    if (pods.length > 0) {
      await podman(["pod", "rm", "-f", "-t", "0", ...pods]);
    }
  }
  const own = (await Promise.all(SESSION_SLEEPS.map(sleeping)))
    .flatMap((one) => (one ? [one.Id] : []))
    .concat(outsideId ? [outsideId] : []);
  if (own.length > 0) {
    await podman(["rm", "-f", "-t", "0", ...own]);
  }
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
    // Pulled only when missing: a pull of an image already here still asks
    // its registry, and fails when the registry does not answer (r181: a TLS
    // timeout to registry-1.docker.io, with the image in storage).
    const here = async () => (await podman(["image", "exists", IMAGE])).code;
    const pulled =
      (await here()) === 0 ? undefined : await podman(["pull", "-q", IMAGE]);
    const exists = await here();
    check(
      "(c0) the probe's image is here",
      exists === 0,
      `podman image exists ${IMAGE}: exit ${exists}${pulled ? `; podman pull exit ${pulled.code}: ${pulled.out}` : "; no pull needed"}`
    );
    const fleet = await kit.fleet(respond);
    const agentEnv = { DOCKER_HOST: UNTRACKED };
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], agentEnv);
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const outsideRun = await podman(["run", "-d", IMAGE, "sleep", OUTSIDE]);
    const outsideId = outsideRun.out.split("\n").at(-1) ?? "";
    let session = "";
    try {
      // ── (u1) a runtime no door reaches ──────────────────────────────────
      const launched = await fleet.logMark("hub");
      session = await fleet.spawn("claude", "Start containers");
      const untracked = await until(
        "the hub's notice of an endpoint with no door",
        async () =>
          (await launched.since())
            .split("\n")
            .find(
              (line) =>
                line.includes(containerWords.untrackedPhrase) &&
                line.includes(session)
            ),
        Boolean,
        30_000
      ).catch(() => undefined);
      check(
        "(u1) the session is told that what it starts at an endpoint no door reaches will not stop with it",
        !!untracked?.includes(UNTRACKED),
        untracked ?? "no such line in the hub's log"
      );

      // ── (c1)–(c3) the session's containers and pods, and one outside ────
      for (const [at, [name]] of COMMANDS.entries()) {
        // biome-ignore lint/performance/noAwaitInLoops: one command at a time, each read back before the next
        await fleet.send(session, `${name}: start it.`);
        await until(
          `the ${name} command's end`,
          () =>
            fleet.seen.filter((request) => request.afterTool).length >= at + 1,
          Boolean,
          300_000
        ).catch(() => undefined);
      }
      const made = await Promise.all(SESSION_SLEEPS.map(sleeping));
      check(
        "(c1) each container the session started runs, labelled with it",
        made.every(
          (one) =>
            one?.State === "running" && one.Labels?.[SESSION_LABEL] === session
        ),
        `session ${session}: ${SESSION_SLEEPS.map((arg, at) => `sleep ${arg}: ${said(made[at])}`).join("; ")}; the commands ran: ${[...ran].join(", ")}`
      );
      const mine = await sleeping(OUTSIDE);
      check(
        "(c2) the spec's own container runs, with no session's label",
        mine?.State === "running" && !mine.Labels?.[SESSION_LABEL],
        `${outsideRun.out}: ${said(mine)}`
      );
      const pods = await podsOf(session);
      check(
        "(c3) both pods carry the session's label: the one it created, and the kube play's",
        pods.length === 2 && pods.some((pod) => pod.Name === KUBE_POD),
        JSON.stringify(pods.map((pod) => [pod.Name, pod.Status]))
      );

      // ── (s1), (s2) an ending left by an agent that died midway ───────────
      await endingLeft(
        kit,
        fleet,
        session,
        made[SESSION_SLEEPS.indexOf(ENDED_EARLIER)],
        agentEnv
      );

      // ── the session ends ────────────────────────────────────────────────
      const hubBefore = await fleet.logMark("hub");
      await fleet.stopSession(session);
      const [runGone, sinceGone] = await Promise.all([
        gone(RUN),
        gone(STARTED_SINCE),
      ]);
      check(
        "(e1) its unnamed containers are stopped and removed, the one started since the old ending too",
        runGone && sinceGone,
        `sleep ${RUN}: ${said(await sleeping(RUN))}; sleep ${STARTED_SINCE}: ${said(await sleeping(STARTED_SINCE))}`
      );
      const kept = await sleeping(NAMED);
      check(
        "(e2) the container it named is stopped and kept",
        kept?.State === "exited",
        said(kept)
      );
      check(
        "(k1) the container Compose named is stopped and removed",
        await gone(COMPOSED),
        said(await sleeping(COMPOSED))
      );
      const podsLeft = await podsOf(session);
      check(
        "(p1) the pod it created is gone, its infra container and its container with it",
        (await gone(IN_POD)) && !podsLeft.some((pod) => pod.Name !== KUBE_POD),
        `sleep ${IN_POD}: ${said(await sleeping(IN_POD))}; its pods left: ${JSON.stringify(podsLeft.map((pod) => pod.Name))}`
      );
      check(
        "(q1) the kube play's pod is gone, and its container",
        (await gone(KUBE)) &&
          !(await podsOf(session)).some((pod) => pod.Name === KUBE_POD),
        `sleep ${KUBE}: ${said(await sleeping(KUBE))}`
      );
      const ours = await sleeping(OUTSIDE);
      check(
        "(e3) the spec's own container still runs",
        ours?.State === "running",
        said(ours)
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
        "(n1) the hub tells what was stopped, naming the kept one",
        !!told?.includes(NAMED_NAME),
        told ?? "no such line in the hub's log"
      );
    } finally {
      await cleanUp(session, outsideId);
    }
  },
};

export default spec;
