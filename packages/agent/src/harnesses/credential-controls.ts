import type { Control } from "@cawco/core/control-table";
import {
  INSTALL_SESSION_CREDENTIAL,
  type SessionCredentialInstall,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core/harness";
import {
  type ControlHandlers,
  type HarnessSession,
  runControl,
} from "../harness";

/**
 * THE ONE OWNER OF THE SESSION CREDENTIAL'S CONTROLS: how an install and a
 * verify are said (as controls of {@link HarnessSession.controls}), read, and
 * answered. The supervisor says them ({@link installCredential},
 * {@link verifyHeldCredential}) and reads what an install from the hub names
 * ({@link installOf}); the pi host reads one the same way; each adapter
 * answers them ({@link credentialControls}). Nothing else in the agent names
 * the two methods; their arguments are the control table's (core
 * control-table.ts).
 */

/** What an install control names: the credential, or `undefined` for any other control. */
export const installOf = (control: Control): string | undefined =>
  control.method === INSTALL_SESSION_CREDENTIAL ? control.args[0] : undefined;

/** The launch's own credential, installed in the process it just started. */
export const installCredential = async (
  session: Pick<HarnessSession, "controls">,
  credential: string
): Promise<void> => {
  await runControl(session.controls, INSTALL_SESSION_CREDENTIAL, [
    credential,
    "initial",
  ]);
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
  session: Pick<HarnessSession, "controls">
): Promise<HeldCredential> => {
  const held = await runControl(
    session.controls,
    VERIFY_SESSION_CREDENTIAL,
    []
  );
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
 * The session credential's controls, the same for every adapter, which
 * spreads them into its session's controls: an install names a credential
 * (its schema refuses one that names none, core control-args.ts) and says
 * whether it is the launch's first (`initial`); a verify proves the one the
 * process already holds.
 */
export const credentialControls = (
  install: (
    credential: string,
    initial: boolean
  ) => Promise<SessionCredentialInstall>,
  verify: () => Promise<unknown>
): ControlHandlers<
  typeof INSTALL_SESSION_CREDENTIAL | typeof VERIFY_SESSION_CREDENTIAL
> => ({
  [INSTALL_SESSION_CREDENTIAL]: (credential, mode) =>
    install(credential, mode === "initial"),
  [VERIFY_SESSION_CREDENTIAL]: verify,
});
