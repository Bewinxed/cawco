import type {
  FleetAgent,
  FleetMarketplace,
  FleetMcpServer,
  FleetPlugin,
  FleetSkillMeta,
  RuleRow,
} from "@cawco/core";
import { type DelegateType, removeDelegateType } from "../delegate-types";
import {
  type FleetMemoryDocRow,
  type FleetMemoryRow,
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
import type { ConfigStore } from "./store.svelte";
import { type Deleted, offerUndo } from "./undo";

/**
 * Every config section's delete (JOURNEY.md Flow 5: "an undo affordance
 * after the fact rather than a confirm dialog before it"): one gesture,
 * nothing asked first. The hub moves the item into its trash, whole (hub
 * db/trash.ts); its row leaves the list; the toast's Undo has the hub put
 * it back, and its row stands again where it stood, marked (undo.ts).
 *
 * `leave` runs once the hub has taken it and before its row goes: an editor
 * goes back to its list there, so the row is seen leaving it. A refused
 * delete throws the hub's sentence and leaves the row standing.
 */
async function deleteRow<T>(
  store: ConfigStore,
  item: {
    /** Asks the hub to trash it. */
    remove: () => Promise<Deleted>;
    /** Takes its row off the list. */
    drop: () => void;
    /** Puts the row the hub restored back. */
    land: (row: T) => void;
    /** What the toast says, and what its Undo marks. */
    words: string;
    mark: string;
  },
  leave?: () => Promise<unknown>
): Promise<void> {
  const deleted = await item.remove();
  await leave?.();
  item.drop();
  offerUndo<T>(`deleted:${item.mark}`, item.words, deleted, (row) => {
    item.land(row);
    store.mark(item.mark);
  });
}

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
  return deleteRow<RuleRow>(
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
      words: `Deleted ${rule.name}`,
      mark: rule.id,
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
  return deleteRow<FleetHook>(
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
      words: `Deleted ${hook.name}`,
      mark: hook.id,
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
  return deleteRow<DelegateType>(
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
      words: `Deleted ${name}`,
      mark: name,
    },
    leave
  );
}

/** A subagent: the fleet forgets it; the machines keep the file they were given. */
export function deleteAgent(
  store: ConfigStore,
  name: string,
  leave?: () => Promise<unknown>
): Promise<void> {
  const at = (store.fleet.value?.agents ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetAgent) => row.name === name;
  return deleteRow<FleetAgent>(
    store,
    {
      remove: () => removeAgent(name),
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
      words: `Removed ${name}`,
      mark: name,
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
  const same = (row: FleetMcpServer) => row.name === name;
  return deleteRow<FleetMcpServer>(
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
      words: `Removed ${name}`,
      mark: name,
    },
    leave
  );
}

export function deleteSkill(store: ConfigStore, name: string): Promise<void> {
  const at = (store.fleet.value?.skills ?? []).findIndex(
    (row) => row.name === name
  );
  const same = (row: FleetSkillMeta) => row.name === name;
  return deleteRow<FleetSkillMeta>(store, {
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
    words: `Removed ${name}`,
    mark: name,
  });
}

export function deletePlugin(store: ConfigStore, id: string): Promise<void> {
  const at = (store.fleet.value?.config.plugins ?? []).findIndex(
    (row) => row.id === id
  );
  const same = (row: FleetPlugin) => row.id === id;
  return deleteRow<FleetPlugin>(store, {
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
    words: `Removed ${id}`,
    mark: id,
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
  return deleteRow<FleetMarketplace>(store, {
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
    words: `Unlinked ${name}`,
    mark: name,
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
    return deleteRow<{
      memory: FleetMemoryRow | null;
      docs: FleetMemoryDocRow[];
    }>(
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
        words: "Deleted CLAUDE.md",
        mark: MAIN,
      },
      leave
    );
  }
  const same = (row: FleetMemoryDocRow) => row.path === path;
  return deleteRow<FleetMemoryDocRow>(
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
      words: `Deleted ${path}`,
      mark: path,
    },
    leave
  );
}
