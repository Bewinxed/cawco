/**
 * Host mode's lock: a preview name serves nothing without proof that the
 * request comes from the owner's dashboard or app (the names may be public,
 * behind a tunnel). The proof is the hub's own, and nothing else signs the
 * person in:
 *
 * - **Ticket.** A client the hub already trusts (the dashboard through its
 *   relay, the app with its credential) asks for one
 *   (`POST /api/instances/:id/preview-ticket`): HMAC-signed, bound to one
 *   session, good for {@link TICKET_MS} and once. Tickets minted before this
 *   hub process started are refused, since the record of spent ones is the
 *   process's.
 * - **Entry.** `<origin>/__cawco/enter?ticket=…&next=<path>` spends the
 *   ticket against the session the Host names, sets the pass cookie and
 *   sends the client on to `next`, a path on the same origin.
 * - **Pass.** The cookie, HMAC-signed and bound to the same session, good
 *   for {@link PASS_MS}. Every request to the name needs it, WebSocket
 *   upgrades too, but the dashboard's ping and the entry itself. A name
 *   whose port a later session holds refuses the earlier session's pass.
 *
 * The key is derived from the hub's secret key (secret-box.ts), never stored
 * or configured. The cookie is one of the dashboard's names (core
 * `DASHBOARD_COOKIE`), so the previewed app is never sent it and can never
 * set it.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  PREVIEW_ENTER_PATH,
  PREVIEW_LOCKED_MESSAGE,
  type PreviewTicket,
} from "@cawco/core";
import { hubSecrets } from "./secret-box";

/** How long a ticket stands: a client spends it at once, in the load it was asked for. */
export const TICKET_MS = 60_000;
/** How long a pass stands. Our call: a working day; past it the next load answers the locked page, and the pane or the app asks for a ticket again. */
const PASS_MS = 12 * 60 * 60 * 1000;
const KEY_LABEL = "cawco preview access v1";
/** Tickets older than this process are refused: the spent ones it remembers are its own. */
const STARTED_AT = Date.now();

let key: Buffer | undefined;
const keyOf = (): Buffer => {
  key ??= hubSecrets().derive(KEY_LABEL);
  return key;
};

type Kind = "ticket" | "pass";

const mac = (kind: Kind, body: string): string =>
  createHmac("sha256", keyOf()).update(`${kind}.${body}`).digest("base64url");

