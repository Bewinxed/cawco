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
 * The door passes every request through to the runtime unchanged but one:
 * a container's create (`POST /containers/create`, `POST
 * /libpod/containers/create`), whose body gets {@link SESSION_LABEL} (the
 * session's instance id), {@link MACHINE_LABEL} (this machine's id),
 * {@link HUB_LABEL} (the hub this agent serves) and,
 * when the create named the container, {@link NAMED_LABEL}. A create that
 * already carries a session's label keeps it: a door behind another door (a
 * scratch fleet a session runs) is the inner session's, which started it.
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
 * AT A SESSION'S END ({@link endSessionContainers}): its doors close, then
 * each container labelled with it, this machine and this hub is stopped the way the
 * runtime stops one, its stop signal and then SIGKILL after its own stop
 * timeout (the API's `POST /containers/{id}/stop` with no `t`: "The main
 * process inside the container will receive SIGTERM, and after a grace
 * period, SIGKILL", docker container stop), and removed unless it was
 * named as it was created, when it is only stopped. The session that
 * delegated it, else the session, is told what was done (core
 * `CONTAINERS_ENDED`).
 *
 * An ending is written down before it starts and crossed off once it is done
 * ({@link ENDING_DIR}), so an agent that stopped midway ends it as it
 * starts again; and as the hub welcomes it, the containers of every session
 * the hub no longer has on this machine are ended too ({@link
 * sweepSessionContainers}).
 *
 * A runtime the door cannot reach does not get one: a Docker endpoint that
 * is not a unix socket (`tcp://`, `ssh://`), a Podman connection over ssh.
 * Then the session's client reaches that runtime as before, its containers
 * unlabelled, and the agent's log says so.
 */
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { machineId } from "@cawco/core/machine-id";
import { cawcoDataDir, darwinSocketRoot } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { containerWords } from "@cawco/core/words/containers";
import Docker from "dockerode";
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
/** The label on a container its create named (`--name`): it is stopped, not removed. */
export const NAMED_LABEL = "dev.cawco.named";

type RuntimeKind = "docker" | "podman";
const KINDS: readonly RuntimeKind[] = ["docker", "podman"];
/** The variable each runtime's clients find it by. */
const ENV_OF: Record<RuntimeKind, string> = {
  docker: "DOCKER_HOST",
  podman: "CONTAINER_HOST",
};
const UNIX = "unix://";

/** A container's create, Docker's or Podman's, behind any API version prefix. */
const CREATE = /^(?:\/v[\d.]+)?(\/libpod)?\/containers\/create$/;
/** The most a request's head may hold before its end. */
const HEAD_MAX = 1024 * 1024;
/** The most a create's body may hold: a container's spec, never a payload. */
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

/** Sessions whose ending is under way, one empty file each, crossed off once done. */
const ENDING_DIR = (): string => join(cawcoDataDir(), "containers-ending");

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

/**
 * The socket the Docker CLI reaches from this agent's environment, as it
 * resolves one: `DOCKER_HOST`, else the current context's endpoint, else the
 * default `/var/run/docker.sock`; none when it is not a unix socket, or no
 * socket is there.
 */
const dockerUpstream = async (): Promise<string | undefined> => {
  const host =
    process.env.DOCKER_HOST ||
    (await contextEndpoint())?.host ||
    `${UNIX}/var/run/docker.sock`;
  if (!host.startsWith(UNIX)) {
    tellOnce(
      `Docker is reached at ${host}, which is not a unix socket: no session gets a door to it, so containers a session starts there are not stopped with it`
    );
    return;
  }
  const path = host.slice(UNIX.length);
  return (await exists(path)) ? path : undefined;
};

/** The Linux Podman service's socket, as podman(1) names it: rootful `/run/podman/podman.sock`, rootless `/run/user/$UID/podman/podman.sock`. */
const linuxPodmanSocket = (): string => {
  const uid = process.getuid?.() ?? 0;
  return uid === 0
    ? "/run/podman/podman.sock"
    : `/run/user/${uid}/podman/podman.sock`;
};

