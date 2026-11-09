import {
  INSTALL_SESSION_CREDENTIAL,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core/harness";

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
      const [credential, mode] = args;
      if (typeof credential !== "string" || !credential) {
        throw new Error("Session credential is missing.");
      }
      return install(credential, mode === "initial");
    }
    if (method === VERIFY_SESSION_CREDENTIAL) {
      return verify();
    }
    return undefined;
  };
