<script lang="ts">
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import type { Kind, Route } from "./model.js";
  import {
    FLEET_ROUTES,
    KIND,
    KINDS,
    PROJECT_ROUTES,
    ROUTE,
    WORDS,
  } from "./words.js";

  /**
   * Where each kind of decision goes, for one project or the whole fleet:
   * each kind and its route, the project's own rows marked against the
   * fleet's default, and that a change touches new decisions only.
   */
  let {
    project,
    scope = $bindable("project"),
  }: {
    project: string;
    /** Whose rules are shown: the project's, or the fleet's default. */
    scope?: string;
  } = $props();

  let routes = $state<Partial<Record<Kind, Route>>>({ ...PROJECT_ROUTES });

  const routeOf = (kind: Kind): Route =>
    scope === "project"
      ? (routes[kind] ?? FLEET_ROUTES[kind])
      : FLEET_ROUTES[kind];
  const own = (kind: Kind) => scope === "project" && routes[kind] !== undefined;
</script>

<div class="@container flex min-w-0 flex-col gap-space-5">
  <Tabs.Root bind:value={scope}>
    <Tabs.List aria-label="Whose rules">
      <Tabs.Trigger value="project">{project}</Tabs.Trigger>
      <Tabs.Trigger value="fleet">{WORDS.fleetDefault}</Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

  <ul class="flex min-w-0 flex-col">
    {#each KINDS as kind (kind)}
      <li
        class="grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-4 border-border-hairline border-b py-space-2 last:border-b-0"
      >
        <span class="flex min-w-0 flex-col">
          <span class="type-label text-ink-row">{KIND[kind]}</span>
          <span class="type-meta text-ink-muted">
            {own(kind) ? `${project}'s own` : WORDS.fleetDefault}
          </span>
        </span>
        <NativeSelect
          aria-label="Where {KIND[kind]} decisions go"
          onchange={(event) => {
            const next = event.currentTarget.value as Route;
            routes = { ...routes, [kind]: next };
            scope = "project";
          }}
          value={routeOf(kind)}
        >
          {#each Object.entries(ROUTE) as [value, label] (value)}
            <NativeSelectOption {value}>{label}</NativeSelectOption>
          {/each}
        </NativeSelect>
      </li>
    {/each}
  </ul>

  <p class="type-meta text-pretty text-ink-muted">{WORDS.appliesNew}</p>
</div>
