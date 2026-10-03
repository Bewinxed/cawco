import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths";
import { DB_PATH } from "./config";
import type { DbShape } from "./db";

const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/;

/** Move, never regenerate, the signing bytes that keep existing MCP transports alive. */
export const mcpSigningKeyPath = (): string => {
  const directory = sessionIdentityDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, "mcp-session.key");
  const previous = join(dirname(DB_PATH), "mcp-session.key");
  if (existsSync(previous)) {
    if (existsSync(target)) {
      if (!readFileSync(previous).equals(readFileSync(target))) {
        throw new Error(
          "Two different MCP signing keys exist; refusing to expire live sessions."
        );
      }
    } else {
      writeFileSync(target, readFileSync(previous), {
        mode: 0o600,
        flag: "wx",
      });
    }
    unlinkSync(previous);
  }
  return target;
};

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
