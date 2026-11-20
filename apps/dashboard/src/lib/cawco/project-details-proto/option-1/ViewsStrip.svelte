<script lang="ts">
  import type { Component } from "svelte";
  /**
   * Views strip: leading fluid tabs (Board, Table, Routines, Decisions), Filter,
   * and New task; trailing on the same axis, TaskHomeAnchor and (for code
   * projects only) FinishedWorkAnchor. Wraps cleanly onto a second aligned line
   * when space tightens at 1024 / 640 widths.
   */
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconColumns,
    IconDecisions,
    IconFilter,
    IconListRows,
    IconPlus,
    IconRepeat,
  } from "#lib/icons.js";
  import FinishedWorkAnchor from "./FinishedWorkAnchor.svelte";
  import type { Change, Changes, GovernedRecord, ProjectView } from "./records";
  import TaskHomeAnchor from "./TaskHomeAnchor.svelte";
  import { words } from "./words";

  const VIEW_TABS: { value: ProjectView; label: string; icon: Component }[] = [
    { value: "board", label: words.views.tabs.board, icon: IconColumns },
    { value: "table", label: words.views.tabs.table, icon: IconListRows },
    { value: "routines", label: words.views.tabs.routines, icon: IconRepeat },
    {
      value: "decisions",
      label: words.views.tabs.decisions,
      icon: IconDecisions,
    },
  ];

  let {
    record,
    view,
    changes,
    now,
    onchange,
    onview,
    onsyncnow,
    onreread,
    onfilter,
    onnewtask,
  }: {
    record: GovernedRecord;
    view: ProjectView;
    changes: Changes;
    now: number;
    onchange: (change: Change) => void;
    onview: (view: ProjectView) => void;
    onsyncnow: () => void;
    onreread: (what: "decides" | "tracker" | "connections") => void;
    onfilter: () => void;
    onnewtask: () => void;
  } = $props();
</script>

<NsPopoverGroup>
  <div
    class="flex flex-wrap items-center justify-between gap-x-space-4 gap-y-space-2 border-b border-border-hairline px-space-5 pb-space-3 pt-space-1"
    data-slot="views-strip"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-space-2">
      <Tabs
        onValueChange={(next) => {
          const picked = VIEW_TABS.find((tab) => tab.value === next);
          if (picked) {
            onview(picked.value);
          }
        }}
        size="compact"
        value={view}
        values={VIEW_TABS.map((t) => t.value)}
      >
        <TabsList aria-label={words.views.tablistLabel} scrollable>
          {#each VIEW_TABS as tab (tab.value)}
            <TabItem icon={tab.icon} label={tab.label} value={tab.value} />
          {/each}
        </TabsList>
      </Tabs>

      <Button onclick={onfilter} size="sm" tone="quiet" variant="ghost">
        <IconFilter aria-hidden="true" />
        <span>{words.views.filter}</span>
      </Button>

      <Button onclick={onnewtask} size="sm" variant="outline">
        <IconPlus aria-hidden="true" />
        <span>{words.views.newTask}</span>
      </Button>
    </div>

    <div class="ms-auto flex min-w-0 flex-wrap items-center gap-space-2">
      <TaskHomeAnchor
        {changes}
        {now}
        {onchange}
        {onreread}
        {onsyncnow}
        {record}
      />
      {#if record.holdsCode}
        <FinishedWorkAnchor {changes} {onchange} {record} />
      {/if}
    </div>
  </div>
</NsPopoverGroup>
