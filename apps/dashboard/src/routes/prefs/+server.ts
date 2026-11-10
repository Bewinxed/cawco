import { error, json } from "@sveltejs/kit";
import {
  PREF_MAX_AGE,
  PREF_VALUE_LIMIT,
  PREFS,
  type Pref,
  prefCookie,
  secureScheme,
} from "#lib/platform/prefs.js";
import type { RequestHandler } from "./$types";

/**
 * Keeps the page's prefs for the server's next render (lib/platform/prefs.ts):
 * each a cookie only this server reads, HttpOnly, `__Host-` where the scheme
 * allows. Only the ones it renders from, each under its size; `null` takes
 * one away. All or none: a request with one value it refuses keeps none of
 * them, so no copy is left half its page's.
 */
export const POST: RequestHandler = async ({ cookies, request, url }) => {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    error(400, "Prefs are a JSON object of names and values.");
  }
  const entries: [Pref, string | null][] = [];
  for (const [name, value] of Object.entries(body)) {
    const pref = PREFS.find((one) => one === name);
    if (!(pref && (typeof value === "string" || value === null))) {
      error(400, `${name} is not a pref this dashboard keeps.`);
    }
    if (value !== null && encodeURIComponent(value).length > PREF_VALUE_LIMIT) {
      error(413, `${name} is too large for a cookie.`);
    }
    entries.push([pref, value]);
  }
  const options = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: secureScheme(url),
  } as const;
  for (const [name, value] of entries) {
    if (value === null) {
      cookies.delete(prefCookie(name, url), options);
    } else {
      cookies.set(prefCookie(name, url), value, {
        ...options,
        maxAge: PREF_MAX_AGE,
      });
    }
  }
  return json({ kept: entries.length });
};
