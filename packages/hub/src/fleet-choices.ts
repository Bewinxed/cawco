/**
 * The fleet's onboarding choices (Projects spec §5.2, §5.6):
 *
 * - **delegates**: use CawCo's delegates instead of each harness's own
 *   subagents — kept on the denied-tools baseline
 *   (`fleet_denied_tools`): Claude Code's `Task`/`Agent`,
 *   OpenCode's `subagent`.
 * - **todos**: use CawCo's to-dos instead of each harness's own list — its
 *   own flag (`supervisor_config.cawco_todos`), never names in the baseline.
 *   On, every session is denied at spawn Claude Code's
 *   `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` (OpenCode 2.0 has no list),
 *   and each one's built-in plan mode (Claude Code's
 *   `EnterPlanMode`/`ExitPlanMode`, OpenCode's `plan` agent), which the
 *   session's spec replaces; a delegate
 *   type can turn it on for its own sessions (`cawcoTodos`). pi has neither,
 *   so neither choice changes it.
 * - **upstream**: whether sessions may post to repositories that are not
 *   their project's (core upstream-guard.ts), where a project sets nothing
 *   (`upstream_settings`, upstream.ts): `off`, `ask` (each post waits for
 *   the person, upstream-asks.ts) or `on`. Asked once, on its own: never
 *   answered (null) is today's behaviour, sessions may, and the dashboard
 *   asks on its next load.
 *
 * - **relay**: the fleet's stream relay (stream-relay.ts), offered once on a
 *   new project's setup page as the card `fleet-relay` while the fleet has
 *   none and nobody has answered it (`supervisor_config.relay_asked_at`): one
 *   option per machine whose capability report holds a public address, and
 *   Later. Settings › Browsers is where it is finished.
 *
 * Names are Claude Code's, the list every daemon already writes into
 * `~/.claude/settings.json` (Claude Code refuses a rule whose tool name is
 * lowercase); the OpenCode adapter reads each name as its OpenCode tool
 * (`opencodeToolsFor`). The answer spells out what each harness is denied
 * for each choice.
 */
import type { ChoiceEntry } from "@cawco/core";
import { NATIVE_TOOLS } from "@cawco/core";
import {
  type RelayCandidate,
  STREAM_RELAY_WORDS,
} from "@cawco/core/stream-relay";
import type { UpstreamPosts } from "@cawco/core/upstream-guard";
import { Elysia, t } from "elysia";

/** The upstream choice's three answers, as a route takes one. */
export const UPSTREAM_POSTS_SCHEMA = t.Union([
  t.Literal("off"),
  t.Literal("ask"),
  t.Literal("on"),
]);

/** What `GET /api/fleet/choices` answers. */
export interface FleetChoices {
  /** Use delegates instead of each harness's subagents. */
  delegates: boolean;
  /** The baseline as stored, the delegates choice and every other denial in it. */
  deniedTools: string[];
  /** When someone last set the choices here (ms epoch); null while nobody has, so a new project's setup asks. */
  setAt: number | null;
  /** Use CawCo's to-dos instead of each harness's own list and plan mode. */
  todos: boolean;
  /** What each choice denies, per harness. */
  tools: Record<"delegates" | "todos", Record<string, readonly string[]>>;
  /** Sessions may post to other people's repositories; null while nobody has answered. */
  upstream: UpstreamPosts | null;
}

/** What the fleet's choices are stored as. */
export interface StoredChoices {
  /** "CawCo's to-dos". */
  cawcoTodos: boolean;
  /** When a PUT last set them; null while nobody has. */
  choicesSetAt: Date | null;
  /** The baseline. */
  deniedTools: string[];
  /** The upstream answer; null while nobody has given it. */
  upstreamPosts: UpstreamPosts | null;
}

/**
 * A change to the baseline (`fleet_denied_tools`): the names removed and
 * added; every other name stays where it was.
 */
export interface DeniedToolsChange {
  add: readonly string[];
  remove: readonly string[];
}

/** "Delegates" turned on or off: Claude Code's subagent tools added, or every harness's removed. */
const delegatesChange = (on: boolean): DeniedToolsChange => {
  const names = NATIVE_TOOLS.subagents;
  return on
    ? { add: names.claude, remove: [] }
    : { add: [], remove: [...names.claude, ...names.opencode] };
};

export const readChoices = ({
  deniedTools,
  cawcoTodos,
  choicesSetAt,
  upstreamPosts,
}: StoredChoices): FleetChoices => ({
  delegates: NATIVE_TOOLS.subagents.claude.every((name) =>
    deniedTools.includes(name)
  ),
  todos: cawcoTodos,
  setAt: choicesSetAt?.getTime() ?? null,
  deniedTools,
  tools: { delegates: NATIVE_TOOLS.subagents, todos: NATIVE_TOOLS.todos },
  upstream: upstreamPosts,
});

