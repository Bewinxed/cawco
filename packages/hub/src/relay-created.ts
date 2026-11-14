/**
 * What creating a relay answers, as relay.ts makes it and the words that
 * show it (presenters/project.ts) read it.
 */

import type { RelayView } from "@cawco/core/relays";

/** What creating a relay answers: the relay, and the routes a conversation may propose for it. */
export interface RelayCreated {
  relay: RelayView;
  /** Event routes for the project's routines, to propose to the owner (event_route_create), never made here. */
  suggestedRoutes: {
    note: string;
    routines: { id: string; name: string }[];
    source: string;
  };
}
