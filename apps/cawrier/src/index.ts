/**
 * Cawrier: the one holder of CawCo's APNs key. A phone with a live Caw&Co Pro
 * subscription (its free trial included), or a TestFlight install before the
 * App Store has products, enrolls a pairing (its device token, under a secret
 * it gives its hub); the hub pushes through the pairing with that secret. No
 * hub holds the key. One subscription holds at most
 * {@link SEATS_PER_PURCHASE} live pairings, each delivering while the
 * subscription is entitled and kept, silent, while it is not
 * (entitlement.ts).
 *
 * POST /v1/enroll  { pairingId, secret, deviceToken, apnsEnvironment, proof }
 * POST /v1/push    Authorization: Bearer <secret>; { pairingId, collapseId?, expiration?, pushType?: "alert" | "background", payload }
 *                  402 { error } while the pairing's subscription is not entitled: the pairing is kept
 * POST /v1/unenroll Authorization: Bearer <secret>; { pairingId }: the pairing and its seat go
 * GET  /v1/health  one APNs probe: proves outbound HTTP/2 to Apple and the key
 * POST /v1/apple/notifications  { signedPayload }: App Store Server Notifications V2
 */

import { readWithin } from "@cawco/core/bounded";
import { unhandled } from "@cawco/core/unhandled";
import {
  type ApnsAnswer,
  type ApnsEnvironment,
  hasKey,
  type PushType,
  sendApns,
} from "./apns";
import { notificationEntitlement } from "./entitlement";
import { SEATS_PER_PURCHASE } from "./seats";
import {
  type Notification,
  type Purchase,
  proProducts,
  verifyAppTransaction,
  verifyNotification,
  verifyPurchase,
} from "./storekit";

export { Pairing } from "./pairing";
export { Seats } from "./seats";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** 32 random bytes, base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/u;
const BEARER = /^Bearer (\S+)$/u;
const DEVICE_TOKEN = /^[0-9a-f]{64,200}$/u;
/** APNs' limit on an alert's payload. */
const MAX_PAYLOAD_BYTES = 4096;
const MAX_BODY_BYTES = 32_768;
/** A notification carries a signed payload with signed transaction and renewal info inside. */
const MAX_NOTIFICATION_BYTES = 65_536;
const HEALTH_TTL_MS = 60_000;

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });
const refuse = (status: number, error: string): Response =>
  json(status, { error });

const bytes = (text: string): number => new TextEncoder().encode(text).length;

const sha256 = async (text: string): Promise<string> =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

type Body = Record<string, unknown>;

const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === "string" && pattern.test(value);

/** The body as an object, or undefined when it is too big or not a JSON object. */
/** The body as sent, or undefined when it is over `maxBytes`. */
const rawBodyOf = async (
  request: Request,
  maxBytes: number
): Promise<string | undefined> => {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    return undefined;
  }
  const text = await request.text();
  return bytes(text) > maxBytes ? undefined : text;
};

