import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";
import { RELEASE_PUBLIC_KEY } from "./release-key";
import { ReleaseManifestSchema } from "./stored-shapes";

export interface ReleaseManifest {
  artifacts: {
    target: string;
    archive: string;
    sha256: string;
    size: number;
    binarySha256: string;
    binarySize: number;
  }[];
  channel: "stable" | "nightly";
  commit: string;
  notes: string;
  protocol: { min: number; max: number };
  /** Database migrations this build carries; a build with fewer than the database holds is never installed. */
  schemaVersion: number;
  /** First-parent commit count of the built commit; only grows, and no path installs a lower or equal one. */
  sequence: number;
  /** The capability required by this build's agent from its process keeper. */
  sessiondProtocol: string;
  testSigned: boolean;
  version: string;
}
/**
 * The release's signed text and its signature: the text is the manifest's
 * compact JSON, published as `release.json` byte for byte, and the signature
 * is over those bytes.
 */
export function signManifest(
  manifest: ReleaseManifest,
  privatePem: string
): { signature: string; text: string } {
  const key = createPrivateKey(privatePem);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error(
      "Release signing requires an ECDSA P-256 PKCS8 private key"
    );
  }
  const text = JSON.stringify(manifest);
  return {
    text,
    signature: sign("sha256", Buffer.from(text), key).toString("base64"),
  };
}

/** Throws unless `value` reads as a manifest this build knows. */
function assertManifest(value: unknown): asserts value is ReleaseManifest {
  const read = ReleaseManifestSchema.safeParse(value);
  if (!read.success) {
    throw new Error(
      `The signed release manifest is not one this build reads: ${z.prettifyError(read.error)}`
    );
  }
}

/**
 * The manifest `text` holds, once its signature checks over `text` itself:
 * the bytes as published, never a manifest re-serialised from a parsed
 * value (a schema's output orders keys by its shape and drops the keys it
 * does not name, so it is no longer what was signed). A manifest carried as
 * JSON (the hub's offer, a staged `release.json`) is its signed text again as
 * `JSON.stringify` of the value parsed from it, with no schema between.
 *
 * What it returns is the very value parsed from `text`, checked against the
 * schema and not rebuilt by it: every signed key, in the signed order, so it
 * serialises back to `text` wherever it is passed on (the hub offers it to
 * machines of every build; the agent stages it).
 */
export function verifyManifest(
  text: string,
  signature: string,
  explicitPublicKey?: string
): ReleaseManifest {
  const value: unknown = JSON.parse(text);
  // A refusal read off the unverified text: it only ever refuses.
  if (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "testSigned") === true &&
    !explicitPublicKey
  ) {
    throw new Error(
      "Test-signed release refused: an explicit test public key is required"
    );
  }
  const publicPem = explicitPublicKey ?? RELEASE_PUBLIC_KEY;
  if (!publicPem) {
    throw new Error(
      "No release public key configured; publishing is not enabled"
    );
  }
  const key = createPublicKey(publicPem);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
    !verify("sha256", Buffer.from(text), key, Buffer.from(signature, "base64"))
  ) {
    throw new Error("Release manifest signature verification failed");
  }
  assertManifest(value);
  return value;
}
