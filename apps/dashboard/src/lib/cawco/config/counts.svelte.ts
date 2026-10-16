import { accountFaults } from "../accounts/model.svelte";
import { cawco } from "../client.svelte";
import { hubFaults, machineFaults, SCOPE_ANCHOR } from "../fleet-faults";
import { attention } from "../updates/model";
import { updates } from "../updates/updates.svelte";
import type { ConfigSection, SectionSlug } from "./sections";
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
    case "accounts":
      return cawco.accounts?.accounts.length ?? null;
    case "connections":
    case "devices":
    case "models":
    case "phone":
    case "previews":
    case "spend":
    case "updates":
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

/** Machines whose update waits on the operator: Updates' rail badge. */
function updatesWaiting(): number {
  const { policy } = updates;
  return policy ? attention(cawco.machines, policy) : 0;
}

/**
 * The figure on a section's rail badge, by the rule its definition names
 * (core `ConfigBadgeRule`, which the app follows too): the fleet faults whose
 * scope the section owns; the accounts signed in as somebody else somewhere
 * or signed in nowhere; or the machines whose update waits on the operator.
 */
export function badgeOf(
  store: ConfigStore,
  section: Pick<ConfigSection, "badge" | "slug">
): number {
  switch (section.badge) {
    case "account-faults":
      return accountFaults();
    case "updates-waiting":
      return updatesWaiting();
    case "fleet-faults": {
      const path = `/config/${section.slug}`;
      return allFaults(store).filter(
        (fault) => SCOPE_ANCHOR[fault.scope] === path
      ).length;
    }
  }
}
