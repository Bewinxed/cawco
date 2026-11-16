/**
 * Whether, and until when, a Caw&Co Pro subscription lets a pairing deliver
 * push, and how long a pairing is kept: pure decisions over what Apple signed
 * and the clock, with no storage and no network. The Durable Objects
 * (pairing.ts, seats.ts) store what these functions decide.
 *
 * Pro is one subscription group of two auto-renewable subscriptions
 * (`PRO_PRODUCT_IDS`), each with a 14-day free introductory offer, which
 * Apple delivers as an ordinary transaction of that product with an
 * `expiresDate`. Apple speaks of a subscription in two places, and each is
 * read here into one {@link Entitlement}:
 *
 * - The phone's StoreKit transaction, at enrolment
 *   ({@link transactionEntitlement}).
 * - App Store Server Notifications V2 ({@link notificationEntitlement}): the
 *   subscription's status as of the moment Apple signed the notification.
 *
 * Apple does not promise to deliver notifications in order, and a phone may
 * enrol on a transaction it fetched before a refund: whichever of the two
 * Apple signed later stands ({@link fresher}).
 *
 * A pairing whose subscription is not entitled is kept and delivers nothing
 * ({@link delivers}), so a later word that it is entitled again (a late
 * renewal, a billing recovery, a resubscription) resumes push with nothing
 * for the person to do. A refund or a revocation is such a lapse too: a
 * reversed refund or regained Family Sharing access resumes push the same
 * way.
 */
import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import { DAY_MS } from "@cawco/core/time";

/**
 * A pairing is kept this long past its last enrol, entitled or not. The app
 * enrols on every launch, so a device left unused gives its seat back after
 * it.
 */
const LIFE_MS = 30 * DAY_MS;

/** What Apple last said of one subscription: entitled until `until`, as of `signedAt` (both ms epoch). */
export interface Entitlement {
  /** When Apple signed what this was read from: the later signature stands. */
  readonly signedAt: number;
  /** The end of what the subscription is entitled to; at or before `signedAt` when Apple said it had already ended. */
  readonly until: number;
}

/**
 * Apple's `transaction.type` for an auto-renewable subscription
 * (developer.apple.com/documentation/appstoreserverapi/type).
 */
const AUTO_RENEWABLE = "Auto-Renewable Subscription";

/**
 * Apple's subscription status as of the notification's `signedDate`
 * (developer.apple.com/documentation/appstoreservernotifications/status),
 * numbered as the library's `Status` enum numbers it. Written out here: the
 * library loads jsrsasign as it loads, which Workers refuse at global scope.
 */
const STATUS = {
  active: 1,
  expired: 2,
  billingRetry: 3,
  gracePeriod: 4,
  revoked: 5,
} as const;

export type Accepted =
  | { readonly ok: true; readonly entitlement: Entitlement }
  | { readonly ok: false; readonly error: string };

/**
 * A verified StoreKit transaction, read for enrolment. Accepted when it is
 * one of the Pro products, an auto-renewable subscription, not revoked, and
 * its `expiresDate` is still ahead; the subscription is then entitled until
 * that `expiresDate`: "The UNIX time, in milliseconds, an auto-renewable
 * subscription purchase expires or renews"
 * (developer.apple.com/documentation/appstoreserverapi/expiresdate). The
 * free introductory offer is such a transaction too, whose `expiresDate` is
 * the offer's end.
 */
export const transactionEntitlement = (
  transaction: JWSTransactionDecodedPayload,
  products: readonly string[],
  now: number
): Accepted => {
  if (!(transaction.productId && products.includes(transaction.productId))) {
    return { ok: false, error: "The purchase is not CawCo Pro." };
  }
  if (transaction.type !== AUTO_RENEWABLE) {
    return {
      ok: false,
      error: "The purchase is not an auto-renewable subscription.",
    };
  }
  // "The UNIX time, in milliseconds, that the App Store refunded the
  // transaction or revoked it from Family Sharing"
  // (developer.apple.com/documentation/appstoreserverapi/revocationdate).
  if (transaction.revocationDate !== undefined) {
    return { ok: false, error: "The subscription was refunded or revoked." };
  }
  if (!(typeof transaction.expiresDate === "number")) {
    return { ok: false, error: "The subscription carries no expiry date." };
  }
  if (!(transaction.expiresDate > now)) {
    return { ok: false, error: "The subscription has expired." };
  }
  if (!(typeof transaction.signedDate === "number")) {
    return { ok: false, error: "The purchase carries no signing date." };
  }
  return {
    ok: true,
    entitlement: {
      signedAt: transaction.signedDate,
      until: transaction.expiresDate,
    },
  };
};

/** A verified App Store Server Notification V2, as far as the subscription's entitlement goes. */
export interface Notice {
  /** The renewal info inside (`data.signedRenewalInfo`), verified; present for an auto-renewable subscription. */
  readonly renewalInfo: JWSRenewalInfoDecodedPayload | undefined;
  /** Apple's `signedDate` on the notification, ms epoch. */
  readonly signedAt: number;
  /** `data.status`: the subscription's status as of `signedAt`; present for an auto-renewable subscription. */
  readonly status: number | undefined;
  /** The transaction inside (`data.signedTransactionInfo`), verified. */
  readonly transaction: JWSTransactionDecodedPayload | undefined;
}

