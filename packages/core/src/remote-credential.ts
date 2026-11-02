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

/** A credential part shorter than this is no secret to hunt for in free text (a username like `git`). */
const SECRET_MIN = 8;

/**
 * `text` (git's words, a sentence) with remote `remote`'s credential taken
 * out wherever it appears: the URL as given becomes the URL without it, its
 * userinfo before an `@` goes, raw or decoded, and any part of it long
 * enough to be a secret (a token) becomes `***`. Text about a remote that
 * carries no credential is as it was.
 */
export const withoutRemoteCredential = (
  text: string,
  remote: string
): string => {
  const given = remote.trim();
  const { url, basic } = remoteWithoutCredential(given);
  if (!basic) {
    return text;
  }
  const { username, password } = new URL(given);
  const decoded = Buffer.from(basic, "base64").toString();
  let said = text.replaceAll(given, url);
  for (const userinfo of [
    `${username}${password ? `:${password}` : ""}@`,
    `${decoded}@`,
  ]) {
    said = said.replaceAll(userinfo, "");
  }
  for (const part of new Set([password, ...decoded.split(":")])) {
    if (part.length >= SECRET_MIN) {
      said = said.replaceAll(part, "***");
    }
  }
  return said;
};
