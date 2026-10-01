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
export const advertise = (port: number): void => {
  if (readEnv(CAWCO_ENV.noMdns) === "1") {
    console.log("[hub] mDNS advertisement disabled");
    return;
  }

  // Platforms that refuse the multicast socket (locked-down containers, a
  // conflicting responder) leave the hub perfectly usable over an explicit URL.
  try {
    const bonjour = new Bonjour();
    const service = bonjour.publish({
      name: `cawco-${hostname()}`,
      type: CAWCO_MDNS_TYPE,
      protocol: "tcp",
      port,
      txt: { version: HUB_VERSION },
    });
    service.on("error", (error: Error) =>
      console.log(`[hub] mDNS unavailable: ${error.message}`)
    );
    console.log(`[hub] advertising _${CAWCO_MDNS_TYPE}._tcp on :${port}`);
  } catch (error) {
    console.log(`[hub] mDNS unavailable: ${(error as Error).message}`);
  }
};
