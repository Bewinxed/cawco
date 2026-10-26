/**
 * A CONTAINER A SESSION'S WORK STARTS STOPS WITH THE SESSION. The owner's
 * pick, 2026-10-19 (calls-to-overrule, workspace-containers: "It stops with
 * the session"): when a session ends (stopped, finished, its work item
 * ended), every container its work started (a dev database, a browser
 * container, a compose stack) is stopped, on Docker and on Podman, on Linux
 * and macOS. Containers the person started, and the fleet's own browser
 * containers, are never touched.
 *
 * HOW A SESSION'S CONTAINERS ARE KNOWN: by labels the runtime keeps on each
 * one, set as it is created. Each session is given its own door to each
 * container runtime on the machine, a unix socket the agent serves
 * ({@link openContainerDoors}), and its environment points the runtimes'
 * clients at it:
 *
 * - `DOCKER_HOST`: the Docker CLI, Compose and every Docker API client read
 *   it first, before any context (docker/cli cli/command/cli.go
 *   `resolveContextName`: "if os.Getenv(client.EnvOverrideHost) != "" {
 *   return DefaultContextName }"; docs.docker.com/engine/manage-resources/contexts:
 *   "all docker commands run against this context, unless overridden with
 *   environment variables such as DOCKER_HOST").
 * - `CONTAINER_HOST`: Podman's (podman(1): "CONTAINER_HOST: Set default
 *   --url value to access Podman service. Automatically enables --remote
 *   option"). A session's podman therefore runs every command through the
 *   Podman service's API, on Linux as on macOS, where it always did.
 *
 * The door passes every request through to the runtime unchanged but the
 * three that make what a session runs ({@link STAMPED}): a container's
 * create (`POST /containers/create`, `POST /libpod/containers/create`), a
 * pod's (`POST /libpod/pods/create`, which `podman pod create` and `podman
 * run --pod new:` send) and a kube play's (`POST /libpod/play/kube`). Each
 * gets {@link SESSION_LABEL} (the session's instance id), {@link
 * MACHINE_LABEL} (this machine's id), {@link HUB_LABEL} (the hub this agent
 * serves) and, when the person named it, {@link NAMED_LABEL}. A kube play
 * gets them on each pod its YAML describes (a Pod's `metadata.labels`, a
 * Deployment's, DaemonSet's or Job's pod template's), which Podman puts on
 * the pod and copies onto each of its containers (podman v5.7.0
 * pkg/specgen/generate/kube/kube.go: "p.Labels = podYAML.ObjectMeta.Labels";
 * pkg/domain/infra/abi/play.go: "// add podYAML labels"). Its `labels` query
 * parameter is not released (podman-kube-play(1) on main: "Add a label to
 * the pods ... created by podman kube play"; in no release notes through
 * 6.1.0). A create that already carries a session's label keeps it: a door
 * behind another door (a scratch fleet a session runs) is the inner
 * session's, which started it.
 *
 * NAMED: a container or pod whose create named it (`--name`, `--pod
 * new:<name>`). A name Compose gives (a create labelled
 * `com.docker.compose.project` or `io.podman.compose.project`) and a kube
 * play's (its YAML's) are a file's, not the person's at the prompt: those go
 * as unnamed ones do.
 *
 * An upgraded connection (attach, exec: `Connection: Upgrade`, as both
 * clients send them, podman pkg/bindings/containers/attach.go
 * `newUpgradeRequest`) is passed through raw from its upgrade on.
 *
 * The fleet's own browser containers are made by the agent through the
 * runtime's own socket (browser/runtime.ts `findRuntime`), never through a
 * session's door, so they carry no session label and nothing here reaches
 * them; nor does anything a person starts from their own shell. Nothing is
 * ever found by name.
 *
 * AT A SESSION'S END ({@link beginEnding}, {@link finishEnding}): its doors
 * close, then the ids of every pod and container labelled with it, this
 * machine and this hub are written down: the ending is theirs alone. Each
 * pod is stopped (`POST /libpod/pods/{id}/stop`) and removed with what it
 * holds, its infra container among them (`DELETE /libpod/pods/{id}?force=true`),
 * unless named; then each container the way the runtime stops one, its stop
 * signal and then SIGKILL after its own stop timeout (the API's `POST
 * /containers/{id}/stop` with no `t`: "The main process inside the
 * container will receive SIGTERM, and after a grace period, SIGKILL",
 * docker container stop), and removed unless named, when it is only
 * stopped. Volumes are left, as `docker rm` leaves them. The session that
 * delegated it, else the session, is told what was done (core
 * `CONTAINERS_ENDED`).
 *
 * The ending's file is crossed off once it is done ({@link ENDING_DIR}), so
 * an agent that stopped midway ends it as it starts again, and only what it
 * wrote down: a session woken since runs containers of its own, which that
 * ending never reaches. As the hub welcomes the agent, the containers of
 * every session the hub no longer has on this machine are ended too
 * ({@link sessionsOwedEnding}).
 *
 * A runtime the door cannot reach does not get one: a Docker endpoint that
 * is not a unix socket (`tcp://`, `ssh://`), a Podman one over ssh. Then
 * the session's client reaches that runtime as before, its containers
 * unlabelled; the agent's log says so, and so is the session, once, as it
 * starts (core `CONTAINERS_UNTRACKED`).
 */
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { machineId } from "@cawco/core/machine-id";
import { cawcoDataDir, darwinSocketRoot } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { containerWords } from "@cawco/core/words/containers";
import { parseAllDocuments } from "yaml";
import { contextEndpoint } from "./browser/runtime";
import { delegationHubUrl } from "./delegation";
import { socketPlace } from "./tool-door";

