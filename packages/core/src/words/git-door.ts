/**
 * What a workspace's git door says to git's stderr when it does not run
 * git against a remote (agent hub-git.ts). The app draws none of it.
 */
export const gitDoorWords = {
  /** The part naming the silent helper, which a probe reads. */
  helperSilent: (host: string, seconds: number) =>
    `this machine's git credential helper for ${host} gave no answer in ${seconds} s`,
  /**
   * The host's credential helper for `host` gave `url` no login within
   * `seconds` (agent hub-git.ts `withHostLogin`): stopped, and git refused.
   */
  credentialSilent: (url: string, host: string, seconds: number) =>
    `cawco: git did not run against ${url}: ${gitDoorWords.helperSilent(host, seconds)}, so it was stopped. It was waiting on a prompt nobody answered, such as a keychain's. Unlock the keychain or sign in at this machine, or store a login for ${host} in a helper there, then run the command again.`,
};
