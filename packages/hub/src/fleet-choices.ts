/**
 * The fleet's tool policy and its one onboarding offer (Projects spec §2,
 * §5.2):
 *
 * - **CawCo's tools over the harness's own**, a standing rule with no
 *   setting: every session is denied its harness's own subagents (core
 *   `SUBAGENTS_DENIED`: Claude Code's `Task`/`Agent`, OpenCode's `subagent`;
 *   pi has none), so work goes to CawCo's delegates; and its own list and
 *   plan mode (core `OWN_LIST_DENIED`), so a session's plan is CawCo's list.
 *   Both are added on every machine (agent denied-tools.ts), never stored in
 *   the baseline and never asked about.
 * - **The baseline** (`fleet_denied_tools`): any other denial the fleet
 *   keeps, which every machine hears through fleet sync.
 * - **relay**: the fleet's stream relay (stream-relay.ts) card and its pick,
 *   for the first-run row that offers it once a machine is online. Settings ›
 *   Browsers is where it is finished.
 *
 * Names are Claude Code's, the list every daemon already writes into
 * `~/.claude/settings.json` (Claude Code refuses a rule whose tool name is
 * lowercase); the OpenCode adapter reads each name as its OpenCode tool
 * (`opencodeToolsFor`).
 */
import type { ChoiceEntry } from "@cawco/core";
import { NATIVE_TOOLS } from "@cawco/core";
import { STREAM_RELAY_WORDS } from "@cawco/core/stream-relay";
import { Elysia } from "elysia";

/** What `GET /api/fleet/choices` answers. */
export interface FleetChoices {
  /**
   * Always true: every session uses CawCo's delegates over its harness's
   * subagents, the fleet's policy. Still sent, with `setAt` and
   * `tools.delegates`, because the apps on TestFlight 20261015 through
   * 20261018 decode them as required (hub openapi.ts's wire check); they go
   * in the change that expires those builds.
   */
  delegates: true;
  /** The baseline as stored: denials beyond the fixed policy. */
  deniedTools: string[];
  /** Always null: nothing about the fleet's tools is set. Kept as `delegates` is. */
  setAt: null;
  /** Always true: every session keeps CawCo's list. Kept as `delegates` is. */
  todos: true;
  /** What each fixed denial denies, per harness. */
  tools: Record<"delegates" | "todos", Record<string, readonly string[]>>;
}

/** `GET /api/fleet/choices`: the policy as it stands, `deniedTools` the stored baseline. */
export const fleetChoicesRoutes = (deniedTools: () => string[]) =>
  new Elysia().get("/api/fleet/choices", (): FleetChoices => ({
    delegates: true,
    deniedTools: deniedTools(),
    setAt: null,
    todos: true,
    tools: { delegates: NATIVE_TOOLS.subagents, todos: NATIVE_TOOLS.todos },
  }));

/** The relay card's id and its two options. */
const RELAY_CARD = {
  id: "fleet-relay",
  setUp: "set-up",
  later: "later",
} as const;

/**
 * The `fleet-relay` card, for the first-run row's relay step: the step's
 * lead (core `STREAM_RELAY_WORDS`), and two options, Set up the stream relay
 * and Later; Set up recommended when the person reached CawCo through a
 * domain, which carries pages and not streams.
 *
 * @public Kept for the first-run row's relay step, the build after the one
 * that took the card off the setup page.
 */
export const relayCard = (domain: string | null): string => {
  const words = STREAM_RELAY_WORDS;
  const lead = domain ? words.leadDomain(domain) : words.leadPlain;
  return `- \`${RELAY_CARD.id}\`: "${words.title}" — ${lead} Options \`${RELAY_CARD.setUp}\` labelled "${words.setUp}"${domain ? " (recommended)" : ""} and \`${RELAY_CARD.later}\` labelled "${words.later}". Say on the card that Set up opens a short guided set-up in Needs you, each step ticking by itself, and that Settings › Browsers is where it is finished and seen. It is the fleet's, asked once: say so on the card.`;
};

/**
 * What the person picked on the relay card: Set up, Later, or nothing.
 *
 * @public Kept for the first-run row's relay step, as {@link relayCard} is.
 */
export const relayPickOf = (
  state: Record<string, ChoiceEntry>
): "set-up" | "later" | undefined => {
  const card: ChoiceEntry | undefined = state[RELAY_CARD.id];
  const [option] = card?.options ?? [];
  if (option === RELAY_CARD.setUp || option === RELAY_CARD.later) {
    return option;
  }
};
