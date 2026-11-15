/**
 * What reads as a credential, in a field's name or in a value: the one
 * notion of it that a permission card (permission-presentation.ts) and the
 * fleet's connector reads (fleet-secrets.ts) share.
 */

/**
 * Credential names, each written as its segments run together in lower case
 * (`api_key`, `apiKey` and `X-API-Key` all read `apikey`). Taken from Sentry's
 * default scrubber denylist (sentry-python `scrubber.py` DEFAULT_DENYLIST,
 * "stolen from relay"), less its bare `auth` and `session`, which name ordinary
 * fields (`author`, `session_id`) far more often than they carry a credential.
 * Plurals are named here too, all but `tokens`, a count (`max_tokens`) far
 * more often than a credential.
 */
const SECRET_NAMES = new Set([
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "secret",
  "token",
  "credential",
  "credentials",
  "secrets",
  "passwords",
  "cookie",
  "cookies",
  "authorization",
  "bearer",
  "csrf",
  "xsrf",
  "apikey",
  "privatekey",
  "apikeys",
  "privatekeys",
  "csrftoken",
  "phpsessid",
]);

/** A name's segments, in lower case: camelCase, snake_case, kebab-case and UPPER_CASE split alike, the last capital of a run starting the word after it (`OAuth2Token` reads `o`, `auth`, `2`, `token`; `APIKey` reads `api`, `key`). */
const segmentsOf = (name: string): string[] =>
  (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/gu) ?? []).map((segment) =>
    segment.toLowerCase()
  );

/** The same name split at every change of case alone, so a run of capitals keeps its last one (`AUTHtoken` reads `auth`, `token`). */
const caseRunsOf = (name: string): string[] =>
  (name.match(/[A-Z]+|[a-z]+|\d+/gu) ?? []).map((segment) =>
    segment.toLowerCase()
  );

/** Whether one reading of a name has a credential name as a segment, or as two side by side read together. */
const namesSecret = (segments: string[]): boolean =>
  segments.some(
    (segment, at) =>
      SECRET_NAMES.has(segment) ||
      SECRET_NAMES.has(`${segment}${segments[at + 1] ?? ""}`)
  );

/**
 * A field whose name says it carries a credential: one of its segments, or
 * two side by side read together (`api` + `key`, `private` + `key`), is a
 * credential name. A name that only contains one (`author`, `max_tokens`,
 * `tokenizer`) is not. A capital run before a lower-case word reads two
 * ways, `APIKey` as `api` + `key` and `AUTHtoken` as `auth` + `token`, and
 * the name is a credential's when either reading says so.
 */
export const isSecretName = (name: string): boolean =>
  namesSecret(segmentsOf(name)) || namesSecret(caseRunsOf(name));

/** Read anywhere in a config name's letters run together, beside {@link SECRET_NAMES}: `X-Auth`, `SESSION`, `passwort`. */
const CONFIG_SECRET_FRAGMENTS = ["auth", "session", "passw"];
/** Read as a whole segment of a config name: `KEY`, `DEPLOY_KEYS`, `connect.sid`, `DB_PASS`. */
const CONFIG_SECRET_SEGMENTS = new Set(["key", "keys", "sid", "pass", "pwd"]);

/**
 * An MCP server's `env`, header or URL query value treated as secret by its
 * name alone. Wider than {@link isSecretName} on purpose: there a missed
 * secret is the harm, so a credential name anywhere in the name's letters
 * run together counts (`AUTHOR` too), as do the bare segments above. Every
 * name the old substring rule counted still counts: its words, less their
 * `-`/`_`, are each a fragment here or a segment (`^key$`).
 */
export const isSecretConfigName = (name: string): boolean => {
  const segments = segmentsOf(name);
  const joined = segments.join("");
  return (
    [...SECRET_NAMES, ...CONFIG_SECRET_FRAGMENTS].some((fragment) =>
      joined.includes(fragment)
    ) || segments.some((segment) => CONFIG_SECRET_SEGMENTS.has(segment))
  );
};

/** A value that reads as a credential whatever its field is called. */
const SECRET_VALUE = [
  /^(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/u,
  /^gh[pousr]_[A-Za-z0-9]{20,}/u,
  /^github_pat_[A-Za-z0-9_]{20,}/u,
  /^xox[abprs]-[A-Za-z0-9-]{10,}/u,
  /^AKIA[0-9A-Z]{16}$/u,
  /^eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/u,
  /^bearer\s+\S{8,}/iu,
];

export const looksSecret = (value: string): boolean =>
  SECRET_VALUE.some((pattern) => pattern.test(value.trim()));
