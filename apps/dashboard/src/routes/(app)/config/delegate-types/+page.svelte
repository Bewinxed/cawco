<script lang="ts">
  import { deleteDelegateType } from "#lib/cawco/config/deletes.js";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import type { DelegateType } from "#lib/cawco/delegate-types.js";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { toast } from "#lib/cawco/toasts.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconFolder, IconPlus, IconTrash } from "#lib/icons.js";

  /**
   * The presets a session's `delegate` call routes against. A calling agent
   * reads the description and picks the type that matches what it needs done,
   * so the description is each row's meta; the model line follows it.
   *
   * Grouped by where they apply: the fleet's, then each project's own, the
   * files in its `delegates/` folder, which its sessions pick before a fleet
   * type of the same name; each row opens its file on the project's page
   * (`?file=`). A file there that made no type is said under its project in
   * the hub's words, so it never just goes missing.
   */
  const store = configStore();
  const section = sectionOf("delegate-types");
  const types = $derived(store.types.value ?? []);
  const projects = $derived(store.projectTypes.value ?? []);
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

  /** Delete: at once, with Undo in the toast (deletes.ts). */
  async function remove(row: DelegateType) {
    busy[row.name] = true;
    try {
      await deleteDelegateType(store, row.name);
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.name];
    }
  }
</script>

<SectionFrame
  problem={store.types.error ?? store.projectTypes.error}
  purpose={section.purpose}
  ready={store.types.value !== null}
  settling={store.projectTypes.loading}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/delegate-types/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>New delegate type</span>
    </Button>
  {/snippet}

  <div data-slot="group" class="group">
    <SectionHeader hue={section.hue} icon={section.icon} label="The fleet" />
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
                onselect: () => remove(row),
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
  </div>

  {#each projects as entry (entry.project.id)}
    <div data-slot="group" class="group">
      <SectionHeader
        hue={section.hue}
        icon={IconFolder}
        label={entry.project.name}
      />
      {#if entry.types.length > 0}
        <RowList label="{entry.project.name}'s delegate types">
          {#each entry.types as row (row.name)}
            <SectionRow
              href={folderFileHref(entry.project.id, row.path)}
              meta="{row.path} · {row.description} · {runsOn(row)}"
              mono
              name={row.name}
            >
              {#snippet tile()}
                <HarnessLogo harness={row.harness} />
              {/snippet}
              {#snippet badge()}
                {#if row.shadows}
                  <Badge variant="secondary"
                    ><span>shadows the fleet's {row.name}</span></Badge
                  >
                {/if}
              {/snippet}
            </SectionRow>
          {/each}
        </RowList>
      {/if}
      {#each entry.problems as fault (`${fault.path}:${fault.problem}`)}
        <RowFault reason="{fault.path}: {fault.problem}" />
      {/each}
    </div>
  {/each}
</SectionFrame>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group + .group {
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
</style>