/** The label naming the session whose work created a container: its instance id. */
export const SESSION_LABEL = "dev.cawco.session";
/** The label naming the machine whose agent served that session: its machine id. */
export const MACHINE_LABEL = "dev.cawco.machine";
/**
 * The label naming the hub that agent serves, by its host and port: a
 * machine may run an agent for another hub beside its own (a scratch
 * fleet's, whose machine id is every scratch fleet's), and each sweeps only
 * its own hub's.
 */
export const HUB_LABEL = "dev.cawco.hub";
/** The label on a container or pod the person named as it was created: it is stopped, not removed. */
export const NAMED_LABEL = "dev.cawco.named";
/** The labels Compose puts on each container it creates, Docker's and podman-compose's: its names are its own. */
const COMPOSE_LABELS = [
  "com.docker.compose.project",
  "io.podman.compose.project",
];

type RuntimeKind = "docker" | "podman";
const KINDS: readonly RuntimeKind[] = ["docker", "podman"];
/** The variable each runtime's clients find it by. */
const ENV_OF: Record<RuntimeKind, string> = {
  docker: "DOCKER_HOST",
  podman: "CONTAINER_HOST",
};
const UNIX = "unix://";

/** What a door stamps: a container's create, a pod's, a kube play's. */
type Stamping = "container" | "libpod-container" | "pod" | "kube";
/** Each request a door stamps, by its path behind any API version prefix. */
const STAMPED: readonly [RegExp, Stamping][] = [
  [/^(?:\/v[\d.]+)?\/containers\/create$/u, "container"],
  [/^(?:\/v[\d.]+)?\/libpod\/containers\/create$/u, "libpod-container"],
  [/^(?:\/v[\d.]+)?\/libpod\/pods\/create$/u, "pod"],
  [/^(?:\/v[\d.]+)?\/libpod\/(?:play\/kube|kube\/play)$/u, "kube"],
];
const stampingOf = (method: string, path: string): Stamping | undefined =>
  method === "POST"
    ? STAMPED.find(([pattern]) => pattern.test(path))?.[1]
    : undefined;
/** The most a request's head may hold before its end. */
const HEAD_MAX = 1024 * 1024;
/** The most a stamped body may hold: a spec or a kube YAML, never a payload. */
const CREATE_MAX = 16 * 1024 * 1024;
const HEAD_END = Buffer.from("\r\n\r\n");
const CRLF = Buffer.from("\r\n");

/**
 * Where the doors are: the agent's runtime dir on Linux, its socket root on
 * macOS. Short: a unix socket's path holds 107 bytes, and a scratch fleet's
 * runtime dir is sized for its longest socket, a preview's bridge
 * (`cawco/previews/<instance id>.sock`), which a door's is not past.
 */
const doorDir = (): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco", "ct");
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), "ct");
  }
  return join(homedir(), ".cawco", "ct");
};

/** Session `instanceId`'s door to `kind`: `<instance id>.d.sock` (Docker) or `.p.sock` (Podman). */
const doorOf = (instanceId: string, kind: RuntimeKind): string =>
  join(doorDir(), `${instanceId}.${kind.slice(0, 1)}.sock`);

/** The folder of endings under way, in the agent's data dir: one file each, named by its session, crossed off once done. */
export const ENDING_DIR_NAME = "containers-ending";
const ENDING_DIR = (): string => join(cawcoDataDir(), ENDING_DIR_NAME);

/** An ending as it is written down: the ids of the pods and containers it ends, and nothing else. */
export interface EndingRecord {
  containers: string[];
  pods: string[];
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Runs `argv` with the host's environment; its stdout, or undefined when it fails. */
const output = async (argv: string[]): Promise<string | undefined> => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "ignore",
    env: hostEnvironment(),
  });
  const [text, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return code === 0 ? text.trim() : undefined;
};

/** One reason a runtime got no door, said once per agent. */
const told = new Set<string>();
const tellOnce = (line: string): void => {
  if (!told.has(line)) {
    told.add(line);
    console.warn(`[containers] ${line}`);
  }
};

/** Where a runtime is: its unix socket, or an endpoint no door reaches (`tcp://`, `ssh://`). */
type Upstream = { path: string } | { untracked: string };

/** A runtime's endpoint as its client names it: its socket when it is a unix one that is there. */
const upstreamAt = async (
  host: string,
  runtime: string
): Promise<Upstream | undefined> => {
  if (!host.startsWith(UNIX)) {
    tellOnce(
      `${runtime} is reached at ${host}, which is not a unix socket: no session gets a door to it, so containers a session starts there are not stopped with it`
    );
    return { untracked: host };
  }
  const path = host.slice(UNIX.length);
  return (await exists(path)) ? { path } : undefined;
};

/**
 * Where the Docker CLI reaches from this agent's environment, as it resolves
 * it: `DOCKER_HOST`, else the current context's endpoint, else the default
 * `/var/run/docker.sock`; none when no socket is there.
 */
