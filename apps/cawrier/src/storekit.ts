/**
 * A StoreKit 2 transaction (`Transaction.jwsRepresentation`) proves Pro.
 * Apple's own verifier checks it offline: the x5c chain to the pinned Apple
 * Root CA G3, the ES256 signature, the bundle id and the environment. Here:
 * which environment to check against, and what the transaction must grant.
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

export type Purchase =
  | { readonly ok: true; readonly environment: TransactionEnvironment }
  | { readonly ok: false; readonly error: string };

/** The environment the transaction claims, read before its signature is checked against that environment. */
const claimedEnvironment = (jws: string): unknown => {
  try {
    const payload = jws.split(".")[1] ?? "";
    return (
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        environment?: unknown;
      }
    ).environment;
  } catch {
    return undefined;
  }
};

export const verifyPurchase = async (
  env: Env,
  jws: string
): Promise<Purchase> => {
  const environment =
    jws.length <= MAX_JWS_CHARS ? claimedEnvironment(jws) : undefined;
  if (environment !== "Production" && environment !== "Sandbox") {
    return {
      ok: false,
      error: "The purchase is not an App Store or TestFlight transaction.",
    };
  }
  // Loaded inside the request: its jsrsasign draws random values when it
  // loads, which Workers refuse at global scope.
  const { Environment, SignedDataVerifier: Verifier } = await import(
    "@apple/app-store-server-library"
  );
  const verifier = new Verifier(
    [APPLE_ROOT_CA_G3],
    false,
    environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
    env.APNS_TOPIC,
    Number(env.APP_APPLE_ID)
  );
  let transaction: Awaited<
    ReturnType<SignedDataVerifier["verifyAndDecodeTransaction"]>
  >;
  try {
    transaction = await verifier.verifyAndDecodeTransaction(jws);
  } catch {
    return {
      ok: false,
      error: "Apple's signature on the purchase does not hold.",
    };
  }
  const products = env.PRO_PRODUCT_IDS.split(",").map((id) => id.trim());
  if (!(transaction.productId && products.includes(transaction.productId))) {
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
  return { ok: true, environment };
};