/**
 * The socket of the Podman service a session's podman would reach, as
 * podman resolves its URL: `CONTAINER_HOST`, else, on Linux, the service's
 * own socket, started by its systemd socket unit when it is not there
 * (`systemctl --user start podman.socket`, as Podman ships it); on macOS the
 * running machine's API socket (`podman machine inspect`:
 * `ConnectionInfo.PodmanSocket.Path`). None where podman is not installed,
 * or the service cannot be reached by a unix socket. `start`: whether a
 * Linux service socket that is not there is started.
 */
const podmanUpstream = async (start: boolean): Promise<string | undefined> => {
  if (!Bun.which("podman")) {
    return;
  }
  const host = process.env.CONTAINER_HOST;
  if (host) {
    if (!host.startsWith(UNIX)) {
      tellOnce(
        `Podman is reached at ${host}, which is not a unix socket: no session gets a door to it, so containers a session starts there are not stopped with it`
      );
      return;
    }
    const path = host.slice(UNIX.length);
    return (await exists(path)) ? path : undefined;
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
      ? path
      : undefined;
  }
  const path = linuxPodmanSocket();
  if (await exists(path)) {
    return path;
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
  return path;
};

const upstreamOf = (
  kind: RuntimeKind,
  start: boolean
): Promise<string | undefined> =>
  kind === "docker" ? dockerUpstream() : podmanUpstream(start);

/** What a door stamps on each container its session creates. */
interface Stamp {
  hub: string;
  instanceId: string;
  machine: string;
}

/** This agent's machine and hub, as its doors stamp them and its endings find them. */
const owner = async (): Promise<{ hub: string; machine: string }> => ({
  hub: new URL(delegationHubUrl()).host,
  machine: await machineId(),
});

/** The label filters that find this agent's containers, of one session or of every one. */
const ownFilter = (
  own: { hub: string; machine: string },
  instanceId?: string
): string[] => [
  `${MACHINE_LABEL}=${own.machine}`,
  `${HUB_LABEL}=${own.hub}`,
  ...(instanceId ? [`${SESSION_LABEL}=${instanceId}`] : []),
];

/**
 * A create's body with the session's labels on it ({@link SESSION_LABEL},
 * {@link MACHINE_LABEL}, {@link NAMED_LABEL} when it names the container):
 * Docker's `Labels` and its `?name=`, Podman's `labels` and `name`. A body
 * that is not a JSON object, or already carries a session's label, goes on
 * as it came: the runtime answers the first itself.
 */
const stamped = (body: Buffer, target: string, stamp: Stamp): Buffer => {
  let spec: unknown;
  try {
    spec = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return body;
  }
  const url = new URL(target, "http://door");
  const libpod = CREATE.exec(url.pathname)?.[1] !== undefined;
  const fields = spec as Record<string, unknown>;
  const key = libpod ? "labels" : "Labels";
  const held = fields[key];
  const labels =
    held && typeof held === "object" && !Array.isArray(held)
      ? (held as Record<string, string>)
      : {};
  if (labels[SESSION_LABEL]) {
    return body;
  }
  const name = libpod ? fields.name : url.searchParams.get("name");
  fields[key] = {
    ...labels,
    [SESSION_LABEL]: stamp.instanceId,
    [MACHINE_LABEL]: stamp.machine,
    [HUB_LABEL]: stamp.hub,
    ...(typeof name === "string" && name !== ""
      ? { [NAMED_LABEL]: "true" }
      : {}),
  };
  return Buffer.from(JSON.stringify(fields));
};

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
  /** A create's body, held whole until it is read. */
  | {
      at: "create";
      body: Buffer[];
      chunked: boolean;
      head: Head;
      left: number;
      size: number;
      trailer: boolean;
    }
  | { at: "raw" };

/** A create's head and body, as the runtime is sent them: its length new, no chunking. */
const rewritten = (head: Head, body: Buffer, stamp: Stamp): Buffer => {
  const out = stamped(body, head.target, stamp);
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
        if (method === "POST" && CREATE.test(path)) {
          reading = {
            at: "create",
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
        refuse("a container create whose body is over 16 MiB");
        return;
      }
      send(rewritten(create.head, Buffer.concat(create.body), stamp));
      reading = { at: "head" };
    }
  };
  client.on("data", (chunk: Buffer) => {
    pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
    pump();
  });
};

