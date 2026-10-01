import { cawco } from "../client.svelte";
import { hubFaults, machineFaults, SCOPE_ANCHOR } from "../fleet-faults";
import type { SectionSlug } from "./sections";
import type { ConfigStore } from "./store.svelte";

/** A section's row count, or null while it has not been read. */
export function countOf(store: ConfigStore, slug: SectionSlug): number | null {
  switch (slug) {
    case "rules":
      return store.rules.value?.length ?? null;
    case "hooks":
      return store.hooks.value?.length ?? null;
    case "delegate-types":
      return store.types.value?.length ?? null;
    case "subagents":
      return store.fleet.value?.agents.length ?? null;
    case "cli-tools":
      return (
        store.tools.value?.catalog.filter((spec) => !spec.dependencyOnly)
          .length ?? null
      );
    case "mcp":
      return store.fleet.value?.config.mcp.length ?? null;
    case "skills": {
      const fleet = store.fleet.value;
      return fleet ? fleet.skills.length + fleet.config.plugins.length : null;
    }
    case "memory": {
      const fleet = store.fleet.value;
      return fleet ? (fleet.memory ? 1 : 0) + fleet.memoryDocs.length : null;
    }
    default:
      return null;
  }
}

/** Every fault the fleet has right now, hub-side and machine-side. */
export function allFaults(store: ConfigStore) {
  const fleet = store.fleet.value;
  return [
    ...(fleet
      ? hubFaults(
          fleet.skills,
          fleet.config.plugins,
          cawco.machines.map((machine) => machine.fleet)
        )
      : []),
    ...cawco.machines.flatMap((machine) =>
      machineFaults(machine.machineId, machine.fleet)
    ),
  ];
}

/** How many faults belong to a section, for its rail badge. */
export function faultsIn(store: ConfigStore, slug: SectionSlug): number {
  const path = `/config/${slug}`;
  return allFaults(store).filter((fault) => SCOPE_ANCHOR[fault.scope] === path)
    .length;
}
