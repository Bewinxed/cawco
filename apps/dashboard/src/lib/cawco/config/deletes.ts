import type {
  FleetAgent,
  FleetMarketplace,
  FleetPlugin,
  FleetSkillMeta,
} from "@cawco/core/fleet";
import type { FleetMcpServerView } from "@cawco/core/fleet-secrets";
import type { RuleRow } from "@cawco/core/rules";
import { configureWords } from "@cawco/core/words/configure";
import { failureClause } from "#lib/platform/hub-read.js";
import { type DelegateType, removeDelegateType } from "../delegate-types";
import {
  type FleetMemoryDocRow,
  removeAgent,
  removeMarketplace,
  removeMcpServer,
  removeMemory,
  removeMemoryDoc,
  removePlugin,
  removeSkill,
} from "../fleet";
import { type FleetHook, removeHook } from "../hooks";
import { removeRule } from "../rules";
import { MAIN } from "./memory";
import { type ConfigStore, upsert } from "./store.svelte";
import { type Deleted, offerUndo } from "./undo";
import type { RowOf, TrashKind } from "./unrestored.svelte";

/**
 * Every config section's delete (JOURNEY.md Flow 5: "an undo affordance
 * after the fact rather than a confirm dialog before it"): one gesture,
 * nothing asked first. The hub moves the item into its trash, whole (hub
 * db/trash.ts); its row leaves the list; the toast's Undo has the hub put
 * it back, and its row stands again where it stood, marked (undo.ts); a
 * refused Undo is said on the section the row stood in.
 *
 * `leave` runs once the hub has taken it and before its row goes: an editor
 * goes back to its list there, so the row is seen leaving it. A refused
 * delete throws the hub's sentence and leaves the row standing.
 */
async function deleteRow<K extends TrashKind>(
  kind: K,
  store: ConfigStore,
  item: {
    /** Asks the hub to trash it. */
    remove: () => Promise<Deleted>;
    /** Takes its row off the list. */
    drop: () => void;
    /** Puts the row the hub restored back. */
    land: (row: RowOf<K>) => void;
    /** What the toast says, and what its Undo marks. */
    words: string;
    mark: string;
    /** Its name, and the list it stood in: where a refused Undo is said. */
    name: string;
    section: string;
  },
  leave?: () => Promise<unknown>
): Promise<void> {
  const deleted = await item.remove();
  await leave?.();
  item.drop();
  offerUndo(
    kind,
    `deleted:${item.mark}`,
    item.words,
    deleted,
    (row) => {
      item.land(row);
      store.mark(item.mark);
    },
    { section: item.section, name: item.name }
  );
}

/**
 * A delete the hub refused, in the error formula, said under the row that
 * stays (never a toast; DESIGN.md, The Work Outlives Its Surface Rule): the
 * refusal already says what did not happen and why ("Could not delete …"),
 * then what stands. The row's Try again is the way on.
 */
export const notDeleted = (name: string, error: unknown): string =>
  `${failureClause(error)}. ${name} stays as it was.`;

/** `row` in `list` where `at` stood (the end when it had no place), any stale copy of it gone. */
function putBack<T>(list: T[], row: T, at: number, same: (a: T) => boolean) {
  const rest = list.filter((other) => !same(other));
  rest.splice(at < 0 ? rest.length : Math.min(at, rest.length), 0, row);
  return rest;
}

export function deleteRule(
  store: ConfigStore,
  rule: Pick<RuleRow, "id" | "name">,
  leave?: () => Promise<unknown>
): Promise<void> {
  const at = (store.rules.value ?? []).findIndex((row) => row.id === rule.id);
  const same = (row: RuleRow) => row.id === rule.id;
  return deleteRow(
    "rule",
    store,
    {
      remove: () => removeRule(rule.id, rule.name),
      drop: () => {
        store.rules.value =
          store.rules.value?.filter((row) => !same(row)) ?? null;
      },
      land: (back) => {
        store.rules.value = putBack(store.rules.value ?? [], back, at, same);
      },
      words: configureWords.deleted(rule.name),
      mark: rule.id,
      name: rule.name,
      section: "/config/rules",
    },
    leave
  );
}

export function deleteHook(
  store: ConfigStore,
  hook: Pick<FleetHook, "id" | "name">,
  leave?: () => Promise<unknown>
): Promise<void> {
  const at = (store.hooks.value ?? []).findIndex((row) => row.id === hook.id);
  const same = (row: FleetHook) => row.id === hook.id;
  return deleteRow(
    "hook",
    store,
    {
      remove: () => removeHook(hook.id, hook.name),
      drop: () => {
        store.hooks.value =
          store.hooks.value?.filter((row) => !same(row)) ?? null;
      },
      land: (back) => {
        store.hooks.value = putBack(store.hooks.value ?? [], back, at, same);
      },
      words: configureWords.deleted(hook.name),
      mark: hook.id,
      name: hook.name,
      section: "/config/hooks",
    },
    leave
  );
}

export function deleteDelegateType(
  store: ConfigStore,
  name: string,
  leave?: () => Promise<unknown>
): Promise<void> {
  const at = (store.types.value ?? []).findIndex((row) => row.name === name);
  const same = (row: DelegateType) => row.name === name;
  return deleteRow(
    "delegateType",
    store,
    {
      remove: () => removeDelegateType(name),
      drop: () => {
        store.types.value =
          store.types.value?.filter((row) => !same(row)) ?? null;
      },
      land: (back) => {
        store.types.value = putBack(store.types.value ?? [], back, at, same);
      },
      words: configureWords.deleted(name),
      mark: name,
      name,
      section: "/config/delegate-types",
    },
    leave
  );
}