const dockerUpstream = async (): Promise<Upstream | undefined> =>
  upstreamAt(
    process.env.DOCKER_HOST ||
      (await contextEndpoint())?.host ||
      `${UNIX}/var/run/docker.sock`,
    "Docker"
  );

/** The Linux Podman service's socket, as podman(1) names it: rootful `/run/podman/podman.sock`, rootless `/run/user/$UID/podman/podman.sock`. */
const linuxPodmanSocket = (): string => {
  const uid = process.getuid?.() ?? 0;
  return uid === 0
    ? "/run/podman/podman.sock"
    : `/run/user/${uid}/podman/podman.sock`;
};

/**
 * Where the Podman service a session's podman would reach is, as podman
 * resolves its URL: `CONTAINER_HOST`, else, on Linux, the service's own
 * socket, started by its systemd socket unit when it is not there
 * (`systemctl --user start podman.socket`, as Podman ships it); on macOS the
 * running machine's API socket (`podman machine inspect`:
 * `ConnectionInfo.PodmanSocket.Path`). None where podman is not installed.
 * `start`: whether a Linux service socket that is not there is started.
 */
const podmanUpstream = async (
  start: boolean
): Promise<Upstream | undefined> => {
  if (!Bun.which("podman")) {
    return;
  }
  const host = process.env.CONTAINER_HOST;
  if (host) {
    return upstreamAt(host, "Podman");
  }
  if (process.platform === "darwin") {
    const inspected = await output(["podman", "machine", "inspect"]);
    const [machine] = inspected
      ? (JSON.parse(inspected) as {
          ConnectionInfo?: { PodmanSocket?: { Path?: string } };
          State?: string;
        }[])
      : [];
    const path = machine?.ConnectionInfo?.PodmanSocket?.Path;
    return machine?.State === "running" && path && (await exists(path))
      ? { path }
      : undefined;
  }
  const path = linuxPodmanSocket();
  if (await exists(path)) {
    return { path };
  }
  if (!start || (process.getuid?.() ?? 0) === 0) {
    return;
  }
  const started = await output([
    "systemctl",
    "--user",
    "start",
    "podman.socket",
  ]);
  if (started === undefined || !(await exists(path))) {
    tellOnce(
      `Podman's service socket ${path} is not there and \`systemctl --user start podman.socket\` did not make it: no session gets a door to Podman, so containers a session's podman starts are not stopped with it`
    );
    return;
  }
  return { path };
};

const upstreamOf = (
  kind: RuntimeKind,
  start: boolean
): Promise<Upstream | undefined> =>
  kind === "docker" ? dockerUpstream() : podmanUpstream(start);

/** What a door stamps on each container its session creates. */
interface Stamp {
  hub: string;
  instanceId: string;
  machine: string;
}

/** This agent's machine and hub, as its doors stamp them and its endings find them. */
const owner = async (): Promise<{ hub: string; machine: string }> => ({
  hub: labelValue(new URL(delegationHubUrl()).host),
  machine: labelValue(await machineId()),
});

/** What a Kubernetes label value holds (a kube play's pod labels are one): 63 of `[A-Za-z0-9_.-]`. */
const LABEL_UNSAFE = /[^A-Za-z0-9_.-]/gu;
const labelValue = (value: string): string =>
  value.replace(LABEL_UNSAFE, "_").slice(0, 63);

/** The label filters that find every session's containers this agent's doors made. */
const ownFilter = (own: { hub: string; machine: string }): string[] => [
  `${MACHINE_LABEL}=${own.machine}`,
  `${HUB_LABEL}=${own.hub}`,
];

/** The labels a door puts on what its session makes; `named` when the person named it. */
const sessionLabels = (
  stamp: Stamp,
  named: boolean
): Record<string, string> => ({
  [SESSION_LABEL]: stamp.instanceId,
  [MACHINE_LABEL]: stamp.machine,
  [HUB_LABEL]: stamp.hub,
  ...(named ? { [NAMED_LABEL]: "true" } : {}),
});

/** A labels map as a body holds it, or an empty one. */
const labelsIn = (held: unknown): Record<string, string> =>
  held && typeof held === "object" && !Array.isArray(held)
    ? (held as Record<string, string>)
    : {};

/**
 * A container's or pod's create with the session's labels on it: Docker's
 * `Labels` and its `?name=`, Podman's `labels` and `name`. Named when the
 * create named it and Compose did not ({@link COMPOSE_LABELS}).
 */
const stampedSpec = (
  body: Buffer,
  target: string,
  stamp: Stamp,
  docker: boolean
): Buffer => {
  let spec: unknown;
  try {
    spec = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return body;
  }
  const fields = spec as Record<string, unknown>;
  const key = docker ? "Labels" : "labels";
  const labels = labelsIn(fields[key]);
  if (labels[SESSION_LABEL]) {
    return body;
  }
  const name = docker
    ? new URL(target, "http://door").searchParams.get("name")
    : fields.name;
  const named =
    typeof name === "string" &&
    name !== "" &&
    !COMPOSE_LABELS.some((label) => labels[label] !== undefined);
  fields[key] = { ...labels, ...sessionLabels(stamp, named) };
  return Buffer.from(JSON.stringify(fields));
};

/** The kinds a kube play makes pods of, and where each keeps its pod's labels. */
const KUBE_POD_LABELS: Record<string, readonly string[]> = {
  Pod: ["metadata", "labels"],
  Deployment: ["spec", "template", "metadata", "labels"],
  DaemonSet: ["spec", "template", "metadata", "labels"],
  Job: ["spec", "template", "metadata", "labels"],
};

