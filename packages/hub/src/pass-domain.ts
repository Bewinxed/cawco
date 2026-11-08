/**
 * Whether host mode's pass (core frames.ts `PREVIEW_PASS_COOKIE`), a cookie
 * set on `domain`, reaches every name under it from a dashboard under it:
 *
 * - **public**: `domain` is a public suffix (or an address). A browser
 *   ignores a cookie whose `Domain` is one ("If the user agent is configured
 *   to reject "public suffixes" and the domain-attribute is a public suffix:
 *   … ignore the cookie entirely", RFC 6265bis §5.7 step 9). The Public
 *   Suffix List says which, its private section included (`ts.net`,
 *   `pages.dev`), and a name of one label is one (the list's `*` rule).
 * - **unknown**: `domain` stands under an ending the list doesn't know
 *   (`.localhost`, `.test`, `.lan`, `.internal`): only that `*` rule makes
 *   it a domain. Chromium takes a name under no known registry for a site of
 *   its own, so the dashboard and each preview frame are cross-site and no
 *   `SameSite=Lax` pass rides a frame (seen on Chromium: a
 *   `Domain=cawco.localhost` cookie kept, and sent to no frame of a sibling
 *   name).
 *
 * Null: `domain` is a registrable domain under a known ending, or a name
 * under one.
 */
import { parse } from "tldts";

export type PassDomainRefusal =
  { kind: "public" } | { kind: "unknown"; suffix: string };

export const passDomainRefusal = (domain: string): PassDomainRefusal | null => {
  const parsed = parse(domain, { allowPrivateDomains: true });
  if (parsed.domain === null) {
    return { kind: "public" };
  }
  return parsed.isIcann || parsed.isPrivate
    ? null
    : { kind: "unknown", suffix: parsed.publicSuffix ?? domain };
};
