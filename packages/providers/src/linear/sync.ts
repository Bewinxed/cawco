/**
 * Linear as a project's tracker (provider spec §2.3 `Sync`, hub sync.ts):
 * one team's states, an issue of it read now, the key a URL's issue goes by
 * there, and the teams a connection reaches. What changed on the team comes
 * through the door from Linear's poll (linear/ingest.ts); its writes are
 * linear/writes.ts's.
 *
 * - **Queries.** Written for what the sync reads, through the SDK's own
 *   client and its error parsing: "it's always recommended to write your own
 *   custom GraphQL queries and use filters to narrow down the data as much
 *   as possible" (linear.app/developers/rate-limiting).
 * - **States** are the team's workflow states with their categories; a new
 *   issue with no state goes to "the team's first state in the Backlog
 *   workflow state category", so the sync always names one.
 */
import { Effect } from "effect";
import type { IssueState, StateType, Sync, SyncTarget } from "../provider";
import { type ProviderFailure, refusedWith } from "../read-stop";
import { linkOfUrl } from "../registry";
import type { LinearClientFor } from "./client";
import {
  LINEAR_ISSUE_FIELDS,
  type LinearPage,
  type LinearRawIssue,
  linearAsk,
  linearIssueRevision,
  wholeIssue,
} from "./ingest";

const TEAM_QUERY = `query CawcoTeam($id: String!) {
  team(id: $id) {
    id
    key
    name
    states(first: 100) { nodes { id name type position } pageInfo { hasNextPage endCursor } }
  }
  organization { urlKey }
}`;

const STATES_MORE_QUERY = `query CawcoStates($id: String!, $after: String) {
  team(id: $id) {
    states(first: 100, after: $after) { nodes { id name type position } pageInfo { hasNextPage endCursor } }
  }
}`;

const TEAMS_QUERY = `query CawcoTeams($after: String) {
  teams(first: 100, after: $after) { nodes { id key name } pageInfo { hasNextPage endCursor } }
  organization { urlKey }
}`;

const ISSUE_QUERY = `query CawcoIssue($id: String!) {
  issue(id: $id) { ${LINEAR_ISSUE_FIELDS} team { id } }
}`;

type RawState = LinearRawIssue["state"] & { position: number };

const TYPES: readonly StateType[] = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
];

/** A Linear state as the sync names it: a category Linear adds later reads as started, open and never closed. */
const stateOf = (raw: LinearRawIssue["state"]): IssueState => ({
  token: raw.id,
  name: raw.name,
  type: TYPES.find((type) => type === raw.type) ?? "started",
});

/** The nodes of a connection past its first page: each next page asked with the cursor the last one ended at. */
export const restOf = Effect.fnUntraced(function* <N>(
  first: LinearPage<N>,
  more: (after: string) => Effect.Effect<LinearPage<N>, ProviderFailure>
) {
  const nodes = [...first.nodes];
  let { pageInfo } = first;
  while (pageInfo.hasNextPage && pageInfo.endCursor) {
    const next = yield* more(pageInfo.endCursor);
    nodes.push(...next.nodes);
    ({ pageInfo } = next);
  }
  return nodes;
});

/** A team, its every state, and its workspace's URL key. */
const teamOf = Effect.fnUntraced(function* (
  client: LinearClientFor,
  teamId: string,
  requestMs: number
) {
  const data = yield* linearAsk<{
    organization: { urlKey: string };
    team: {
      id: string;
      key: string;
      name: string;
      states: LinearPage<RawState>;
    } | null;
  }>(client, requestMs, "read the team", TEAM_QUERY, { id: teamId });
  const { team } = data;
  if (!team) {
    return yield* refusedWith(
      `Linear has no team ${teamId} the connection can see.`,
      "scope"
    );
  }
  const states = yield* restOf(team.states, (after) =>
    linearAsk<{ team: { states: LinearPage<RawState> } | null }>(
      client,
      requestMs,
      "read the team",
      STATES_MORE_QUERY,
      { id: teamId, after }
    ).pipe(
      Effect.map(
        (more) =>
          more.team?.states ?? { nodes: [], pageInfo: { hasNextPage: false } }
      )
    )
  );
  return { ...team, states, urlKey: data.organization.urlKey };
});

/** One issue of the team, with all its labels; null when it is gone, or on another team. */
const issueOf = Effect.fnUntraced(function* (
  client: LinearClientFor,
  teamId: string,
  key: string,
  requestMs: number
) {
  const read = yield* linearAsk<{
    issue: (LinearRawIssue & { team: { id: string } }) | null;
  }>(client, requestMs, `read ${key}`, ISSUE_QUERY, { id: key }).pipe(
    // "Entity not found": deleted, or never one the connection can see.
    Effect.catchIf(
      (failure) =>
        failure._tag === "ProviderRefused" && failure.kind === "input",
      () => Effect.succeed({ issue: null })
    )
  );
  const { issue } = read;
  if (!issue || issue.team.id !== teamId) {
    return null;
  }
  return yield* wholeIssue(client, requestMs, issue);
});

export const linearSync: Sync<LinearClientFor> = {
  describe: (client, teamId, requestMs) =>
    teamOf(client, teamId, requestMs).pipe(
      Effect.map((team): SyncTarget => ({
        id: team.id,
        name: `${team.key} · ${team.name}`,
        url: `https://linear.app/${team.urlKey}/team/${team.key}`,
      }))
    ),

  states: (client, teamId, requestMs) =>
    teamOf(client, teamId, requestMs).pipe(
      Effect.map((team) =>
        team.states.toSorted((a, b) => a.position - b.position).map(stateOf)
      )
    ),

  issue: (client, teamId, key, requestMs) =>
    issueOf(client, teamId, key, requestMs).pipe(
      Effect.map((raw) => (raw && linearIssueRevision(raw)) ?? null)
    ),

  keyOf: (client, teamId, url, requestMs) => {
    const item = linkOfUrl(url);
    return item?.provider === "linear"
      ? issueOf(client, teamId, item.key, requestMs).pipe(
          Effect.map((raw) => raw?.id)
        )
      : Effect.succeed(undefined);
  },

  targets: (client, requestMs) => {
    interface Teams {
      organization: { urlKey: string };
      teams: LinearPage<{ id: string; key: string; name: string }>;
    }
    const askTeams = (after: string | null) =>
      linearAsk<Teams>(client, requestMs, "list its teams", TEAMS_QUERY, {
        after,
      });
    return Effect.gen(function* () {
      const data = yield* askTeams(null);
      const teams = yield* restOf(data.teams, (after) =>
        askTeams(after).pipe(Effect.map((more) => more.teams))
      );
      return {
        more: false,
        targets: teams.map((team) => ({
          id: team.id,
          name: `${team.key} · ${team.name}`,
          url: `https://linear.app/${data.organization.urlKey}/team/${team.key}`,
        })),
      };
    });
  },
};