/**
 * A kube play's YAML with the session's labels on each pod it describes
 * ({@link KUBE_POD_LABELS}), never named: its names are its file's. A body
 * that is not YAML (a build's tar) goes on as it came, as does a pod
 * already labelled with a session.
 */
const stampedKube = (body: Buffer, stamp: Stamp): Buffer => {
  const documents = parseAllDocuments(body.toString("utf8"));
  if (
    !Array.isArray(documents) ||
    documents.some((document) => document.errors.length > 0)
  ) {
    return body;
  }
  let changed = false;
  for (const document of documents) {
    const at = KUBE_POD_LABELS[String(document.get("kind"))];
    if (!at || document.getIn([...at, SESSION_LABEL]) !== undefined) {
      continue;
    }
    for (const [label, value] of Object.entries(sessionLabels(stamp, false))) {
      document.setIn([...at, label], value);
    }
    changed = true;
  }
  // A document after the first keeps the `---` it was written with.
  return changed
    ? Buffer.from(
        documents
          .map((document, at) => {
            const text = String(document);
            return at === 0 || text.startsWith("---") ? text : `---\n${text}`;
          })
          .join("")
      )
    : body;
};

/** A stamped request's body, as the runtime is sent it. */
const stamped = (
  body: Buffer,
  target: string,
  stamp: Stamp,
  stamping: Stamping
): Buffer =>
  stamping === "kube"
    ? stampedKube(body, stamp)
    : stampedSpec(body, target, stamp, stamping === "container");

/** A request's head, read. */
interface Head {
  /** Its header lines, as sent. */
  lines: string[];
  method: string;
  target: string;
}

const headerOf = (head: Head, name: string): string | undefined =>
  head.lines
    .find((line) => line.toLowerCase().startsWith(`${name}:`))
    ?.slice(name.length + 1)
    .trim();

/** Where a door's reading of one connection's requests stands. */
type Reading =
  | { at: "head" }
  /** A body passed on as it comes: `left` bytes, or chunks. */
  | { at: "length"; left: number; upgrade: boolean }
  | {
      at: "chunked";
      /** In a chunk: its bytes left, with its CRLF; else reading a size or the trailer. */
      left: number;
      trailer: boolean;
      upgrade: boolean;
    }
  /** A stamped request's body, held whole until it is read. */
  | {
      at: "create";
      body: Buffer[];
      stamping: Stamping;
      chunked: boolean;
      head: Head;
      left: number;
      size: number;
      trailer: boolean;
    }
  | { at: "raw" };

/** A stamped request's head and body, as the runtime is sent them: its length new, no chunking. */
const rewritten = (
  head: Head,
  body: Buffer,
  stamp: Stamp,
  stamping: Stamping
): Buffer => {
  const out = stamped(body, head.target, stamp, stamping);
  const lines = head.lines.filter((line) => {
    const name = line.toLowerCase();
    return !(
      name.startsWith("content-length:") ||
      name.startsWith("transfer-encoding:")
    );
  });
  return Buffer.concat([
    Buffer.from(
      `${head.method} ${head.target} ${lines[0]}\r\n${[...lines.slice(1), `Content-Length: ${out.length}`].join("\r\n")}\r\n\r\n`,
      "latin1"
    ),
    out,
  ]);
};

/**
 * One connection a session's client made to its door: each request read in
 * turn and passed to `upstream`, a create's stamped ({@link stamped}); the
 * runtime's answers passed back as they come.
 */
