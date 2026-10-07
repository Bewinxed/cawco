/**
 * The fleet's two onboarding choices (Projects spec §5.2, §5.6):
 *
 * - **delegates**: use CawCo's delegates instead of each harness's own
 *   subagents — kept on the denied-tools baseline
 *   (`supervisor_config.denied_tools`): Claude Code's `Task`/`Agent`,
 *   OpenCode's `task`.
 * - **todos**: use CawCo's to-dos instead of each harness's own list — its
 *   own flag (`supervisor_config.cawco_todos`), never names in the baseline.
 *   On, every session is denied at spawn Claude Code's
 *   `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`, OpenCode's
 *   `todowrite`/`todoread`, and each one's built-in plan mode (Claude Code's
 *   `EnterPlanMode`/`ExitPlanMode`, OpenCode's `plan_enter`/`plan_exit`,
 *   and its `plan` agent), which the session's spec replaces; a delegate
 *   type can turn it on for its own sessions (`cawcoTodos`). pi has neither,
 *   so neither choice changes it.
 *
 * Names are Claude Code's, the list every daemon already writes into
 * `~/.claude/settings.json` (Claude Code refuses a rule whose tool name is
 * lowercase); the OpenCode adapter reads each name as its OpenCode tool
 * (`opencodeToolsFor`). The answer spells out what each harness is denied
 * for each choice.
 */
import { NATIVE_TOOLS } from "@cawco/core";
import { Elysia, t } from "elysia";

/**
 * The baseline before anyone set it: the agent's compiled default
 * (`DENIED_WEB_TOOLS` and `DENIED_NATIVE_SUBAGENT_TOOLS`), which the
 * migration seeded too.
 */
export const DEFAULT_DENIED_TOOLS: readonly string[] = [
  "WebSearch",
  "WebFetch",
  "Task",
  "Agent",
];

/** What `GET /api/fleet/choices` answers. */
export interface FleetChoices {
  /** Use delegates instead of each harness's subagents. */
  delegates: boolean;
  /** The baseline as stored, the delegates choice and every other denial in it. */
  deniedTools: string[];
  /** Use CawCo's to-dos instead of each harness's own list and plan mode. */
  todos: boolean;
  /** What each choice denies, per harness. */
  tools: Record<"delegates" | "todos", Record<string, readonly string[]>>;
}

/** What the fleet's choices are stored as. */
export interface StoredChoices {
  /** "CawCo's to-dos". */
  cawcoTodos: boolean;
  /** The baseline; null before anyone set it. */
  deniedTools: string[] | null;
}

/** The baseline with "delegates" turned on or off; every other name stays where it was. */
const withDelegates = (list: readonly string[], on: boolean): string[] => {
  const names = NATIVE_TOOLS.subagents;
  if (on) {
    return [...list, ...names.claude.filter((name) => !list.includes(name))];
  }
  const off = new Set<string>([...names.claude, ...names.opencode]);
  return list.filter((name) => !off.has(name));
};

export const readChoices = ({
  deniedTools,
  cawcoTodos,
}: StoredChoices): FleetChoices => {
  const list = [...(deniedTools ?? DEFAULT_DENIED_TOOLS)];
  return {
    delegates: NATIVE_TOOLS.subagents.claude.every((name) =>
      list.includes(name)
    ),
    todos: cawcoTodos,
    deniedTools: list,
    tools: { delegates: NATIVE_TOOLS.subagents, todos: NATIVE_TOOLS.todos },
  };
};

/**
 * `GET /api/fleet/choices` and `PUT /api/fleet/choices`. A PUT names the
 * choices it changes; they are stored and every machine is sent them
 * (`synced`), so the next session on each starts under them and each
 * machine's own harness config follows at once.
 */
export const fleetChoicesRoutes = (deps: {
  read: () => StoredChoices;
  write: (choices: { deniedTools?: string[]; cawcoTodos?: boolean }) => void;
  synced: () => void;
}) =>
  new Elysia()
    .get("/api/fleet/choices", () => readChoices(deps.read()))
    .put(
      "/api/fleet/choices",
      {
        body: t.Object({
          delegates: t.Optional(t.Boolean()),
          todos: t.Optional(t.Boolean()),
        }),
      },
      ({ body }) => {
        const stored = deps.read();
        deps.write({
          ...(body.delegates === undefined
            ? {}
            : {
                deniedTools: withDelegates(
                  stored.deniedTools ?? DEFAULT_DENIED_TOOLS,
                  body.delegates
                ),
              }),
          ...(body.todos === undefined ? {} : { cawcoTodos: body.todos }),
        });
        deps.synced();
        return readChoices(deps.read());
      }
    );
