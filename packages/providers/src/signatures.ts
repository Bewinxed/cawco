/**
 * How a webhook's signature is checked, said once for every provider that
 * signs its deliveries itself (connection/webhook.ts's schemes, GitLab's,
 * Gitea's): a hex HMAC-SHA256, a constant-time compare, a timestamp's
 * window, and Standard Webhooks through its own library.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Webhook as StandardWebhook } from "standardwebhooks";
import type { RawDelivery } from "./provider";

/** A signed timestamp's window either way: Stripe's own tolerance, 5 minutes, and Standard Webhooks' library's. */
const WINDOW_S = 5 * 60;

/** A hex SHA-256 digest. */
export const HEX_SHA256 = /^[0-9a-f]{64}$/u;

/** The hex HMAC-SHA256 of `parts`, in order, keyed by `secret`. */
export const hmacHex = (secret: string, ...parts: (string | Uint8Array)[]) => {
  const mac = createHmac("sha256", secret);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest("hex");
};

/** Two strings equal, compared in constant time for their length (a length says nothing secret). */
export const sameText = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Whether a Unix time in seconds is within the window of now. */
export const freshSeconds = (seconds: number, now: number) =>
  Number.isFinite(seconds) && Math.abs(now / 1000 - seconds) <= WINDOW_S;

/**
 * Standard Webhooks, verified by its own library (`webhook-id`,
 * `webhook-timestamp`, `webhook-signature`, the timestamp within its
 * window): why the signature does not hold, or nothing when it does.
 * `secret` is the `whsec_` form the spec names.
 */
export const standardMisfit = (
  { headers, body }: RawDelivery,
  secret: string
): string | undefined => {
  try {
    new StandardWebhook(secret).verify(
      body,
      Object.fromEntries(headers.entries()),
      { jsonParse: false }
    );
  } catch (error) {
    return `the Standard Webhooks signature does not hold: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
};
