/**
 * A git remote's URL and the credential an http(s) URL may carry in its
 * userinfo (`https://user:token@host/…`): the one place CawCo takes it off,
 * for the agent's move (which hands it to git apart from the URL) and for
 * every text that names a remote to a person or an agent.
 */

/**
 * A remote's URL with any credential it carries taken off, and that
 * credential as HTTP Basic (base64 of `user:password`, decoded from the
 * URL's percent-encoding). Only http(s) URLs carry one: `ssh://git@…` and
 * `git@host:…` name an ssh login, not a secret, and stay as they are.
 */
export const remoteWithoutCredential = (
  remote: string
): { url: string; basic?: string } => {
  let parsed: URL;
  try {
    parsed = new URL(remote);
  } catch {
    return { url: remote };
  }
  if (!(
    (parsed.protocol === "https:" || parsed.protocol === "http:") &&
    (parsed.username || parsed.password)
  )) {
    return { url: remote };
  }
  const pair = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
  parsed.username = "";
  parsed.password = "";
  return {
    url: parsed.toString(),
    basic: Buffer.from(pair).toString("base64"),
  };
};