const serveConnection = (
  client: Socket,
  upstream: string,
  stamp: Stamp
): void => {
  const runtime = connect(upstream);
  let answered = false;
  let pending: Buffer = Buffer.alloc(0);
  let reading: Reading = { at: "head" };
  runtime.on("data", (chunk: Buffer) => {
    answered = true;
    if (!client.write(chunk)) {
      runtime.pause();
      client.once("drain", () => runtime.resume());
    }
  });
  runtime.on("end", () => client.end());
  runtime.on("error", (error) => {
    if (!answered) {
      answered = true;
      const text = `CawCo's container door could not reach ${upstream}: ${said(error)}\n`;
      client.end(
        `HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`
      );
      return;
    }
    client.destroy();
  });
  client.on("error", () => runtime.destroy());
  client.on("close", () => runtime.destroy());
  client.on("end", () => runtime.end());
  const send = (bytes: Buffer): void => {
    if (bytes.length > 0 && !runtime.write(bytes)) {
      client.pause();
      runtime.once("drain", () => client.resume());
    }
  };
  const refuse = (why: string): void => {
    const text = `CawCo's container door: ${why}\n`;
    client.end(
      `HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`
    );
    runtime.destroy();
  };
  /** Reads a chunked body's size or trailer line: `more` while it is not all here, `done` at the body's end. */
  const chunkLine = (
    state: { left: number; trailer: boolean },
    take: (bytes: Buffer) => void
  ): "more" | "done" | "line" => {
    const end = pending.indexOf(CRLF);
    if (end < 0) {
      return "more";
    }
    const line = pending.subarray(0, end).toString("latin1");
    take(pending.subarray(0, end + 2));
    pending = pending.subarray(end + 2);
    if (state.trailer) {
      return line === "" ? "done" : "line";
    }
    const size = Number.parseInt(line.split(";")[0] ?? "", 16);
    if (size === 0) {
      state.trailer = true;
    } else {
      state.left = size + 2;
    }
    return "line";
  };
  const next = (upgrade: boolean): void => {
    reading = upgrade ? { at: "raw" } : { at: "head" };
    if (upgrade) {
      send(pending);
      pending = Buffer.alloc(0);
    }
  };
  /** Reads what has come, as far as it goes. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one reader for HTTP/1.1's three body framings, passed through or held for a create
  const pump = (): void => {
    for (;;) {
      if (reading.at === "raw") {
        send(pending);
        pending = Buffer.alloc(0);
        return;
      }
      if (reading.at === "head") {
        const end = pending.indexOf(HEAD_END);
        if (end < 0) {
          if (pending.length > HEAD_MAX) {
            refuse("a request head longer than 1 MiB");
          }
          return;
        }
        const raw = pending.subarray(0, end + 4);
        pending = pending.subarray(end + 4);
        const [first = "", ...rest] = raw
          .subarray(0, end)
          .toString("latin1")
          .split("\r\n");
        const [method = "", target = "", version = "HTTP/1.1"] =
          first.split(" ");
        const head: Head = { method, target, lines: [version, ...rest] };
        const chunked = (headerOf(head, "transfer-encoding") ?? "")
          .toLowerCase()
          .includes("chunked");
        const length = Number(headerOf(head, "content-length") ?? 0) || 0;
        const upgrade = headerOf(head, "upgrade") !== undefined;
        const path = new URL(target, "http://door").pathname;
        const stamping = stampingOf(method, path);
        if (stamping) {
          reading = {
            at: "create",
            stamping,
            head,
            chunked,
            left: chunked ? 0 : length,
            trailer: false,
            body: [],
            size: 0,
          };
          continue;
        }
        send(raw);
        if (chunked) {
          reading = { at: "chunked", left: 0, trailer: false, upgrade };
        } else if (length > 0) {
          reading = { at: "length", left: length, upgrade };
        } else {
          next(upgrade);
        }
        continue;
      }
      if (reading.at === "length") {
        const take = pending.subarray(0, reading.left);
        pending = pending.subarray(take.length);
        send(take);
        reading.left -= take.length;
        if (reading.left > 0) {
          return;
        }
        next(reading.upgrade);
        continue;
      }
      if (reading.at === "chunked") {
        if (reading.left > 0) {
          const take = pending.subarray(0, reading.left);
          pending = pending.subarray(take.length);
          send(take);
          reading.left -= take.length;
          if (reading.left > 0) {
            return;
          }
          continue;
        }
        const line = chunkLine(reading, send);
        if (line === "more") {
          return;
        }
        if (line === "done") {
          next(reading.upgrade);
        }
        continue;
      }
      // A create: its body held whole, then sent stamped.
      const create = reading;
      if (!create.chunked) {
        const take = pending.subarray(0, create.left);
        pending = pending.subarray(take.length);
        create.body.push(take);
        create.size += take.length;
        create.left -= take.length;
        if (create.left > 0) {
          return;
        }
      } else if (create.left > 0) {
        const take = pending.subarray(0, create.left);
        pending = pending.subarray(take.length);
        // Each chunk's own CRLF, its last two bytes, is framing, not body.
        const data = take.subarray(0, Math.max(0, create.left - 2));
        create.left -= take.length;
        create.body.push(data);
        create.size += data.length;
        if (create.left > 0) {
          return;
        }
        continue;
      } else {
        const line = chunkLine(create, () => undefined);
        if (line === "more") {
          return;
        }
        if (line !== "done") {
          continue;
        }
      }
      if (create.size > CREATE_MAX) {
        refuse("a create whose body is over 16 MiB");
        return;
      }
      send(
        rewritten(
          create.head,
          Buffer.concat(create.body),
          stamp,
          create.stamping
        )
      );
      reading = { at: "head" };
    }
  };
  client.on("data", (chunk: Buffer) => {
    pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
    pump();
  });
};

/** A session's doors to the machine's runtimes: what its environment names them by, and the endpoints no door reaches. */
export interface ContainerDoors {
  env: Record<string, string>;
  /** Each runtime endpoint the session reaches with no door (`tcp://`, `ssh://`): what it starts there does not stop with it. */
  untracked: string[];
}

/** Each session's doors as they open and once open: its servers too. */
const doors = new Map<
  string,
  Promise<ContainerDoors & { servers: Server[] }>
>();

/**
 * Session `instanceId`'s doors to the machine's container runtimes, opened
 * when it has none (a launch, or a session an agent restart takes back,
 * whose environment already names them): the variables its environment
 * gets, `DOCKER_HOST` and `CONTAINER_HOST` for each runtime there is a door
 * to, and the endpoints there is none to. A door an earlier agent left is
 * replaced.
 */
export const openContainerDoors = (
  instanceId: string
): Promise<ContainerDoors> => {
  const open = doors.get(instanceId);
  if (open) {
    return open.then(({ env, untracked }) => ({ env, untracked }));
  }
  const opening = (async () => {
    const stamp = { instanceId, ...(await owner()) };
    const env: Record<string, string> = {};
    const untracked: string[] = [];
    const servers: Server[] = [];
    const upstreams = new Map<string, string>();
    for (const kind of KINDS) {
      // biome-ignore lint/performance/noAwaitInLoops: two runtimes, each read in turn
      const upstream = await upstreamOf(kind, true);
      if (!upstream) {
        continue;
      }
      if ("untracked" in upstream) {
        untracked.push(upstream.untracked);
        continue;
      }
      const path = doorOf(instanceId, kind);
      await socketPlace(path, `${instanceId}'s door to ${kind}`);
      await rm(path, { force: true });
      const server = createServer({ allowHalfOpen: true }, (client) =>
        serveConnection(client, upstream.path, stamp)
      );
      await new Promise<void>((done, fail) => {
        server.once("error", fail);
        server.listen(path, () => {
          server.off("error", fail);
          done();
        });
      });
      servers.push(server);
      upstreams.set(kind, upstream.path);
      env[ENV_OF[kind]] = `${UNIX}${path}`;
    }
    if (servers.length > 0) {
      console.info(
        `[containers] ${instanceId}'s doors: ${[...upstreams].map(([kind, upstream]) => `${kind} → ${upstream}`).join(", ")}`
      );
    }
    return { env, untracked, servers };
  })();
  doors.set(instanceId, opening);
  opening.catch(() => doors.delete(instanceId));
  return opening.then(({ env, untracked }) => ({ env, untracked }));
};

/** Session `instanceId`'s doors closed and their sockets gone: nothing it runs creates a container through them again. */
const closeContainerDoors = async (instanceId: string): Promise<void> => {
  const open = doors.get(instanceId);
  doors.delete(instanceId);
  const held = await open?.catch(() => undefined);
  await Promise.all(
    (held?.servers ?? []).map(
      (server) => new Promise<void>((done) => server.close(() => done()))
    )
  );
  await Promise.all(
    KINDS.map((kind) => rm(doorOf(instanceId, kind), { force: true }))
  );
};

/** What a session's notice says of the runtimes its containers do not stop on; none when there are none. */
export const containersUntrackedWords = (
  untracked: readonly string[]
): string | undefined =>
  untracked.length === 0 ? undefined : containerWords.untracked(untracked);

/** The `/` the Engine API puts before each container's name. */
const NAME_SLASH = /^\//u;

/** A container as the Engine API lists it (`GET /containers/json`), Docker's and Podman's alike. */
interface ListedContainer {
  Id: string;
  Image: string;
  Labels?: Record<string, string> | null;
  Names: string[];
  State: string;
}

/** One container a session's end reached, in words: `` `name` (image) ``. */
const namedContainer = (container: ListedContainer): string =>
  `\`${container.Names[0]?.replace(NAME_SLASH, "") ?? container.Id.slice(0, 12)}\` (${container.Image})`;

/** A pod as libpod lists it (`GET /libpod/pods/json`). */
interface ListedPod {
  Id: string;
  Labels?: Record<string, string> | null;
  Name: string;
  Status: string;
}

/** One pod a session's end reached, in words: `` `name` (pod) ``. */
const namedPod = (pod: ListedPod): string => `\`${pod.Name}\` (pod)`;

/** What a session's end did to its pods and containers. */
export interface ContainersEnded {
  failed: string[];
  kept: string[];
  removed: string[];
}

/** Each runtime socket on this machine, once each: Docker's and Podman's may be one. */
const runtimeSockets = async (): Promise<string[]> => {
  const found = await Promise.all(KINDS.map((kind) => upstreamOf(kind, false)));
  return [
    ...new Set(
      found.flatMap((upstream) =>
        upstream && "path" in upstream ? [upstream.path] : []
      )
    ),
  ];
};

/**
 * One Engine API call on the runtime at `socketPath`: its status and JSON
 * answer. Made by `fetch` on the socket itself, never a client that reads
 * the environment: dockerode's modem takes `DOCKER_HOST` over the socket it
 * is given (docker-modem 5.0.7 lib/modem.js: `Object.assign({},
 * optDefaults, options)`, then "if (!this.host) { this.socketPath = … }"),
 * so with `DOCKER_HOST=tcp://127.0.0.1:9` it dialled that and read nothing
 * (r191: no ending found the session's containers).
 */
const engine = async (
  socketPath: string,
  method: string,
  path: string
): Promise<{ body: unknown; status: number }> => {
  const answer = await fetch(`http://d${path}`, {
    method,
    unix: socketPath,
  } as RequestInit);
  const text = await answer.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: its text stands.
  }
  return { status: answer.status, body };
};

