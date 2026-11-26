import { getDomain, parse } from "tldts";

/**
 * Where a name's registrable domain begins, by the Public Suffix List
 * (publicsuffix.org, read through tldts): `outpost.bewinxed.com` is
 * `bewinxed.com`, `relay.northwind.co.uk` is `northwind.co.uk`, and
 * `foo.s3.amazonaws.com` is `foo.s3.amazonaws.com`, a private suffix's
 * own. Null for an address or a name under no public suffix (localhost, a
 * .local name).
 */
export const registrableDomain = (host: string): string | null =>
  getDomain(host);

/** Whether `name` is a registrable domain under an ICANN suffix (`example.com`, `example.co.uk`), not an unknown one. */
export const isRegistrableDomain = (name: string): boolean => {
  const read = parse(name);
  return read.isIcann === true && read.domain === name;
};
