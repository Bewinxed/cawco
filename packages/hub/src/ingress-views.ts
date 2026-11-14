/**
 * A project's ingress as its routes and tools answer it (ingress.ts makes
 * it), and as the words that show it (presenters/project.ts) read it.
 */

import type { OfferedMode } from "@cawco/core/harness/kinds";
import type { GitHubCursors } from "./db/ingress";
import type { InboundVia } from "./db/schema";

/** The most a stored payload holds (ingress.ts). */
export const PAYLOAD_MAX = 64 * 1024;

export interface EventRouteView {
  author: string | null;
  branch: string | null;
  createdAt: number;
  createdBy: string;
  enabled: boolean;
  id: string;
  kinds: string[];
  label: string | null;
  /** When it last delivered an event to its routine; null when it never has. */
  lastDeliveryAt: number | null;
  /** The mode its event starts the project's conversation in when it has none; null: its routine's. */
  mode: OfferedMode | null;
  projectId: string;
  regex: string | null;
  routineId: string;
  source: string;
}

export interface ConnectorPollView {
  args: Record<string, unknown>;
  connection: string;
  createdAt: number;
  createdBy: string;
  enabled: boolean;
  id: string;
  idPath: string;
  intervalS: number;
  itemsPath: string;
  polledAt: number | null;
  projectId: string;
  reason: string | null;
  /** Items its last call saw; null until its first call. */
  seen: number | null;
  tool: string;
  versionPath: string;
}

export interface InboundEventView {
  event: unknown;
  handledAt: number | null;
  id: string;
  key: string;
  kind: string;
  receivedAt: number;
  routedTo: string | null;
  source: string;
  via: InboundVia;
}

/** What a project's ingress is: its GitHub poller, routes, connector polls and newest events. */
export interface IngressView {
  connectorPolls: ConnectorPollView[];
  events: InboundEventView[];
  github: {
    connection: string | null;
    polled: boolean;
    polledAt: number | null;
    /**
     * Read by nothing here: {@link repos} as one line, for the shipped apps
     * that show it (TestFlight builds before 2026-11-03); it goes once none
     * is installable.
     */
    repo: string | null;
    /** The GitHub repositories it polls, `owner/repo`: every one the project links. */
    repos: string[];
    /** Read by nothing: kept empty for the shipped apps that declare it; it goes with {@link repo}. */
    resources: GitHubCursors;
    resumeAt: number | null;
    /** What is true of it, in a sentence: polled, or why not. */
    state: string;
  };
  routes: EventRouteView[];
}
