/**
 * The browser container has the internet whenever its machine does, on the
 * runtime where it lost it: native rootless Podman 5.3 or later with pasta
 * (agent browser/egress.ts). browser-egress proves the rules without a
 * runtime; this proves the mechanism and the placement on one.
 *
 * - (a) The incident's mechanism in a scratch namespace, the machine
 *   untouched: inside `podman unshare unshare -n` (the template), a veth
 *   pair with an address and no default route. pasta started there, joined
 *   to a second empty namespace (`--netns`, as Podman runs it for a
 *   container), copies the template into it: its `/proc/net/route` holds no
 *   default route (egress.ts `hasDefaultRoute`). With a default route added
 *   to the template, pasta's next copy holds one. pasta is given a namespace
 *   to join, not a command to spawn: spawning makes it a user namespace of
 *   its own, and as uid 0 of `podman unshare`'s user namespace it then maps
 *   uid 0 of its parent, which since Linux 5.12 needs CAP_SETFCAP in that
 *   parent; a pasta that writes the map from the new namespace itself
 *   (`/proc/self/uid_map`) has none there ("Couldn't write to
 *   /proc/self/uid_map: Operation not permitted", round 557). Joining a
 *   namespace (`--netns` implies `--netns-only`, passt.1) makes none.
 * - (b) A scratch fleet's project browser, started on this runtime: its
 *   container's `HostConfig.NetworkMode` is `pasta` and it stands on no
 *   `cawco-media`; its namespace is not the user's shared rootless one
 *   (`podman unshare --rootless-netns`); `/proc/net/route` inside it holds a
 *   default route; neko and DevTools answer on their published ports; its
 *   media port measured `udp+tcp`; its record keeps the machine's network
 *   as it started, routed; and a page load of a public address answers no
 *   `errorText`.
 * - (c) With the stream relay on this machine (`cawco-relay` running):
 *   `host.containers.internal` stands in the browser's `/etc/hosts`, and a
 *   STUN Binding request from inside its namespace to
 *   `host.containers.internal:3478` over UDP is answered by coturn with a
 *   Binding success: the path its TURN URL takes (relay-urls.ts). The
 *   scratch fleet's hub holds no credential of the machine's relay, so the
 *   allocation itself is not made here.
 *
 * Run on the host, outside every workspace boundary (it makes namespaces,
 * and reaches the runtime's socket and the browser's ports), on a checkout
 * of this commit:
 *
 *   bun scripts/probe-kit/run.ts browser-egress-host
 */
import { readWithin } from "../../../packages/core/src/bounded";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const MACHINE = "scratch-fleet";
/** How long a browser may take to go live: a first start builds its image. */
const LIVE_WITHIN_MS = 15 * 60_000;
/** A public page the browser loads. */
const PUBLIC_PAGE = "https://example.com/";
/** The stream relay's container on the machine (agent relay.ts). */
const RELAY_CONTAINER = "cawco-relay";
/** `/etc/hosts` naming the machine as pasta maps it. */
const MACHINE_NAMED = /\shost\.containers\.internal(\s|$)/mu;

const respond = (_request: Seen): Reply => ({ everyMs: 5, words: ["ok"] });

