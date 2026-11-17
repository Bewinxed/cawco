import type { Control, ControlResult } from "@cawco/core/control-table";
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
 * the two methods; their arguments are the control table's (core
 * control-table.ts).
 */

/** What an install control names: the credential, or `undefined` for any other control. */
export const installOf = (control: Control): string | undefined =>
  control.method === INSTALL_SESSION_CREDENTIAL ? control.args[0] : undefined;

/** The launch's own credential, installed in the process it just started. */
export const installCredential = async (
  session: Pick<HarnessSession, "control">,
  credential: string
): Promise<void> => {
  await session.control({
    method: INSTALL_SESSION_CREDENTIAL,
    args: [credential, "initial"],
  });
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
  const held = await session.control({
    method: VERIFY_SESSION_CREDENTIAL,
    args: [],
  });
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
 * The session credential's controls, routed the same for every adapter: an
 * install names a credential (its schema refuses one that names none, core
 * control-args.ts) and says whether it is the launch's first (`initial`); a
 * verify proves the one the process already holds. `undefined` for any
 * other control, which is the adapter's own.
 */
export const credentialControls =
  (
    install: (
      credential: string,
      initial: boolean
    ) => Promise<ControlResult<typeof INSTALL_SESSION_CREDENTIAL>>,
    verify: () => Promise<unknown>
  ) =>
  (control: Control): Promise<unknown> | undefined => {
    if (control.method === INSTALL_SESSION_CREDENTIAL) {
      return install(control.args[0], control.args[1] === "initial");
    }
    return control.method === VERIFY_SESSION_CREDENTIAL ? verify() : undefined;
  };
