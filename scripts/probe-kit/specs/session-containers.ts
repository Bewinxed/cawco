/**
 * A container a session's work starts stops with the session (agent
 * session-containers.ts); one started outside every session is never
 * touched. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), with no workspace, against the machine's own
 * container runtime ({@link findRuntime}): rootless Podman where its service
 * runs (obelisk), else Docker (the owner's Mac, Docker Desktop). The spec
 * reads and removes containers through that runtime's Engine API, the same
 * on both.
 *
 * On Podman the agent's `DOCKER_HOST` is `tcp://127.0.0.1:9`, an endpoint no
 * door reaches. On Docker it is the machine's Docker socket, as its context
 * names it: the scratch HOME has no Docker context of its own.
 *
 * - (u1) Podman: as the session launches, the hub tells it that containers
 *   it starts at `tcp://127.0.0.1:9` will not stop when it ends. Docker: a
 *   NOTE, as there is no second runtime here to point at such an endpoint.
 * - (c1) The session's shell starts, each through its door: `sleep 6071`;
 *   `sleep 6072` with `--name`; `sleep 6074` named and labelled
 *   `com.docker.compose.project`, as Compose creates one; on Podman also
 *   `sleep 6075` in a pod `podman pod create` made, and a kube play's pod
 *   running `sleep 6076` (only where pods can have an infra container: see
 *   {@link infra}); `sleep 6078` and `sleep 6079`. Each runs, labelled with
 *   the session.
 * - (c2) The spec's own `sleep 6073`, started outside every session (no
 *   `CONTAINER_HOST` or `DOCKER_HOST` of a door), carries no session label.
 * - (c3) Podman: its pods (the `podman pod create` one, and the kube play's
 *   where it ran) carry the session's label. Docker has no pods: a NOTE.
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
 *   - (p1) Podman: the `podman pod create` pod is gone, its infra container
 *     with it where it has one, and `sleep 6075`.
 *   - (q1) Podman: the kube play's pod is gone, and `sleep 6076`; pending,
 *     where pods can have no infra container.
 *   - (e3) the spec's own container still runs.
 *   - (n1) the hub said what was stopped, naming the kept one.
 *
 *   bun scripts/probe-kit/run.ts session-containers
 */
import { existsSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
/** The agent's Docker endpoint on Podman: one no door reaches (the discard port, which nothing here serves). */
const UNTRACKED = "tcp://127.0.0.1:9";
const UNIX = "unix://";
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
/**
 * The spec's own marks, on everything it starts, in a session or not: the
 * spec's, by which a run removes what an earlier run of it left (one killed
 * midway runs no finally), and this run's, by which it reads and removes its
 * own. Never a command line: r198 read an earlier run's `sleep 6071`.
 */
const SPEC_MARK = "cawco-probe.spec";
const SPEC_NAME = "session-containers";
const RUN_MARK = "cawco-probe.run";
const MARKS = `--label ${SPEC_MARK}=${SPEC_NAME} --label ${RUN_MARK}=${tag}`;

/** The machine's runtime: which, its CLI by its whole path, and its Engine API socket. */
interface Runtime {
  cli: string;
  kind: "docker" | "podman";
  socket: string;
}

/** Set once the runtime is found, before anything reads it. */
let runtime: Runtime = { kind: "podman", cli: "podman", socket: "" };

/**
 * Whether this machine's Podman makes a pod's infra container, which needs
 * catatonit for its pause image (podman-pod-create(1) `--infra`: "Create an
 * infra container and associate it with the pod … Default: true"; r191 on
 * obelisk: "failed to make pod: finding catatonit binary"). Without it, the
 * session's pod is made `--infra=false`: CawCo labels and ends a pod by its
 * create and its id, never its infra container. A kube play always makes
 * one (podman v5.7.0 pkg/domain/infra/abi/play.go: `podOpt :=
 * entities.PodCreateOptions{ Infra: true, …}`, which no kube play option
 * turns off), so its leg waits for catatonit.
 */
let infra = true;

const podman = (): boolean => runtime.kind === "podman";

/** Each command the session runs, one a turn, in this order: the tag its message carries, and the command. */
const COMMANDS: readonly (readonly [string, () => string])[] = [
  ["PROBE-RUN", () => `${runtime.cli} run -d ${MARKS} ${IMAGE} sleep ${RUN}`],
  [
    "PROBE-NAMED",
    () =>
      `${runtime.cli} run -d ${MARKS} --name ${NAMED_NAME} ${IMAGE} sleep ${NAMED}`,
  ],
  [
    "PROBE-COMPOSE",
    () =>
      `${runtime.cli} run -d ${MARKS} --name ${COMPOSE_NAME} --label com.docker.compose.project=cawco-probe-${tag} ${IMAGE} sleep ${COMPOSED}`,
  ],
  [
    "PROBE-POD",
    () =>
      `P=$(${runtime.cli} pod create ${MARKS}${infra ? "" : " --infra=false"}) && ${runtime.cli} run -d ${MARKS} --pod "$P" ${IMAGE} sleep ${IN_POD}`,
  ],
  [
    "PROBE-KUBE",
    () =>
      `printf '%s\\n' 'apiVersion: v1' 'kind: Pod' 'metadata:' '  name: ${KUBE_POD}' '  labels:' '    ${SPEC_MARK}: ${SPEC_NAME}' '    ${RUN_MARK}: "${tag}"' 'spec:' '  containers:' '  - name: s' '    image: ${IMAGE}' '    command: ["sleep", "${KUBE}"]' > "./${KUBE_POD}.yaml" && ${runtime.cli} kube play "./${KUBE_POD}.yaml"`,
  ],
  [
    "PROBE-EARLIER",
    () => `${runtime.cli} run -d ${MARKS} ${IMAGE} sleep ${ENDED_EARLIER}`,
  ],
  [
    "PROBE-SINCE",
    () => `${runtime.cli} run -d ${MARKS} ${IMAGE} sleep ${STARTED_SINCE}`,
  ],
];

/** The commands this machine runs: pods on Podman alone, the kube play's only where pods have infra. */
const commands = () =>
  COMMANDS.filter(
    ([name]) =>
      (name !== "PROBE-POD" && name !== "PROBE-KUBE") ||
      (podman() && (infra || name !== "PROBE-KUBE"))
  );

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
  const command = commands().find(
    ([name]) => request.last.includes(name) && !ran.has(name)
  );
  if (command) {
    ran.add(command[0]);
    return bash(command[1]());
  }
  return text("ok");
};

/** The spec's own environment for its runtime's CLI: outside every session's door. */
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

