/**
 * The hub calling its own routes (a tool's handler reading or writing through
 * the REST door, delegation-actions.ts and admin-tools.ts): the hub, not the
 * session the tool runs for, and never anyone else. Each such call carries a
 * secret this process made at start and keeps in memory (hub-auth.ts reads
 * it as the hub itself). The calling session's own `Authorization`, when a
 * call passes it on, still names who the hub acts for.
 *
 * Only to this hub's own origin: a call anywhere else is refused before it
 * goes, so no URL a caller hands the hub can carry the secret out.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { CAWCO_ENV, CAWCO_HUB_PORT } from "@cawco/core";

const WS_SCHEME = /^ws/;
const WS_PATH_SUFFIX = /\/ws$/;

/** Where the hub answers REST, derived from the websocket url the daemon uses. */
export const hubHttpUrl = (): string => {
  const ws =
    process.env[CAWCO_ENV.hubUrl] ??
    `ws://localhost:${process.env[CAWCO_ENV.hubPort] ?? CAWCO_HUB_PORT}/ws`;
  return ws.replace(WS_SCHEME, "http").replace(WS_PATH_SUFFIX, "");
};

/** The header a self-call carries. */
export const HUB_SELF_HEADER = "x-cawco-hub-self";

const secret = randomBytes(32).toString("base64url");

/** Whether `value` is this process's own secret. */
export const isHubSelf = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const given = Buffer.from(value);
  const held = Buffer.from(secret);
  return given.length === held.length && timingSafeEqual(given, held);
};

/** `fetch`, to this hub's own origin only, as the hub. */
export const selfFetch = (
  url: string | URL,
  init: BunFetchRequestInit = {}
): Promise<Response> => {
  const target = new URL(url);
  if (target.origin !== new URL(hubHttpUrl()).origin) {
    return Promise.reject(
      new Error(
        `The hub calls only its own routes as itself; ${target.origin} is not ${hubHttpUrl()}.`
      )
    );
  }
  const headers = new Headers(init.headers);
  headers.set(HUB_SELF_HEADER, secret);
  return fetch(target, { ...init, headers });
};