/**
 * A subagent: the fleet forgets it; the machines keep the file they were
 * given. Only the file at `agent.hash`: one that moved since is refused, and
 * the latest takes its row's place.
 */
export function deleteAgent(
  store: ConfigStore,
  agent: Pick<FleetAgent, "hash" | "name">,
  leave?: () => Promise<unknown>
): Promise<void> {
  const { name } = agent;
  const at = (store.fleet.value?.agents ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetAgent) => row.name === name;
  return deleteRow(
    "agent",
    store,
    {
      remove: async () => {
        const removed = await removeAgent(name, agent.hash);
        if (removed.ok) {
          return removed.done;
        }
        const fleet = store.fleet.value;
        if (fleet) {
          upsert(fleet.agents, removed.latest, same);
        }
        throw new Error(configureWords.changedSince(name));
      },
      drop: () => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.agents = fleet.agents.filter((row) => !same(row));
        }
      },
      land: (back) => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.agents = putBack(fleet.agents, back, at, same);
        }
      },
      words: configureWords.removed(name),
      mark: name,
      name,
      section: "/config/subagents",
    },
    leave
  );
}

/** An MCP server: off every machine at once; Undo brings it back signed in as it was. */
export function deleteMcpServer(
  store: ConfigStore,
  name: string,
  leave?: () => Promise<unknown>
): Promise<void> {
  const at = (store.fleet.value?.config.mcp ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetMcpServerView) => row.name === name;
  return deleteRow(
    "mcp",
    store,
    {
      remove: () => removeMcpServer(name),
      drop: () => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.config.mcp = fleet.config.mcp.filter((row) => !same(row));
        }
      },
      land: (back) => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.config.mcp = putBack(fleet.config.mcp, back, at, same);
        }
      },
      words: configureWords.removed(name),
      mark: name,
      name,
      section: "/config/mcp",
    },
    leave
  );
}

export function deleteSkill(store: ConfigStore, name: string): Promise<void> {
  const at = (store.fleet.value?.skills ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetSkillMeta) => row.name === name;
  return deleteRow("skill", store, {
    remove: () => removeSkill(name),
    drop: () => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.skills = fleet.skills.filter((row) => !same(row));
      }
    },
    land: (back) => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.skills = putBack(fleet.skills, back, at, same);
      }
    },
    words: configureWords.removed(name),
    mark: name,
    name,
    section: "/config/skills",
  });
}

export function deletePlugin(store: ConfigStore, id: string): Promise<void> {
  const at = (store.fleet.value?.config.plugins ?? []).findIndex(
    (row) => row.id === id
  );
  const same = (row: FleetPlugin) => row.id === id;
  return deleteRow("plugin", store, {
    remove: () => removePlugin(id),
    drop: () => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.config.plugins = fleet.config.plugins.filter((row) => !same(row));
      }
    },
    land: (back) => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.config.plugins = putBack(fleet.config.plugins, back, at, same);
      }
    },
    words: configureWords.removed(id),
    mark: id,
    name: id,
    section: "/config/skills",
  });
}

/** Unlinked from the fleet and every machine; plugins installed from it stay. */
export function deleteMarketplace(
  store: ConfigStore,
  name: string
): Promise<void> {
  const at = (store.fleet.value?.config.marketplaces ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetMarketplace) => row.name === name;
  return deleteRow("marketplace", store, {
    remove: () => removeMarketplace(name),
    drop: () => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.config.marketplaces = fleet.config.marketplaces.filter(
          (row) => !same(row)
        );
      }
    },
    land: (back) => {
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.config.marketplaces = putBack(
          fleet.config.marketplaces,
          back,
          at,
          same
        );
      }
    },
    words: configureWords.unlinked(name),
    mark: name,
    name,
    section: "/config/skills",
  });
}

/**
 * The main memory file (`MAIN`), which takes the documents it links with it
 * (a scoped one stays), or one document, its scope kept for its Undo.
 */
export function deleteMemory(
  store: ConfigStore,
  path: string,
  leave?: () => Promise<unknown>
): Promise<void> {
  if (path === MAIN) {
    return deleteRow(
      "memory",
      store,
      {
        remove: () => removeMemory(),
        drop: () => {
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.memory = null;
            fleet.memoryDocs = fleet.memoryDocs.filter((row) => row.scope);
          }
        },
        // The hub's whole set: the main file and every document as it stands.
        land: (back) => {
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.memory = back.memory;
            fleet.memoryDocs = back.docs;
          }
        },
        words: configureWords.deleted(MAIN),
        mark: MAIN,
        name: MAIN,
        section: "/config/memory",
      },
      leave
    );
  }
  const same = (row: FleetMemoryDocRow) => row.path === path;
  return deleteRow(
    "memoryDoc",
    store,
    {
      remove: () => removeMemoryDoc(path),
      drop: () => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.memoryDocs = fleet.memoryDocs.filter((row) => !same(row));
        }
      },
      // The section lists documents by path.
      land: (back) => {
        const fleet = store.fleet.value;
        if (fleet) {
          fleet.memoryDocs = [
            ...fleet.memoryDocs.filter((row) => !same(row)),
            back,
          ].toSorted((a, b) => a.path.localeCompare(b.path));
        }
      },
      words: configureWords.deleted(path),
      mark: path,
      name: path,
      section: "/config/memory",
    },
    leave
  );
}
