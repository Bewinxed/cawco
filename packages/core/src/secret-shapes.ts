/**
 * What reads as a credential, in a field's name or in a value: the one
 * notion of it that a permission card (permission-presentation.ts) and the
 * fleet's connector reads (fleet-secrets.ts) share.
 */

/** A field whose name says it carries a credential. */
export const SECRET_KEY =
  /secret|token|passw|api[-_]?key|apikey|auth|credential|cookie|private[-_]?key|^key$|bearer|session[-_]?id/iu;
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
