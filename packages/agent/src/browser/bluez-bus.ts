/**
 * BlueZ, reached from inside a browser container: Chromium finds a Bluetooth
 * adapter only through BlueZ on the D-Bus system bus, and the container has
 * neither a bus nor bluetoothd (the kernel keeps Bluetooth sockets to the
 * host's network namespace, so bluetoothd can't run in it). The machine's
 * bluetoothd manages the virtual adapter (passkey-inject.ts), and the
 * container is given the machine's system bus through `xdg-dbus-proxy`, the
 * filtering proxy Flatpak's sandboxes reach their buses through, filtered to
 * BlueZ alone.
 *
 * The proxy listens in a folder of the browser's own, bound at the
 * container's `/run/dbus`: a proxy started again makes its socket anew there,
 * and a running container sees it, where a bound socket file would go on
 * naming the old one. The proxy holds one end of a pipe to the agent
 * (`--fd`) and stops when it closes, so it ends with the agent. With no
 * `xdg-dbus-proxy` on the machine, the machine's system bus socket itself is
 * bound, unfiltered.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Gone, readWithin } from "@cawco/core/bounded";
import type { BrowserKey } from "@cawco/core/browser";
import { browserSlug } from "@cawco/core/browser";
import { makeFolderSync } from "@cawco/core/folders";

/** The machine's D-Bus system bus. */
const SYSTEM_BUS = "/run/dbus/system_bus_socket";

/** Where a container's programs look for the system bus: libdbus's default, named outright. */
const CONTAINER_BUS_DIR = "/run/dbus";
const BUS_SOCKET = "system_bus_socket";
const PROXY = "xdg-dbus-proxy";

/** How long the proxy has to say it listens. */
const READY_MS = 5000;

/** What a container is given for BlueZ: a bind and the bus address its programs read. */
export interface BluezBus {
  /** `<host path>:<container path>`, as the Engine API's `HostConfig.Binds` takes it. */
  bind: string;
  /** `DBUS_SYSTEM_BUS_ADDRESS=…` for the container's environment. */
  env: string;
  /** The host path bound: a container made with another is made again. */
  source: string;
}

/** Each browser's running proxy, by key. */
const proxies = new Map<BrowserKey, ChildProcess>();

/** The browser's own folder the proxy listens in: under the agent's runtime dir, else the temp dir. */
const proxyDir = (key: BrowserKey): string =>
  join(
    process.env.XDG_RUNTIME_DIR ?? tmpdir(),
    "cawco",
    "bluez",
    browserSlug(key)
  );

/** Whether `xdg-dbus-proxy` runs here: it answers `--version`. */
const proxyInstalled = (): boolean =>
  spawnSync(PROXY, ["--version"], { stdio: "ignore" }).status === 0;

/**
 * Starts `xdg-dbus-proxy` listening at `socket`: answered once it writes to
 * its ready pipe, and killed when it hasn't within {@link READY_MS}.
 */
const startProxy = async (
  key: BrowserKey,
  socket: string
): Promise<ChildProcess> => {
  let stderr = "";
  const started = await readWithin(
    READY_MS,
    (signal) =>
      new Promise<ChildProcess>((resolve, reject) => {
        const child = spawn(
          PROXY,
          [
            "--fd=3",
            `unix:path=${SYSTEM_BUS}`,
            socket,
            "--filter",
            "--talk=org.bluez",
            "--call=org.bluez.*=*",
          ],
          { signal, stdio: ["ignore", "ignore", "pipe", "pipe"] }
        );
        const [, , errors, ready] = child.stdio;
        errors?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        ready?.once("data", () => resolve(child));
        child.once("error", reject);
        child.once("exit", (code, exitSignal) => {
          if (proxies.get(key) === child) {
            proxies.delete(key);
            console.warn(
              `[browser] ${key}: ${PROXY} stopped (${exitSignal ?? `exit ${code}`}); the browser has no BlueZ until it starts again`
            );
          }
          reject(
            new Gone(
              `${PROXY} exited ${exitSignal ?? code} before it listened: ${stderr.trim()}`
            )
          );
        });
      })
  );
  if (started.kind === "unanswered") {
    throw new Error(
      `${PROXY} did not listen (${started.reason}, after ${started.after} ms): ${stderr.trim()}`
    );
  }
  return started.value;
};

/**
 * BlueZ for browser `key`'s container: its proxy, started when it is not
 * running, or the machine's system bus unfiltered where no proxy is
 * installed. Undefined, with a warning, where the machine has no system bus
 * or the proxy fails: the browser starts all the same, with no passkey relay.
 */
export const standBluezBus = async (
  key: BrowserKey
): Promise<BluezBus | undefined> => {
  const env = `DBUS_SYSTEM_BUS_ADDRESS=unix:path=${CONTAINER_BUS_DIR}/${BUS_SOCKET}`;
  if (!existsSync(SYSTEM_BUS)) {
    console.warn(
      `[browser] ${key}: no D-Bus system bus at ${SYSTEM_BUS}, so Chromium sees no Bluetooth adapter and offers no passkey relay`
    );
    return;
  }
  if (!proxyInstalled()) {
    console.warn(
      `[browser] ${key}: no ${PROXY} on this machine, so the container is given the whole system bus, unfiltered. Install it (xdg-dbus-proxy, Flatpak's) to give it BlueZ alone.`
    );
    return {
      bind: `${SYSTEM_BUS}:${CONTAINER_BUS_DIR}/${BUS_SOCKET}`,
      env,
      source: SYSTEM_BUS,
    };
  }
  const dir = proxyDir(key);
  const bus = { bind: `${dir}:${CONTAINER_BUS_DIR}`, env, source: dir };
  if (proxies.has(key)) {
    return bus;
  }
  const socket = join(dir, BUS_SOCKET);
  makeFolderSync(dir, { mode: 0o755 });
  // A socket the last proxy left: a new one can't listen over it.
  rmSync(socket, { force: true });
  try {
    proxies.set(key, await startProxy(key, socket));
  } catch (error) {
    console.warn(
      `[browser] ${key}: ${PROXY} didn't start, so Chromium sees no Bluetooth adapter: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  // The container's user is another uid on the machine (a rootless runtime
  // maps it to a subordinate one): it connects only to a socket anyone may
  // write. What it reaches through the socket is BlueZ alone.
  chmodSync(dir, 0o755);
  chmodSync(socket, 0o666);
  console.info(
    `[browser] ${key}: BlueZ reaches the container through ${socket}`
  );
  return bus;
};

/** Stops browser `key`'s proxy, if it runs, and removes its folder. */
export const stopBluezBus = (key: BrowserKey): void => {
  const child = proxies.get(key);
  proxies.delete(key);
  child?.kill();
  rmSync(proxyDir(key), { recursive: true, force: true });
};