/** The label filter as the Engine and libpod APIs take it, in a query. */
const filterQuery = (labels: readonly string[]): string =>
  `filters=${encodeURIComponent(JSON.stringify({ label: labels }))}`;

/**
 * A libpod API call. Libpod's routes are versioned only (podman v5.7.0
 * pkg/api/server/register_pods.go: `r.Handle(VersionedPath("/libpod/pods/json"), …)`):
 * unversioned, every one answers 404. 4.0.0, the oldest Podman whose pods
 * API this speaks.
 */
const libpod = (
  socketPath: string,
  method: string,
  path: string
): Promise<{ body: unknown; status: number }> =>
  engine(socketPath, method, `/v4.0.0/libpod${path}`);

/** The pods on `socketPath` with every one of `labels`; none where the runtime has no pods (Docker answers 404). */
const podsWith = async (
  socketPath: string,
  labels: readonly string[]
): Promise<ListedPod[]> => {
  const { status, body } = await libpod(
    socketPath,
    "GET",
    `/pods/json?${filterQuery(labels)}`
  );
  if (status === 404) {
    return [];
  }
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error(`listing pods answered ${status}: ${String(body)}`);
  }
  return body as ListedPod[];
};

/** The containers on `socketPath` with every one of `labels`, stopped ones too. */
const containersWith = async (
  socketPath: string,
  labels: readonly string[]
): Promise<ListedContainer[]> => {
  const { status, body } = await engine(
    socketPath,
    "GET",
    `/containers/json?all=true&${filterQuery(labels)}`
  );
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error(
      `listing containers answered ${status}: ${JSON.stringify(body)}`
    );
  }
  return body as ListedContainer[];
};

