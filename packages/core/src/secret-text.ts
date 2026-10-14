/**
 * What reads as a credential in a piece of text, wherever CawCo looks: a
 * memory note's words (hub memory.ts hides each one), and a file a place's
 * first commit would take (agent place-repo.ts leaves the file out). One
 * list, so both read a key the same way.
 */

/** Each credential's shape, global so a caller can replace every one, and what it is called. */
const CREDENTIALS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: "an API key", pattern: /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g },
  { kind: "a GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: "a GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { kind: "a Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "an AWS key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "a signed token", pattern: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g },
  {
    kind: "a private key",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  },
  {
    kind: "a password or token set to a value",
    pattern: /\b(?:password|passwd|secret|token|api[-_]?key)\s*[:=]\s*\S{6,}/gi,
  },
  { kind: "a bearer token", pattern: /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi },
];

/** Every credential's shape, global: what a caller replaces to hide them. */
export const CREDENTIAL_PATTERNS: readonly RegExp[] = CREDENTIALS.map(
  (each) => each.pattern
);

/**
 * What the first credential `text` holds is called ("an API key"), never
 * any of its characters; undefined when it holds none.
 */
export const credentialIn = (text: string): string | undefined => {
  for (const { kind, pattern } of CREDENTIALS) {
    pattern.lastIndex = 0;
    const found = pattern.test(text);
    pattern.lastIndex = 0;
    if (found) {
      return kind;
    }
  }
  return undefined;
};
