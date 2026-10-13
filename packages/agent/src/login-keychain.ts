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
 * `security find-generic-password` without `-w` cannot tell: an item's
 * attributes read while its keychain is locked, and only its secret needs
 * the unlock (measured on a locked scratch keychain: the read exited 0).
 */
import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { homedir } from "node:os";
import { join } from "node:path";

/** `kSecUnlockStateStatus` (SecKeychain.h): the keychain is unlocked. */
const UNLOCK_STATE_STATUS = 1;
/** `errSecNoSuchKeychain`: there is no keychain at that path. */
const NO_SUCH_KEYCHAIN = -25_294;

/** This machine's login keychain, under HOME: the one `unlockKeychain` unlocks. */
export const loginKeychainPath = (): string =>
  join(homedir(), "Library", "Keychains", "login.keychain-db");

const openFrameworks = () => ({
  security: dlopen("/System/Library/Frameworks/Security.framework/Security", {
    SecKeychainOpen: {
      args: [FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    SecKeychainGetStatus: {
      args: [FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  }),
  coreFoundation: dlopen(
    "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
    { CFRelease: { args: [FFIType.ptr], returns: FFIType.void } }
  ),
});
let frameworks: ReturnType<typeof openFrameworks> | undefined;

/**
 * Whether the keychain at `path` is locked for this process's security
 * session. A path with no keychain is not locked: there is nothing there to
 * unlock. Any other refusal throws with its OSStatus. macOS only.
 */
export const keychainLocked = (path: string): boolean => {
  frameworks ??= openFrameworks();
  const { security, coreFoundation } = frameworks;
  const ref = new BigUint64Array(1);
  const opened = security.symbols.SecKeychainOpen(
    Buffer.from(`${path}\0`),
    ref
  );
  if (opened !== 0) {
    throw new Error(`SecKeychainOpen(${path}) answered OSStatus ${opened}.`);
  }
  const keychain = Number(ref[0]) as Pointer;
  try {
    const status = new Uint32Array(1);
    const read = security.symbols.SecKeychainGetStatus(keychain, status);
    if (read === NO_SUCH_KEYCHAIN) {
      return false;
    }
    if (read !== 0) {
      throw new Error(
        `SecKeychainGetStatus(${path}) answered OSStatus ${read}.`
      );
    }
    // biome-ignore lint/suspicious/noBitwiseOperators: SecKeychainStatus is a bit field
    return ((status[0] ?? 0) & UNLOCK_STATE_STATUS) === 0;
  } finally {
    coreFoundation.symbols.CFRelease(keychain);
  }
};