const signed = (kind: Kind, payload: object): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(kind, body)}`;
};

/** `token`'s payload when the hub signed it as `kind`; null otherwise. */
const opened = <T>(kind: Kind, token: string): T | null => {
  const dot = token.indexOf(".");
  if (dot < 1) {
    return null;
  }
  const body = token.slice(0, dot);
  const want = Buffer.from(mac(kind, body));
  const got = Buffer.from(token.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
};

interface TicketBody {
  /** When it stops standing, ms epoch. */
  e: number;
  /** When it was minted, ms epoch. */
  i: number;
  /** Its one-time name. */
  n: string;
  /** The session it opens. */
  s: string;
}

interface PassBody {
  e: number;
  s: string;
}

/** Spent tickets by their one-time name, kept until they would have lapsed anyway. */
const spent = new Map<string, number>();

/** A ticket into session `instanceId`'s preview origin. */
export const mintTicket = (instanceId: string): PreviewTicket => {
  const minted = Date.now();
  const expiresAt = minted + TICKET_MS;
  const body: TicketBody = {
    s: instanceId,
    n: randomBytes(16).toString("base64url"),
    i: minted,
    e: expiresAt,
  };
  return { ticket: signed("ticket", body), expiresAt };
};

/** Why a ticket did not open the door, in a word the journal carries. */
export type TicketRefusal = "forged" | "elsewhere" | "expired" | "spent";

/** Spends `ticket` on session `instanceId`'s origin: null when it opens the door, else why not. */
export const spendTicket = (
  ticket: string,
  instanceId: string,
  now = Date.now()
): TicketRefusal | null => {
  const body = opened<TicketBody>("ticket", ticket);
  if (!body) {
    return "forged";
  }
  if (body.s !== instanceId) {
    return "elsewhere";
  }
  if (body.e <= now || body.i < STARTED_AT) {
    return "expired";
  }
  for (const [name, lapses] of spent) {
    if (lapses <= now) {
      spent.delete(name);
    }
  }
  if (spent.has(body.n)) {
    return "spent";
  }
  spent.set(body.n, body.e);
  return null;
};

/**
 * The pass cookie's name and attributes for an origin. On https it is
 * `__Host-` and `Secure; SameSite=None`, so a frame of the dashboard carries
 * it. Plain http on `localhost` or a `.localhost` name, which browsers treat
 * as a secure context, takes `Secure; SameSite=None` too, without the prefix
 * (Chrome refuses `__Host-` there). Any other plain http name can hold no
 * cross-site cookie at all (`SameSite=None` needs `Secure`), so its pass is
 * `SameSite=Lax`: it stands in the app's web views and a tab of its own, and
 * in a frame only when the dashboard is the same site.
 */
export interface PassCookie {
  attributes: string;
  name: string;
}

export const passCookie = (
  scheme: "http" | "https",
  hostname: string
): PassCookie => {
  if (scheme === "https") {
    return {
      name: "__Host-cawco-preview",
      attributes: "Path=/; Secure; HttpOnly; SameSite=None",
    };
  }
  return hostname === "localhost" || hostname.endsWith(".localhost")
    ? {
        name: "cawco-preview",
        attributes: "Path=/; Secure; HttpOnly; SameSite=None",
      }
    : { name: "cawco-preview", attributes: "Path=/; HttpOnly; SameSite=Lax" };
};

/** The `Set-Cookie` value that lets the browser into session `instanceId`'s origin. */
const setPass = (cookie: PassCookie, instanceId: string): string => {
  const body: PassBody = { s: instanceId, e: Date.now() + PASS_MS };
  return `${cookie.name}=${signed("pass", body)}; Max-Age=${PASS_MS / 1000}; ${cookie.attributes}`;
};

/** Whether `request` carries a standing pass into session `instanceId`'s origin. */
export const holdsPass = (
  request: Request,
  cookie: PassCookie,
  instanceId: string,
  now = Date.now()
): boolean => {
  const header = request.headers.get("cookie");
  if (!header) {
    return false;
  }
  for (const pair of header.split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === cookie.name) {
      const body = opened<PassBody>("pass", pair.slice(at + 1).trim());
      if (body && body.s === instanceId && body.e > now) {
        return true;
      }
    }
  }
  return false;
};

/** `next` as a path on the request's own origin; one that leaves it, or names the entry, is the root. */
const placeOf = (url: URL): string => {
  const next = url.searchParams.get("next") ?? "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  const at = new URL(next, url.origin);
  if (at.origin !== url.origin || at.pathname === PREVIEW_ENTER_PATH) {
    return "/";
  }
  return `${at.pathname}${at.search}${at.hash}`;
};

const LOCKED_WORDS =
  "This preview opens from the CawCo dashboard or app. Open it there.";

/**
 * What a preview name answers without a pass: 401, a sentence for a person
 * who opened it in a tab of its own, and a word to the frame's parent
 * (core `PREVIEW_LOCKED_MESSAGE`), so the dashboard's pane asks for a ticket
 * and enters again. Nothing in it is the app's, so any parent may hear it.
 */
export const lockedResponse = (): Response =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="cawco-preview-locked" content="1"><title>Preview locked</title></head><body><p>${LOCKED_WORDS}</p><script>if(window.parent!==window)window.parent.postMessage({type:${JSON.stringify(PREVIEW_LOCKED_MESSAGE)}},"*")</script></body></html>`,
    {
      status: 401,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );

/**
 * `GET /__cawco/enter?ticket=…&next=<path>` on session `instanceId`'s origin:
 * the pass and a redirect to `next`, or the locked page and the refusal's
 * word for the journal.
 */
export const enter = (
  request: Request,
  cookie: PassCookie,
  instanceId: string
): { response: Response; refused: TicketRefusal | null } => {
  const url = new URL(request.url);
  const refused = spendTicket(url.searchParams.get("ticket") ?? "", instanceId);
  if (refused) {
    return { response: lockedResponse(), refused };
  }
  return {
    refused: null,
    response: new Response(null, {
      status: 302,
      headers: {
        location: placeOf(url),
        "set-cookie": setPass(cookie, instanceId),
        "cache-control": "no-store",
      },
    }),
  };
};
