/**
 * A StoreKit 2 transaction (`Transaction.jwsRepresentation`) proves Pro or
 * the free week, and App Store Server Notifications V2 report purchases and
 * refunds. Apple's own verifier checks both offline: the x5c chain to the
 * pinned Apple Root CA G3, the ES256 signature, the bundle id and the
 * environment. Here: which environment to check against, and what the
 * transaction must grant.
 */
import { Buffer } from "node:buffer";
import type { SignedDataVerifier } from "@apple/app-store-server-library";

/** https://www.apple.com/certificateauthority/AppleRootCA-G3.cer, sha256 63343abf…3e9179. */
const APPLE_ROOT_CA_G3 = Buffer.from(
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==",
  "base64"
);

/** A real StoreKit transaction is about 5 KB. */
const MAX_JWS_CHARS = 16_384;

export type TransactionEnvironment = "Production" | "Sandbox";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Purchase =
  | {
      readonly ok: true;
      /** When the free week ends; null for Pro. */
      readonly endsAt: number | null;
      readonly environment: TransactionEnvironment;
      /** The purchase's devices are counted under this: environment and original transaction id. */
      readonly seat: string;
    }
  | { readonly ok: false; readonly error: string };

/** A notification's signed payload carries a signed transaction and renewal info; real ones are well under this. */
const MAX_NOTIFICATION_CHARS = 64_000;

type Transaction = Awaited<
  ReturnType<SignedDataVerifier["verifyAndDecodeTransaction"]>
>;

