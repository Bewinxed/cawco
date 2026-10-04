import { createHash, randomBytes } from "node:crypto";
import type { DbShape } from "./db";

const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/;

/** The hub keeps hashes only. The raw value travels directly to one retained harness. */
export const createSessionIdentities = (db: DbShape) => {
  const hash = (credential: string) =>
    createHash("sha256").update(credential).digest("hex");
  const resolve = (authorization: string | null) => {
    if (!authorization?.startsWith("Bearer ")) {
      return;
    }
    const credential = authorization.slice(7);
    return CREDENTIAL.test(credential)
      ? db.sessionIdentityByHash(hash(credential))
      : undefined;
  };
  return {
    mint(instanceId: string): string {
      const credential = randomBytes(32).toString("base64url");
      db.stageSessionIdentity(instanceId, hash(credential));
      return credential;
    },
    resolve,
    acknowledge(authorization: string | null): boolean {
      const row = resolve(authorization);
      if (!(row && authorization)) {
        return false;
      }
      const credentialHash = hash(authorization.slice(7));
      return (
        db.acknowledgeSessionIdentity(row.instanceId, credentialHash) ||
        (row.credentialHash === credentialHash && row.installedAt !== null)
      );
    },
  };
};
