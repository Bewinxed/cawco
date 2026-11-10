import { createHash } from "node:crypto";
import { passDomainRefusal } from "./pass-domain";
import { refusal } from "./refusal";

/**
 * `https://` (how the proxy in front of the names serves them, never how a
 * client reached the hub: the pass is a `Secure` cookie, which no browser
 * keeps from plain http, RFC 6265bis §5.7 step 13), then a host name whose
 * first label holds exactly one placeholder, `{session}` or `{port}`, with a
 * port after it or not. The first label: every name then stands under one
 * domain, the rest of the name, which the pass is set on. The characters
 * around the placeholder hold no brace, so a second one never fits.
 */
const PATTERN_SHAPE =
  /^https:\/\/([a-z0-9-]*)\{(session|port)\}([a-z0-9-]*\.([a-z0-9.-]+?))(:\d{1,5})?$/u;

const PATTERN_REFUSAL =
  "A host pattern is https:// and a host name whose first label holds one of {session} or {port}, like https://p-{session}.example.com or https://p-{port}.example.com, and a port after it or not.";

/**
 * Host mode's names, parsed once: what stands for a session in them, its id
 * (`{session}`) or the preview port it keeps (`{port}`), the host text
 * before and after it, and the domain they all stand under.
 */
export interface HostPattern {
  after: string;
  before: string;
  /** The domain every name stands under: its pass's `Domain` (core `hostModeDomain`). */
  domain: string;
  key: "session" | "port";
  /** A Host header's name for one session: the placeholder's value at group 1. */
  shape: RegExp;
}

/** One DNS label: what a `{session}` name's placeholder holds ({@link labelOf}). */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const VALUE_OF = {
  // Any origin's label (labelOf): a session's, a project's, an embed's.
  session: "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?",
  port: "\\d{1,5}",
} as const;

/**
 * The label a `{session}` pattern names origin `key` by: the key itself
 * when it is a DNS label already (a session's id, `project-<uuid>`,
 * `embed-<uuid>`, a project id like `proj-00000-tde5z`), else `o-` and a
 * hash of it (a project id with capitals or `_`, or one longer than a
 * label holds), so every origin the hub hands out has a name, and each name
 * reads back to one origin (preview.ts `sessionOfHost`).
 */
export const labelOf = (key: string): string =>
  DNS_LABEL.test(key)
    ? key
    : `o-${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;

/**
 * `pattern` parsed, or its refusal in one sentence: one whose names stand under
 * a public suffix (`ts.net`, `pages.dev`, a bare `localhost`), or under an
 * ending the Public Suffix List doesn't know (`.localhost`, `.test`,
 * `.lan`), is refused, since no browser's frames would carry their pass
 * (hub pass-domain.ts).
 */
export const parsePattern = (pattern: string) => {
  const parts = pattern.match(PATTERN_SHAPE);
  if (!parts) {
    return refusal(422, "preview-pattern-unfit", PATTERN_REFUSAL);
  }
  const [, before = "", placeholder, name = "", domain = "", port = ""] = parts;
  const key: HostPattern["key"] = placeholder === "port" ? "port" : "session";
  const unpassed = passDomainRefusal(domain);
  if (unpassed?.kind === "public") {
    return refusal(
      422,
      "preview-pattern-public-suffix",
      `The pattern's names stand under ${domain}, a public suffix, where no browser keeps a cookie, so the hub can't give them a pass. Use names under a domain of your own, like https://p-{port}.previews.example.com, then save again.`
    );
  }
  if (unpassed) {
    return refusal(
      422,
      "preview-pattern-unregistered",
      `The pattern's names stand under ${domain}, whose ending .${unpassed.suffix} no public registry holds, so a browser takes each name for a site of its own and no frame of the dashboard carries their pass. Use names under a domain registered on the internet, like https://p-{port}.previews.example.com, then save again.`
    );
  }
  const after = `${name}${port}`;
  // The Host header names the port only when it is not the scheme's own.
  const parsed: HostPattern = {
    before,
    key,
    after,
    domain,
    shape: new RegExp(
      `^${literal(before)}(${VALUE_OF[key]})(?:${literal(after)}|${literal(name)})$`,
      "iu"
    ),
  };
  return parsed;
};

/** The host name `pattern` gives a session whose placeholder value is `value` (`name[:port]`). */
export const hostFor = (pattern: HostPattern, value: string | number): string =>
  `${pattern.before}${value}${pattern.after}`;

/** The whole origin `pattern` gives that session. */
export const originFor = (
  pattern: HostPattern,
  value: string | number
): string => `https://${hostFor(pattern, value)}`;

export const PORT_SUFFIX = /:\d+$/u;

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

/** `text` as a regular expression that matches it alone. */
const literal = (text: string): string =>
  text.replaceAll(REGEX_SPECIAL, "\\$&");
