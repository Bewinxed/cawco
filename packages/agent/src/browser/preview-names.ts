/**
 * The hub's preview names as a browser container must resolve them, so a
 * session's browser opens what `artifact_browse` hands it (hub
 * server.ts `browseAt`). A container's loopback is its own: a name this
 * machine resolves to its loopback (a `localtest.me` name, a hosts entry, a
 * proxy on the machine) reaches nothing in there. Those names are mapped to
 * the machine as the container sees it, by Chromium's own resolver ("MAP
 * <hostname_pattern> <replacement_host>", where "The <replacement_host> can
 * be either a hostname, or an IP address literal", chromium
 * net/base/host_mapping_rules.h). A name that resolves anywhere else
 * resolves the same inside, through the runtime's DNS, and is left alone: a
 * tunnel's names go on to the tunnel.
 *
 * The machine's name inside a container is its runtime's
 * ({@link machineHostOf}). The local host's Chromium runs on the machine's
 * own network, and maps nothing.
 */
import { readWithin } from "@cawco/core/bounded";
import { PREVIEW_NAMES_PATH, type PreviewNames } from "@cawco/core/browser";
import { delegationHubUrl } from "../delegation";
import { provenFetch } from "../hub-proof";
import type { Runtime } from "./runtime";

/** A native engine's container's own name for the machine: its `/etc/hosts` entry, `host-gateway`'s address. */
const MACHINE_HOST = "cawco-host";

/** How long the hub has to name its preview names. Our call: a browser's start and an agent's connection wait on it. */
const NAMES_MS = 5000;

/**
 * The name a container of `runtime` reaches the machine by, and the host
 * entries its making adds for it:
 * - a native engine on Linux (its host network the machine's own): its
 *   runtime's `host-gateway` under a name of ours ("Instead of an IP
 *   address, the special flag host-gateway can be given. This resolves to
 *   an IP address the container can use to connect to the host",
 *   docs.podman.io podman-run `--add-host`; Docker's `--add-host` takes it
 *   alike);
 * - Podman in a VM (`podman machine`): `host.containers.internal`, which
 *   its own DNS answers ("If Podman is running in a virtual machine using
 *   `podman machine` … the internal hostnames are resolved by the gvproxy
 *   DNS resolver instead", the same page), and no entry, since such a
 *   runtime may refuse `host-gateway` ("there's no guarantee that Podman
 *   can determine the host-gateway address automatically, which will then
 *   cause Podman to fail with an error message");
 * - Docker in a VM: `host.docker.internal`, and no entry. Docker Desktop:
 *   "`host.docker.internal` Resolves to the internal IP address of your
 *   host" (docs.docker.com/desktop/features/networking/networking-how-tos);
 *   OrbStack: "You can use the `host.docker.internal` domain to connect to
 *   a server running on Mac" (docs.orbstack.dev/docker/network); Colima's
 *   VM resolver answers it with its gateway (`"host.docker.internal":
 *   gatewayAddr`, github.com/abiosoft/colima environment/vm/lima/dns.go).
 */
export const machineHostOf = (
  runtime: Pick<Runtime, "kind" | "ownNetwork">
): { extraHosts: string[]; name: string } => {
  if (runtime.ownNetwork) {
    return {
      name: MACHINE_HOST,
      extraHosts: [`${MACHINE_HOST}:host-gateway`],
    };
  }
  return {
    name:
      runtime.kind === "podman"
        ? "host.containers.internal"
        : "host.docker.internal",
    extraHosts: [],
  };
};

/** Whether `address` is a loopback address (127.0.0.0/8, ::1). */
const loopback = (address: string): boolean =>
  address.startsWith("127.") || address === "::1";

/**
 * The hub's preview names, and whether their sample resolves to this
 * machine's loopback alone: the fetch, its body and the lookup under one
 * deadline ({@link NAMES_MS}), so a start or a move never waits longer.
 */
const readNames = async (
  signal: AbortSignal
): Promise<{ loopback: boolean; names: PreviewNames["names"] }> => {
  const answer = await provenFetch(
    `${delegationHubUrl()}${PREVIEW_NAMES_PATH}`,
    {
      signal,
    }
  );
  if (!answer.ok) {
    throw new Error(`HTTP ${answer.status}`);
  }
  const { names } = (await answer.json()) as PreviewNames;
  if (!names) {
    return { names, loopback: false };
  }
  const resolved = await Bun.dns
    .lookup(names.sample)
    .catch(() => [] as { address: string }[]);
  return {
    names,
    loopback:
      resolved.length > 0 && resolved.every((one) => loopback(one.address)),
  };
};

/**
 * The rules a container of `runtime` wants now: each of the hub's preview
 * names that resolves to this machine's loopback, mapped to the machine
 * ({@link machineHostOf}); `rules` undefined when none does. Null when the
 * hub didn't answer within {@link NAMES_MS} or refused, said in one line:
 * nothing is known, so nothing changes for it, and it never throws.
 */
export const wantedHostRules = async (
  runtime: Pick<Runtime, "kind" | "ownNetwork">
): Promise<{ rules: string | undefined } | null> => {
  let read: Awaited<ReturnType<typeof readNames>>;
  try {
    const bounded = await readWithin(NAMES_MS, readNames);
    if (bounded.kind !== "answered") {
      throw new Error(`no answer within ${NAMES_MS / 1000} s`);
    }
    read = bounded.value;
  } catch (error) {
    console.warn(
      `[browser] the hub's preview names were not read (${error instanceof Error ? error.message : String(error)}): the container's rules stay as they are`
    );
    return null;
  }
  if (!(read.names && read.loopback)) {
    return { rules: undefined };
  }
  const { name } = machineHostOf(runtime);
  return {
    rules: read.names.patterns
      .map((pattern) => `MAP ${pattern} ${name}`)
      .join(", "),
  };
};
