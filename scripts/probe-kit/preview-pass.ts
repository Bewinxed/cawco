/**
 * The person's preview pass for a spec that reads a preview origin itself,
 * outside the dashboard (which enters on its frames' `cawco:locked`). Every
 * preview origin, an origin's own port or a host-mode name, is behind the
 * lock (hub preview-access.ts): a ticket from the hub's API
 * (`POST /api/preview-ticket`), spent at `/__cawco/enter` on the origin,
 * sets the pass, which a port's host carries on every port of it and a
 * host-mode name on its whole domain. One pass per origin's scope is kept
 * for the run; a read that the lock turns away (its pass lapsed or revoked)
 * enters once more.
 */
import type { BrowserContext } from "playwright-core";
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../packages/core/src/frames";

/** The fleet as a pass needs it: the hub's base, where tickets are asked. */
interface Hub {
  base: string;
}

/** The pass cookie (`name=value`) by origin. */
const held = new Map<string, string>();

/** A new pass for `origin`: `name=value`, or the entry's answer said as an error. */
const enterOrigin = async (hub: Hub, origin: string): Promise<string> => {
  const asked = await fetch(`${hub.base}/api/preview-ticket`, {
    method: "POST",
  });
  if (!asked.ok) {
    throw new Error(
      `the hub gave no preview ticket: ${asked.status} ${await asked.text()}`
    );
  }
  const { ticket } = (await asked.json()) as PreviewTicket;
  const entry = await fetch(previewEnterUrl(origin, ticket), {
    redirect: "manual",
  });
  const cookie = entry.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) {
    throw new Error(
      `${origin}/__cawco/enter set no pass: ${entry.status} ${(await entry.text()).slice(0, 160)}`
    );
  }
  return cookie;
};

/** The person's pass for `origin` (`name=value`), entered once per run. */
export const previewPass = async (
  hub: Hub,
  origin: string
): Promise<string> => {
  const at = new URL(origin).origin;
  const kept = held.get(at);
  if (kept) {
    return kept;
  }
  const cookie = await enterOrigin(hub, at);
  held.set(at, cookie);
  return cookie;
};

/**
 * `fetch` of a preview origin's `url` carrying the person's pass; turned
 * away by the lock (401, the locked page), it enters once more.
 */
export const passedFetch = async (
  hub: Hub,
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  const at = new URL(url).origin;
  const ask = async (cookie: string) => {
    const headers = new Headers(init.headers);
    headers.set(
      "cookie",
      [headers.get("cookie"), cookie].filter(Boolean).join("; ")
    );
    return await fetch(url, { ...init, headers });
  };
  const first = await ask(await previewPass(hub, at));
  if (first.status !== 401) {
    return first;
  }
  held.delete(at);
  return await ask(await previewPass(hub, at));
};

/** The person's pass for `origin` put in a browser context's cookie jar, so its pages load the origin as the dashboard's frames do. */
export const passInto = async (
  context: BrowserContext,
  hub: Hub,
  origin: string
): Promise<void> => {
  const [name = "", value = ""] = (await previewPass(hub, origin)).split("=");
  const at = new URL(origin);
  await context.addCookies([
    {
      name,
      value,
      domain: at.hostname,
      path: "/",
      httpOnly: true,
      secure: at.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
};
