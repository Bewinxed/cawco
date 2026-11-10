import {
  INSTALL_SESSION_CREDENTIAL,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core/harness";
import type { HarnessSession } from "../harness";

/**
 * THE ONE OWNER OF THE SESSION CREDENTIAL'S CONTROLS: how an install and a
 * verify are said (as controls of {@link HarnessSession.control}), read, and
 * answered. The supervisor says them ({@link installCredential},
 * {@link verifyHeldCredential}) and reads what an install from the hub names
 * ({@link installOf}); the pi host reads one the same way; each adapter
 * answers them ({@link credentialControls}). Nothing else in the agent names
 * the two methods or the shape of their arguments.
 */

/** The `args[1]` of an install that is the launch's first. */
const INITIAL = "initial";

/** What an install control names: the credential, and whether it is the launch's first. */
interface Install {
  credential: string;
  initial: boolean;
}

/**
 * What an install control names, or `undefined` for any other method and for
 * an install that names no credential.
 */
export const installOf = (
  method: string,
  args: readonly unknown[]
): Install | undefined => {
  if (method !== INSTALL_SESSION_CREDENTIAL) {
    return undefined;
  }
  const [credential, mode] = args;
  return typeof credential === "string" && credential
    ? { credential, initial: mode === INITIAL }
    : undefined;
};

/** The launch's own credential, installed in the process it just started. */
export const installCredential = async (
  session: Pick<HarnessSession, "control">,
  credential: string
): Promise<void> => {
  await session.control(INSTALL_SESSION_CREDENTIAL, [credential, INITIAL]);
};

/**
 * What a held process answers to a verify: the credential it carries (a
 * harness that can read it says it, so the agent redacts it too), and
 * whether the hub refused it, which the harness has already stopped the
 * session for.
 */
export interface HeldCredential {
  credential?: string;
  refused: boolean;
}

/** The credential a process this agent attached to already holds, proved. */
export const verifyHeldCredential = async (
  session: Pick<HarnessSession, "control">
): Promise<HeldCredential> => {
  const held = await session.control(VERIFY_SESSION_CREDENTIAL, []);
  if (typeof held !== "object" || held === null) {
    return { refused: false };
  }
  return {
    ...("credential" in held &&
    typeof held.credential === "string" &&
    held.credential
      ? { credential: held.credential }
      : {}),
    refused: "refused" in held && held.refused === true,
  };
};

/**
 * The session credential's controls, routed and guarded the same for every
 * adapter: an install names a credential (refused when it names none) and
 * says whether it is the launch's first (`initial`); a verify proves the
 * one the process already holds. `undefined` for any other method, which is
 * the adapter's own.
 */
export const credentialControls =
  (
    install: (credential: string, initial: boolean) => Promise<unknown>,
    verify: () => Promise<unknown>
  ) =>
  (method: string, args: unknown[]): Promise<unknown> | undefined => {
    if (method === INSTALL_SESSION_CREDENTIAL) {
      const named = installOf(method, args);
      if (!named) {
        throw new Error("Session credential is missing.");
      }
      return install(named.credential, named.initial);
    }
    if (method === VERIFY_SESSION_CREDENTIAL) {
      return verify();
    }
    return undefined;
  };
