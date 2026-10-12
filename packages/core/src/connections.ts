/**
 * Connections (Projects spec §3, §5.5): a signed-in outside service the hub
 * holds the key for. Each is one named row; two accounts of one service are
 * two rows (`x-brand`, `x-founder`). A session never holds a connection's
 * key: a delegate type (or a project) lists the connections its sessions may
 * use, and the hub calls their tools for them (`conn__<name>__<tool>`).
 */

/**
 * How the hub reaches the service's MCP server: `http` (Streamable HTTP),
 * `sse` (the older HTTP+SSE transport), or `stdio` (a command the hub runs on
 * its own machine).
 */
export const CONNECTION_TRANSPORTS = ["http", "sse", "stdio"] as const;
export type ConnectionTransport = (typeof CONNECTION_TRANSPORTS)[number];

/**
 * How the hub signs in: `none`; `bearer` (`Authorization: Bearer <key>`);
 * `header` (the key as the value of the header `header` names, or for
 * `stdio` the environment variable it names); `oauth` (the MCP authorization
 * flow, run and refreshed by the hub).
 */
export const CONNECTION_AUTHS = ["none", "bearer", "header", "oauth"] as const;
export type ConnectionAuth = (typeof CONNECTION_AUTHS)[number];

/** `signed-in`: its tools answer. `needs-sign-in`: a key or a sign-in is owed. `error`: `reason` says what failed. */
export type ConnectionState = "signed-in" | "needs-sign-in" | "error";

/** A connection as every route and tool answers it: never its key. */
export interface ConnectionView {
  /** Which account of the service it is, in the owner's words (`@brand`). */
  account: string;
  args?: string[];
  auth: ConnectionAuth;
  /** For `stdio`: the command the hub runs. */
  command?: string;
  createdAt: number;
  /** Whether a key or OAuth tokens are held for it. */
  hasSecret: boolean;
  /** For `header` auth: the header (or, for `stdio`, the environment variable) the key goes in. */
  header?: string;
  id: string;
  name: string;
  /** Projects whose every session may use it, beside the delegate types that list it. */
  projects: string[];
  /** Why it is in `error` or `needs-sign-in`; absent when signed in. */
  reason?: string;
  /** Free text: github, x, linear… */
  service: string;
  state: ConnectionState;
  /** Its tools' names, as the hub last listed them; absent before a first listing. */
  tools?: string[];
  transport: ConnectionTransport;
  updatedAt: number;
  /** For `http` and `sse`: the server's URL. */
  url?: string;
}
