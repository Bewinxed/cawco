import type {
  FleetAgent,
  FleetConfig,
  FleetSkillMeta,
  RuleRow,
  ToolPolicy,
  ToolSpec,
} from "@cawco/core";
import { getContext, setContext } from "svelte";
import type { DelegateTypesPayload } from "../delegate-types";
import type {
  FleetMemoryDocRow,
  FleetMemoryRow,
  FleetSnapshot,
} from "../fleet";
import type { HooksPayload } from "../hooks";
import type { RulesPayload } from "../rules";
import type { ToolsSnapshot } from "../tools";

/**
 * What the Configure area reads from the hub, held once for every section so
 * the rail's counts and the section on screen are the same numbers. Each part
 * loads on its own: a hub that refuses the rules still shows the hooks, and a
 * re-read that fails keeps the last good rows on screen under the error.
 *
 * Created by the /config layout and handed down through context — never a
 * module-level singleton, which the server render would share across requests.
 */
export class Slot<T> {
  value = $state<T | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);
  readonly #read: () => Promise<T>;
  readonly #what: string;

  constructor(what: string, reader: () => Promise<T>) {
    this.#what = what;
    this.#read = reader;
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.value = await this.#read();
      this.error = null;
    } catch (caught) {
      const said = caught instanceof Error ? caught.message : String(caught);
      this.error = `Could not read ${this.#what} — ${said}.`;
    } finally {
      this.loading = false;
    }
  }
}

export interface FleetState {
  agents: FleetAgent[];
  config: FleetConfig;
  memory: FleetMemoryRow | null;
  memoryDocs: FleetMemoryDocRow[];
  skills: FleetSkillMeta[];
}

export interface ToolsState {
  catalog: ToolSpec[];
  policies: ToolPolicy[];
}

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`the hub answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/** How long a saved row stays marked after the list comes back. */
const FLASH_MS = 700;

export class ConfigStore {
  readonly rules = new Slot("the rules", async () => {
    const payload = await read<RulesPayload>("/api/rules");
    return payload.rules ?? [];
  });
  readonly hooks = new Slot("the hooks", async () => {
    const payload = await read<HooksPayload>("/api/fleet/hooks");
    return payload.hooks ?? [];
  });
  readonly types = new Slot("the delegate types", async () => {
    const payload = await read<DelegateTypesPayload>("/api/delegate-types");
    return payload.types ?? [];
  });
  readonly fleet = new Slot(
    "the fleet's setup",
    async (): Promise<FleetState> => {
      const snapshot = await read<FleetSnapshot>("/api/fleet");
      return {
        config: snapshot.config,
        skills: snapshot.skills ?? [],
        agents: snapshot.agents ?? [],
        memory: snapshot.memory ?? null,
        memoryDocs: snapshot.memoryDocs ?? [],
      };
    }
  );
  readonly tools = new Slot(
    "the tool catalog",
    async (): Promise<ToolsState> => {
      const snapshot = await read<ToolsSnapshot>("/api/tools");
      return {
        catalog: snapshot.catalog ?? [],
        policies: snapshot.policies ?? [],
      };
    }
  );

  /** The row a save just returned to, marked once when the list renders. */
  flash = $state<string | null>(null);
  #flashTimer: ReturnType<typeof setTimeout> | undefined;

  async loadAll(): Promise<void> {
    await Promise.all([
      this.rules.load(),
      this.hooks.load(),
      this.types.load(),
      this.fleet.load(),
      this.tools.load(),
    ]);
  }

  /** Marks `key` for the one-shot highlight on the list it returns to. */
  mark(key: string): void {
    clearTimeout(this.#flashTimer);
    this.flash = key;
    this.#flashTimer = setTimeout(() => {
      this.flash = null;
    }, FLASH_MS);
  }
}

const KEY = Symbol("cawco.config");

export const provideConfig = (store: ConfigStore): ConfigStore =>
  setContext(KEY, store);

export const configStore = (): ConfigStore => getContext<ConfigStore>(KEY);

/** A rule as the list holds it: a freshly created one has caught nothing. */
export const withStats = (
  rule: Omit<RuleRow, "stats">,
  stats?: RuleRow["stats"]
): RuleRow => ({
  ...rule,
  stats: stats ?? {
    ruleId: rule.id,
    pending: 0,
    totalFires: 0,
    lastFiredAt: null,
  },
});

/** Replaces the row with the same key, or adds it at the top. */
export function upsert<T>(rows: T[], row: T, same: (a: T) => boolean): void {
  const at = rows.findIndex(same);
  if (at === -1) {
    rows.unshift(row);
  } else {
    rows[at] = row;
  }
}
