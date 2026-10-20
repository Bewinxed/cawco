/**
 * Host mode's lock: a preview name serves nothing without proof that the
 * request comes from the owner's dashboard or app (the names may be public,
 * behind a tunnel). The proof is the hub's own, and nothing else signs the
 * person in:
 *
 * - **Ticket.** A client the hub already trusts (the dashboard through its
 *   relay, the app with its credential) asks for one
 *   (`POST /api/preview-ticket`): HMAC-signed, bound to the paired device
 *   that asked (none on a trusted hub), good for {@link TICKET_MS} and once.
 *   Tickets minted before this hub process started are refused, since the
 *   record of spent ones is the process's. A ticket only ever opens the
 *   entry: no page, embed or program the hub serves carries one.
 * - **Entry.** `<origin>/__cawco/enter?ticket=…`, on any name a session,
 *   project or embed holds, spends the ticket and sets the pass, then sends
 *   the client on to `next` (a path on the same origin) when it names one.
 * - **Pass.** One cookie per browser, {@link PREVIEW_PASS_COOKIE}: a random
 *   256-bit token, set on the domain every name stands under
 *   (`Domain=<pattern's parent>`), so every preview, embedded preview, frame
 *   and asset under it carries the one pass. The hub keeps its sha256 alone
 *   (`preview_passes`), with the device it was given to: a pass stands for
 *   {@link PASS_MS} from its entry, absolute, unless its device is unpaired
 *   or the person revokes it (`DELETE /api/preview-pass`), which locks every
 *   frame at its next request. Every request to a name needs a live one,
 *   WebSocket upgrades too, but the dashboard's ping and the entry itself.
 * - **Nothing told.** Without a pass, a name no session holds answers a
 *   stranger exactly as a held one does (preview.ts `atTheLock`), so the
 *   lock tells nobody which ports or sessions exist; only a live pass learns
 *   that a name is closed.
 *
 * The cookie, after OWASP's Session Management cheat sheet
 * (cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html):
 * `__Secure-`, "Use only when subdomain sharing is required", which it is
 * (`__Host-` refuses a `Domain`); `Secure` and `HttpOnly`, so the previewed
 * app never reads it; `SameSite=Lax` ("Session cookies must explicitly set
 * `SameSite=Strict` (preferred) or `SameSite=Lax`"), which every frame
 * carries because a client takes host mode's names only from a page under
 * their domain (core `previewRoute`), so the dashboard and each frame in it
 * are same-site ("A document's "site for cookies" is the top-level origin if
 * and only if the top-level origin is same-site with the document's origin,
 * and with each of the document's ancestor documents' origins", RFC 6265bis
 * §5.2.1); no `Partitioned`, which a same-site frame doesn't need and Safari
 * 18.5–26.1 doesn't support (caniuse.com/mdn-http_headers_set-cookie_partitioned).
 * Its token from a CSPRNG, "at least 128 bits of entropy; prefer 160 bits or
 * more", kept as "a one-way verifier"; its timeout absolute and enforced
 * here; a new pass at every entry, the one presented gone ("the old or
 * previous session ID must be destroyed").
 *
 * The ticket's key is derived from the hub's secret key (secret-box.ts),
 * never stored or configured. The cookie is one of the dashboard's names
 * (core `DASHBOARD_COOKIE`), so the previewed app is never sent it and can
 * never set it.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  PREVIEW_ENTER_PATH,
  PREVIEW_LOCKED_MESSAGE,
  PREVIEW_PASS_COOKIE,
  type PreviewTicket,
} from "@cawco/core";
import type { PreviewPassesDb, PreviewPassRow } from "./db/preview-passes";
import { hubSecrets } from "./secret-box";

/** How long a ticket stands: a client spends it at once, in the load it was asked for. */
export const TICKET_MS = 60_000;
/**
 * How long a pass stands from its entry, however it is used: 30 days,
 * absolute (the orchestrator's call on the advisor's model, from OWASP's
 * absolute timeout). Past it the next load is locked, and the dashboard or
 * the app enters again with a new ticket, unseen.
 */
const PASS_MS = 30 * 24 * 60 * 60 * 1000;
/** How often a pass's last use is written, at most (hub-auth.ts writes a device's the same way). */
const TOUCH_EVERY_MS = 60_000;
const KEY_LABEL = "cawco preview access v1";
/** Tickets older than this process are refused: the spent ones it remembers are its own. */
const STARTED_AT = Date.now();

let key: Buffer | undefined;
const keyOf = (): Buffer => {
  key ??= hubSecrets().derive(KEY_LABEL);
  return key;
};

const mac = (body: string): string =>
  createHmac("sha256", keyOf()).update(`ticket.${body}`).digest("base64url");

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

interface TicketBody {
  /** The paired device it was given to; null on a trusted hub, which pairs none. */
  d: string | null;
  /** When it stops standing, ms epoch. */
  e: number;
  /** When it was minted, ms epoch. */
  i: number;
  /** Its one-time name. */
  n: string;
}