const parsedBody = (text: string | undefined): Body | undefined => {
  if (text === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isObject(parsed) ? parsed : undefined;
};

const bodyOf = async (request: Request): Promise<Body | undefined> =>
  parsedBody(await rawBodyOf(request, MAX_BODY_BYTES));

interface Enrollment {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  readonly pairingId: string;
  /** A union on `kind`: `appStore` (a StoreKit transaction) or `appTransaction` (a TestFlight install's). */
  readonly proof: Body;
  readonly secret: string;
}

const enrollmentOf = (body: Body | undefined): Enrollment | undefined =>
  body &&
  matches(body.pairingId, UUID) &&
  matches(body.secret, SECRET) &&
  matches(body.deviceToken, DEVICE_TOKEN) &&
  (body.apnsEnvironment === "production" ||
    body.apnsEnvironment === "sandbox") &&
  isObject(body.proof)
    ? {
        pairingId: body.pairingId,
        secret: body.secret,
        deviceToken: body.deviceToken,
        apnsEnvironment: body.apnsEnvironment,
        proof: body.proof,
      }
    : undefined;

interface Push {
  readonly collapseId?: string;
  readonly expiration?: number;
  readonly pairingId: string;
  readonly payload: Body;
  readonly pushType: PushType;
}

/** Absent is a visible alert; `background` carries data only, so it takes no collapse id. */
const pushTypeOf = (body: Body): PushType | undefined => {
  if (body.pushType === undefined || body.pushType === "alert") {
    return "alert";
  }
  return body.pushType === "background" && body.collapseId === undefined
    ? "background"
    : undefined;
};

const isCollapseId = (value: unknown): value is string | undefined =>
  value === undefined ||
  (typeof value === "string" && value.length > 0 && bytes(value) <= 64);

const isExpiration = (value: unknown): value is number | undefined =>
  value === undefined ||
  (Number.isSafeInteger(value) && (value as number) >= 0);

const pushOf = (body: Body | undefined): Push | undefined => {
  const pushType = body && pushTypeOf(body);
  return body &&
    pushType &&
    matches(body.pairingId, UUID) &&
    isCollapseId(body.collapseId) &&
    isExpiration(body.expiration) &&
    isObject(body.payload)
    ? {
        pairingId: body.pairingId,
        collapseId: body.collapseId,
        expiration: body.expiration,
        payload: body.payload,
        pushType,
      }
    : undefined;
};

const pairing = (env: Env, pairingId: string) =>
  env.PAIRING.get(env.PAIRING.idFromName(pairingId));

/**
 * The proof, verified: a StoreKit transaction (`appStore`), or a TestFlight
 * install's AppTransaction (`appTransaction`) while the App Store serves no
 * products. Undefined for any other shape.
 */
const purchaseOf = async (
  env: Env,
  proof: Body
): Promise<Purchase | undefined> => {
  if (proof.kind === "appStore" && typeof proof.transaction === "string") {
    return await verifyPurchase(env, proof.transaction);
  }
  if (proof.kind === "appTransaction" && typeof proof.jws === "string") {
    return await verifyAppTransaction(env, proof.jws);
  }
  return undefined;
};

const enroll = async (request: Request, env: Env): Promise<Response> => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await env.ENROLL_LIMIT.limit({ key: ip })).success) {
    return refuse(
      429,
      "Too many enrollments from this address. Try again in a minute."
    );
  }
  const enrollment = enrollmentOf(await bodyOf(request));
  if (!enrollment) {
    return refuse(400, "The enrollment is not in the shape Cawrier reads.");
  }
  const purchase = await purchaseOf(env, enrollment.proof);
  if (!purchase) {
    return refuse(403, "The proof of purchase is not one Cawrier accepts.");
  }
  if (!purchase.ok) {
    console.log(`enroll 403: ${purchase.error}`);
    return refuse(403, purchase.error);
  }
  const enrolled = await pairing(env, enrollment.pairingId).enroll({
    secretHash: await sha256(enrollment.secret),
    deviceToken: enrollment.deviceToken,
    apnsEnvironment: enrollment.apnsEnvironment,
    transactionEnvironment: purchase.environment,
    seat: purchase.seat,
    entitlement: purchase.entitlement,
  });
  if (enrolled === "held") {
    return refuse(409, "This pairing is held under another secret.");
  }
  if (enrolled === "ended") {
    console.log("enroll 403: the subscription has ended");
    return refuse(403, "This subscription has ended.");
  }
  if (enrolled === "full") {
    console.log("enroll 409: every seat on the subscription is taken");
    return refuse(
      409,
      `This subscription is already on ${SEATS_PER_PURCHASE} devices. Remove one in CawCo on another device, or contact support.`
    );
  }
  return json(200, { ok: true });
};

/** APNs' word that the device token is dead: the pairing is wiped. */
const DEAD_TOKEN = new Set(["BadDeviceToken", "DeviceTokenNotForTopic"]);

