/**
 * The bookkeeping every adapter keeps around a session's process the same
 * way: the session credential's two controls, and the sends handed to a
 * process that reads them by uuid. What differs per runtime stays with its
 * adapter: OpenCode admits sends through a queue of its own and pi's host
 * reads them oldest first, so neither keeps this ledger; each adapter says
 * its own background work, its own turn, and its own unknown verbs.
 */

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

/**
 * The sends handed to a session's process and not read yet, by uuid, for a
 * process that says which send it read: stopping the process before then
 * loses them, so a session holding any is not at rest ({@link held}).
 */
export class SessionLedger {
  readonly #unread = new Set<string>();

  /** How many sends are handed and not read yet. */
  get unread(): number {
    return this.#unread.size;
  }

  /** Send `uuid` is handed to the process. */
  handed(uuid: string): void {
    this.#unread.add(uuid);
  }

  /** Send `uuid` is read, withdrawn or refused: the process holds it no longer. */
  read(uuid: string): void {
    this.#unread.delete(uuid);
  }

  /** The process holds no send any more: it ended, or said it read them all. */
  readAll(): void {
    this.#unread.clear();
  }

  /** What the unread sends keep the session from, in `holding`'s words; nothing when none. */
  held(): string | undefined {
    return this.#unread.size > 0
      ? `it holds ${this.#unread.size} send(s) it has not read yet`
      : undefined;
  }
}
