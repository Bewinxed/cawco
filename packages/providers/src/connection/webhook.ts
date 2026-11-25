/**
 * The generic `connection` provider's webhook (provider spec §2.9): any
 * signed sender, its watch holding only how it signs (`settings.scheme`)
 * and where its event's id is. Such a watch is polled by nothing: it is the
 * relay's container, its id the relay's, so what lands is source
 * `hook:<relay id>`, as event routes name it.
 *
 * Its three schemes, each checked in constant time before the body is
 * parsed; a timestamp outside 5 minutes of now (Stripe's own tolerance) is
 * refused:
 * - `stripe`: `Stripe-Signature`, `t=` and one or more `v1=`, each the hex
 *   HMAC-SHA256 of `<t>.<body>`. No small library verifies it, so it is
 *   here, as the relay had it. Keyed by the event's `id`.
 * - `hmac-header`: a hex HMAC-SHA256 (a `sha256=` before it is let be) in
 *   the watch's header, of the body, or of `<timestamp>.<body>` with its
 *   timestamp header. Keyed by the id at the watch's path, else the body's
 *   SHA-256.
 * - `standard-webhooks`: verified by the `standardwebhooks` library, the
 *   spec's own ("Use the `webhook-id` header as an idempotency key",
 *   github.com/standard-webhooks/standard-webhooks), and keyed by
 *   `webhook-id`, so a sender's retry lands once.
 *
 * No lifecycle: the person adds the URL at the sender.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Effect, Result, Schema } from "effect";
import { Webhook as StandardWebhook } from "standardwebhooks";
import { deliveryJson, deliveryText } from "../delivery";
import type {
  HookAt,
  RawDelivery,
  SourceEvent,
  WatchView,
  Webhook,
} from "../provider";
import { DeliveryUnread, DeliveryUnverified } from "../read-stop";
import { HOOK_SCHEMES, type HookScheme, keyPart, valueAt } from "./descriptor";

/** A relay's watch's signing, as its settings hold it. */
export interface HookSigning {
  /** hmac-header, and any scheme: a dot path to the event's id in the body. */
  idPath: string | null;
  scheme: HookScheme;
  /** hmac-header: the header the hex HMAC-SHA256 comes in, lower case. */
  signatureHeader: string | null;
  /** hmac-header: a header with the Unix time the signature covers, lower case. */
  timestampHeader: string | null;
}

const SettingsSchema = Schema.Struct({
  idPath: Schema.optional(Schema.NullOr(Schema.String)),
  scheme: Schema.Literals(HOOK_SCHEMES),
  signatureHeader: Schema.optional(Schema.NullOr(Schema.String)),
  timestampHeader: Schema.optional(Schema.NullOr(Schema.String)),
});

/** A watch's settings read as a relay's signing; undefined for a watch that is no relay's (a connector poll). */
export const hookSigningOf = (settings: object): HookSigning | undefined => {
  const read = Schema.decodeUnknownResult(SettingsSchema)(settings);
  if (!Result.isSuccess(read)) {
    return;
  }
  const { scheme, idPath, signatureHeader, timestampHeader } = read.success;
  return {
    scheme,
    idPath: idPath ?? null,
    signatureHeader: signatureHeader ?? null,
    timestampHeader: timestampHeader ?? null,
  };
};

/** What an event route's source pattern matches of a relay: `hook:<relay id>`. */
export const hookSource = (relay: string): string => `hook:${relay}`;

/** A signed timestamp's window either way: Stripe's own tolerance, 5 minutes. */
const WINDOW_S = 5 * 60;
const HEX = /^[0-9a-f]{64}$/u;
const SHA256_PREFIX = "sha256=";
/** The most of an id kept as a key. */
const KEY_MAX = 200;

const hmacHex = (secret: string, ...parts: (string | Uint8Array)[]) => {
  const mac = createHmac("sha256", secret);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest("hex");
};

/** Two strings equal, compared in constant time for their length (a length says nothing secret). */
const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Whether a Unix time in seconds is within the window of now. */
const fresh = (seconds: number, now: number) =>
  Number.isFinite(seconds) && Math.abs(now / 1000 - seconds) <= WINDOW_S;

/** Stripe's `Stripe-Signature`: "t=…,v1=…,v1=…,v0=…", the timestamp, then one or more signatures of `<t>.<body>`. */
const stripeMisfit = (
  { headers, body, now }: RawDelivery,
  secret: string
): string | undefined => {
  const pairs = (headers.get("stripe-signature") ?? "")
    .split(",")
    .map((part) => part.trim().split("="));
  const stamp = pairs.find(([key]) => key === "t")?.[1] ?? "";
  const expected = hmacHex(secret, `${stamp}.`, body);
  const signed = pairs
    .filter(([key]) => key === "v1")
    .some(([, value]) => same(value ?? "", expected));
  if (!(stamp && signed)) {
    return "Stripe-Signature does not match t and the body";
  }
  return fresh(Number(stamp), now)
    ? undefined
    : `Stripe-Signature's t=${stamp} is outside 5 minutes of now`;
};