const relay = async (request: Request, env: Env): Promise<Response> => {
  const secret = bearerOf(request);
  if (!matches(secret, SECRET)) {
    return refuse(401, "The pairing's secret is missing.");
  }
  const push = pushOf(await bodyOf(request));
  if (!push) {
    return refuse(400, "The push is not in the shape Cawrier reads.");
  }
  const payload = JSON.stringify(push.payload);
  if (bytes(payload) > MAX_PAYLOAD_BYTES) {
    return refuse(413, "The payload is over APNs' 4096 bytes.");
  }
  const stub = pairing(env, push.pairingId);
  const claim = await stub.claim(await sha256(secret));
  if (!claim.ok) {
    switch (claim.status) {
      case 401:
        return refuse(401, "No pairing holds this id and secret.");
      case 402:
        return refuse(
          402,
          "The Caw&Co Pro subscription behind this pairing is not active. The pairing is kept, and push resumes once Apple renews it."
        );
      case 429:
        return json(429, {
          error: "This pairing has had its 500 pushes for today.",
          resetsAt: claim.resetsAt,
        });
      default:
        return unhandled("claim", claim);
    }
  }
  const answer = await sendApns(env, {
    apnsEnvironment: claim.apnsEnvironment,
    deviceToken: claim.deviceToken,
    body: payload,
    collapseId: push.collapseId,
    expiration: push.expiration,
    pushType: push.pushType,
  });
  if (answer.status === 200) {
    return json(200, { ok: true });
  }
  console.log(`push ${answer.status}: ${answer.reason ?? ""}`);
  if (
    answer.status === 410 ||
    (answer.status === 400 && DEAD_TOKEN.has(answer.reason ?? ""))
  ) {
    await stub.forget(claim.deviceToken);
    return json(410, { reason: answer.reason ?? "Unregistered" });
  }
  return json(502, {
    status: answer.status,
    reason: answer.reason ?? `APNs answered ${answer.status}`,
  });
};

const bearerOf = (request: Request): string | undefined =>
  BEARER.exec(request.headers.get("authorization") ?? "")?.[1];

/** The device was removed in CawCo: its pairing is wiped and its seat freed. */
const unenroll = async (request: Request, env: Env): Promise<Response> => {
  const secret = bearerOf(request);
  if (!matches(secret, SECRET)) {
    return refuse(401, "The pairing's secret is missing.");
  }
  const body = await bodyOf(request);
  if (!(body && matches(body.pairingId, UUID))) {
    return refuse(400, "The unenrollment is not in the shape Cawrier reads.");
  }
  return (await pairing(env, body.pairingId).unenroll(await sha256(secret)))
    ? new Response(null, { status: 204 })
    : refuse(401, "No pairing holds this id and secret.");
};

const seats = (env: Env, seat: string) =>
  env.SEATS.get(env.SEATS.idFromName(seat));

type Verified = Extract<Notification, { ok: true }>;

/**
 * What the notification says of the subscription's entitlement
 * (entitlement.ts), kept under its seat when Apple signed it no earlier than
 * what the seat holds; then every pairing on the seat moves to the end that
 * stands: an entitled end makes each deliver, and one that has passed (a
 * lapse, a refund, a revocation) keeps each silent. Every pairing is moved
 * on every call, so a retry finds any a failed call missed.
 */
const settled = async (env: Env, notice: Verified): Promise<string> => {
  const decision = notificationEntitlement(notice, proProducts(env));
  if (decision.kind === "leave") {
    return `left: ${decision.reason}`;
  }
  const original = notice.transaction?.originalTransactionId;
  if (!original) {
    return "left: no original transaction id";
  }
  const seat = `${notice.environment}:${original}`;
  const { until, pairings } = await seats(env, seat).settle(
    decision.entitlement
  );
  await Promise.all(
    pairings.map((id) =>
      env.PAIRING.get(env.PAIRING.idFromString(id)).entitled(seat, until)
    )
  );
  const state =
    until > Date.now()
      ? `entitled until ${new Date(until).toISOString()}`
      : "not entitled";
  return `${state}, ${pairings.length} pairing(s) moved`;
};

