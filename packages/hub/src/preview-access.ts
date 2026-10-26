/**
 * The previews' lock: a preview origin, a host-mode name or an origin's own
 * port, serves nothing without proof that the request comes from the owner's
 * dashboard or app (host mode's names may be public, behind a tunnel; a port
 * is open to whoever reaches the hub's machine). The proof is the hub's own,
 * and nothing else signs the person in:
 *
 * - **Ticket.** A client the hub already trusts (the dashboard through its
 *   relay, the app with its credential) asks for one
 *   (`POST /api/preview-ticket`): HMAC-signed, bound to the paired device
 *   that asked (none on a trusted hub), good for {@link TICKET_MS} and once.
 *   Tickets minted before this hub process started are refused, since the
 *   record of spent ones is the process's. A ticket only ever opens the
 *   entry: no page, embed or program the hub serves carries one.
 * - **Entry.** `<origin>/__cawco/enter?ticket=…`, on any origin a session,
 *   project or embed holds, spends the ticket and sets the pass, then sends
 *   the client on to `next` (a path on the same origin) when it names one.
 * - **Pass.** One cookie per browser, a random 256-bit token. On host mode's
 *   names {@link PREVIEW_PASS_COOKIE}, set on the domain every name stands
 *   under (`Domain=<pattern's parent>`); on an origin's own port, on that
 *   host alone, which every port of it carries (RFC 6265 §8.5):
 *   {@link PREVIEW_PASS_COOKIE} reached over https, else
 *   {@link PREVIEW_PORT_PASS_COOKIE}, since no browser keeps a `Secure`
 *   cookie from plain http. So every preview, embedded preview, frame and
 *   asset there carries the one pass. The hub keeps its sha256 alone
 *   (`preview_passes`), with the device it was given to: a pass stands for
 *   {@link PASS_MS} from its entry, absolute, unless its device is unpaired
 *   or the person revokes it (`DELETE /api/preview-pass`), which locks every
 *   frame at its next request. Every request to a name needs a live one,
 *   WebSocket upgrades too, but the dashboard's ping and the entry itself.
 * - **Nothing told.** Without a pass, a name no session holds answers a
 *   stranger exactly as a held one does, and a port's origin is the locked
 *   page as well (preview.ts `atTheLock`), so the
 *   lock tells nobody which ports or sessions exist; only the person's live
 *   pass learns that a name is closed.
 * - **A session's pass.** A session's `artifact_browse` gets a ticket of its
 *   own kind ({@link mintSessionTicket}), signed apart from the person's so
 *   neither opens as the other: bound to the session, naming the origins
 *   that artifact needs (its own, and each embed its page shows), good for
 *   {@link SESSION_PASS_MS} and once. Its entry, on one of those names, sets
 *   that session's own cookie ({@link sessionPassCookie}), beside the
 *   person's and never in its place, so sessions sharing a project's browser
 *   each keep theirs. The row keeps the session and the scope; the pass
 *   lapses with its ticket's end, absolute, and goes with its session
 *   (preview-passes.ts `revoke`). A request on a name outside its scope is
 *   answered as one with no pass, so it learns nothing of other names.
 *
 * The port's cookie over plain http carries no `Secure` and no prefix, the
 * one difference: a token on plain http is read by anyone on the path, as
 * the dashboard's own cookie on that host is.
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
 * A session's cookie is made the same way, its `Max-Age` its pass's end.
 *
 * The ticket's key is derived from the hub's secret key (secret-box.ts),
 * never stored or configured. Both cookies are among the dashboard's names
 * (core `DASHBOARD_COOKIE`), so the previewed app is never sent them and can
 * never set them.
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
  PREVIEW_PORT_PASS_COOKIE,
  type PreviewTicket,
} from "@cawco/core";
import { DAY_MS } from "@cawco/core/time";
import { z } from "zod";
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
const PASS_MS = 30 * DAY_MS;
/**
 * How long a session's pass stands from its ticket's minting, however it is
 * used: 15 minutes, absolute (the orchestrator's call; a session mints
 * another whenever it needs one).
 */
export const SESSION_PASS_MS = 15 * 60_000;
/** How often a pass's last use is written, at most (hub-auth.ts writes a device's the same way). */
const TOUCH_EVERY_MS = 60_000;
const KEY_LABEL = "cawco preview access v1";
/** Tickets older than this process are refused: the spent ones it remembers are its own. */
const STARTED_AT = Date.now();

let macKey: Buffer | undefined;
const keyOf = (): Buffer => {
  macKey ??= hubSecrets().derive(KEY_LABEL);
  return macKey;
};

/** A ticket's kind, signed into its MAC: the person's opens only as the person's, a session's only as a session's. */
type TicketKind = "ticket" | "session";

const mac = (kind: TicketKind, body: string): string =>
  createHmac("sha256", keyOf()).update(`${kind}.${body}`).digest("base64url");

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** What every ticket's body holds. */
const BaseBodySchema = z.object({
  /** When it stops standing, ms epoch. */
  e: z.number(),
  /** When it was minted, ms epoch. */
  i: z.number(),
  /** Its one-time name. */
  n: z.string(),
});
type BaseBody = z.infer<typeof BaseBodySchema>;

