import { error, json } from "@sveltejs/kit";
import {
  PREF_MAX_AGE,
  PREF_VALUE_LIMIT,
  PREFS,
  type Pref,
  prefCookie,
  secureScheme,
} from "#lib/cawco/prefs.js";
import type { RequestHandler } from "./$types";

/**
 * Keeps the page's prefs for the server's next render (lib/cawco/prefs.ts):
 * each a cookie only this server reads, HttpOnly, `__Host-` where the scheme
 * allows. Only the ones it renders from, each under its size.
 */
export const POST: RequestHandler = async ({ cookies, request, url }) => {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    error(400, "Prefs are a JSON object of names and values.");
  }
  for (const [name, value] of Object.entries(body)) {
    if (!PREFS.includes(name as Pref) || typeof value !== "string") {
      error(400, `${name} is not a pref this dashboard keeps.`);
    }
    if (encodeURIComponent(value).length > PREF_VALUE_LIMIT) {
      error(413, `${name} is too large for a cookie.`);
    }
    cookies.set(prefCookie(name as Pref, url), value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: secureScheme(url),
      maxAge: PREF_MAX_AGE,
    });
  }
  return json({ kept: Object.keys(body).length });
};