/** Each session's doors as they open and once open: its servers and the environment that names them. */
const doors = new Map<
  string,
  Promise<{ env: Record<string, string>; servers: Server[] }>
>();

/**
 * Session `instanceId`'s doors to the machine's container runtimes, opened
 * when it has none (a launch, or a session an agent restart takes back,
 * whose environment already names them): the variables its environment
 * gets, `DOCKER_HOST` and `CONTAINER_HOST` for each runtime there is a door
 * to. A door an earlier agent left is replaced.
 */
export const openContainerDoors = (
  instanceId: string
): Promise<Record<string, string>> => {
  const open = doors.get(instanceId);
  if (open) {
    return open.then(({ env }) => env);
  }
  const opening = (async () => {
    const stamp = { instanceId, ...(await owner()) };
    const env: Record<string, string> = {};
    const servers: Server[] = [];
    const upstreams = new Map<string, string>();
    for (const kind of KINDS) {
      // biome-ignore lint/performance/noAwaitInLoops: two runtimes, each read in turn
      const upstream = await upstreamOf(kind, true);
      if (!upstream) {
        continue;
      }
      const path = doorOf(instanceId, kind);
      await socketPlace(path, `${instanceId}'s door to ${kind}`);
      await rm(path, { force: true });
      const server = createServer({ allowHalfOpen: true }, (client) =>
        serveConnection(client, upstream, stamp)
      );
      await new Promise<void>((done, fail) => {
        server.once("error", fail);
        server.listen(path, () => {
          server.off("error", fail);
          done();
        });
      });
      servers.push(server);
      upstreams.set(kind, upstream);
      env[ENV_OF[kind]] = `${UNIX}${path}`;
    }
    if (servers.length > 0) {
      console.info(
        `[containers] ${instanceId}'s doors: ${[...upstreams].map(([kind, upstream]) => `${kind} → ${upstream}`).join(", ")}`
      );
    }
    return { env, servers };
  })();
  doors.set(instanceId, opening);
  opening.catch(() => doors.delete(instanceId));
  return opening.then(({ env }) => env);
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

/** The `/` the Engine API puts before each container's name. */
const NAME_SLASH = /^\//;

/** One container a session's end reached, in words: `` `name` (image) ``. */
const named = (container: Docker.ContainerInfo): string =>
  `\`${container.Names[0]?.replace(NAME_SLASH, "") ?? container.Id.slice(0, 12)}\` (${container.Image})`;

/** What a session's end did to its containers. */
export interface ContainersEnded {
  failed: string[];
  kept: string[];
  removed: string[];
}

/** Each runtime socket on this machine, once each: Docker's and Podman's may be one. */
const runtimeSockets = async (): Promise<string[]> => {
  const found = await Promise.all(KINDS.map((kind) => upstreamOf(kind, false)));
  return [...new Set(found.filter((path): path is string => !!path))];
};

/** A runtime that is not there, or refuses this user, holds nothing of a session's. */
const unreachable = (error: unknown): boolean =>
  ["ENOENT", "ECONNREFUSED", "EACCES"].includes(
    (error as NodeJS.ErrnoException).code ?? ""
  );

/** Stops and, unless named, removes `containers` on `docker`, into `ended`. */
const endEach = (
  docker: Docker,
  containers: readonly Docker.ContainerInfo[],
  ended: ContainersEnded
): Promise<unknown> =>
  Promise.all(
    containers.map(async (container) => {
      const one = docker.getContainer(container.Id);
      const keep = container.Labels?.[NAMED_LABEL] === "true";
      try {
        if (container.State !== "exited" && container.State !== "created") {
          // No `t`: the runtime's own stop, its stop signal, then SIGKILL
          // after the container's stop timeout. 304: it stopped meanwhile.
          await one.stop().catch((error: { statusCode?: number }) => {
            if (error.statusCode !== 304) {
              throw error;
            }
          });
        }
        if (keep) {
          ended.kept.push(named(container));
        } else {
          await one.remove();
          ended.removed.push(named(container));
        }
      } catch (error) {
        ended.failed.push(`${named(container)} (${said(error)})`);
      }
    })
  );

/**
 * Every container labelled with session `instanceId` and this machine, on
 * each runtime here, stopped, and removed unless it was named; the
 * session's doors closed first. What was done, by container.
 */
export const endSessionContainers = async (
  instanceId: string
): Promise<ContainersEnded> => {
  await closeContainerDoors(instanceId);
  const own = await owner();
  const ended: ContainersEnded = { removed: [], kept: [], failed: [] };
  for (const socketPath of await runtimeSockets()) {
    const docker = new Docker({ socketPath });
    // biome-ignore lint/performance/noAwaitInLoops: one runtime at a time, its containers together
    const containers = await docker
      .listContainers({
        all: true,
        filters: { label: ownFilter(own, instanceId) },
      })
      .catch((error: unknown) => {
        if (unreachable(error)) {
          return [];
        }
        throw error;
      });
    await endEach(docker, containers, ended);
  }
  return ended;
};

/** What a session's notice says of its ended containers; none when nothing was there. */
export const containersEndedWords = (
  ended: ContainersEnded
): string | undefined =>
  ended.removed.length + ended.kept.length + ended.failed.length === 0
    ? undefined
    : containerWords.stopped(ended.removed, ended.kept, ended.failed);

/** Writes down that session `instanceId`'s ending is under way. */
export const beginEnding = async (instanceId: string): Promise<void> => {
  await mkdir(ENDING_DIR(), { recursive: true, mode: 0o700 });
  await writeFile(join(ENDING_DIR(), instanceId), "");
};

/** Crosses session `instanceId`'s ending off. */
export const finishEnding = (instanceId: string): Promise<void> =>
  rm(join(ENDING_DIR(), instanceId), { force: true });

/**
 * The sessions whose containers are owed an ending as the hub welcomes this
 * agent: each whose ending was written down and not crossed off (an agent
 * that stopped midway), and each with a container labelled for this machine
 * whose session the hub no longer has here (`instances`, the welcome's
 * every session of this machine: one forgotten while the machine was
 * away). A container labelled for another machine is that machine's.
 */
export const sessionsOwedEnding = async (
  instances: readonly string[]
): Promise<{ gone: string[]; unfinished: string[] }> => {
  const unfinished = await readdir(ENDING_DIR()).catch(() => [] as string[]);
  const own = await owner();
  const had = new Set(instances);
  const gone = new Set<string>();
  for (const socketPath of await runtimeSockets()) {
    // biome-ignore lint/performance/noAwaitInLoops: one runtime at a time
    const containers = await new Docker({ socketPath })
      .listContainers({
        all: true,
        filters: { label: ownFilter(own) },
      })
      .catch((error: unknown) => {
        if (unreachable(error)) {
          return [];
        }
        throw error;
      });
    for (const container of containers) {
      const session = container.Labels?.[SESSION_LABEL];
      if (session && !had.has(session) && !unfinished.includes(session)) {
        gone.add(session);
      }
    }
  }
  return { gone: [...gone], unfinished };
};
