<script lang="ts">
  import { hookSentence } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import {
    draftOf,
    type FleetHook,
    HOOK_TEMPLATES,
    message,
    removeHook,
    saveHook,
  } from "#lib/cawco/hooks.js";
  import { newId } from "#lib/cawco/id.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
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
  let busy = $state<Record<string, boolean>>({});
  let seeding = $state<string | null>(null);
  /** The template whose last add failed: its button shows no check. */
  let seedFailed = $state<string | null>(null);

  async function toggle(row: FleetHook, enabled: boolean) {
    busy[row.id] = true;
    try {
      await saveHook(row.id, { ...draftOf(row), enabled });
      row.enabled = enabled;
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.id];
    }
  }

  /** A hook is executable material on every machine — never a bare click. */
  async function askRemove(row: FleetHook) {
    await confirm({
      title: `Delete ${row.name}?`,
      body: "This hook stops running and is removed from every machine that had it. You can always write it again, but there's no undo.",
      confirmLabel: "Delete hook",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        busy[row.id] = true;
        try {
          await removeHook(row.id, row.name);
          store.hooks.value = hooks.filter((other) => other.id !== row.id);
        } finally {
          delete busy[row.id];
        }
      },
    });
  }

  async function useTemplate(template: (typeof HOOK_TEMPLATES)[number]) {
    seeding = template.title;
    seedFailed = null;
    try {
      const saved = await saveHook(newId(), template.draft);
      store.hooks.value = [saved, ...hooks];
      store.mark(saved.id);
      toast.success(`${template.title} is written to every machine.`);
    } catch (error) {
      seedFailed = template.title;
      toast.error(message(error));
    } finally {
      seeding = null;
    }
  }
</script>

<SectionFrame
  problem={store.hooks.error}
  purpose={section.purpose}
  ready={store.hooks.value !== null}
  title={section.label}
>
  {#snippet actions(
    down
  )}
    <Button
      disabled={down !== null}
      href="/config/hooks/new"
      title={down ?? undefined}
    >
      <IconPlus />
      New hook
    </Button>
  {/snippet}

  {#if hooks.length === 0}
    <EmptyState
      icon={section.icon}
      line="Start from one of these — they are ordinary hooks once added, and you can change every part of them."
      title="Nothing runs yet"
    />
    <RowList label="Starter hooks">
      {#each HOOK_TEMPLATES as template (template.title)}
        <SectionRow
          hue={HUE}
          icon={IconHook}
          meta="{template.blurb} {hookSentence(template.draft)}"
          name={template.title}
        >
          {#snippet trailing()}
            <Button
              disabled={seeding !== null && seeding !== template.title}
              failed={seedFailed === template.title}
              label="Add"
              onclick={() => useTemplate(template)}
              pending={seeding === template.title}
              pendingLabel="Adding…"
              size="sm"
              variant="outline"
            />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
    <div>
      <Button href="/config/hooks/new" variant="outline">
        Or write one from scratch
      </Button>
    </div>
  {:else}
    <RowList label="Hooks">
      {#each hooks as row (row.id)}
        <SectionRow
          actions={[
            {
              label: "Delete hook",
              icon: IconTrash,
              destructive: true,
              onselect: () => askRemove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.id}
          href="/config/hooks/{row.id}"
          hue={HUE}
          icon={IconHook}
          meta="{row.event} · {hookSentence(row)}"
          name={row.name}
          ontoggle={(next) => toggle(row, next)}
          toggling={busy[row.id] === true}
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
            <RowFaults key={row.id} kind="hooks" {machines} />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>
