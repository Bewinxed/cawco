/**
 * git-lfs as CawCo pins it: the filters, the endpoint a remote implies, and
 * the env-only config that holds git-lfs to one endpoint.
 */

/**
 * Large-file filters named in env-only config ({@link configEnv}), so a
 * snapshot's clean filter runs in a repository whose LFS hooks were never
 * installed.
 */
export const LFS_FILTERS: [string, string][] = [
  ["filter.lfs.clean", "git-lfs clean -- %f"],
  ["filter.lfs.smudge", "git-lfs smudge -- %f"],
  ["filter.lfs.process", "git-lfs filter-process"],
  ["filter.lfs.required", "true"],
];

/**
 * The LFS endpoint git-lfs derives from a clone URL: `<url>/info/lfs` for
 * one ending in `.git`, `<url>.git/info/lfs` otherwise
 * (lfsapi/endpoint_finder.go `NewEndpointFromCloneURL`).
 */
export const lfsEndpointOf = (repo: string): string => {
  const url = repo.replace(TRAILING_SLASH, "");
  return url.endsWith(".git") ? `${url}/info/lfs` : `${url}.git/info/lfs`;
};

const TRAILING_SLASH = /\/+$/u;

/** An LFS endpoint as two of them are compared: no trailing slash. */
export const sameEndpoint = (a: string, b: string): boolean =>
  a.replace(TRAILING_SLASH, "") === b.replace(TRAILING_SLASH, "");

/**
 * Where a project declared its large files live (hub `GET
 * /api/lfs/projects/:id`, its Large files setting): the LFS endpoint, and
 * the credential of the fleet connection it is bound to, as HTTP Basic.
 */
export interface DeclaredLfs {
  basic: string;
  endpoint: string;
}

/**
 * git-lfs held to `endpoint` alone, env-only, whatever a repository's
 * committed `.lfsconfig` names: `.lfsconfig` still permits `lfs.url`,
 * `lfs.pushurl`, `remote.<name>.lfsurl` and `lfs.<url>.access`, and
 * "Settings from Git configuration files override the `.lfsconfig` file"
 * (git-lfs-config(5)). `lfs.url` and `lfs.pushurl` come before every other
 * source of an endpoint (lfsapi/endpoint_finder.go `getEndpoint`). At that
 * endpoint, lock checks off, and, when `signed` (CawCo hands git-lfs the
 * endpoint's credential, or the host's own helpers answer for it), the
 * access mode as `basic`, so the credential goes up front: both at the
 * endpoint's own URL, so no more specific key in `.lfsconfig` outranks
 * them. Otherwise a 401 or a missing locks API has git-lfs persist what it
 * learned into the clone's own `.git/config` by lock-and-rename (`SetAccess`
 * is `gitConfig.SetLocal`; lockverifier.go `disableFor`). Unsigned, the
 * access is left alone: `basic` with no credential to give fails every
 * transfer ("credential fill errors", git-lfs 3.7.1).
 */
export const lfsPins = (
  endpoint: string,
  signed: boolean
): [string, string][] => [
  ["lfs.url", endpoint],
  ["lfs.pushurl", endpoint],
  [`lfs.${endpoint}.locksverify`, "false"],
  ...(signed
    ? ([[`lfs.${endpoint}.access`, "basic"]] satisfies [string, string][])
    : []),
];

/**
 * git-lfs held to a project's declared endpoint ({@link lfsPins}), its
 * connection's credential sent to that endpoint alone as an `Authorization`
 * header (`http.<endpoint>.extraHeader`, matched on whole path segments,
 * which git-lfs reads for its own requests, lfshttp/client.go): git's own
 * requests to the origin keep the origin's credential, though both be on one
 * host. A request that carries it asks no credential helper, and the host's
 * helpers for the endpoint's host are emptied (`helper =` resets the list,
 * git-config(1)) unless that host is the origin's (`originHost`), whose
 * credential git needs: nothing of the machine's own is asked, or handed
 * the credential to keep.
 */
export const declaredPins = (
  declared: DeclaredLfs,
  originHost: string | undefined
): [string, string][] => {
  const host = new URL(declared.endpoint).origin;
  return [
    ...lfsPins(declared.endpoint, true),
    [
      `http.${declared.endpoint}.extraHeader`,
      `Authorization: Basic ${declared.basic}`,
    ],
    ...(host === originHost
      ? []
      : ([[`credential.${host}.helper`, ""]] satisfies [string, string][])),
  ];
};

/** The origin (`scheme://host[:port]`) of a remote URL; undefined for one that is no URL (`git@host:…`). */
export const urlOrigin = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    // An scp-like remote is no URL, so it has no origin.
  }
};

/** An scp-like remote (`git@host:owner/repo.git`): user, host and path. */
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(.+)$/u;

const LEADING_SLASHES = /^\/+/u;

/**
 * The LFS endpoint git-lfs derives from `origin`: `<url>/info/lfs` for an
 * http(s) one; for an ssh one (`ssh://…`, `git@host:…`), the https URL of the
 * same host and path's (lfsapi/endpoint_finder.go `NewEndpointFromCloneURL`).
 */
export const originEndpoint = (origin: string): string => {
  if (urlOrigin(origin)?.startsWith("http")) {
    return lfsEndpointOf(origin);
  }
  const ssh = origin.startsWith("ssh://") ? new URL(origin) : undefined;
  const scp = ssh ? undefined : SCP_LIKE.exec(origin);
  const host = ssh?.hostname ?? scp?.[1] ?? "";
  const path = (ssh?.pathname ?? `/${scp?.[2] ?? ""}`).replace(
    LEADING_SLASHES,
    ""
  );
  return lfsEndpointOf(`https://${host}/${path}`);
};