/**
 * App Store Server Notifications V2. The signed payload and the transaction
 * and renewal info inside it are verified against Apple's root, for bundle
 * dev.cawco.app, in Production or the sandbox; anything else is refused.
 * Every notification about a Pro subscription is read for the status Apple
 * reports with it ({@link settled}); the rest answer 200 so Apple does not
 * retry them.
 *
 * Apple allows one notification URL per app, so once a notification has
 * verified and been applied here, its exact body goes on to Yield (the
 * owner's revenue dashboard, `ASSN_FORWARD_URL`), which verifies Apple's JWS
 * itself. The forward runs after the answer and never changes it: Apple's
 * retries stay about Cawrier. Nothing that failed verification is forwarded.
 */
const appleNotification = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const raw = await rawBodyOf(request, MAX_NOTIFICATION_BYTES);
  const body = parsedBody(raw);
  if (!(raw && typeof body?.signedPayload === "string")) {
    return refuse(400, "The notification is not in the shape Cawrier reads.");
  }
  const notice = await verifyNotification(env, body.signedPayload);
  if (!notice.ok) {
    console.log(`notification 400: ${notice.error}`);
    return refuse(400, notice.error);
  }
  const outcome =
    notice.type === "TEST" ? "verified" : await settled(env, notice);
  console.log(
    `notification ${notice.type}${notice.subtype ? `/${notice.subtype}` : ""} ${notice.environment} ${notice.uuid}: ${outcome}`
  );
  ctx.waitUntil(forward(env, raw, notice.uuid));
  return json(200, { ok: true });
};

const FORWARD_TIMEOUT_MS = 10_000;

/** Passes a verified notification's exact body on to Yield; logs its answer, never throws. */
const forward = async (env: Env, raw: string, uuid: string): Promise<void> => {
  try {
    const sent = await readWithin(FORWARD_TIMEOUT_MS, async (signal) => {
      const response = await fetch(env.ASSN_FORWARD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
        signal,
      });
      await response.body?.cancel();
      return response.status;
    });
    switch (sent.kind) {
      case "answered":
        console.log(`forward ${uuid}: Yield answered ${sent.value}`);
        break;
      case "unanswered":
        console.log(
          `forward ${uuid}: Yield did not answer within ${sent.after} ms (${sent.reason})`
        );
        break;
      default:
        unhandled("read", sent);
    }
  } catch (error) {
    console.log(
      `forward ${uuid}: Yield not reached (${error instanceof Error ? error.message : String(error)})`
    );
  }
};

let health:
  { at: number; body: { apns: ApnsAnswer; key: boolean } } | undefined;

const healthCheck = async (env: Env): Promise<Response> => {
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) {
    const apns = await sendApns(env, {
      apnsEnvironment: "production",
      deviceToken: "0".repeat(64),
      body: JSON.stringify({ aps: { alert: "Cawrier health" } }),
      pushType: "alert",
    });
    console.log(`health ${apns.status}: ${apns.reason ?? ""}`);
    health = { at: Date.now(), body: { apns, key: hasKey(env) } };
  }
  return json(200, health.body);
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/v1/enroll") {
      return await enroll(request, env);
    }
    if (request.method === "POST" && pathname === "/v1/push") {
      return await relay(request, env);
    }
    if (request.method === "POST" && pathname === "/v1/unenroll") {
      return await unenroll(request, env);
    }
    if (request.method === "GET" && pathname === "/v1/health") {
      return await healthCheck(env);
    }
    if (request.method === "POST" && pathname === "/v1/apple/notifications") {
      return await appleNotification(request, env, ctx);
    }
    return refuse(404, "Nothing is here.");
  },
} satisfies ExportedHandler<Env>;