/**
 * What session `instanceId` made on `socketPath` through this agent's
 * doors: found by its session label alone (an instance id is the one
 * session's on every machine), then kept to this machine's and hub's. One
 * the session's label names but another owner's is said in the log, and
 * left. A runtime that does not answer (a socket that refuses this user:
 * obelisk's `/var/run/docker.sock` is root Podman's) is said, and holds
 * nothing here.
 */
const madeBy = async (
  socketPath: string,
  instanceId: string
): Promise<{ containers: ListedContainer[]; pods: ListedPod[] }> => {
  const own = await owner();
  const session = [`${SESSION_LABEL}=${instanceId}`];
  const ours = (labels: Record<string, string> | null | undefined): boolean =>
    labels?.[MACHINE_LABEL] === own.machine && labels?.[HUB_LABEL] === own.hub;
  try {
    const [pods, containers] = await Promise.all([
      podsWith(socketPath, session),
      containersWith(socketPath, session),
    ]);
    for (const made of [...pods, ...containers]) {
      if (!ours(made.Labels)) {
        console.warn(
          `[containers] ${instanceId}: ${made.Id.slice(0, 12)} on ${socketPath} carries the session's label but another owner's (${MACHINE_LABEL}=${made.Labels?.[MACHINE_LABEL]}, ${HUB_LABEL}=${made.Labels?.[HUB_LABEL]}; this agent is ${own.machine}, ${own.hub}): it is left`
        );
      }
    }
    return {
      pods: pods.filter((pod) => ours(pod.Labels)),
      containers: containers.filter((container) => ours(container.Labels)),
    };
  } catch (error) {
    console.warn(
      `[containers] ${instanceId}: ${socketPath} could not be read, so nothing of the session's there is ended: ${said(error)}`
    );
    return { pods: [], containers: [] };
  }
};

/** Stops `pod` and, unless named, removes it with what it holds, into `ended`. */
const endPod = async (
  socketPath: string,
  pod: ListedPod,
  ended: ContainersEnded
): Promise<void> => {
  try {
    // No `t`: each container's own stop timeout. 304: it was stopped.
    const stopped = await libpod(socketPath, "POST", `/pods/${pod.Id}/stop`);
    if (stopped.status !== 200 && stopped.status !== 304) {
      throw new Error(
        `stop answered ${stopped.status}: ${JSON.stringify(stopped.body)}`
      );
    }
    if (pod.Labels?.[NAMED_LABEL] === "true") {
      ended.kept.push(namedPod(pod));
      return;
    }
    const removed = await libpod(
      socketPath,
      "DELETE",
      `/pods/${pod.Id}?force=true`
    );
    if (removed.status !== 200) {
      throw new Error(
        `remove answered ${removed.status}: ${JSON.stringify(removed.body)}`
      );
    }
    ended.removed.push(namedPod(pod));
  } catch (error) {
    ended.failed.push(`${namedPod(pod)} (${said(error)})`);
  }
};

/** Stops `container` and, unless named, removes it, into `ended`. */
const endContainer = async (
  socketPath: string,
  container: ListedContainer,
  ended: ContainersEnded
): Promise<void> => {
  try {
    if (container.State !== "exited" && container.State !== "created") {
      // No `t`: the runtime's own stop, its stop signal, then SIGKILL after
      // the container's stop timeout. 304: it stopped meanwhile.
      const stopped = await engine(
        socketPath,
        "POST",
        `/containers/${container.Id}/stop`
      );
      if (stopped.status !== 204 && stopped.status !== 304) {
        throw new Error(
          `stop answered ${stopped.status}: ${JSON.stringify(stopped.body)}`
        );
      }
    }
    if (container.Labels?.[NAMED_LABEL] === "true") {
      ended.kept.push(namedContainer(container));
      return;
    }
    const removed = await engine(
      socketPath,
      "DELETE",
      `/containers/${container.Id}`
    );
    if (removed.status !== 204) {
      throw new Error(
        `remove answered ${removed.status}: ${JSON.stringify(removed.body)}`
      );
    }
    ended.removed.push(namedContainer(container));
  } catch (error) {
    ended.failed.push(`${namedContainer(container)} (${said(error)})`);
  }
};

/**
 * Session `instanceId`'s pods and containers on each runtime here, as they
 * stand: each pod, then each container, so a container a removed pod held
 * is gone by its turn. `only`: the ids an ending wrote down, and nothing
 * else.
 */
