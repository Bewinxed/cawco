/**
 * A scratch ACME for the probe kit: Let's Encrypt's own test server, pebble
 * (github.com/letsencrypt/pebble), with real HTTP-01 validation
 * (`PEBBLE_VA_ALWAYS_VALID` unset), in rootless Podman on a network of its
 * own. Its DNS is `pebble-challtestsrv`, which answers every A query with
 * the one address the caller names (`-defaultIPv4`), so pebble's validation
 * asks that address for every name ("use the `-dnsserver` flag to define an
 * address to a DNS server", pebble's README). Its HTTP-01 port is 80
 * (`"httpPort"` in its `-config` file; the README: "These ports can be
 * changed by editing the `httpPort` and `tlsPort` values").
 *
 * Every container and the network, and the caller's containers and volumes
 * on them, are removed by exact name when `stop` runs, and on SIGINT or
 * SIGTERM before it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PEBBLE_IMAGE = "ghcr.io/letsencrypt/pebble:latest";
export const CHALLTESTSRV_IMAGE =
  "ghcr.io/letsencrypt/pebble-challtestsrv:latest";

/** The scratch network and the addresses on it: pebble's, its DNS's, and the caller's one validated address. */
export const ACME_NETWORK = {
  name: "cawco-probe-acme",
  subnet: "10.231.77.0/24",
  pebble: "10.231.77.12",
  dns: "10.231.77.11",
  /** The address every name resolves to: where the caller's port 80 stands. */
  target: "10.231.77.10",
} as const;
export const PEBBLE_CONTAINER = "cawco-probe-pebble";
export const CHALLTESTSRV_CONTAINER = "cawco-probe-challtestsrv";

/**
 * pebble's own test config (test/config/pebble-config.json) with HTTP-01 on
 * port 80; its certificate and key paths are the image's own.
 */
const CONFIG = {
  pebble: {
    listenAddress: "0.0.0.0:14000",
    managementListenAddress: "0.0.0.0:15000",
    certificate: "test/certs/localhost/cert.pem",
    privateKey: "test/certs/localhost/key.pem",
    httpPort: 80,
    tlsPort: 5001,
    ocspResponderURL: "",
    externalAccountBindingRequired: false,
  },
};

export interface Pebble {
  /** The ACME directory, on the scratch network. */
  directory: string;
  /** pebble's management interface, where its intermediate is read (`/intermediates/0`). */
  management: string;
  /** Every container and the network gone, by name. */
  stop: () => Promise<void>;
}

/** `podman <args>`: its exit code and what it said. */
export const podmanRun = async (
  podman: string,
  args: string[]
): Promise<{ code: number; out: string }> => {
  const run = Bun.spawn([podman, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  return { code: await run.exited, out: `${out}${err}`.trim() };
};

/** What a run made, by exact name. */
interface Made {
  containers: readonly string[];
  network: string;
  volumes: readonly string[];
}

/** Removes everything `made` names, at once; what is already gone is fine. */
const removeAll = (podman: string, made: Made): void => {
  Bun.spawnSync([
    podman,
    "rm",
    "-f",
    "-t",
    "0",
    "--ignore",
    ...made.containers,
  ]);
  Bun.spawnSync([podman, "network", "rm", "-f", made.network]);
  for (const volume of made.volumes) {
    Bun.spawnSync([podman, "volume", "rm", "-f", volume]);
  }
};

/**
 * pebble and its DNS on {@link ACME_NETWORK}, its config written in `dir`;
 * `others` names the caller's containers on the same network and the
 * volumes it makes, removed with them. Throws with Podman's words when one
 * doesn't start.
 */
export const startPebble = async (
  podman: string,
  dir: string,
  others: { containers: readonly string[]; volumes: readonly string[] }
): Promise<Pebble> => {
  const made: Made = {
    containers: [
      PEBBLE_CONTAINER,
      CHALLTESTSRV_CONTAINER,
      ...others.containers,
    ],
    network: ACME_NETWORK.name,
    volumes: others.volumes,
  };
  const stop = async (): Promise<void> => {
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
    removeAll(podman, made);
    await Promise.resolve();
  };
  const interrupted = (): void => {
    removeAll(podman, made);
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  // A run that died before its stop left these behind: gone first, by name.
  removeAll(podman, made);
  mkdirSync(dir, { recursive: true });
  const config = join(dir, "pebble-config.json");
  writeFileSync(config, JSON.stringify(CONFIG, null, 2));
  const steps: string[][] = [
    ["network", "create", "--subnet", ACME_NETWORK.subnet, ACME_NETWORK.name],
    [
      "run",
      "-d",
      "--name",
      CHALLTESTSRV_CONTAINER,
      "--network",
      ACME_NETWORK.name,
      "--ip",
      ACME_NETWORK.dns,
      CHALLTESTSRV_IMAGE,
      "-defaultIPv4",
      ACME_NETWORK.target,
      "-defaultIPv6",
      "",
      "-http01",
      "",
      "-https01",
      "",
      "-tlsalpn01",
      "",
      "-dnsserver",
      ":8053",
    ],
    [
      "run",
      "-d",
      "--name",
      PEBBLE_CONTAINER,
      "--network",
      ACME_NETWORK.name,
      "--ip",
      ACME_NETWORK.pebble,
      "-e",
      "PEBBLE_VA_NOSLEEP=1",
      "-e",
      "PEBBLE_WFE_NONCEREJECT=0",
      "-v",
      `${config}:/probe/pebble-config.json:ro,z`,
      PEBBLE_IMAGE,
      "-config",
      "/probe/pebble-config.json",
      "-dnsserver",
      `${ACME_NETWORK.dns}:8053`,
      "-strict",
      "false",
    ],
  ];
  for (const step of steps) {
    // biome-ignore lint/performance/noAwaitInLoops: the network first, then its DNS, then pebble
    const ran = await podmanRun(podman, step);
    if (ran.code !== 0) {
      await stop();
      throw new Error(
        `podman ${step.slice(0, 4).join(" ")}… exited ${ran.code}: ${ran.out}`
      );
    }
  }
  return {
    directory: `https://${ACME_NETWORK.pebble}:14000/dir`,
    management: `https://${ACME_NETWORK.pebble}:15000`,
    stop,
  };
};
