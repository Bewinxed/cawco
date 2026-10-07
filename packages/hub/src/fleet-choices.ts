/**
 * The fleet's two onboarding choices (Projects spec §5.2, §5.6), both kept on
 * the fleet's denied-tools baseline (`supervisor_config.denied_tools`):
 *
 * - **delegates**: use CawCo's delegates instead of each harness's own
 *   subagents — deny Claude Code's `Task`/`Agent`, OpenCode's `task`.
 * - **todos**: use CawCo's to-dos instead of each harness's own list — deny
 *   Claude Code's `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`, OpenCode's
 *   `todowrite`/`todoread`, and each one's built-in plan mode (Claude Code's
 *   `EnterPlanMode`/`ExitPlanMode`, OpenCode's `plan_enter`/`plan_exit`),
 *   which the session's spec replaces. pi has neither, so neither choice
 *   changes it.
 *
 * The baseline is written in Claude Code's names, the list every daemon
 * already writes into `~/.claude/settings.json` (Claude Code refuses a rule
 * whose tool name is lowercase); the OpenCode adapter reads each name as its
 * OpenCode tool (`opencodeToolsFor`). The answer spells out what each harness
 * is denied for each choice.
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

export type FleetChoice = keyof typeof NATIVE_TOOLS;

/** What `GET /api/fleet/choices` answers. */
export interface FleetChoices {
  /** Use delegates instead of each harness's subagents. */
  delegates: boolean;
  /** The baseline as stored, every choice and every other denial in it. */
  deniedTools: string[];
  /** Use CawCo's to-dos instead of each harness's own list. */
  todos: boolean;
  /** What each choice denies, per harness. */
  tools: Record<"delegates" | "todos", Record<string, readonly string[]>>;
}

const KEYS: Record<"delegates" | "todos", FleetChoice> = {
  delegates: "subagents",
  todos: "todos",
};

/** Whether the baseline carries every one of a choice's Claude names. */
const isOn = (list: readonly string[], choice: FleetChoice): boolean =>
  NATIVE_TOOLS[choice].claude.every((name) => list.includes(name));

/** The baseline with a choice turned on or off; every other name stays where it was. */
export const withChoice = (
  list: readonly string[],
  choice: FleetChoice,
  on: boolean
): string[] => {
  const names = NATIVE_TOOLS[choice];
  if (on) {
    return [...list, ...names.claude.filter((name) => !list.includes(name))];
  }
  const off = new Set<string>([...names.claude, ...names.opencode]);
  return list.filter((name) => !off.has(name));
};

export const readChoices = (stored: readonly string[] | null): FleetChoices => {
  const list = [...(stored ?? DEFAULT_DENIED_TOOLS)];
  return {
    delegates: isOn(list, KEYS.delegates),
    todos: isOn(list, KEYS.todos),
    deniedTools: list,
    tools: {
      delegates: NATIVE_TOOLS[KEYS.delegates],
      todos: NATIVE_TOOLS[KEYS.todos],
    },
  };
};

/**
 * `GET /api/fleet/choices` and `PUT /api/fleet/choices`. A PUT names the
 * choices it changes; the new baseline is stored and every machine is sent
 * it (`synced`), so the next session on each starts under it.
 */
export const fleetChoicesRoutes = (deps: {
  read: () => string[] | null;
  write: (deniedTools: string[]) => void;
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
        let list: string[] = [...(deps.read() ?? DEFAULT_DENIED_TOOLS)];
        for (const key of ["delegates", "todos"] as const) {
          const on = body[key];
          if (on !== undefined) {
            list = withChoice(list, KEYS[key], on);
          }
        }
        deps.write(list);
        deps.synced();
        return readChoices(list);
      }
    );
