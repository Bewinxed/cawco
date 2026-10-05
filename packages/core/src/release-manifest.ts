import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { RELEASE_PUBLIC_KEY } from "./release-key";

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
  /** The capability required by this build's agent from its process keeper. */
  sessiondProtocol: string;
  testSigned: boolean;
  version: string;
}
export function signManifest(
  manifest: ReleaseManifest,
  privatePem: string
): string {
  const key = createPrivateKey(privatePem);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error(
      "Release signing requires an ECDSA P-256 PKCS8 private key"
    );
  }
  return sign("sha256", Buffer.from(JSON.stringify(manifest)), key).toString(
    "base64"
  );
}
export function verifyManifest(
  manifest: ReleaseManifest,
  signature: string,
  explicitPublicKey?: string
): void {
  if (manifest.testSigned && !explicitPublicKey) {
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
    !verify(
      "sha256",
      Buffer.from(JSON.stringify(manifest)),
      key,
      Buffer.from(signature, "base64")
    )
  ) {
    throw new Error("Release manifest signature verification failed");
  }
}
