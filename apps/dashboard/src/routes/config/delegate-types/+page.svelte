<script lang="ts">
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import {
    type DelegateType,
    message,
    removeDelegateType,
  } from "#lib/cawco/delegate-types.js";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconPlus, IconTrash } from "#lib/icons.js";

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
    await confirm({
      title: `Delete ${row.name}?`,
      body: "A session already running keeps the type list it started with — the prompt cache is frozen for its lifetime. This only stops the name from being offered to new sessions.",
      confirmLabel: "Delete delegate type",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        busy[row.name] = true;
        try {
          await removeDelegateType(row.name);
          store.types.value = types.filter((other) => other.name !== row.name);
        } finally {
          delete busy[row.name];
        }
      },
    });
  }
</script>

<SectionFrame
  problem={store.types.error}
  purpose={section.purpose}
  ready={store.types.value !== null}
  title={section.label}
>
  {#snippet actions(
    down
  )}
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
    <EmptyState
      icon={section.icon}
      line="A fresh hub seeds five on first read; delete all of them and this is what is left."
      title="No delegate types yet"
    />
  {:else}
    <RowList label="Delegate types">
      {#each types as row (row.name)}
        <SectionRow
          actions={[
            {
              label: "Delete delegate type",
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
