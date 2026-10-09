/**
 * Cawrier: the one holder of CawCo's APNs key. A phone with Pro or a live
 * free week enrolls a pairing (its device token, under a secret it gives its
 * hub); the hub pushes through the pairing with that secret. No hub holds the
 * key. One purchase holds at most {@link SEATS_PER_PURCHASE} live pairings.
 *
 * POST /v1/enroll  { pairingId, secret, deviceToken, apnsEnvironment, proof }
 * POST /v1/push    Authorization: Bearer <secret>; { pairingId, collapseId?, expiration?, payload }
 * POST /v1/unenroll Authorization: Bearer <secret>; { pairingId }: the pairing and its seat go
 * GET  /v1/health  one APNs probe: proves outbound HTTP/2 to Apple and the key
 * POST /v1/apple/notifications  { signedPayload }: App Store Server Notifications V2
 * GET  /v1/experiment/<name> Authorization: Bearer <EXPERIMENT_READ_TOKEN>: the counts
 *
 * The paywall experiment is counted from Apple's notifications only; the app
 * sends Cawrier nothing for it (App Review 5.1.1(ii)).
 */
import {
  type ApnsAnswer,
  type ApnsEnvironment,
  hasKey,
  sendApns,
} from "./apns";
import type { ExperimentEvent } from "./experiment";
import { SEATS_PER_PURCHASE } from "./seats";
import {
  type Notification,
  type Purchase,
  verifyAppTransaction,
  verifyNotification,
  verifyPurchase,
} from "./storekit";

// biome-ignore lint/performance/noBarrelFile: Workers find a Durable Object class among the entry module's exports.
export { Experiment } from "./experiment";
export { Pairing } from "./pairing";
export { Seats } from "./seats";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** 32 random bytes, base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const BEARER = /^Bearer (\S+)$/;
const DEVICE_TOKEN = /^[0-9a-f]{64,200}$/;
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
}

const isCollapseId = (value: unknown): value is string | undefined =>
  value === undefined ||
  (typeof value === "string" && value.length > 0 && bytes(value) <= 64);

const isExpiration = (value: unknown): value is number | undefined =>
  value === undefined ||
  (Number.isSafeInteger(value) && (value as number) >= 0);