/** Runs `cli args` outside every session; its exit and what it said. */
const run = async (
  cli: string,
  args: string[]
): Promise<{ code: number; out: string }> => {
  const child = Bun.spawn([cli, ...args], {
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

/**
 * The machine's runtime: rootless Podman where its service socket is there,
 * else Docker at the socket its current context names (`docker context
 * inspect`); why there is none, else.
 */
const findRuntime = async (): Promise<Runtime | { missing: string }> => {
  const podmanCli = Bun.which("podman");
  const podmanSocket = PODMAN_SOCKET();
  if (podmanCli && existsSync(podmanSocket)) {
    return { kind: "podman", cli: podmanCli, socket: podmanSocket };
  }
  const dockerCli = Bun.which("docker");
  if (!dockerCli) {
    return {
      missing: podmanCli
        ? `${podmanSocket} is not there: run \`systemctl --user start podman.socket\``
        : "neither podman nor docker is on this PATH",
    };
  }
  const host = await run(dockerCli, [
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  const socket = host.out.startsWith(UNIX)
    ? host.out.slice(UNIX.length)
    : undefined;
  return socket && existsSync(socket)
    ? { kind: "docker", cli: dockerCli, socket }
    : {
        missing: `docker's context names ${host.out || "no endpoint"}, not a unix socket that is there`,
      };
};

/** One Engine API call on the runtime's socket: its status and JSON answer. */
const api = async (
  method: string,
  path: string
): Promise<{ body: unknown; status: number }> => {
  const answer = await fetch(`http://d${path}`, {
    method,
    unix: runtime.socket,
  } as RequestInit);
  const said = await answer.text();
  let body: unknown = said;
  try {
    body = JSON.parse(said);
  } catch {
    // Not JSON: its text stands.
  }
  return { status: answer.status, body };
};

const filters = (labels: readonly string[]): string =>
  `filters=${encodeURIComponent(JSON.stringify({ label: labels }))}`;

interface Listed {
  Command: string | string[] | null;
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

/** The containers carrying every one of `labels`, stopped ones too. */
const containersWith = async (labels: readonly string[]): Promise<Listed[]> => {
  const { status, body } = await api(
    "GET",
    `/containers/json?all=true&${filters(labels)}`
  );
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error(`listing containers answered ${status}: ${String(body)}`);
  }
  return body as Listed[];
};

/** The pods carrying every one of `labels`; none on Docker, which has none. */
const podsWith = async (labels: readonly string[]): Promise<ListedPod[]> => {
  if (!podman()) {
    return [];
  }
  const { status, body } = await api(
    "GET",
    `/v4.0.0/libpod/pods/json?${filters(labels)}`
  );
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error(`listing pods answered ${status}: ${String(body)}`);
  }
  return body as ListedPod[];
};

/** The scratch session this run started, once it has: what its containers' session label names. */
let session = "";

/**
 * This run's container running `sleep <arg>`: its own outside every session
 * ({@link OUTSIDE}), else one the session made, labelled with the session.
 */
const sleeping = async (arg: string): Promise<Listed | undefined> => {
  if (arg !== OUTSIDE && !session) {
    return;
  }
  const containers = await containersWith([
    `${RUN_MARK}=${tag}`,
    ...(arg === OUTSIDE ? [] : [`${SESSION_LABEL}=${session}`]),
  ]);
  return containers.find((one) => {
    const command = Array.isArray(one.Command)
      ? one.Command.join(" ")
      : (one.Command ?? "");
    return command === `sleep ${arg}`;
  });
};

/** This run's pods the session made, labelled with it. */
const podsOf = (of: string): Promise<ListedPod[]> =>
  podsWith([`${RUN_MARK}=${tag}`, `${SESSION_LABEL}=${of}`]);

/** Everything carrying `mark`, pods and then containers, removed at once. */
const removeMarked = async (mark: string): Promise<string> => {
  const pods = await podsWith([mark]);
  for (const pod of pods) {
    // biome-ignore lint/performance/noAwaitInLoops: one pod at a time, each with what it holds
    await api("DELETE", `/v4.0.0/libpod/pods/${pod.Id}?force=true`);
  }
  const containers = await containersWith([mark]);
  for (const one of containers) {
    // biome-ignore lint/performance/noAwaitInLoops: one container at a time
    await api("DELETE", `/containers/${one.Id}?force=true`);
  }
  return `${pods.length} pod(s) and ${containers.length} container(s)`;
};

/** What every label CawCo's doors put on starts with. */
const LABEL_PREFIX = "dev.cawco.";

const said = (one: Listed | undefined): string =>
  one
    ? `${one.Names.join(",")} ${one.State}, labelled ${JSON.stringify(
        Object.fromEntries(
          Object.entries(one.Labels ?? {}).filter(([key]) =>
            key.startsWith(LABEL_PREFIX)
          )
        )
      )}`
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

/** What the session's containers run, on this machine's runtime ({@link commands}). */
const sessionSleeps = (): string[] =>
  [RUN, NAMED, COMPOSED, IN_POD, KUBE, ENDED_EARLIER, STARTED_SINCE].filter(
    (arg) =>
      (arg !== IN_POD && arg !== KUBE) || (podman() && (infra || arg !== KUBE))
  );

/** The mode the session's pod ran in, as a leg says it. */
const podMode = (): string =>
  infra
    ? "with its infra container"
    : "made --infra=false: this machine's Podman has no catatonit for an infra container";

/** A leg this machine's runtime has nothing for, said as a NOTE. */
const note = (leg: string, why: string): void => {
  console.log(`NOTE session-containers: ${leg} not run: ${why}`);
};

/**
 * (s1), (s2): the agent killed, an ending of this run's session left as an
 * agent that died midway leaves one, naming only `earlier`; the agent
 * started again ends that one alone and crosses the ending off.
 */
const endingLeft = async (
  kit: Kit,
  fleet: Fleet,
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
  const others = sessionSleeps().filter((arg) => arg !== ENDED_EARLIER);
  const still = await Promise.all(others.map(sleeping));
  kit.check(
    "(s2) every container the ending did not name still runs",
    still.every((one) => one?.State === "running"),
    others.map((arg, at) => `sleep ${arg}: ${said(still[at])}`).join("; ")
  );
};

/** (u1) the session told, as it launches, of the endpoint no door reaches; the session's id. */
const launchSession = async (kit: Kit, fleet: Fleet): Promise<string> => {
  const launched = await fleet.logMark("hub");
  const id = await fleet.spawn("claude", "Start containers");
  if (!podman()) {
    note(
      "(u1)",
      "on Docker the agent's DOCKER_HOST is the machine's socket, and there is no second runtime here to point at an endpoint no door reaches"
    );
    return id;
  }
  const untracked = await until(
    "the hub's notice of an endpoint with no door",
    async () =>
      (await launched.since())
        .split("\n")
        .find(
          (line) =>
            line.includes(containerWords.untrackedPhrase) && line.includes(id)
        ),
    Boolean,
    30_000
  ).catch(() => undefined);
  kit.check(
    "(u1) the session is told that what it starts at an endpoint no door reaches will not stop with it",
    !!untracked?.includes(UNTRACKED),
    untracked ?? "no such line in the hub's log"
  );
  return id;
};

/** (p1), (q1): the session's pods gone with it, on Podman; NOTEs on Docker. */
const podsEnded = async (kit: Kit): Promise<void> => {
  if (!podman()) {
    note("(c3), (p1), (q1)", "Docker has no pods and no kube play");
    return;
  }
  const podsLeft = await podsOf(session);
  kit.check(
    "(p1) the pod it created is gone, its infra container where it has one, and its container",
    (await gone(IN_POD)) && !podsLeft.some((pod) => pod.Name !== KUBE_POD),
    `its pod ${podMode()}; sleep ${IN_POD}: ${said(await sleeping(IN_POD))}; its pods left: ${JSON.stringify(podsLeft.map((pod) => pod.Name))}`
  );
  kit.check(
    "(q1) the kube play's pod is gone, and its container",
    infra &&
      (await gone(KUBE)) &&
      !(await podsOf(session)).some((pod) => pod.Name === KUBE_POD),
    infra
      ? `sleep ${KUBE}: ${said(await sleeping(KUBE))}`
      : "pending catatonit: a kube play always makes an infra container (podman v5.7.0 play.go `podOpt := entities.PodCreateOptions{ Infra: true, …}`), and this machine's Podman has no catatonit for one"
  );
};

/** The rootless Podman service's own socket, as podman(1) names it. */
const PODMAN_SOCKET = (): string =>
  `/run/user/${process.getuid?.() ?? 0}/podman/podman.sock`;

/**
 * The pause image a pod's infra container runs on the spec's own Podman
 * service, where the machine's has no catatonit to build its own
 * (containers.conf(5) `infra_image`: "Infra (pause) container image for pod
 * infra containers").
 */
const PAUSE_IMAGE = "registry.k8s.io/pause:3.10";

/** The spec's own Podman service, when it runs one, and its files. */
let service:
  { child: ReturnType<typeof Bun.spawn>; files: string[] } | undefined;

/** Whether a pod with an infra container is made on the Podman service at `socket`: `podman --url … pod create`, removed at once. */
const podMakes = async (
  socket: string
): Promise<{ code: number; out: string }> => {
  const name = `cawco-probe-podcheck-${tag}-${crypto.randomUUID().slice(0, 4)}`;
  const made = await run(runtime.cli, [
    "--url",
    `${UNIX}${socket}`,
    "pod",
    "create",
    ...MARKS.split(" "),
    "--name",
    name,
  ]);
  if (made.code === 0) {
    await run(runtime.cli, [
      "--url",
      `${UNIX}${socket}`,
      "pod",
      "rm",
      "-f",
      name,
    ]);
  }
  return made;
};

/**
 * A Podman service of the spec's own (`podman system service`), on the
 * machine's storage, whose pods' infra containers run {@link PAUSE_IMAGE}
 * (`CONTAINERS_CONF_OVERRIDE`: "the config file will be loaded last",
 * containers.conf(5)), so pods and kube plays run where the host has no
 * catatonit. The machine's own Podman configuration is not touched. Its
 * socket, once it answers; none when it does not.
 */
const ownService = async (): Promise<string | undefined> => {
  if ((await run(runtime.cli, ["image", "exists", PAUSE_IMAGE])).code !== 0) {
    const pulled = await run(runtime.cli, ["pull", "-q", PAUSE_IMAGE]);
    if (pulled.code !== 0) {
      console.log(
        `session-containers: ${PAUSE_IMAGE} could not be pulled: ${pulled.out}`
      );
      return;
    }
  }
  const dir = dirname(PODMAN_SOCKET());
  const conf = join(dir, `cawco-probe-${tag}.conf`);
  const socket = join(dir, `cawco-probe-${tag}.sock`);
  await writeFile(conf, `[engine]\ninfra_image = "${PAUSE_IMAGE}"\n`);
  service = {
    child: Bun.spawn(
      [runtime.cli, "system", "service", "--time=0", `${UNIX}${socket}`],
      {
        env: { ...outside(), CONTAINERS_CONF_OVERRIDE: conf },
        stdout: "ignore",
        stderr: "ignore",
      }
    ),
    files: [conf, socket],
  };
  /** Whether the service answers its ping yet. */
  const pings = async (): Promise<true | undefined> => {
    if (!existsSync(socket)) {
      return;
    }
    try {
      const answer = await fetch("http://d/_ping", {
        unix: socket,
      } as RequestInit);
      return answer.ok ? true : undefined;
    } catch {
      // Not listening yet.
    }
  };
  const answered = await until(
    "the spec's own Podman service answering",
    pings,
    Boolean,
    30_000
  ).catch(() => undefined);
  return answered ? socket : undefined;
};

/** The spec's own Podman service stopped and its files gone, when it ran one. */
const stopService = (): void => {
  if (!service) {
    return;
  }
  service.child.kill("SIGTERM");
  for (const file of service.files) {
    rmSync(file, { force: true });
  }
  service = undefined;
};

/** (c0) the runtime found, the image there, and on Podman whether pods get infra; the agent's environment. */
const prepare = async (
  kit: Kit
): Promise<Record<string, string> | undefined> => {
  const found = await findRuntime();
  if ("missing" in found) {
    kit.check(
      "(c0) this machine has a container runtime",
      false,
      found.missing
    );
    return;
  }
  runtime = found;
  console.log(
    `session-containers: on ${runtime.kind} (${runtime.cli}), its API at ${runtime.socket}`
  );
  // Pulled only when missing: a pull of an image already here still asks
  // its registry, and fails when the registry does not answer (r181: a TLS
  // timeout to registry-1.docker.io, with the image in storage).
  const here = async () => (await api("GET", `/images/${IMAGE}/json`)).status;
  const pulled =
    (await here()) === 200
      ? undefined
      : await run(runtime.cli, ["pull", "-q", IMAGE]);
  const status = await here();
  kit.check(
    "(c0) the probe's image is here",
    status === 200,
    `GET /images/${IMAGE}/json: ${status}${pulled ? `; ${runtime.kind} pull exit ${pulled.code}: ${pulled.out}` : "; no pull needed"}`
  );
  // What an earlier run left (one killed midway runs no finally), by the
  // spec's own mark alone.
  console.log(
    `session-containers: an earlier run's leftovers removed: ${await removeMarked(`${SPEC_MARK}=${SPEC_NAME}`)}`
  );
  if (!podman()) {
    return { DOCKER_HOST: `${UNIX}${runtime.socket}` };
  }
  // A pod's infra container needs catatonit on the host ({@link infra}).
  const made = await podMakes(runtime.socket);
  infra = made.code === 0;
  if (!infra) {
    const own = await ownService();
    const ownMade = own ? await podMakes(own) : undefined;
    infra = ownMade?.code === 0;
    console.log(
      infra && own
        ? `NOTE session-containers: this machine's Podman makes no pod with an infra container (${made.out}); the spec runs its own Podman service at ${own} with infra_image=${PAUSE_IMAGE} (containers.conf(5): "Infra (pause) container image for pod infra containers"), and the session's pods and kube play run there`
        : `NOTE session-containers: this machine's Podman makes no pod with an infra container (${made.out}), nor did the spec's own service (${ownMade?.out ?? "it did not start"}); the session's pod is made --infra=false, and the kube play leg waits for catatonit (\`sudo apt install catatonit\`)`
    );
    if (infra && own) {
      runtime = { ...runtime, socket: own };
    } else {
      stopService();
    }
  }
  return {
    DOCKER_HOST: UNTRACKED,
    ...(runtime.socket === PODMAN_SOCKET()
      ? {}
      : { CONTAINER_HOST: `${UNIX}${runtime.socket}` }),
  };
};

const spec: Spec = {
  name: "session-containers",
  host: "it runs containers on the machine's own runtime, which no workspace reaches",
  run: async (kit: Kit) => {
    try {
      await provenOn(kit);
    } finally {
      // Everything this run started, in its session or not, by its own mark.
      if (runtime.socket) {
        await removeMarked(`${RUN_MARK}=${tag}`);
      }
      stopService();
    }
  },
};

/** The spec's legs, on the machine's runtime ({@link prepare}). */
const provenOn = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  const agentEnv = await prepare(kit);
  if (!agentEnv) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], agentEnv);
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const outsideRun = await run(runtime.cli, [
    "run",
    "-d",
    ...MARKS.split(" "),
    IMAGE,
    "sleep",
    OUTSIDE,
  ]);
  {
    // ── (u1) a runtime no door reaches ──────────────────────────────────
    session = await launchSession(kit, fleet);

    // ── (c1)–(c3) the session's containers and pods, and one outside ────
    for (const [at, [name]] of commands().entries()) {
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
    const sleeps = sessionSleeps();
    const made = await Promise.all(sleeps.map(sleeping));
    check(
      "(c1) each container the session started runs, labelled with it",
      made.every(
        (one) =>
          one?.State === "running" && one.Labels?.[SESSION_LABEL] === session
      ),
      `on ${runtime.kind}, session ${session}: ${sleeps.map((arg, at) => `sleep ${arg}: ${said(made[at])}`).join("; ")}; the commands ran: ${[...ran].join(", ")}`
    );
    const mine = await sleeping(OUTSIDE);
    check(
      "(c2) the spec's own container runs, with no session's label",
      mine?.State === "running" && !mine.Labels?.[SESSION_LABEL],
      `${outsideRun.out}: ${said(mine)}`
    );
    if (podman()) {
      const pods = await podsOf(session);
      check(
        "(c3) its pods carry the session's label: the one it created, and the kube play's where it ran",
        pods.length === (infra ? 2 : 1) &&
          (!infra || pods.some((pod) => pod.Name === KUBE_POD)),
        `${JSON.stringify(pods.map((pod) => [pod.Name, pod.Status]))}; its pod ${podMode()}`
      );
    }

    // ── (s1), (s2) an ending left by an agent that died midway ───────────
    await endingLeft(kit, fleet, made[sleeps.indexOf(ENDED_EARLIER)], agentEnv);

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
    await podsEnded(kit);
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
  }
};

export default spec;
