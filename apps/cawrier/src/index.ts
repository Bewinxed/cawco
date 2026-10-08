/**
 * Cawrier: the one holder of CawCo's APNs key. A phone that bought Pro
 * enrolls a pairing (its device token, under a secret it gives its hub);
 * the hub pushes through the pairing with that secret. No hub holds the key.
 *
 * POST /v1/enroll  { pairingId, secret, deviceToken, apnsEnvironment, proof }
 * POST /v1/push    Authorization: Bearer <secret>; { pairingId, collapseId?, expiration?, payload }
 * GET  /v1/health  one APNs probe: proves outbound HTTP/2 to Apple and the key
 */
import {
  type ApnsAnswer,
  type ApnsEnvironment,
  hasKey,
  sendApns,
} from "./apns";
import { verifyPurchase } from "./storekit";

// biome-ignore lint/performance/noBarrelFile: Workers find a Durable Object class among the entry module's exports.
export { Pairing } from "./pairing";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** 32 random bytes, base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const BEARER = /^Bearer (\S+)$/;
const DEVICE_TOKEN = /^[0-9a-f]{64,200}$/;
/** APNs' limit on an alert's payload. */
const MAX_PAYLOAD_BYTES = 4096;
const MAX_BODY_BYTES = 32_768;
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
const bodyOf = async (request: Request): Promise<Body | undefined> => {
  const text = await request.text();
  if (bytes(text) > MAX_BODY_BYTES) {
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

interface Enrollment {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  readonly pairingId: string;
  /** Kept a union on `kind`: one kind today; a Polar purchase would be another. */
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
  const { proof } = enrollment;
  if (proof.kind !== "appStore" || typeof proof.transaction !== "string") {
    return refuse(403, "The proof of purchase is not one Cawrier accepts.");
  }
  const purchase = await verifyPurchase(env, proof.transaction);
  if (!purchase.ok) {
    console.log(`enroll 403: ${purchase.error}`);
    return refuse(403, purchase.error);
  }
  const held = await pairing(env, enrollment.pairingId).enroll({
    secretHash: await sha256(enrollment.secret),
    deviceToken: enrollment.deviceToken,
    apnsEnvironment: enrollment.apnsEnvironment,
    transactionEnvironment: purchase.environment,
  });
  if (!held) {
    return refuse(409, "This pairing is held under another secret.");
  }
  return json(200, { ok: true });
};

/** APNs' word that the device token is dead: the pairing is wiped. */
const DEAD_TOKEN = new Set(["BadDeviceToken", "DeviceTokenNotForTopic"]);

const relay = async (request: Request, env: Env): Promise<Response> => {
  const secret = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
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
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/v1/enroll") {
      return await enroll(request, env);
    }
    if (request.method === "POST" && pathname === "/v1/push") {
      return await relay(request, env);
    }
    if (request.method === "GET" && pathname === "/v1/health") {
      return await healthCheck(env);
    }
    return refuse(404, "Nothing is here.");
  },
} satisfies ExportedHandler<Env>;