const pushOf = (body: Body | undefined): Push | undefined =>
  body &&
  matches(body.pairingId, UUID) &&
  isCollapseId(body.collapseId) &&
  isExpiration(body.expiration) &&
  isObject(body.payload)
    ? {
        pairingId: body.pairingId,
        collapseId: body.collapseId,
        expiration: body.expiration,
        payload: body.payload,
      }
    : undefined;

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
    endsAt: purchase.endsAt,
  });
  if (enrolled === "held") {
    return refuse(409, "This pairing is held under another secret.");
  }
  if (enrolled === "revoked") {
    console.log("enroll 403: the purchase was refunded");
    return refuse(403, "This purchase was refunded.");
  }
  if (enrolled === "full") {
    console.log("enroll 409: every seat on the purchase is taken");
    return refuse(
      409,
      `This purchase is already on ${SEATS_PER_PURCHASE} devices. Remove one in CawCo on another device, or contact support.`
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
    return claim.status === 401
      ? refuse(401, "No pairing holds this id and secret.")
      : json(429, {
          error: "This pairing has had its 500 pushes for today.",
          resetsAt: claim.resetsAt,
        });
  }
  const answer = await sendApns(env, {
    apnsEnvironment: claim.apnsEnvironment,
    deviceToken: claim.deviceToken,
    body: payload,
    collapseId: push.collapseId,
    expiration: push.expiration,
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

interface Variant {
  readonly experiment: string;
  readonly variant: string;
}

/**
 * `EXPERIMENT_TOKENS`: "name:variant=token,variant=token;name:…", the fixed
 * `appAccountToken` each paywall variant hands StoreKit. Read as the variants
 * of each experiment, and the variant each token names.
 */
const experimentsOf = (
  env: Env
): { byName: Map<string, string[]>; byToken: Map<string, Variant> } => {
  const byName = new Map<string, string[]>();
  const byToken = new Map<string, Variant>();
  for (const entry of env.EXPERIMENT_TOKENS.split(";")) {
    const [name = "", pairs = ""] = entry.split(":").map((part) => part.trim());
    if (!name) {
      continue;
    }
    const variants: string[] = [];
    for (const pair of pairs.split(",")) {
      const [variant = "", token = ""] = pair
        .split("=")
        .map((part) => part.trim());
      if (variant && UUID.test(token.toLowerCase())) {
        variants.push(variant);
        byToken.set(token.toLowerCase(), { experiment: name, variant });
      }
    }
    byName.set(name, variants);
  }
  return { byName, byToken };
};

const experiment = (env: Env, name: string) =>
  env.EXPERIMENT.get(env.EXPERIMENT.idFromName(name));

const seats = (env: Env, seat: string) =>
  env.SEATS.get(env.SEATS.idFromName(seat));

type Verified = Extract<Notification, { ok: true }>;

/** What a purchase counts as under its variant, or nothing. */
const eventOf = (env: Env, productId: string | undefined) => {
  if (productId === env.TRIAL_PRODUCT_ID) {
    return "trial";
  }
  const pro = env.PRO_PRODUCT_IDS.split(",").map((id) => id.trim());
  return productId && pro.includes(productId) ? "bought" : undefined;
};

/**
 * A completed purchase (`ONE_TIME_CHARGE`): counted under the variant its
 * verified transaction's `appAccountToken` names, once per notification and
 * never over a refund. Family Sharing grants are not purchases and count nothing.
 */
const charged = async (env: Env, notice: Verified): Promise<string> => {
  const { transaction } = notice;
  const variant = experimentsOf(env).byToken.get(
    transaction?.appAccountToken?.toLowerCase() ?? ""
  );
  const event: ExperimentEvent | undefined = eventOf(
    env,
    transaction?.productId
  );
  if (
    !(transaction?.originalTransactionId && variant && event) ||
    transaction.inAppOwnershipType !== "PURCHASED"
  ) {
    return "not counted";
  }
  return await experiment(env, variant.experiment).charge({
    uuid: notice.uuid,
    transactionKey: `${notice.environment}:${transaction.originalTransactionId}`,
    variant: variant.variant,
    event,
    purchasedAt: transaction.purchaseDate ?? notice.signedAt,
    signedAt: notice.signedAt,
  });
};

/**
 * A refund or revocation: terminal, in whatever order it arrives. The
 * purchase is marked revoked under its seats, every pairing on it is wiped
 * (each gives its seat back as it goes, so a retry finds the rest), and it
 * comes out of every experiment's counts.
 */
const revoked = async (env: Env, notice: Verified): Promise<string> => {
  const original = notice.transaction?.originalTransactionId;
  if (!original) {
    return "no transaction";
  }
  const transactionKey = `${notice.environment}:${original}`;
  const pairings = await seats(env, transactionKey).revoke();
  await Promise.all(
    pairings.map((id) =>
      env.PAIRING.get(env.PAIRING.idFromString(id)).revoked()
    )
  );
  await Promise.all(
    [...experimentsOf(env).byName.keys()].map((name) =>
      experiment(env, name).revoke({
        uuid: notice.uuid,
        transactionKey,
        signedAt: notice.signedAt,
      })
    )
  );
  return `revoked, ${pairings.length} pairing(s) wiped`;
};

/**
 * App Store Server Notifications V2. The signed payload and the transaction
 * inside it are verified against Apple's root, for bundle dev.cawco.app, in
 * Production or the sandbox; anything else is refused. Types not handled
 * here answer 200 so Apple does not retry them.
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
  let outcome = "ignored";
  if (notice.type === "ONE_TIME_CHARGE") {
    outcome = await charged(env, notice);
  } else if (notice.type === "REFUND" || notice.type === "REVOKE") {
    outcome = await revoked(env, notice);
  } else if (notice.type === "TEST") {
    outcome = "verified";
  }
  console.log(
    `notification ${notice.type} ${notice.environment} ${notice.uuid}: ${outcome}`
  );
  ctx.waitUntil(forward(env, raw, notice.uuid));
  return json(200, { ok: true });
};

const FORWARD_TIMEOUT_MS = 10_000;

/** Passes a verified notification's exact body on to Yield; logs its answer, never throws. */
const forward = async (env: Env, raw: string, uuid: string): Promise<void> => {
  try {
    const response = await fetch(env.ASSN_FORWARD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    await response.body?.cancel();
    console.log(`forward ${uuid}: Yield answered ${response.status}`);
  } catch (error) {
    console.log(
      `forward ${uuid}: Yield not reached (${error instanceof Error ? error.message : String(error)})`
    );
  }
};

/** Constant-time over equal-length digests, so the token's length does not show either. */
const sameToken = async (given: string, held: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all(
    [given, held].map((text) =>
      crypto.subtle.digest("SHA-256", encoder.encode(text))
    )
  );
  return crypto.subtle.timingSafeEqual(
    left as ArrayBuffer,
    right as ArrayBuffer
  );
};

const experimentReport = async (
  request: Request,
  env: Env,
  name: string
): Promise<Response> => {
  const token = bearerOf(request);
  if (
    !(
      env.EXPERIMENT_READ_TOKEN &&
      token &&
      (await sameToken(token, env.EXPERIMENT_READ_TOKEN))
    )
  ) {
    return refuse(401, "The experiment's read token is missing or wrong.");
  }
  const variants = experimentsOf(env).byName.get(name);
  if (!variants) {
    return refuse(404, "No experiment has that name.");
  }
  return json(200, {
    experiment: name,
    ...(await experiment(env, name).report(variants)),
  });
};

const EXPERIMENT_PATH = "/v1/experiment/";

let health:
  | { at: number; body: { apns: ApnsAnswer; key: boolean } }
  | undefined;

const healthCheck = async (env: Env): Promise<Response> => {
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) {
    const apns = await sendApns(env, {
      apnsEnvironment: "production",
      deviceToken: "0".repeat(64),
      body: JSON.stringify({ aps: { alert: "Cawrier health" } }),
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
    if (request.method === "GET" && pathname.startsWith(EXPERIMENT_PATH)) {
      return await experimentReport(
        request,
        env,
        pathname.slice(EXPERIMENT_PATH.length)
      );
    }
    return refuse(404, "Nothing is here.");
  },
} satisfies ExportedHandler<Env>;
