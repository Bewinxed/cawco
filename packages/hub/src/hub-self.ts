/**
 * Where the hub answers (`hubHttpUrl`), and the secret this process makes at
 * start and keeps in memory (`processSecret`).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { CAWCO_HUB_PORT } from "@cawco/core/ports";

const WS_SCHEME = /^ws/u;
const WS_PATH_SUFFIX = /\/ws$/u;

/** Where the hub answers REST, derived from the websocket url the daemon uses. */
export const hubHttpUrl = (): string => {
  const ws =
    process.env[CAWCO_ENV.hubUrl] ??
    `ws://localhost:${process.env[CAWCO_ENV.hubPort] ?? CAWCO_HUB_PORT}/ws`;
  return ws.replace(WS_SCHEME, "http").replace(WS_PATH_SUFFIX, "");
};

/**
 * A secret this process makes as it starts and keeps in memory: `value` to
 * send, and `is`, whether a value given back is it (in constant time).
 */
export const processSecret = () => {
  const value = randomBytes(32).toString("base64url");
  const held = Buffer.from(value);
  return {
    value,
    is: (given: string | null | undefined): boolean => {
      if (!given) {
        return false;
      }
      const bytes = Buffer.from(given);
      return bytes.length === held.length && timingSafeEqual(bytes, held);
    },
  };
};
