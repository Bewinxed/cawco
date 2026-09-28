<script lang="ts">
  import { hookSentence } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  import { IconHook, IconPlus, IconTrash } from "$lib/icons";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import RolloutChip from "$lib/whiffle/config/RolloutChip.svelte";
  import RowFaults from "$lib/whiffle/config/RowFaults.svelte";
  import RowList from "$lib/whiffle/config/RowList.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SectionRow from "$lib/whiffle/config/SectionRow.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import {
    draftOf,
    type FleetHook,
    HOOK_TEMPLATES,
    message,
    removeHook,
    saveHook,
  } from "$lib/whiffle/hooks";
  import { newId } from "$lib/whiffle/id";
  import { orderMachines } from "$lib/whiffle/rail.svelte";

  /**
   * The hooks, each read as the sentence it is — a matcher's meaning is easy
   * to get wrong silently — with where it has landed beside it. The empty
   * state is the onboarding: three ready-made hooks, one click each.
   */
  const store = configStore();
  const section = sectionOf("hooks");
  const HUE = section.hue;

  const hooks = $derived(store.hooks.value ?? []);
  const machines = $derived(orderMachines(whiffle.machines));
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
        } catch (error) {
          toast.error(message(error));
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
  {#snippet actions(down)}
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
              label: 'Delete hook',
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
