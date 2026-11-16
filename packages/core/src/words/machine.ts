/**
 * What a machine's menu and its keychain unlock say, on the dashboard and
 * in the app (`Words.Machine`, CawCoCore/Words.generated.swift).
 */
export const machineWords = {
  /** A machine removed, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  notRemovedThen: "so the machine was not removed. Try again.",
  /** A machine's pause changed, refused by the hub (`hubRefusal`). */
  pauseNotChangedThen: "so the machine's pause did not change. Try again.",
  /** The menu's way to a Mac's login keychain, for an agent outside the desktop session. */
  unlockKeychain: "Unlock keychain…",
  /** The menu's pause, until a time picked. */
  pauseUntil: "Pause until…",
  copyMachineId: "Copy machine id",
  /** The unlock's field, and what it ended in. */
  loginPasswordFor: (host: string) => `Login password for ${host}`,
  unlocked: (host: string) => `${host} is unlocked`,
  cantReadLogins: (host: string) => `${host} cannot read its logins`,
  /** The keychain unlocked, and Claude there gave no word on its sign-in yet (core `MachineHarnessReport.auth`). */
  loginsUnsaid: (host: string) =>
    `${host}'s keychain is unlocked, and Claude there has not said yet whether it is signed in. Its row says once it does.`,
};