/** The person's ticket. */
const TicketBodySchema = BaseBodySchema.extend({
  /** The paired device it was given to; null on a trusted hub, which pairs none. */
  d: z.string().nullable(),
});
type TicketBody = z.infer<typeof TicketBodySchema>;

/** A session's ticket (`artifact_browse`). */
const SessionTicketBodySchema = BaseBodySchema.extend({
  /** The session it was given to. */
  a: z.string(),
  /** The origins (their keys) its pass opens. */
  s: z.array(z.string()),
});
type SessionTicketBody = z.infer<typeof SessionTicketBodySchema>;

/** `ticket`'s body when the hub signed it as `kind`; null otherwise. */
const opened = <S extends z.ZodType<BaseBody>>(
  ticket: string,
  kind: TicketKind,
  schema: S
): z.output<S> | null => {
  const dot = ticket.indexOf(".");
  if (dot < 1) {
    return null;
  }
  const body = ticket.slice(0, dot);
  const want = Buffer.from(mac(kind, body));
  const got = Buffer.from(ticket.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return null;
  }
  try {
    return schema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    );
  } catch {
    return null;
  }
};

/** Spent tickets by their one-time name, kept until they would have lapsed anyway. */
const spent = new Map<string, number>();

/** `body` signed as `kind`. */
const signed = (kind: TicketKind, body: BaseBody): string => {
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${mac(kind, encoded)}`;
};

/** A ticket into the previews for paired device `deviceId` (null: a trusted hub's caller). */
export const mintTicket = (deviceId: string | null): PreviewTicket => {
  const minted = Date.now();
  const expiresAt = minted + TICKET_MS;
  const body: TicketBody = {
    d: deviceId,
    n: randomBytes(16).toString("base64url"),
    i: minted,
    e: expiresAt,
  };
  return { ticket: signed("ticket", body), expiresAt };
};

/**
 * A ticket for session `instanceId`'s own browser, into the origins `scope`
 * names (their keys) alone: its pass lapses when the ticket would have,
 * {@link SESSION_PASS_MS} from now.
 */
export const mintSessionTicket = (
  instanceId: string,
  scope: string[],
  now = Date.now()
): PreviewTicket => {
  const expiresAt = now + SESSION_PASS_MS;
  const body: SessionTicketBody = {
    a: instanceId,
    s: scope,
    n: randomBytes(16).toString("base64url"),
    i: now,
    e: expiresAt,
  };
  return { ticket: signed("session", body), expiresAt };
};

/** Why an entry did not open the door, in a word the journal carries. */
export type TicketRefusal =
  | "forged"
  | "expired"
  | "spent"
  | "unpaired"
  /** A session's ticket spent on a name outside its scope. */
  | "outside"
  /** A session's ticket whose session has ended. */
  | "ended";

/** Spends `ticket`: who it was given to, or why it opens nothing. */
const spendTicket = (
  ticket: string,
  now: number
):
  | { deviceId: string | null }
  | { session: SessionTicketBody }
  | { refused: TicketRefusal } => {
  const person = opened(ticket, "ticket", TicketBodySchema);
  const session = person
    ? null
    : opened(ticket, "session", SessionTicketBodySchema);
  const body = person ?? session;
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
  return person
    ? { deviceId: person.d }
    : { session: body as SessionTicketBody };
};

/** The lock, as a listener holds it: where its pass is set, where passes are kept, and which sessions still run. */
export interface PassLock {
  /**
   * Host mode's names: the domain every name of the pattern stands under
   * (core `hostModeDomain`). Null on an origin's own port, whose pass is set
   * on the host it was reached at alone.
   */
  domain: string | null;
  passes: PreviewPassesDb;
  /** Whether session `instanceId` still runs: a session's ticket opens nothing once it ended. */
  sessionLive: (instanceId: string) => boolean;
}

/** The prefix of each session's own pass cookie, `Secure` or over plain http: among the dashboard's names (core `DASHBOARD_COOKIE`). */
const SESSION_PASS_PREFIX = "__Secure-cawco-session-pass-";
const PORT_SESSION_PASS_PREFIX = "cawco-preview-session-pass-";

/**
 * Session `instanceId`'s own pass cookie: one name per session, so sessions
 * sharing a project's browser (one cookie jar) each keep their own pass;
 * `secure` false on a port reached over plain http.
 */
export const sessionPassCookie = (instanceId: string, secure = true): string =>
  `${secure ? SESSION_PASS_PREFIX : PORT_SESSION_PASS_PREFIX}${instanceId}`;

/** The person's pass cookie, `Secure` or over plain http. */
const personPassCookie = (secure: boolean): string =>
  secure ? PREVIEW_PASS_COOKIE : PREVIEW_PORT_PASS_COOKIE;

/** Whether `name` is one of the person's pass cookies. */
const isPersonPass = (name: string): boolean =>
  name === PREVIEW_PASS_COOKIE || name === PREVIEW_PORT_PASS_COOKIE;

/** Whether a pass set in answer to `request` is `Secure`: always on host mode's names, on a port when it was reached over https. */
const secureFor = (request: Request, lock: PassLock): boolean =>
  lock.domain !== null || new URL(request.url).protocol === "https:";

/** The sha256 of each token `request` presents under a cookie name `named` takes. */
const tokensUnder = (
  request: Request,
  named: (name: string) => boolean
): string[] => {
  const header = request.headers.get("cookie");
  if (!header) {
    return [];
  }
  const hashes: string[] = [];
  for (const pair of header.split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && named(pair.slice(0, at).trim())) {
      const token = pair.slice(at + 1).trim();
      if (token) {
        hashes.push(sha256(token));
      }
    }
  }
  return hashes;
};

/** The sha256 of each of the person's pass tokens `request` presents (a browser may hold an older one beside it). */
export const presentedPasses = (request: Request): string[] =>
  tokensUnder(request, isPersonPass);

/** When each pass's last use was written, by its id. */
const touched = new Map<string, number>();

/**
 * Whether `row` opens origin `key`: the person's pass opens every name, and
 * alone learns of a name nobody holds (`key` undefined); a session's opens
 * the names of its scope.
 */
const opens = (row: PreviewPassRow, key: string | undefined): boolean =>
  row.scope === null || (key !== undefined && row.scope.includes(key));

/**
 * The live pass `request` carries that opens origin `key` ({@link opens}),
 * the person's or a session's, or null: its last use written at most once a
 * minute.
 */
export const passOf = (
  request: Request,
  lock: PassLock,
  key: string | undefined,
  now = Date.now()
): PreviewPassRow | null => {
  const presented = tokensUnder(
    request,
    (name) =>
      isPersonPass(name) ||
      name.startsWith(SESSION_PASS_PREFIX) ||
      name.startsWith(PORT_SESSION_PASS_PREFIX)
  );
  for (const hash of presented) {
    const row = lock.passes.live(hash, new Date(now));
    if (row && opens(row, key)) {
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
 * The pass a spent ticket gives: the person's, for {@link PASS_MS}, under
 * the person's cookie; a session's, to its ticket's end and on its scope
 * alone, under the session's own cookie. Each replaces the one the browser
 * presented under the same cookie, and no other.
 */
const passFor = (
  request: Request,
  spending: { deviceId: string | null } | { session: SessionTicketBody },
  now: number,
  secure: boolean
) => {
  if ("session" in spending) {
    const { a: instanceId, s: scope, e: expiresAt } = spending.session;
    const cookie = sessionPassCookie(instanceId, secure);
    return {
      cookie,
      expiresAt,
      held: { deviceId: null, instanceId, scope },
      replacing: tokensUnder(request, (name) => name === cookie)[0] ?? null,
    };
  }
  const cookie = personPassCookie(secure);
  return {
    cookie,
    expiresAt: now + PASS_MS,
    held: { deviceId: spending.deviceId, instanceId: null, scope: null },
    replacing: tokensUnder(request, (name) => name === cookie)[0] ?? null,
  };
};

/**
 * `GET /__cawco/enter?ticket=…[&next=<path>]` on a held name or port (origin
 * `key`): a new pass, the one the browser presented under the same cookie
 * gone, and a redirect to `next`, or a bare 204 when it names none (the
 * dashboard's own entry, made beside its frames); else the locked page and
 * the refusal's word for the journal. A session's ticket enters only on a
 * name of its scope, and only while its session runs.
 */
export const enter = (
  request: Request,
  lock: PassLock,
  key: string,
  now = Date.now()
): { response: Response; refused: TicketRefusal | null } => {
  const url = new URL(request.url);
  const spending = spendTicket(url.searchParams.get("ticket") ?? "", now);
  if ("refused" in spending) {
    return { response: lockedResponse(), refused: spending.refused };
  }
  if ("session" in spending && !spending.session.s.includes(key)) {
    return { response: lockedResponse(), refused: "outside" };
  }
  if ("session" in spending && !lock.sessionLive(spending.session.a)) {
    return { response: lockedResponse(), refused: "ended" };
  }
  const secure = secureFor(request, lock);
  const pass = passFor(request, spending, now, secure);
  const token = randomBytes(32).toString("base64url");
  const given = lock.passes.open(
    {
      id: randomUUID(),
      tokenHash: sha256(token),
      ...pass.held,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(pass.expiresAt),
    },
    pass.replacing
  );
  if (!given) {
    return { response: lockedResponse(), refused: "unpaired" };
  }
  const next = url.searchParams.get("next");
  const maxAge = Math.ceil((pass.expiresAt - now) / 1000);
  const headers = {
    "set-cookie": `${pass.cookie}=${token}; ${lock.domain === null ? "" : `Domain=${lock.domain}; `}Path=/; Max-Age=${maxAge}; ${secure ? "Secure; " : ""}HttpOnly; SameSite=Lax`,
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