/** Where the fleet's choices are kept, and how every machine hears them. */
export interface FleetChoicesStore {
  read: () => StoredChoices;
  /** Keeps the upstream answer; every machine hears it with its next beat (upstream.ts). */
  setUpstream: (posts: UpstreamPosts) => void;
  synced: () => void;
  /** Stores the choices named, the baseline's change with them, in one transaction. */
  write: (choices: {
    denied?: DeniedToolsChange;
    cawcoTodos?: boolean;
    choicesSetAt: Date;
  }) => void;
}

/**
 * Sets the choices named, stores them and sends every machine them
 * (`synced`), so the next session on each starts under them and each
 * machine's own harness config follows at once: the PUT, and a new
 * project's setup page when the person sends it (setup.ts). The upstream
 * answer is kept on its own: naming only it leaves the other two unasked
 * where nobody set them.
 */
export const setFleetChoices = (
  store: FleetChoicesStore,
  choices: { delegates?: boolean; todos?: boolean; upstream?: UpstreamPosts }
): FleetChoices => {
  if (choices.upstream !== undefined) {
    store.setUpstream(choices.upstream);
  }
  if (choices.delegates === undefined && choices.todos === undefined) {
    return readChoices(store.read());
  }
  store.write({
    ...(choices.delegates === undefined
      ? {}
      : { denied: delegatesChange(choices.delegates) }),
    ...(choices.todos === undefined ? {} : { cawcoTodos: choices.todos }),
    choicesSetAt: new Date(),
  });
  store.synced();
  return readChoices(store.read());
};

/** `GET /api/fleet/choices` and `PUT /api/fleet/choices`; a PUT names the choices it changes. */
export const fleetChoicesRoutes = (store: FleetChoicesStore) =>
  new Elysia()
    .get("/api/fleet/choices", () => readChoices(store.read()))
    .put(
      "/api/fleet/choices",
      {
        body: t.Object({
          delegates: t.Optional(t.Boolean()),
          todos: t.Optional(t.Boolean()),
          upstream: t.Optional(UPSTREAM_POSTS_SCHEMA),
        }),
      },
      ({ body }) => setFleetChoices(store, body)
    );

/** The relay card's id, its Later option, a machine's option, and the DNS name field's id. */
export const RELAY_CARD = {
  id: "fleet-relay",
  later: "later",
  machine: (machineId: string) => `run:${machineId}`,
  hostname: "fleet-relay-hostname",
} as const;

const RUN = /^run:(.+)$/;

/**
 * The `fleet-relay` card, for Caw's setup page (setup.ts): the step's words
 * (core `STREAM_RELAY_WORDS`), an option per machine that could run it, and
 * Later; with no such machine, the line that says how to get one, and Later.
 */
export const relayCard = (candidates: readonly RelayCandidate[]): string => {
  const words = STREAM_RELAY_WORDS;
  const machines =
    candidates.length > 0
      ? `One option per machine, each labelled "${words.runHere}" beside the machine's name and its address in code type: ${candidates.map((one) => `${one.name} (\`${one.address}\`) as \`${RELAY_CARD.machine(one.machineId)}\``).join(", ")}; and \`${RELAY_CARD.later}\` labelled "${words.later}". Under the options a text field labelled "${words.hostnameLabel}", its hint "${words.hostnameHint}", stored with \`cawco.set("${RELAY_CARD.hostname}", <its text>)\` on every edit. Say on the card that picking a machine starts the relay there once the page is sent: ${words.startBody}`
      : `Say "${words.none}" and give one option, \`${RELAY_CARD.later}\` labelled "${words.later}".`;
  return `- \`${RELAY_CARD.id}\`: "${words.title}" — ${words.lead} ${machines} It is the fleet's, asked once, and Settings › Browsers is where it is finished: say so on the card.`;
};

/** What the person picked on the relay card: a machine (and the DNS name typed), Later, or nothing. */
export const relayPickOf = (
  state: Record<string, ChoiceEntry>
): { machineId: string; hostname?: string } | "later" | undefined => {
  const card: ChoiceEntry | undefined = state[RELAY_CARD.id];
  const [option] = card?.options ?? [];
  if (option === RELAY_CARD.later) {
    return "later";
  }
  const machineId = option ? RUN.exec(option)?.[1] : undefined;
  if (!machineId) {
    return;
  }
  const field: ChoiceEntry | undefined = state[RELAY_CARD.hostname];
  const typed = field?.value;
  const hostname = typeof typed === "string" ? typed.trim() : "";
  return hostname ? { machineId, hostname } : { machineId };
};
