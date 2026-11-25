/**
 * Every provider's descriptor, by id and by host, and the one reader of an
 * outside item's URL over them: a task's `links:`, a comment's heading, a
 * wait on a pull request or an Actions run, and the tracker sync's record
 * all read a URL here.
 */
import { gitea } from "./gitea/descriptor";
import { github } from "./github/descriptor";
import { gitlab } from "./gitlab/descriptor";
import { linear } from "./linear/descriptor";
import {
  type ItemRef,
  LINK_KINDS,
  type LinkKind,
  type ProviderDescriptor,
  type ProviderId,
} from "./provider";

const BY_ID: Readonly<Record<ProviderId, ProviderDescriptor>> = {
  github,
  linear,
  gitlab,
  gitea,
};

/**
 * The providers whose items a task links. GitLab's and Gitea's join with
 * their own slice (the provider spec's build order, step 8), which is new
 * behaviour and waits for the owner's go.
 */
const LINKED: ReadonlySet<ProviderId> = new Set(["github", "linear"]);

const BY_HOST: ReadonlyMap<string, ProviderDescriptor> = new Map(
  Object.values(BY_ID).flatMap((descriptor) =>
    descriptor.hosts.map((host) => [host, descriptor] as const)
  )
);

/** The scheme and the authority as written, before the URL parser drops a default port or a user. */
const AUTHORITY = /^https?:\/\/([^/?#]*)/iu;
/** What the URL parser deletes from anywhere in a URL (url.spec.whatwg.org, "basic URL parser"), so a URL holding one reads as written only by refusing it. */
const STRIPPED = /[\t\n\r]/u;

/** A URL as the platform parses it; null for none. `URL.parse` is not in the phone app's WebKit before iOS 18. */
const parsedUrl = (written: string): URL | null => {
  try {
    return new URL(written);
  } catch {
    // The parser's TypeError says only that this is no URL, which null says.
    return null;
  }
};

/** A URL its descriptor reads: http or https, its authority its host alone, written as the descriptor's host. */
const located = (
  url: string
): { descriptor: ProviderDescriptor; parsed: URL } | undefined => {
  const written = url.trim();
  const authority = AUTHORITY.exec(written)?.[1];
  const parsed =
    authority && !STRIPPED.test(written) ? parsedUrl(written) : null;
  if (!parsed || authority?.toLowerCase() !== parsed.host) {
    return;
  }
  const descriptor = BY_HOST.get(parsed.host);
  return descriptor && LINKED.has(descriptor.id)
    ? { descriptor, parsed }
    : undefined;
};

/** The one parser of an outside item's URL, with or without a comment's anchor or a trailing path; undefined for any other URL. */
export const itemOfUrl = (url: string): ItemRef | undefined => {
  const found = located(url);
  return found?.descriptor.itemOfUrl(found.parsed);
};

const LINK_KIND_SET: ReadonlySet<string> = new Set(LINK_KINDS);

const isLink = (item: ItemRef): item is ItemRef & { kind: LinkKind } =>
  LINK_KIND_SET.has(item.kind);

/** An item a task links (an issue, pull request or discussion), by its URL; undefined for any other URL, an Actions run's included. */
export const linkOfUrl = (
  url: string
): (ItemRef & { kind: LinkKind }) | undefined => {
  const item = itemOfUrl(url);
  return item && isLink(item) ? item : undefined;
};

/** A comment's own id on its service, read off its URL's anchor; undefined when the URL names no comment on a linked item. */
export const commentOfUrl = (url: string): string | undefined => {
  const found = located(url);
  const item = found?.descriptor.itemOfUrl(found.parsed);
  return found && item && isLink(item)
    ? found.descriptor.commentOfUrl(found.parsed)
    : undefined;
};

const DIGITS = /^\d+$/u;

/** An item's number: GitHub's, GitLab's and Gitea's; null where the service keys it by a name (Linear's `ENG-123`). */
export const numberOf = (item: ItemRef): number | null =>
  DIGITS.test(item.key) ? Number(item.key) : null;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** git's scp-like form, `[user@]host:path`, no slash before the colon (git-scm.com/docs/git-clone, "GIT URLS"). */
const SCP_LIKE = /^(?:[^@/\s]+@)?([^/:\s]+):(.+)$/u;
const EDGE_SLASHES = /^\/+|\/+$/gu;
const DOT_GIT = /\.git$/iu;

/**
 * Where a repository is, from its git URL or `host/path`: its host with its
 * port, which is how gh, glab and tea name a self-hosted forge's login
 * (`gitea.local:3000`), and its path, `.git` and edge slashes off.
 * Undefined for what names no host and path.
 */
export const repoAt = (
  raw: string
): { host: string; path: string } | undefined => {
  const text = raw.trim();
  let host = "";
  let path = "";
  if (SCHEME.test(text)) {
    const parsed = parsedUrl(text);
    if (!parsed) {
      return;
    }
    ({ host } = parsed);
    path = decodeURIComponent(parsed.pathname);
  } else {
    const scp = SCP_LIKE.exec(text);
    if (scp) {
      [, host = "", path = ""] = scp;
    } else {
      const at = text.indexOf("/");
      host = text.slice(0, at);
      path = text.slice(at + 1);
    }
  }
  path = path.replace(EDGE_SLASHES, "").replace(DOT_GIT, "");
  return host && path.includes("/")
    ? { host: host.toLowerCase(), path }
    : undefined;
};
