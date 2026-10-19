/**
 * How the internet reaches this machine, for the stream relay (core
 * stream-relay.ts): the public address its router maps it to, asked of one
 * STUN server (`STUN_SERVER`, Cloudflare's; a scratch fleet's stand-in by
 * `CAWCO_STUN_SERVER`) at each capability report, and, from a fleet machine
 * on another network, a STUN binding through each of the relay's URLs
 * (`relay.prove`), so the relay is proven reached from outside without the
 * person. Both are turn-server's `getPublicIP`.
 */
import { networkInterfaces } from "node:os";
import { isPublicAddress } from "@cawco/core/public-address";
import { stunServer } from "@cawco/core/stream-relay";
import { getPublicIP } from "turn-server";

/** How long a STUN binding has to be answered. */
const STUN_MS = 3000;

/** The address a binding through `url` maps this machine to; undefined when none answered within {@link STUN_MS}. */
const mappedBy = (url: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    try {
      getPublicIP(url, { timeout: STUN_MS }, (error, address) =>
        resolve(error ? undefined : address?.ip)
      );
    } catch {
      resolve(undefined);
    }
  });

const PRIVATE_V4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

/**
 * This machine's address on its router's network: the first private IPv4
 * an interface holds (a tailnet's 100.64/10 is no router's network). Our
 * call: the forwards name the address the router knows the machine by, and
 * a home router hands out one of these.
 */
const lanAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .find(
      (one) =>
        one.family === "IPv4" && !one.internal && PRIVATE_V4.test(one.address)
    )?.address;

/**
 * The public address this machine's router maps it to, and its address on
 * the router's network; undefined when the STUN server did not answer with
 * a public address, or the machine has no router's network address.
 */
export const routerAddress = async (): Promise<
  { address: string; lan: string } | undefined
> => {
  const lan = lanAddress();
  if (!lan) {
    return;
  }
  const address = await mappedBy(stunServer());
  return address && isPublicAddress(address) ? { address, lan } : undefined;
};

const TURN_SCHEME = /^turn(s?):/;

/** A TURN URL as the STUN binding through it: `turn:` → `stun:`, `turns:` → `stuns:`. */
const asStun = (url: string): string => url.replace(TURN_SCHEME, "stun$1:");

/** `relay.prove`: each of the relay's URLs that answered a STUN binding from this machine. */
export const proveRelay = async (urls: string[]): Promise<string[]> => {
  const answered = await Promise.all(
    urls.map(async (url) => ((await mappedBy(asStun(url))) ? url : null))
  );
  return answered.filter((url): url is string => url !== null);
};
