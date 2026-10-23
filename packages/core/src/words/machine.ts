/**
 * What a machine's menu and its keychain unlock say, on the dashboard and
 * in the app (`Words.Machine`, CawCoCore/Words.generated.swift). The probe
 * kit finds them by these same words (scripts/probe-words-check.ts refuses
 * a copy).
 */
export const machineWords = {
  /** The menu's way to a Mac's login keychain, for an agent outside the desktop session. */
  unlockKeychain: "Unlock keychain…",
  /** The menu's pause, until a time picked. */
  pauseUntil: "Pause until…",
  copyMachineId: "Copy machine id",
  /** The unlock's field, and what it ended in. */
  loginPasswordFor: (host: string) => `Login password for ${host}`,
  unlocked: (host: string) => `${host} is unlocked`,
  cantReadLogins: (host: string) => `${host} cannot read its logins`,
};