/** A command's exit code and what it said. */
const run = async (
  argv: string[]
): Promise<{ code: number; out: string; err: string }> => {
  const child = Bun.spawn(argv, {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
};

/**
 * (a) pasta's copy of the scratch template, before and after a default route
 * is added there: each into an empty namespace a `sleep` holds, which pasta
 * joins and configures before it goes to the background (passt.c: the tap
 * and its routes are set up in `tap_backend_init`, before `__daemon`), read
 * with `nsenter`, and dropped with its holder (pasta quits once the
 * namespace's procfs entry goes, passt.1 `--no-netns-quit`).
 */
const SCRATCH_NAMESPACE = [
  "set -e",
  "copy() {",
  "  unshare -n sleep 60 &",
  "  holder=$!",
  '  while [ "$(readlink /proc/$holder/ns/net)" = "$(readlink /proc/self/ns/net)" ]; do sleep 0.05; done',
  "  pasta --config-net -q --netns /proc/$holder/ns/net",
  "  nsenter --net=/proc/$holder/ns/net cat /proc/net/route",
  "  kill $holder",
  "  wait $holder 2>/dev/null || true",
  "}",
  "ip link add cawco-egress-a type veth peer name cawco-egress-b",
  "ip addr add 192.0.2.2/24 dev cawco-egress-a",
  "ip link set cawco-egress-a up",
  "ip link set cawco-egress-b up",
  "copy",
  "echo ====",
  "ip route add default via 192.0.2.1 dev cawco-egress-a",
  "copy",
].join("\n");

async function scratchNamespace(kit: Kit): Promise<void> {
  const { hasDefaultRoute } =
    await import("../../../packages/agent/src/browser/egress");
  const said = await run([
    "podman",
    "unshare",
    "unshare",
    "-n",
    "sh",
    "-c",
    SCRATCH_NAMESPACE,
  ]);
  const [before = "", after = ""] = said.out.split("====");
  kit.check(
    "(a) pasta started in a namespace with routes and none default copies no default route",
    said.code === 0 && before.includes("Iface") && !hasDefaultRoute(before),
    `exit ${said.code}: ${before.trim()} ${said.err.trim()}`
  );
  kit.check(
    "(a) with a default route added there, pasta's next copy holds one",
    said.code === 0 && hasDefaultRoute(after),
    `exit ${said.code}: ${after.trim()} ${said.err.trim()}`
  );
}

/** The fleet's record of the browser, read under its agent's data home for the read alone. */
const recordOf = async (dataHome: string, key: BrowserKey) => {
  const { readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const before = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = dataHome;
  try {
    return await readBrowser(key);
  } finally {
    if (before === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = before;
    }
  }
};

/** What Chromium answers `Page.navigate` to `url` with, on a page of its own made through DevTools at `port`. */
const navigate = async (
  port: number,
  url: string
): Promise<{ errorText?: string; error?: string }> => {
  const made = (await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json()) as { id: string };
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/devtools/page/${made.id}`
  );
  try {
    return await new Promise((resolve, reject) => {
      socket.onerror = () => reject(new Error("DevTools' socket failed"));
      socket.onopen = () =>
        socket.send(
          JSON.stringify({ id: 1, method: "Page.navigate", params: { url } })
        );
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          id?: number;
          result?: { errorText?: string };
          error?: { message: string };
        };
        if (message.id === 1) {
          resolve(
            message.error
              ? { error: message.error.message }
              : { ...message.result }
          );
        }
      };
    });
  } finally {
    socket.close();
  }
};

/** A STUN Binding request (RFC 8489 §5) sent from inside `container` to `host:3478` over UDP: the first two bytes answered, as hex. */
const STUN_BINDING = (host: string): string =>
  [
    `exec 3<>/dev/udp/${host}/3478`,
    // Binding request, length 0, the magic cookie, a 12-byte transaction id.
    String.raw`printf '\x00\x01\x00\x00\x21\x12\xa4\x42cawcoegress1' >&3`,
    "timeout 3 dd bs=2 count=1 <&3 2>/dev/null | od -An -tx1",
  ].join("; ");

async function fleetBrowser(kit: Kit): Promise<void> {
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const { placementOf, hasDefaultRoute } =
    await import("../../../packages/agent/src/browser/egress");
  const { portsOf } = await import("../../../packages/agent/src/browser/state");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    kit.check(
      "a container runtime answers on this host",
      false,
      runtime.missing
    );
    return;
  }
  kit.check(
    `(b) this host's runtime gives a namespace of its own (${runtime.kind} ${runtime.version}, rootless ${runtime.rootless}, on ${runtime.rootlessNetwork ?? "no rootless network read"})`,
    placementOf(runtime) === "own-namespace",
    "this check runs on native rootless Podman 5.3 or later with pasta"
  );
  if (placementOf(runtime) !== "own-namespace") {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], { DOCKER_HOST: `unix://${runtime.endpoint}` });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: { name: "Egress", machineId: MACHINE, cwd: fleet.repo, caw: false },
    })
  );
  const key: BrowserKey = `project:${project.id}`;
  const dataHome = fleet.env.XDG_DATA_HOME as string;
  const start = await readWithin(LIVE_WITHIN_MS, async (signal) => {
    const response = await fetchHub(
      fetch,
      fleet.base,
      hubRequest("POST /api/browsers/:key/start", {
        path: { key },
        body: { machineId: MACHINE },
      }),
      { signal }
    );
    return `${response.status} ${await response.text()}`;
  });
  const record = await until(
    "the project's browser is live on the container host",
    () => recordOf(dataHome, key),
    (now) => now?.state === "live" || now?.state === "failed",
    LIVE_WITHIN_MS
  ).catch(() => recordOf(dataHome, key));
  const container = record?.container;
  kit.check(
    "(b) the project's browser is live in a container",
    record?.state === "live" && record.host === "container" && !!container,
    `start answered ${start.kind === "answered" ? start.value : start.reason}; record ${JSON.stringify({ state: record?.state, host: record?.host, why: record?.why })}`
  );
  if (!(record && container)) {
    return;
  }
  const inspected = await runtime.docker.getContainer(container.id).inspect();
  const networks = Object.keys(inspected.NetworkSettings.Networks ?? {});
  kit.check(
    "(b) its container's NetworkMode is pasta, and it stands on no cawco-media",
    inspected.HostConfig.NetworkMode === "pasta" &&
      !networks.includes("cawco-media"),
    `NetworkMode ${inspected.HostConfig.NetworkMode}; networks ${JSON.stringify(networks)}`
  );
  const own = await run([
    "podman",
    "exec",
    container.id,
    "readlink",
    "/proc/self/ns/net",
  ]);
  const shared = await run([
    "podman",
    "unshare",
    "--rootless-netns",
    "readlink",
    "/proc/self/ns/net",
  ]);
  kit.check(
    "(b) its namespace is its own, not the user's shared rootless one",
    own.code === 0 &&
      own.out.trim() !== "" &&
      own.out.trim() !== shared.out.trim(),
    `its ${own.out.trim() || own.err.trim()}; shared ${shared.out.trim() || shared.err.trim()}`
  );
  const routes = await run([
    "podman",
    "exec",
    container.id,
    "cat",
    "/proc/net/route",
  ]);
  kit.check(
    "(b) /proc/net/route inside it holds a default route",
    hasDefaultRoute(routes.out),
    routes.out.trim() || routes.err.trim()
  );
  const ports = portsOf(record);
  // neko serves its client at its root.
  const neko = await fetch(`http://127.0.0.1:${ports.http}/`).then(
    (response) => response.status,
    (error: unknown) => String(error)
  );
  const devtools = await fetch(
    `http://127.0.0.1:${ports.devtools}/json/version`
  ).then(
    (response) => response.status,
    (error: unknown) => String(error)
  );
  kit.check(
    "(b) neko and DevTools answer on their published ports",
    neko === 200 && devtools === 200,
    `neko ${neko}, DevTools ${devtools}`
  );
  kit.check(
    "(b) its media port measured udp+tcp",
    container.media === "udp+tcp",
    container.media
  );
  kit.check(
    "(b) its record keeps the machine's network as it started, routed",
    container.network?.routed === true,
    JSON.stringify(container.network)
  );
  const loaded = await navigate(ports.devtools, PUBLIC_PAGE).catch(
    (error: unknown): { errorText?: string; error?: string } => ({
      error: String(error),
    })
  );
  kit.check(
    `(b) a page load of ${PUBLIC_PAGE} answers no errorText`,
    !(loaded.errorText || loaded.error),
    JSON.stringify(loaded)
  );

  // (c)
  const relay = await runtime.docker
    .getContainer(RELAY_CONTAINER)
    .inspect()
    .catch(() => undefined);
  kit.check(
    "(c) the stream relay runs on this machine",
    relay?.State.Running === true,
    "start the stream relay on this machine (Settings › Browsers), then run this again"
  );
  if (!relay?.State.Running) {
    return;
  }
  const hosts = await run([
    "podman",
    "exec",
    container.id,
    "cat",
    "/etc/hosts",
  ]);
  kit.check(
    "(c) host.containers.internal stands in the browser's /etc/hosts",
    MACHINE_NAMED.test(hosts.out),
    hosts.out.trim() || hosts.err.trim()
  );
  const binding = await run([
    "podman",
    "exec",
    container.id,
    "bash",
    "-c",
    STUN_BINDING("host.containers.internal"),
  ]);
  kit.check(
    "(c) coturn answers a STUN Binding from the browser's namespace at host.containers.internal:3478 over UDP with a success",
    binding.out.replace(/\s/gu, "") === "0101",
    `exit ${binding.code}: ${binding.out.trim()} ${binding.err.trim()}`
  );
}

const spec: Spec = {
  group: "The hub and machines",
  host: "it makes network namespaces and runs the project's browser in a container, whose runtime socket and ports no workspace boundary reaches",
  name: "browser-egress-host",
  run: async (kit) => {
    await scratchNamespace(kit);
    await fleetBrowser(kit);
  },
};

export default spec;
