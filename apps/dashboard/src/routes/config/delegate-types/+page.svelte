<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { IconPlus, IconTrash } from "$lib/icons";
  import EmptyHead from "$lib/whiffle/config/EmptyHead.svelte";
  import RowList from "$lib/whiffle/config/RowList.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SectionRow from "$lib/whiffle/config/SectionRow.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore } from "$lib/whiffle/config/store.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import {
    type DelegateType,
    message,
    removeDelegateType,
  } from "$lib/whiffle/delegate-types";
  import HarnessLogo from "$lib/whiffle/HarnessLogo.svelte";

  /**
   * The presets a session's `delegate` call routes against. A calling agent
   * reads the description and picks the type that matches what it needs done,
   * so the description is each row's meta; the model line follows it.
   */
  const store = configStore();
  const section = sectionOf("delegate-types");
  const types = $derived(store.types.value ?? []);
  let busy = $state<Record<string, boolean>>({});

  /** Harness, model, effort, and every narrowing, as one short line. */
  function runsOn(row: DelegateType): string {
    const parts = [row.harness, row.model];
    if (row.effort) {
      parts.push(`${row.effort} effort`);
    }
    if (row.skills?.length) {
      parts.push(
        `${row.skills.length} skill${row.skills.length === 1 ? "" : "s"}`
      );
    }
    if (row.denyTools?.length) {
      parts.push(
        `${row.denyTools.length} tool${row.denyTools.length === 1 ? "" : "s"} denied`
      );
    }
    if (row.canDelegate) {
      parts.push("may delegate");
    }
    return parts.join(" · ");
  }

  async function askRemove(row: DelegateType) {
    const ok = await confirm({
      title: `Delete ${row.name}?`,
      body: "A session already running keeps the type list it started with — the prompt cache is frozen for its lifetime. This only stops the name from being offered to new sessions.",
      confirmLabel: "Delete delegate type",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    busy[row.name] = true;
    try {
      await removeDelegateType(row.name);
      store.types.value = types.filter((other) => other.name !== row.name);
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.name];
    }
  }
</script>

<SectionFrame
  problem={store.types.error}
  purpose={section.purpose}
  ready={store.types.value !== null}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/delegate-types/new"
      title={down ?? undefined}
    >
      <IconPlus />
      New delegate type
    </Button>
  {/snippet}

  {#if types.length === 0}
    <EmptyHead
      line="A fresh hub seeds five on first read; delete all of them and this is what is left."
      title="No delegate types yet"
    />
  {:else}
    <RowList label="Delegate types">
      {#each types as row (row.name)}
        <SectionRow
          actions={[
            {
              label: 'Delete delegate type',
              icon: IconTrash,
              destructive: true,
              disabled: busy[row.name] === true,
              onselect: () => askRemove(row),
            },
          ]}
          flash={store.flash === row.name}
          href="/config/delegate-types/{row.name}"
          meta="{row.description} · {runsOn(row)}"
          mono
          name={row.name}
        >
          {#snippet tile()}
            <HarnessLogo harness={row.harness} />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>
