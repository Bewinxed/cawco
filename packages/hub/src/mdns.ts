import { hostname } from "node:os";
import { CAWCO_ENV, CAWCO_MDNS_TYPE, readEnv } from "@cawco/core";
import { Bonjour } from "bonjour-service";
import { HUB_VERSION } from "./config";

/**
 * Announces the hub on the local link, so `cawco up` on a machine plugged into
 * the same network finds it without being told anything.
 *
 * Multicast is link-local by definition: this announcement does not cross a
 * router and does not cross a tailnet, however long a browser waits for it. The
 * CLI walks tailscale peers for exactly that reason — do not try to make mDNS
 * carry that case.
 */
const NOT_LABEL_CHARS = /[^a-z0-9-]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const TRAILING_DASHES = /-+$/;

/**
 * The hub's own `.local` host name, the SRV target its A/AAAA records answer for.
 *
 * bonjour-service is a responder of its own, separate from the OS's. Left
 * without `host` it publishes address records for the machine's name
 * (`os.hostname()`), which mDNSResponder and avahi already own. macOS reads that
 * as a second device claiming its name and renames itself
 * ("Omars-MacBook-Pro-2.local"). A name prefixed `cawco-` is never the
 * machine's. The first label is lowercased and reduced to `[a-z0-9-]` so it is
 * one valid DNS label of at most 63 bytes.
 */
export const hubHostName = (machine = hostname()): string => {
  const label = (machine.split(".")[0] ?? "")
    .toLowerCase()
    .replace(NOT_LABEL_CHARS, "-")
    .replace(EDGE_DASHES, "");
  return `${`cawco-${label || "hub"}`.slice(0, 63).replace(TRAILING_DASHES, "")}.local`;
};

export const advertise = (port: number): void => {
  if (readEnv(CAWCO_ENV.noMdns) === "1") {
    console.log("[hub] mDNS advertisement disabled");
    return;
  }

  // Platforms that refuse the multicast socket (locked-down containers, a
  // conflicting responder) leave the hub perfectly usable over an explicit URL.
  try {
    const bonjour = new Bonjour();
    const host = hubHostName();
    const service = bonjour.publish({
      name: `cawco-${hostname()}`,
      host,
      type: CAWCO_MDNS_TYPE,
      protocol: "tcp",
      port,
      txt: { version: HUB_VERSION },
    });
    service.on("error", (error: Error) =>
      console.log(`[hub] mDNS unavailable: ${error.message}`)
    );
    console.log(
      `[hub] advertising _${CAWCO_MDNS_TYPE}._tcp on ${host}:${port}`
    );
  } catch (error) {
    console.log(`[hub] mDNS unavailable: ${(error as Error).message}`);
  }
};
