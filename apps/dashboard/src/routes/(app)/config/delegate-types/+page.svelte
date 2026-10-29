<script lang="ts">
  import { delegateTypesWords as words } from "@cawco/core/words/delegate-types";
  import DeleteFault from "#lib/cawco/config/DeleteFault.svelte";
  import { deleteDelegateType } from "#lib/cawco/config/deletes.js";
  import FleetEmpty from "#lib/cawco/config/FleetEmpty.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import { RowActs } from "#lib/cawco/config/row-acts.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import type { DelegateType } from "#lib/cawco/delegate-types.js";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconFolder, IconPlus } from "#lib/icons.js";

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

  /** Harness, model, effort, and every narrowing, as one short line. */
  function runsOn(row: DelegateType): string {
    const parts = [row.harness, row.model];
    if (row.effort) {
      parts.push(words.effortOf(row.effort));
    }
    if (row.skills?.length) {
      parts.push(words.skillCount(row.skills.length));
    }
    if (row.denyTools?.length) {
      parts.push(words.deniedCount(row.denyTools.length));
    }
    if (row.canDelegate) {
      parts.push(words.mayDelegateShort);
    }
    return parts.join(" · ");
  }

  /** Delete: at once, with Undo in the toast (deletes.ts). */
  const acts = new RowActs<DelegateType>("/config/delegate-types", {
    key: (row) => row.name,
    remove: (row) => deleteDelegateType(store, row.name),
  });
</script>

<SectionFrame
  problem={store.types.error ?? store.projectTypes.error}
  ready={store.types.value !== null}
  settling={store.projectTypes.loading}
  {section}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/delegate-types/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>{words.add}</span>
    </Button>
  {/snippet}

  <div data-slot="group" class="flex flex-col gap-space-2">
    <SectionHeader hue={section.hue} icon={section.icon} label={words.fleet} />
    {#if types.length === 0}
      <FleetEmpty
        add={{ href: "/config/delegate-types/new", label: words.add }}
        ask="delegateTypes"
        icon={section.icon}
        line={words.emptyLine}
        title={words.emptyTitle}
      />
    {:else}
      <RowList label={words.list}>
        {#each types as row (row.name)}
          <SectionRow
            actions={[acts.deleteAction(row, words.remove)]}
            flash={store.flash === row.name}
            href="/config/delegate-types/{row.name}"
            meta="{row.description} · {runsOn(row)}"
            mono
            name={row.name}
          >
            {#snippet tile()}
              <HarnessLogo harness={row.harness} />
            {/snippet}
            {#snippet below()}
              <DeleteFault {acts} {row} />
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
  </div>

  {#each projects as entry (entry.project.id)}
    <div
      data-slot="group"
      class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-5"
    >
      <SectionHeader
        hue={section.hue}
        icon={IconFolder}
        label={entry.project.name}
      />
      {#if entry.types.length > 0}
        <RowList label={words.projectList(entry.project.name)}>
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
                    ><span>{words.shadows(row.name)}</span></Badge
                  >
                {/if}
              {/snippet}
            </SectionRow>
          {/each}
        </RowList>
      {/if}
      {#each entry.problems as fault (`${fault.path}:${fault.problem}`)}
        <RowFault reason={words.fileProblem(fault.path, fault.problem)} />
      {/each}
    </div>
  {/each}
</SectionFrame>