/** A JWS's payload, read before its signature is checked: only to pick the environment to check it against. */
const unverifiedPayload = (jws: string): Record<string, unknown> => {
  try {
    const payload = jws.split(".")[1] ?? "";
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const isEnvironment = (value: unknown): value is TransactionEnvironment =>
  value === "Production" || value === "Sandbox";

/**
 * Apple's verifier for one environment: the x5c chain to the pinned root, the
 * ES256 signature, and the payload's bundle id (`APNS_TOPIC`, dev.cawco.app),
 * app id and environment. Loaded inside the request: its jsrsasign draws
 * random values when it loads, which Workers refuse at global scope.
 */
const verifierFor = async (env: Env, environment: TransactionEnvironment) => {
  const { Environment, SignedDataVerifier: Verifier } = await import(
    "@apple/app-store-server-library"
  );
  return new Verifier(
    [APPLE_ROOT_CA_G3],
    false,
    environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
    env.APNS_TOPIC,
    Number(env.APP_APPLE_ID)
  );
};

export type Notification =
  | {
      readonly ok: true;
      readonly environment: TransactionEnvironment;
      /** Apple's signing time, ms epoch. */
      readonly signedAt: number;
      /** The signed transaction inside, verified the same way; absent on a TEST. */
      readonly transaction: Transaction | undefined;
      readonly type: string;
      readonly uuid: string;
    }
  | { readonly ok: false; readonly error: string };

/** An App Store Server Notification V2 (`signedPayload`), verified, with the transaction it carries verified too. */
export const verifyNotification = async (
  env: Env,
  signedPayload: string
): Promise<Notification> => {
  if (signedPayload.length > MAX_NOTIFICATION_CHARS) {
    return { ok: false, error: "The notification is too big." };
  }
  const data = unverifiedPayload(signedPayload).data as
    | { environment?: unknown }
    | undefined;
  const environment = data?.environment;
  if (!isEnvironment(environment)) {
    return {
      ok: false,
      error: "The notification is not from the App Store or the sandbox.",
    };
  }
  const verifier = await verifierFor(env, environment);
  let notice: Awaited<
    ReturnType<SignedDataVerifier["verifyAndDecodeNotification"]>
  >;
  try {
    notice = await verifier.verifyAndDecodeNotification(signedPayload);
  } catch {
    return {
      ok: false,
      error: "Apple's signature on the notification does not hold.",
    };
  }
  if (!(notice.notificationType && notice.notificationUUID)) {
    return { ok: false, error: "The notification carries no type or id." };
  }
  let transaction: Transaction | undefined;
  const signed = notice.data?.signedTransactionInfo;
  if (signed) {
    try {
      transaction = await verifier.verifyAndDecodeTransaction(signed);
    } catch {
      return {
        ok: false,
        error:
          "Apple's signature on the notification's transaction does not hold.",
      };
    }
  }
  return {
    ok: true,
    environment,
    signedAt: notice.signedDate ?? Date.now(),
    transaction,
    type: notice.notificationType,
    uuid: notice.notificationUUID,
  };
};

/**
 * A TestFlight install while the App Store serves no products (the Paid Apps
 * Agreement isn't active yet): the app's own signed AppTransaction stands in
 * for a purchase. Only the sandbox's, which is TestFlight's; App Store and
 * Xcode installs are refused. Apple's verifier checks the chain to the pinned
 * root, the signature, the bundle id and the environment (`receiptType`). The
 * seat is the install's app transaction, with no end: once the agreement is
 * active, the app enrolls on its real purchase instead.
 */
export const verifyAppTransaction = async (
  env: Env,
  jws: string
): Promise<Purchase> => {
  const receiptType =
    jws.length <= MAX_JWS_CHARS
      ? unverifiedPayload(jws).receiptType
      : undefined;
  if (receiptType === "Production") {
    return {
      ok: false,
      error:
        "An App Store install enrolls on its purchase, not on the app's transaction.",
    };
  }
  if (receiptType === "Xcode") {
    return {
      ok: false,
      error:
        "An Xcode build's app transaction is not signed by Apple, so Cawrier does not accept it.",
    };
  }
  if (receiptType !== "Sandbox") {
    return {
      ok: false,
      error: "The app transaction is not a TestFlight install's.",
    };
  }
  const verifier = await verifierFor(env, "Sandbox");
  let transaction: Awaited<
    ReturnType<SignedDataVerifier["verifyAndDecodeAppTransaction"]>
  >;
  try {
    transaction = await verifier.verifyAndDecodeAppTransaction(jws);
  } catch {
    return {
      ok: false,
      error: "Apple's signature on the app transaction does not hold.",
    };
  }
  if (!transaction.appTransactionId) {
    return {
      ok: false,
      error: "The app transaction carries no app transaction id.",
    };
  }
  return {
    ok: true,
    environment: "Sandbox",
    seat: `Sandbox:app:${transaction.appTransactionId}`,
    endsAt: null,
  };
};

export const verifyPurchase = async (
  env: Env,
  jws: string
): Promise<Purchase> => {
  const environment =
    jws.length <= MAX_JWS_CHARS
      ? unverifiedPayload(jws).environment
      : undefined;
  if (!isEnvironment(environment)) {
    return {
      ok: false,
      error: "The purchase is not an App Store or TestFlight transaction.",
    };
  }
  const verifier = await verifierFor(env, environment);
  let transaction: Transaction;
  try {
    transaction = await verifier.verifyAndDecodeTransaction(jws);
  } catch {
    return {
      ok: false,
      error: "Apple's signature on the purchase does not hold.",
    };
  }
  const products = env.PRO_PRODUCT_IDS.split(",").map((id) => id.trim());
  const trial = transaction.productId === env.TRIAL_PRODUCT_ID;
  if (
    !(
      trial ||
      (transaction.productId && products.includes(transaction.productId))
    )
  ) {
    return { ok: false, error: "The purchase is not CawCo Pro." };
  }
  if (transaction.revocationDate !== undefined) {
    return { ok: false, error: "The purchase was refunded." };
  }
  if (
    typeof transaction.expiresDate === "number" &&
    transaction.expiresDate <= Date.now()
  ) {
    return { ok: false, error: "The subscription has expired." };
  }
  if (!transaction.originalTransactionId) {
    return {
      ok: false,
      error: "The purchase carries no original transaction id.",
    };
  }
  const seat = `${environment}:${transaction.originalTransactionId}`;
  if (!trial) {
    return { ok: true, environment, seat, endsAt: null };
  }
  if (typeof transaction.purchaseDate !== "number") {
    return { ok: false, error: "The purchase carries no purchase date." };
  }
  // A restore gets a new purchaseDate; the week runs from the first purchase.
  const startedAt = Math.min(
    transaction.purchaseDate,
    transaction.originalPurchaseDate ?? transaction.purchaseDate
  );
  const endsAt = startedAt + Number(env.TRIAL_DAYS) * DAY_MS;
  if (!(endsAt > Date.now())) {
    return { ok: false, error: "The free week on this purchase has ended." };
  }
  return { ok: true, environment, seat, endsAt };
};