export type Decision =
  | { readonly kind: "entitlement"; readonly entitlement: Entitlement }
  | { readonly kind: "leave"; readonly reason: string };

/**
 * What a notification says of the subscription's entitlement, read off the
 * status Apple reports with it, whatever its type: "This status value is
 * current as of the `signedDate` in the decoded payload"
 * (developer.apple.com/documentation/appstoreservernotifications/status). So
 * each notification type that changes entitlement moves the subscription by
 * the status it carries (a renewal, a recovery, a resubscription, an
 * extension or a reversed refund arrive `active`; a failed renewal
 * `billingRetry` or `gracePeriod`; an expiry `expired`; a refund or a lost
 * Family Sharing `revoked`), and a type that changes nothing restates the
 * status that already stood.
 */
export const notificationEntitlement = (
  notice: Notice,
  products: readonly string[]
): Decision => {
  const { renewalInfo, signedAt, status, transaction } = notice;
  if (!(transaction?.productId && products.includes(transaction.productId))) {
    return { kind: "leave", reason: "not a Pro subscription" };
  }
  if (!(status !== undefined && renewalInfo)) {
    return { kind: "leave", reason: "no subscription status" };
  }
  const endsAt = (until: number): Decision => ({
    kind: "entitlement",
    entitlement: { signedAt, until },
  });
  // Active: entitled until the current period renews or expires. The
  // notification's transaction may be an earlier period's (a refund or a
  // reversed refund of one), so the period's end is the renewal info's
  // `renewalDate`: "The UNIX time, in milliseconds, when the most recent
  // auto-renewable subscription purchase expires"
  // (developer.apple.com/documentation/appstoreserverapi/renewaldate), which
  // is the `expiresDate` of the latest transaction.
  if (status === STATUS.active) {
    return renewalInfo.renewalDate === undefined
      ? { kind: "leave", reason: "active with no renewal date" }
      : endsAt(renewalInfo.renewalDate);
  }
  // Billing Grace Period: "continue to provide service through the grace
  // period" (developer.apple.com/documentation/appstoreservernotifications/notificationtype,
  // DID_FAIL_TO_RENEW), whose end is `gracePeriodExpiresDate`: "The time when
  // the Billing Grace Period for subscription renewals expires"
  // (developer.apple.com/documentation/appstoreserverapi/graceperiodexpiresdate).
  if (status === STATUS.gracePeriod) {
    return renewalInfo.gracePeriodExpiresDate === undefined
      ? { kind: "leave", reason: "grace period with no end" }
      : endsAt(renewalInfo.gracePeriodExpiresDate);
  }
  // Billing retry with no grace period: "the subscription isn't in a grace
  // period and you can stop providing the subscription service"
  // (notificationtype, DID_FAIL_TO_RENEW); and after a grace period, "you can
  // turn off access to the service or content" (GRACE_PERIOD_EXPIRED). Ended
  // as of the notification; its pairings are kept, since a recovery
  // (DID_RENEW, BILLING_RECOVERY) can follow for 60 days.
  if (status === STATUS.billingRetry) {
    return endsAt(signedAt);
  }
  // Expired: "a subscription expired" for any reason (notificationtype,
  // EXPIRED). Ended as of the notification; a resubscription in the same
  // group keeps its original transaction id, so its seat's pairings are kept.
  if (status === STATUS.expired) {
    return endsAt(signedAt);
  }
  // Revoked: "The App Store refunded the transaction or revoked it from
  // Family Sharing" (developer.apple.com/documentation/appstoreserverapi/status;
  // notificationtype, REFUND and REVOKE). Ended as of the notification; its
  // pairings are kept, since Apple can reverse it: "If your app revoked
  // content or services as a result of the related refund, it needs to
  // reinstate them" (notificationtype, REFUND_REVERSED), and a family member
  // can regain access (SUBSCRIBED, RESUBSCRIBE).
  if (status === STATUS.revoked) {
    return endsAt(signedAt);
  }
  return { kind: "leave", reason: `unknown status ${status}` };
};

/** The entitlement that stands: what Apple signed later. A tie is the same word again (a retried notification), so `next` stands. */
export const fresher = (
  held: Entitlement | undefined,
  next: Entitlement
): Entitlement => (held && held.signedAt > next.signedAt ? held : next);

/** When a pairing is wiped: 30 days after its last enrol ({@link LIFE_MS}), whatever its subscription says. */
export const pairingEnd = (lastEnrolledAt: number): number =>
  lastEnrolledAt + LIFE_MS;

/**
 * Whether a kept pairing delivers push now: while its subscription is
 * entitled. `until` is null for a seat no subscription stands behind (a
 * TestFlight install's app transaction), which always delivers.
 */
export const delivers = (until: number | null, now: number): boolean =>
  until === null || until > now;