/** `ticket`'s body when the hub signed it; null otherwise. */
const opened = (ticket: string): TicketBody | null => {
  const dot = ticket.indexOf(".");
  if (dot < 1) {
    return null;
  }
  const body = ticket.slice(0, dot);
  const want = Buffer.from(mac(body));
  const got = Buffer.from(ticket.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as TicketBody;
  } catch {
    return null;
  }
};

/** Spent tickets by their one-time name, kept until they would have lapsed anyway. */
const spent = new Map<string, number>();

/** A ticket into host mode's previews for paired device `deviceId` (null: a trusted hub's caller). */
export const mintTicket = (deviceId: string | null): PreviewTicket => {
  const minted = Date.now();
  const expiresAt = minted + TICKET_MS;
  const body: TicketBody = {
    d: deviceId,
    n: randomBytes(16).toString("base64url"),
    i: minted,
    e: expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return { ticket: `${encoded}.${mac(encoded)}`, expiresAt };
};

/** Why an entry did not open the door, in a word the journal carries. */
export type TicketRefusal = "forged" | "expired" | "spent" | "unpaired";

/** Spends `ticket`: the device it was given to, or why it opens nothing. */
const spendTicket = (
  ticket: string,
  now: number
): { deviceId: string | null } | { refused: TicketRefusal } => {
  const body = opened(ticket);
  if (!body) {
    return { refused: "forged" };
  }
  if (body.e <= now || body.i < STARTED_AT) {
    return { refused: "expired" };
  }
  for (const [name, lapses] of spent) {
    if (lapses <= now) {
      spent.delete(name);
    }
  }
  if (spent.has(body.n)) {
    return { refused: "spent" };
  }
  spent.set(body.n, body.e);
  return { deviceId: body.d };
};

/** Host mode's lock, as its listener holds it: the domain its pass is set on, and where passes are kept. */
export interface PassLock {
  /** The domain every name of the pattern stands under (core `hostModeDomain`). */
  domain: string;
  passes: PreviewPassesDb;
}

/** The sha256 of each pass token `request` presents (a browser may hold an older one beside it). */
export const presentedPasses = (request: Request): string[] => {
  const header = request.headers.get("cookie");
  if (!header) {
    return [];
  }
  const hashes: string[] = [];
  for (const pair of header.split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === PREVIEW_PASS_COOKIE) {
      const token = pair.slice(at + 1).trim();
      if (token) {
        hashes.push(sha256(token));
      }
    }
  }
  return hashes;
};

/** When each pass's last use was written, by its id. */
const touched = new Map<string, number>();

/** The live pass `request` carries, or null: its last use written at most once a minute. */
export const passOf = (
  request: Request,
  lock: PassLock,
  now = Date.now()
): PreviewPassRow | null => {
  for (const hash of presentedPasses(request)) {
    const row = lock.passes.live(hash, new Date(now));
    if (row) {
      if (now - (touched.get(row.id) ?? 0) > TOUCH_EVERY_MS) {
        touched.set(row.id, now);
        lock.passes.touch(row.id, new Date(now));
      }
      return row;
    }
  }
  return null;
};

/** `next` as a path on the request's own origin; one that leaves it, or names the entry, is the root. */
const placeOf = (url: URL, next: string): string => {
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
 * (core `PREVIEW_LOCKED_MESSAGE`), so the dashboard enters again. Nothing in
 * it is the app's, so any parent may hear it.
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
 * `GET /__cawco/enter?ticket=…[&next=<path>]` on a held name: a new pass,
 * the one the browser presented gone, and a redirect to `next`, or a bare
 * 204 when it names none (the dashboard's own entry, made beside its
 * frames); else the locked page and the refusal's word for the journal.
 */
export const enter = (
  request: Request,
  lock: PassLock,
  now = Date.now()
): { response: Response; refused: TicketRefusal | null } => {
  const url = new URL(request.url);
  const spending = spendTicket(url.searchParams.get("ticket") ?? "", now);
  if ("refused" in spending) {
    return { response: lockedResponse(), refused: spending.refused };
  }
  const token = randomBytes(32).toString("base64url");
  const given = lock.passes.open(
    {
      id: randomUUID(),
      tokenHash: sha256(token),
      deviceId: spending.deviceId,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + PASS_MS),
    },
    presentedPasses(request)[0] ?? null
  );
  if (!given) {
    return { response: lockedResponse(), refused: "unpaired" };
  }
  const next = url.searchParams.get("next");
  const headers = {
    "set-cookie": `${PREVIEW_PASS_COOKIE}=${token}; Domain=${lock.domain}; Path=/; Max-Age=${PASS_MS / 1000}; Secure; HttpOnly; SameSite=Lax`,
    "cache-control": "no-store",
  };
  return {
    refused: null,
    response:
      next === null
        ? new Response(null, { status: 204, headers })
        : new Response(null, {
            status: 302,
            headers: { ...headers, location: placeOf(url, next) },
          }),
  };
};
