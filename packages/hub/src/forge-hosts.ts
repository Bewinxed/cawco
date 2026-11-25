/**
 * Which forge, on which host, each hub connection reads (core
 * `connectionApi`): what the follow rule (db/watches.ts) and the poll
 * (clock.ts) read a connection by, and what makes a self-managed host's
 * URLs read as its provider's items (providers registry.ts `nameHosts`).
 *
 * Most connections name their host in what they hold (a GitLab server's URL,
 * gitea-mcp's `--host` argument). A `gitea` connection over HTTP does not:
 * its server says which Gitea it serves when asked (`get_me`, whose
 * `html_url` is on that Gitea), and the hub keeps what it said here,
 * learned by the poll loop ({@link learnHost}) at start and whenever the
 * connection's projects are written. Until then it follows nothing.
 */

import type { ConnectionView } from "@cawco/core/connections";
import {
  type ApiProvider,
  type ConnectionApi,
  connectionApi,
} from "@cawco/core/connections";
import { nameHosts } from "@cawco/providers/registry";

/** A forge a connection reads: its provider, its host as its URLs write it (port and all), and the origin its API answers at. */
export interface Forge {
  host: string;
  origin: string;
  provider: ApiProvider;
}

/** What of a connection names its forge. */
export type ForgeNamed = Pick<
  ConnectionView,
  "args" | "auth" | "name" | "service" | "transport" | "url"
>;

/** The origins `gitea` connections over HTTP said they serve, by connection name. */
const learned = new Map<string, string>();

/** The origin a `gitea` connection over HTTP serves, as its server said (`undefined`: forgotten, it said none). */
export const learnHost = (name: string, origin: string | undefined): void => {
  if (origin === undefined) {
    learned.delete(name);
    return;
  }
  learned.set(name, origin);
};

/** Whether a connection's forge is asked of its server, and not yet known. */
export const unlearned = (connection: ForgeNamed): boolean => {
  const api = connectionApi(connection);
  return api?.origin === null && !learned.has(connection.name);
};

/** The forge a connection reads; undefined for one that reads none, or a Gitea whose server has not said which. */
export const forgeOf = (connection: ForgeNamed): Forge | undefined => {
  const api: ConnectionApi | undefined = connectionApi(connection);
  if (!api) {
    return;
  }
  const origin = api.origin ?? learned.get(connection.name);
  if (!origin) {
    return;
  }
  return { provider: api.provider, origin, host: new URL(origin).host };
};

/** Two forges are one: one provider on one host. */
export const sameForge = (
  a: Pick<Forge, "host" | "provider">,
  b: Pick<Forge, "host" | "provider">
): boolean =>
  a.provider === b.provider && a.host.toLowerCase() === b.host.toLowerCase();

const PORT = /:\d+$/u;

/** A host without its port, lower case: what a project's link (`host/path`, core `repoIdentity`) names it by. */
export const hostnameOf = (host: string): string =>
  host.toLowerCase().replace(PORT, "");

/**
 * The self-managed hosts every connection names, and every GitLab or Gitea
 * watch is of, so their URLs read as their provider's items: a watch
 * carries a Gitea over HTTP's host across a restart, before its server is
 * asked again.
 */
export const nameConnectionHosts = (
  connections: readonly ForgeNamed[],
  watches: readonly { host: string; provider: string }[]
): void => {
  nameHosts([
    ...connections.flatMap((connection) => {
      const forge = forgeOf(connection);
      return forge && forge.provider !== "github"
        ? [{ host: forge.host, provider: forge.provider }]
        : [];
    }),
    ...watches.flatMap(({ host, provider }) => {
      if (provider === "gitlab" || provider === "gitea") {
        const named: { host: string; provider: "gitlab" | "gitea" } = {
          host,
          provider,
        };
        return [named];
      }
      return [];
    }),
  ]);
};