const endResources = async (
  instanceId: string,
  only?: EndingRecord
): Promise<ContainersEnded> => {
  const ended: ContainersEnded = { removed: [], kept: [], failed: [] };
  const pods = only && new Set(only.pods);
  const containers = only && new Set(only.containers);
  for (const socketPath of await runtimeSockets()) {
    // biome-ignore lint/performance/noAwaitInLoops: one runtime at a time, its pods together and then its containers
    const podsHere = (await madeBy(socketPath, instanceId)).pods.filter(
      (pod) => !pods || pods.has(pod.Id)
    );
    await Promise.all(podsHere.map((pod) => endPod(socketPath, pod, ended)));
    // Read again: a removed pod took its containers with it.
    const containersHere = (
      await madeBy(socketPath, instanceId)
    ).containers.filter(
      (container) => !containers || containers.has(container.Id)
    );
    await Promise.all(
      containersHere.map((container) =>
        endContainer(socketPath, container, ended)
      )
    );
  }
  return ended;
};

/**
 * Every pod and container session `instanceId` made through this agent's
 * doors, ended whole: for a session the hub no longer has, which nothing
 * wakes again. Its doors closed first.
 */
export const endSessionContainers = async (
  instanceId: string
): Promise<ContainersEnded> => {
  await closeContainerDoors(instanceId);
  return await endResources(instanceId);
};

/** What a session's notice says of its ended containers; none when nothing was there. */
export const containersEndedWords = (
  ended: ContainersEnded
): string | undefined =>
  ended.removed.length + ended.kept.length + ended.failed.length === 0
    ? undefined
    : containerWords.stopped(ended.removed, ended.kept, ended.failed);

const endingFile = (instanceId: string): string =>
  join(ENDING_DIR(), instanceId);

/**
 * Session `instanceId`'s ending begun: its doors closed, so nothing more is
 * made through them, then the ids of every pod and container it made
 * written down ({@link EndingRecord}): what {@link finishEnding} ends, and
 * nothing a session woken since makes.
 */
export const beginEnding = async (instanceId: string): Promise<void> => {
  await closeContainerDoors(instanceId);
  const record: EndingRecord = { containers: [], pods: [] };
  const sockets = await runtimeSockets();
  for (const socketPath of sockets) {
    // biome-ignore lint/performance/noAwaitInLoops: one runtime at a time
    const { pods, containers } = await madeBy(socketPath, instanceId);
    record.pods.push(...pods.map((pod) => pod.Id));
    record.containers.push(...containers.map((container) => container.Id));
  }
  await mkdir(ENDING_DIR(), { recursive: true, mode: 0o700 });
  await writeFile(endingFile(instanceId), `${JSON.stringify(record)}\n`, {
    mode: 0o600,
  });
  console.info(
    `[containers] ${instanceId}: its ending is written down: ${record.pods.length} pod(s) and ${record.containers.length} container(s), on ${sockets.join(", ") || "no runtime"}`
  );
};

/**
 * Session `instanceId`'s ending, as written down, done: the pods and
 * containers it names that are still there ended, and the ending crossed
 * off once none failed. One whose file cannot be read ends nothing, and is
 * crossed off with a line in the log.
 */
export const finishEnding = async (
  instanceId: string
): Promise<ContainersEnded> => {
  const file = endingFile(instanceId);
  let record: EndingRecord;
  try {
    record = JSON.parse(await readFile(file, "utf8")) as EndingRecord;
    if (!(Array.isArray(record.containers) && Array.isArray(record.pods))) {
      throw new Error("it names no pods and containers");
    }
  } catch (error) {
    console.warn(
      `[containers] ${instanceId}'s ending at ${file} cannot be read, so it ends nothing: ${said(error)}`
    );
    await rm(file, { force: true });
    return { removed: [], kept: [], failed: [] };
  }
  console.info(
    `[containers] ${instanceId}: its ending runs: ${record.pods.length} pod(s) and ${record.containers.length} container(s) written down`
  );
  const ended = await endResources(instanceId, record);
  if (ended.failed.length === 0) {
    await rm(file, { force: true });
  }
  return ended;
};

/**
 * The sessions whose containers are owed an ending as the hub welcomes this
 * agent: each whose ending was written down and not crossed off (an agent
 * that stopped midway), and each with a pod or container labelled for this
 * machine and hub whose session the hub no longer has here (`instances`,
 * the welcome's every session of this machine: one forgotten while the
 * machine was away).
 */
export const sessionsOwedEnding = async (
  instances: readonly string[]
): Promise<{ gone: string[]; unfinished: string[] }> => {
  const unfinished = await readdir(ENDING_DIR()).catch(() => [] as string[]);
  const labels = ownFilter(await owner());
  const had = new Set(instances);
  const gone = new Set<string>();
  for (const socketPath of await runtimeSockets()) {
    // biome-ignore lint/performance/noAwaitInLoops: one runtime at a time
    const [pods, containers] = await Promise.all([
      podsWith(socketPath, labels),
      containersWith(socketPath, labels),
    ]).catch((error: unknown) => {
      console.warn(
        `[containers] ${socketPath} could not be read as the hub welcomed this agent, so no ended session's containers there are ended: ${said(error)}`
      );
      return [[], []] as const;
    });
    for (const made of [...pods, ...containers]) {
      const session = made.Labels?.[SESSION_LABEL];
      if (session && !had.has(session) && !unfinished.includes(session)) {
        gone.add(session);
      }
    }
  }
  return { gone: [...gone], unfinished };
};
