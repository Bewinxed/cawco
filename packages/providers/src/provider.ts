/**
 * One provider per outside service (GitHub, Linear, GitLab, Gitea): what
 * each one is, said once. A descriptor is pure (no SDK), so the dashboard,
 * the hub and the agent all read it; registry.ts holds every descriptor.
 *
 * This package stands under core and imports no workspace package: core
 * reads its URLs and names its sources by these ids.
 */

/** Every provider, by id. A task's link, a comment's heading and a stored row name their source by one. */
export const PROVIDER_IDS = ["github", "linear", "gitlab", "gitea"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** What a task links on a service. */
export const LINK_KINDS = ["issue", "pr", "discussion"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** What a URL names on a service: a link's kind, or an Actions run a wait names. */
type ItemKind = LinkKind | "run";

/** One item, named without reading the service. */
export interface ItemRef {
  /** Where it lives, lower case: `owner/repo`, the Linear workspace, `group/sub/project`. */
  container: string;
  /** `github.com`, `linear.app`, `gitlab.example.com:8443`. */
  host: string;
  /** What the service's API takes: `12`, `ENG-123`, a run's id. */
  key: string;
  kind: ItemKind;
  provider: ProviderId;
  /** `#12`, `ENG-123`, `!7`, `run 7735`. */
  ref: string;
  /** The item's URL, without a comment's anchor or a trailing path. */
  url: string;
}

/** Pure: no SDK. The dashboard, the hub and the agent all read it. */
export interface ProviderDescriptor {
  /** A comment's own id, read off a URL's anchor; undefined when it names none. */
  commentOfUrl: (url: URL) => string | undefined;
  /** Hosts that are this provider's with no connection saying so: github.com, linear.app, gitlab.com. */
  hosts: readonly string[];
  id: ProviderId;
  /** The item a URL names, read off the URL alone. Its host was matched by the registry. */
  itemOfUrl: (url: URL) => ItemRef | undefined;
}
