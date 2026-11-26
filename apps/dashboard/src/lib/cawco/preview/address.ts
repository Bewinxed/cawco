/**
 * Where a browser is, as its address shows it (BrowserAddress): the place
 * a person reads first is the site, its registrable domain, so that part is
 * never cut; what comes before it (a preview's long subdomain) gives way
 * first, from its end. A secure page's scheme is the norm and goes unsaid;
 * any other scheme is said, since it is the exception a person should see.
 */

import { registrableDomain } from "@cawco/core/registrable-domain";

/** An origin as the address draws it. */
export interface Place {
  /** The registrable domain and its port (`northwind.dev`, `localhost:5173`), whole. */
  domain: string;
  /** What stands before the domain (`pr-2417.staging.`), cut first; empty for a bare domain. */
  lead: string;
  /** The scheme where it is not https (`http://`), else empty. */
  scheme: string;
}

const IP = /^[\d.]+$|^\[/u;

/** The place an origin names; an origin that does not parse is its words whole. */
export function placeOf(origin: string): Place {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return { scheme: "", lead: "", domain: origin };
  }
  const scheme = url.protocol === "https:" ? "" : `${url.protocol}//`;
  const port = url.port ? `:${url.port}` : "";
  const host = url.hostname;
  const domain = IP.test(host) ? null : registrableDomain(host);
  if (!domain || domain === host) {
    return { scheme, lead: "", domain: `${host}${port}` };
  }
  return {
    scheme,
    lead: host.slice(0, host.length - domain.length),
    domain: `${domain}${port}`,
  };
}
