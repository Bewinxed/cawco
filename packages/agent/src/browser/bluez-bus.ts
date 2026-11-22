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
 * container's `/run/dbus`: a proxy started again makes its socket anew there
 * (it unlinks the old one before it listens, flatpak-proxy.c
 * `flatpak_proxy_start`), and a running container sees it, where a bound
 * socket file would go on naming the old one.
 *
 * The bus lasts as long as the container. Chromium aborts the moment its
 * system bus disconnects (`FATAL:dbus/bus.cc:1245] D-Bus connection was
 * disconnected. Aborting.`), so the proxy is a transient unit of the user's
 * systemd manager of its own ({@link unitOf}), never the agent's child: as
 * the agent's child it held one end of a pipe to the agent (`--fd`) and
 * stopped as that closed, and the agent's unit stops every process in its
 * cgroup as it stops (`KillMode=control-group`), so every agent restart,
 * update and stop took Chromium down with it (all 8 stops with a live
 * browser on 21–22 Nov 2026). An agent that starts again finds the unit
 * active and keeps it; systemd starts the proxy again if it ends. The unit
 * stops only once its browser's container has stopped or gone
 * (container-host.ts `stop`, `remove`).
 *
 * With no `xdg-dbus-proxy` on the machine, the machine's system bus socket
 * itself is bound, unfiltered.
 */
import { existsSync, rmSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserKey } from "@cawco/core/browser";
import { browserSlug } from "@cawco/core/browser";
import { makeFolder } from "@cawco/core/folders";
import { runInC } from "@cawco/core/run-captured";
import { browserOwner } from "./state";

/** The machine's D-Bus system bus. */
const SYSTEM_BUS = "/run/dbus/system_bus_socket";

/** Where a container's programs look for the system bus: libdbus's default, named outright. */
const CONTAINER_BUS_DIR = "/run/dbus";
const BUS_SOCKET = "system_bus_socket";
const PROXY = "xdg-dbus-proxy";

/** How long the proxy has to listen once its unit starts. */
const READY_MS = 5000;
const READY_POLL_MS = 100;

/** What a container is given for BlueZ: a bind and the bus address its programs read. */
export interface BluezBus {
  /** `<host path>:<container path>`, as the Engine API's `HostConfig.Binds` takes it. */
  bind: string;
  /** `DBUS_SYSTEM_BUS_ADDRESS=…` for the container's environment. */
  env: string;
  /** The host path bound: a container made with another is made again. */
  source: string;
}

/** The browser's own folder the proxy listens in: under the agent's runtime dir, else the temp dir. */
const proxyDir = (key: BrowserKey): string =>
  join(
    process.env.XDG_RUNTIME_DIR ?? tmpdir(),
    "cawco",
    "bluez",
    browserSlug(key)
  );

/**
 * Browser `key`'s proxy unit, named for the agent whose records keep the
 * browser (state.ts `browserOwner`) as its container is: two agents of one
 * user (a scratch fleet beside the machine's own) share one systemd manager.
 */
const unitOf = async (key: BrowserKey): Promise<string> =>
  `cawco-bluez-${await browserOwner()}-${browserSlug(key)}.service`;

/** Whether `socket` is there within {@link READY_MS}: the proxy listens once it is. */
const listens = async (socket: string): Promise<boolean> => {
  const until = Date.now() + READY_MS;
  while (!existsSync(socket)) {
    if (Date.now() >= until) {
      return false;
    }
    await Bun.sleep(READY_POLL_MS);
  }
  return true;
};

/**
 * Starts `unit` running `proxy` to listen at `socket`. `UMask=0000`: the
 * container's user is another uid on the machine (a rootless runtime maps it
 * to a subordinate one), and it connects only to a socket anyone may write,
 * as each start the unit makes anew has it. What it reaches through the
 * socket is BlueZ alone. Throws systemd's own words when it refuses.
 */
const startUnit = async (
  unit: string,
  proxy: string,
  socket: string
): Promise<void> => {
  const ran = await runInC([
    "systemd-run",
    "--user",
    "--collect",
    "--quiet",
    `--unit=${unit}`,
    "--property=Type=exec",
    "--property=Restart=always",
    "--property=RestartSec=1",
    "--property=UMask=0000",
    proxy,
    `unix:path=${SYSTEM_BUS}`,
    socket,
    "--filter",
    "--talk=org.bluez",
    "--call=org.bluez.*=*",
  ]);
  if (ran.code !== 0) {
    throw new Error(
      `systemd-run refused ${unit}: ${ran.stderr.trim() || `exit ${ran.code}`}`
    );
  }
};

/** Stops `unit`; one already gone is stopped. */
const stopUnit = async (unit: string): Promise<void> => {
  await runInC(["systemctl", "--user", "stop", unit]);
};

/** Whether `unit` runs, or is starting its proxy again. */
const unitUp = async (unit: string): Promise<boolean> => {
  const ran = await runInC(["systemctl", "--user", "is-active", unit]);
  const state = ran.stdout.trim();
  return state === "active" || state === "activating";
};

/**
 * BlueZ for browser `key`'s container: its proxy unit, kept when it runs and
 * listens, started when it does not, or the machine's system bus unfiltered
 * where no proxy is installed. Undefined, with a warning, where the machine
 * has no system bus or the proxy doesn't listen: the browser starts all the
 * same, with no passkey relay.
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
  const proxy = Bun.which(PROXY);
  if (!proxy) {
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
  const socket = join(dir, BUS_SOCKET);
  const unit = await unitOf(key);
  try {
    if ((await unitUp(unit)) && (await listens(socket))) {
      return bus;
    }
    // Neither running nor listening: whatever is left of it goes, and it
    // starts afresh.
    await stopUnit(unit);
    await makeFolder(dir, { mode: 0o755 });
    // The container's user reaches the socket through this folder.
    await chmod(dir, 0o755);
    rmSync(socket, { force: true });
    await startUnit(unit, proxy, socket);
    if (!(await listens(socket))) {
      await stopUnit(unit);
      throw new Error(
        `it did not listen within ${READY_MS} ms: journalctl --user -u ${unit} says why`
      );
    }
  } catch (error) {
    console.warn(
      `[browser] ${key}: ${PROXY} didn't start, so Chromium sees no Bluetooth adapter: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  console.info(
    `[browser] ${key}: BlueZ reaches the container through ${socket} (${unit})`
  );
  return bus;
};

/**
 * Stops browser `key`'s proxy unit, if it runs, and removes its folder: only
 * once its container has stopped or gone, as Chromium aborts when its bus
 * disconnects.
 */
export const stopBluezBus = async (key: BrowserKey): Promise<void> => {
  if (Bun.which(PROXY)) {
    await stopUnit(await unitOf(key));
  }
  rmSync(proxyDir(key), { recursive: true, force: true });
};
