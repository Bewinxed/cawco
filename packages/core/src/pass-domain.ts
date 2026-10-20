/**
 * Whether a browser keeps a cookie set on `domain` (host mode's pass, core
 * frames.ts `PREVIEW_PASS_COOKIE`): a browser ignores one whose `Domain` is
 * a public suffix ("If the user agent is configured to reject "public
 * suffixes" and the domain-attribute is a public suffix: … ignore the cookie
 * entirely", RFC 6265bis §5.7 step 9), and a name is a public suffix when
 * the Public Suffix List says so, its private section included (`ts.net`,
 * `pages.dev`), or when it has a single label (the list's `*` rule). So the
 * domain has to be a registrable domain or a name under one: never a
 * suffix itself, and never an address.
 */
import { parse } from "tldts";

export const isPublicSuffix = (domain: string): boolean =>
  parse(domain, { allowPrivateDomains: true }).domain === null;
