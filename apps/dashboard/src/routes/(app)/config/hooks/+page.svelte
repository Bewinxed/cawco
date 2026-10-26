<script lang="ts">
  import { HOOK_TEMPLATES, hookSentence } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { deleteHook } from "#lib/cawco/config/deletes.js";
  import FleetStarters from "#lib/cawco/config/FleetStarters.svelte";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowActFaults from "#lib/cawco/config/RowActFaults.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import { RowActs } from "#lib/cawco/config/row-acts.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { draftOf, type FleetHook, saveHook } from "#lib/cawco/hooks.js";
  import { newId } from "#lib/cawco/id.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconHook, IconPlus, IconTrash } from "#lib/icons.js";

  /**
   * The hooks, each read as the sentence it is — a matcher's meaning is easy
   * to get wrong silently — with where it has landed beside it. The empty
   * state is the onboarding: three ready-made hooks, one click each.
   */
  const store = configStore();
  const section = sectionOf("hooks");
  const HUE = section.hue;

  const hooks = $derived(store.hooks.value ?? []);
  const machines = $derived(orderMachines(cawco.machines));
  const acts = new RowActs<FleetHook>("/config/hooks", {
    toggle: (row, enabled) => saveHook(row.id, { ...draftOf(row), enabled }),
    remove: (row) => deleteHook(store, row),
  });
</script>

<SectionFrame
  problem={store.hooks.error}
  purpose={section.purpose}
  ready={store.hooks.value !== null}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/hooks/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>New hook</span>
    </Button>
  {/snippet}

  {#if hooks.length === 0}
    <FleetStarters
      {acts}
      add={async (starter) => {
        const saved = await saveHook(newId(), starter.draft);
        // Its new row, marked, with its rollout chip, is the result.
        store.hooks.value = [saved, ...hooks];
        store.mark(saved.id);
      }}
      icon={IconHook}
      kind="hooks"
      label="Starter hooks"
      meta={(starter) =>
        `${starter.blurb} ${hookSentence(starter.draft).replaceAll("`", "")}`}
      {section}
      starters={HOOK_TEMPLATES}
      title="Nothing runs yet"
    />
  {:else}
    <RowList label="Hooks">
      {#each hooks as row (row.id)}
        <SectionRow
          actions={[
            {
              label: "Delete hook",
              icon: IconTrash,
              destructive: true,
              onselect: () => acts.remove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.id}
          href="/config/hooks/{row.id}"
          hue={HUE}
          icon={IconHook}
          meta="{row.event} · {hookSentence(row).replaceAll('`', '')}"
          name={row.name}
          ontoggle={(next) => acts.toggle(row, next)}
          toggling={acts.busy[row.id] === true}
        >
          {#snippet rollout()}
            <RolloutChip
              kind="hooks"
              {machines}
              name={row.id}
              what={row.name}
            />
          {/snippet}
          {#snippet below()}
            <RowActFaults {acts} {row} />
            <RowFaults key={row.id} kind="hooks" {machines} />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>
