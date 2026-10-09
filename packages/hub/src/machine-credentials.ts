/**
 * What a fleet machine proves itself with to the hub's git remote
 * (git-remote.ts). Minted at each register and sent in the register ack over
 * the machine's own socket; the machine holds it in memory and hands it to
 * git per command through env-only config, so nothing new is written to its
 * disk. The hub keeps only its sha256, in memory, and replaces it on every
 * register: a hub that restarts holds none, and every machine's next register
 * mints it a fresh one. Not on the agents row: that row goes to every
 * dashboard on the board frame.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

export const createMachineCredentials = () => {
  const hashes = new Map<string, Buffer>();
  return {
    /** A new credential for `machineId`'s connection; the one before it stops working. */
    mint(machineId: string): string {
      const credential = randomBytes(32).toString("base64url");
      hashes.set(machineId, sha256(credential));
      return credential;
    },
    /** Whether `credential` is the one `machineId` was last handed. */
    verify(machineId: string, credential: string): boolean {
      const held = hashes.get(machineId);
      return held !== undefined && timingSafeEqual(held, sha256(credential));
    },
    /** A machine removed from the fleet proves nothing any more. */
    forget(machineId: string): void {
      hashes.delete(machineId);
    },
  };
};

export type MachineCredentials = ReturnType<typeof createMachineCredentials>;

/**
 * Who an `Authorization: Basic <user:password>` header proves: a machine by
 * its credential, or a session by its own (`<instanceId>:<session
 * credential>`). Undefined for anything else.
 */
export const basicCaller = (
  authorization: string | null,
  machines: MachineCredentials,
  session: (credential: string) => string | undefined
): string | undefined => {
  if (!authorization?.startsWith("Basic ")) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString(
      "utf8"
    );
  } catch {
    return undefined;
  }
  const colon = decoded.indexOf(":");
  if (colon <= 0) {
    return undefined;
  }
  const user = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  if (!password) {
    return undefined;
  }
  if (machines.verify(user, password)) {
    return user;
  }
  return session(password) === user ? user : undefined;
};
