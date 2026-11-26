/**
 * What Connections' add form and its host share (ConnectionsSection,
 * AddConnectionForm, AppFields): a service and its ways, as core names
 * them, and a Linear app's draft before the hub holds it.
 */
import { CONNECTION_NAME_LENGTH } from "@cawco/core/delegate-types";
import type {
  ConnectionService,
  ConnectionWay,
} from "@cawco/core/words/connections";

/** One way the hub signs in to a service (core `ConnectionWay`). */
export type Way = ConnectionWay;
/** A service the page can start a connection to (core `CONNECTION_SERVICES`, where each one's sources are). */
export type Service = ConnectionService;

/** What a Linear app is set with, before the hub holds it. */
export interface AppDraft {
  clientId: string;
  clientSecret: string;
}

export const emptyApp = (): AppDraft => ({ clientId: "", clientSecret: "" });

const NOT_NAME = /[^a-z0-9]+/gu;
const EDGE_HYPHENS = /^-+|-+$/gu;
const TRAILING_HYPHENS = /-+$/u;

/** A connection's name from its service and the account's words: `github-brand`. */
export const nameFor = (service: string, account: string): string => {
  const words = account
    .toLowerCase()
    .replace(NOT_NAME, "-")
    .replace(EDGE_HYPHENS, "");
  // @limit measured: 24 leaves a connection's tools room under the 64-character tool name (connections.ts sessionToolName)
  return (words ? `${service}-${words}` : service)
    .slice(0, CONNECTION_NAME_LENGTH)
    .replace(TRAILING_HYPHENS, "");
};

/** A typed server address as the hub takes one: an http(s) URL, or none. */
export const serverUrl = (typed: string): string | undefined => {
  try {
    const url = new URL(typed.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    // Not a URL: no address the hub takes.
  }
};
