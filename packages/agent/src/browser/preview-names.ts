/**
 * The hub's preview names as a browser container must resolve them, so a
 * session's browser opens what `artifact_browse` hands it (hub
 * server.ts `browseAt`). A container's loopback is its own: a name this
 * machine resolves to its loopback (a `localtest.me` name, a hosts entry, a
 * proxy on the machine) reaches nothing in there. Those names are mapped to
 * the machine as the container sees it, the runtime's `host-gateway` entry
 * ("This resolves to an IP address the container can use to connect to the
 * host", docs.podman.io podman-run `--add-host`), by Chromium's own
 * resolver ("MAP <hostname_pattern> <replacement_host>", where "The
 * <replacement_host> can be either a hostname, or an IP address literal",
 * chromium net/base/host_mapping_rules.h). A name that resolves anywhere
 * else resolves the same inside, through the runtime's DNS, and is left
 * alone: a tunnel's names go on to the tunnel.
 *
 * The local host's Chromium runs on the machine's own network, and maps
 * nothing.
 */
import { readWithin } from "@cawco/core/bounded";
import { PREVIEW_NAMES_PATH, type PreviewNames } from "@cawco/core/browser";
import { delegationHubUrl } from "../delegation";
import { provenFetch } from "../hub-proof";

/** The container's own name for the machine: its `/etc/hosts` entry, `host-gateway`'s address. */
export const MACHINE_HOST = "cawco-host";

/** How long the hub has to name its preview names. Our call: a browser's start waits on it. */
const NAMES_MS = 5000;

/** Whether `address` is a loopback address (127.0.0.0/8, ::1). */
const loopback = (address: string): boolean =>
  address.startsWith("127.") || address === "::1";

/**
 * The rules a browser container is made with now: each of the hub's
 * preview names that resolves to this machine's loopback, mapped to
 * {@link MACHINE_HOST}; undefined when none does. A hub that doesn't answer
 * leaves the container without them, said in one line: its previews' names
 * then resolve inside as they do through DNS.
 */
export const containerHostRules = async (): Promise<string | undefined> => {
  let names: PreviewNames["names"];
  try {
    const read = await readWithin(NAMES_MS, (signal) =>
      provenFetch(`${delegationHubUrl()}${PREVIEW_NAMES_PATH}`, { signal })
    );
    if (read.kind !== "answered") {
      throw new Error(`no answer within ${NAMES_MS / 1000} s`);
    }
    if (!read.value.ok) {
      throw new Error(`HTTP ${read.value.status}`);
    }
    ({ names } = (await read.value.json()) as PreviewNames);
  } catch (error) {
    console.warn(
      `[browser] the hub's preview names were not read (${error instanceof Error ? error.message : String(error)}): the container is made without mapping them`
    );
    return;
  }
  if (!names) {
    return;
  }
  const resolved = await Bun.dns
    .lookup(names.sample)
    .catch(() => [] as { address: string }[]);
  if (
    resolved.length === 0 ||
    !resolved.every((one) => loopback(one.address))
  ) {
    return;
  }
  return names.patterns
    .map((pattern) => `MAP ${pattern} ${MACHINE_HOST}`)
    .join(", ");
};