/** A hex HMAC-SHA256 in the watch's header, of the body, or of `<timestamp>.<body>` with its timestamp header. */
const hmacHeaderMisfit = (
  signing: HookSigning,
  { headers, body, now }: RawDelivery,
  secret: string
): string | undefined => {
  const header = signing.signatureHeader ?? "";
  const raw = (headers.get(header) ?? "").trim().toLowerCase();
  const given = raw.startsWith(SHA256_PREFIX)
    ? raw.slice(SHA256_PREFIX.length)
    : raw;
  const stampHeader = signing.timestampHeader;
  if (!stampHeader) {
    return HEX.test(given) && same(given, hmacHex(secret, body))
      ? undefined
      : `${header} does not match the body`;
  }
  const stamp = (headers.get(stampHeader) ?? "").trim();
  const expected = hmacHex(secret, `${stamp}.`, body);
  if (!(stamp && HEX.test(given) && same(given, expected))) {
    return `${header} does not match ${stampHeader} and the body`;
  }
  return fresh(Number(stamp), now)
    ? undefined
    : `${stampHeader} ${stamp} is outside 5 minutes of now`;
};

/** Standard Webhooks, verified by its own library: `webhook-id`, `webhook-timestamp`, `webhook-signature`. */
const standardMisfit = (
  { headers, body }: RawDelivery,
  secret: string
): string | undefined => {
  try {
    new StandardWebhook(secret).verify(
      body,
      Object.fromEntries(headers.entries()),
      {
        jsonParse: false,
      }
    );
  } catch (error) {
    return `the Standard Webhooks signature does not hold: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
};

/** Why a delivery does not hold under `signing`, or nothing when it does. */
const misfitOf = (
  signing: HookSigning,
  delivery: RawDelivery,
  secret: string
): string | undefined => {
  switch (signing.scheme) {
    case "stripe":
      return stripeMisfit(delivery, secret);
    case "hmac-header":
      return hmacHeaderMisfit(signing, delivery, secret);
    case "standard-webhooks":
      return standardMisfit(delivery, secret);
    default:
      return unhandledScheme(signing.scheme);
  }
};

/** A scheme no case reads: the type says there is none. */
const unhandledScheme = (scheme: never): string =>
  `the relay's watch names a scheme no check reads: ${String(scheme)}`;

/** A generic body: its JSON, or its text when it isn't JSON. */
const jsonOr = (delivery: RawDelivery) =>
  deliveryJson(delivery).pipe(
    Effect.orElseSucceed(() => ({ text: deliveryText(delivery) }))
  );

/** The event's natural key, as its scheme keys it; undefined when the delivery names none. */
const keyOf = (
  signing: HookSigning,
  delivery: RawDelivery,
  body: unknown
): string | undefined => {
  if (signing.scheme === "standard-webhooks") {
    return delivery.headers.get("webhook-id")?.slice(0, KEY_MAX) || undefined;
  }
  const path = signing.scheme === "stripe" ? "id" : signing.idPath;
  if (!path) {
    return createHash("sha256").update(delivery.body).digest("hex");
  }
  return keyPart(valueAt(body, path))?.slice(0, KEY_MAX);
};

/** What the person does at the sender, by how it signs. */
const stepOf = (signing: HookSigning | undefined, hook: HookAt): string => {
  if (signing?.scheme === "stripe") {
    return `Add ${hook.url} as an endpoint in Stripe (Developers, Webhooks), then give the relay its signing secret (whsec_…) from your own terminal: cawco relay set-secret ${hook.relay}`;
  }
  if (signing?.scheme === "standard-webhooks") {
    return `Have the service POST to ${hook.url}, signed by Standard Webhooks. Then give the relay its signing secret (whsec_…) from your own terminal: cawco relay set-secret ${hook.relay}`;
  }
  const stamp = signing?.timestampHeader
    ? `, and the Unix time in ${signing.timestampHeader}, signing <timestamp>.<body>`
    : "";
  return `Have the service POST to ${hook.url}, signing the raw body with HMAC-SHA256 (hex) in ${signing?.signatureHeader}${stamp}. Then give the relay the same secret from your own terminal: cawco relay set-secret ${hook.relay}`;
};

/** The relay's signing, or the failure that its watch holds none. */
const signingOf = (watch: WatchView) => hookSigningOf(watch.settings);

export const connectionWebhook: Webhook<never> = {
  verify: (delivery, secret, watch) => {
    const signing = signingOf(watch);
    const misfit = signing
      ? misfitOf(signing, delivery, secret)
      : "the relay's watch names no scheme";
    return misfit === undefined
      ? Effect.void
      : Effect.fail(new DeliveryUnverified({ words: misfit }));
  },
  read: (delivery, watch) =>
    Effect.gen(function* () {
      const signing = signingOf(watch);
      if (!signing) {
        return "ignored";
      }
      const body =
        signing.scheme === "stripe"
          ? yield* deliveryJson(delivery)
          : yield* jsonOr(delivery);
      const key = keyOf(signing, delivery, body);
      if (key === undefined) {
        return yield* new DeliveryUnread({
          words: `it had no event id at ${signing.scheme === "stripe" ? "id" : signing.idPath}; nothing stored`,
        });
      }
      const type = valueAt(body, "type");
      const named = typeof type === "string" ? type.slice(0, 100) : null;
      const created = Number(valueAt(body, "created"));
      const event: SourceEvent = {
        item: null,
        source: hookSource(watch.id),
        key,
        kind: named ?? "hook",
        actor: null,
        labels: [],
        branch: null,
        url: null,
        title: named,
        body: null,
        at:
          signing.scheme === "stripe" && Number.isFinite(created)
            ? created * 1000
            : delivery.now,
        data: body,
      };
      return { revisions: [], events: [event] };
    }),
  manualStep: (watch, hook, why) => {
    const step = stepOf(signingOf(watch), hook);
    return why ? `${why} ${step}` : step;
  },
};
