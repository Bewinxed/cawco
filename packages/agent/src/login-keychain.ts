/**
 * The Mac's login keychain: where it is, and whether it is locked, read with
 * no secret and no UI.
 *
 * The lock state comes from Security.framework's `SecKeychainGetStatus` on
 * the keychain `SecKeychainOpen` makes a reference to by path. Apple: "You can
 * use this function to determine if the keychain is unlocked, readable, or
 * writable" (developer.apple.com/documentation/security/seckeychaingetstatus(_:_:)),
 * and `SecKeychainOpen` only retrieves "a pointer to a keychain object given
 * the path of the keychain" (…/seckeychainopen(_:_:)). In Apple's source the
 * status is a query and nothing more: `KeychainImpl::status()` returns
 * `mDb->isLocked() ? 0 : kSecUnlockStateStatus | …`
 * (OSX/libsecurity_keychain/lib/Keychains.cpp), and `DbImpl::isLocked()` is
 * `CSSM_DL_PassThrough(…, CSSM_APPLECSPDL_DB_IS_LOCKED, …)`
 * (OSX/libsecurity_cdsa_client/lib/dlclient.cpp), github.com/apple-oss-distributions/Security.
 * No unlock is attempted, so no password dialog can rise.
 *
 * Both calls are synchronous round trips to securityd, so they run in a
 * process of their own ({@link LOCK_STATUS}), never on the agent's JS
 * thread: a securityd slow to answer under load held that thread, every
 * timer and socket of the agent with it (a 20 s `claude auth status` budget
 * let go after 50.6 s on the owner's Mac). The child is a child of the agent,
 * so it is in the agent's security session and reads the lock the agent's
 * own Claude Code would meet.
 *
 * `security find-generic-password` without `-w` cannot tell: an item's
 * attributes read while its keychain is locked, and only its secret needs
 * the unlock (measured on a locked scratch keychain: the read exited 0).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Gone } from "@cawco/core/bounded";
import { hostEnvironment } from "@cawco/core/session-env";
import { BUN_SCRIPT_ENV, bunScriptRuntime } from "./boundary";

/** This machine's login keychain, under HOME: the one `unlockKeychain` unlocks. */
export const loginKeychainPath = (): string =>
  join(homedir(), "Library", "Keychains", "login.keychain-db");

/**
 * The lock read, as a plain Bun script: prints `locked` or `unlocked` for the
 * keychain at `CAWCO_KEYCHAIN`, or exits 1 with the OSStatus that refused it.
 * `kSecUnlockStateStatus` (SecKeychain.h) is 1, the keychain unlocked;
 * `errSecNoSuchKeychain` (-25294) is no keychain at that path, which is not
 * locked: there is nothing there to unlock.
 */
const LOCK_STATUS = `const { dlopen, FFIType } = require("bun:ffi");
const path = process.env.CAWCO_KEYCHAIN;
const security = dlopen("/System/Library/Frameworks/Security.framework/Security", {
  SecKeychainOpen: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  SecKeychainGetStatus: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
});
const ref = new BigUint64Array(1);
const opened = security.symbols.SecKeychainOpen(Buffer.from(path + "\\0"), ref);
if (opened !== 0) {
  console.error("SecKeychainOpen(" + path + ") answered OSStatus " + opened + ".");
  process.exit(1);
}
const status = new Uint32Array(1);
const read = security.symbols.SecKeychainGetStatus(Number(ref[0]), status);
if (read === -25294) {
  console.log("unlocked");
} else if (read !== 0) {
  console.error("SecKeychainGetStatus(" + path + ") answered OSStatus " + read + ".");
  process.exit(1);
} else {
  console.log((status[0] & 1) === 0 ? "locked" : "unlocked");
}`;

/**
 * Whether the keychain at `path` is locked for this agent's security session,
 * read in a child process ({@link LOCK_STATUS}). `signal` ends the read: its
 * caller's deadline (core `readWithin`), which then answers it unanswered.
 * A child ended by a signal is {@link Gone}; any refusal throws with its
 * OSStatus. macOS only.
 */
export const keychainLocked = async (
  path: string,
  signal?: AbortSignal
): Promise<boolean> => {
  const child = Bun.spawn([bunScriptRuntime(), "-e", LOCK_STATUS], {
    env: { ...hostEnvironment(), ...BUN_SCRIPT_ENV, CAWCO_KEYCHAIN: path },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    ...(signal ? { signal } : {}),
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (child.signalCode !== null) {
    throw new Gone(`the lock read of ${path} (${child.signalCode})`);
  }
  const word = out.trim();
  if (child.exitCode === 0 && (word === "locked" || word === "unlocked")) {
    return word === "locked";
  }
  throw new Error(
    err.trim() ||
      `The lock read of ${path} exited ${child.exitCode} and said ${word || "nothing"}.`
  );
};
