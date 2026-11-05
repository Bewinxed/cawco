<script lang="ts">
  /**
   * The Configure sheet (TOM tasks 16, 17, 19), reached from More and from
   * the rail's foot: one ledger of how the project runs and where it lives,
   * each row its name, what it is now and the way to change it; then
   * Forget and Delete, set apart, each asking in the page (DESIGN.md,
   * Asking in the page) and naming what still runs, which stops first.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  import type { Project } from "./model";

  let {
    project,
    ask = null,
  }: {
    project: Project;
    /** The question standing open: Forget or Delete. */
    ask?: "forget" | "delete" | null;
  } = $props();

  // Open from the story's state, until a press changes it (follows-props).
  let asking = $derived(ask);
  const running = $derived(
    project.sessions.filter(
      (session) => session.state === "working" || session.state === "needs"
    ).length
  );
  const types = $derived(
    [...new Set(project.tasks.map((task) => task.type).filter(Boolean))].join(
      ", "
    )
  );
  const rows = $derived([
    {
      name: w.configureRows.stages,
      value: project.stages.map((one) => one.name).join(" → "),
    },
    { name: w.configureRows.types, value: types },
    {
      name: w.configureRows.places,
      value: `${project.caw.machine} · ~/${project.name.toLowerCase()}`,
    },
    { name: w.configureRows.tracker, value: w.configureValues.tracker },
    { name: w.configureRows.decides, value: w.configureValues.decides },
    {
      name: w.configureRows.events,
      value: project.caw.eventsReach ? w.on : w.off,
    },
    { name: w.configureRows.account, value: w.configureValues.account },
    {
      name: w.configureRows.capRow,
      value: project.spend
        ? w.configureValues.cap(project.spend.capDay, project.spend.capMonth)
        : "",
    },
  ]);
</script>

<div class="flex flex-col gap-space-group px-space-3 pb-space-6">
  <ul class="flex flex-col">
    {#each rows as row (row.name)}
      <li>
        <button
          type="button"
          class="press-tint focus-inset touch-hit mark-line flex w-full items-center gap-space-3 rounded-sm px-space-2 py-space-3 text-start hover:bg-surface-hover"
        >
          <span class="w-c-setup-label-w flex-none type-label text-ink-row"
            >{row.name}</span
          >
          <span
            class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
            >{row.value}</span
          >
          <IconChevronRight
            class="size-icon-sm flex-none text-ink-muted"
            aria-hidden="true"
          />
        </button>
      </li>
    {/each}
  </ul>
  <div
    class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-4"
  >
    {#each [{ key: "forget" as const, label: w.forget, ask: w.forgetAsk(project.name), what: w.forgetWhat(running), verb: w.forgetVerb }, { key: "delete" as const, label: w.delete, ask: w.deleteAsk(project.name), what: w.deleteWhat(running), verb: w.deleteVerb }] as act (act.key)}
      <div class="flex flex-col gap-space-2">
        <Button
          variant="ghost"
          size="sm"
          tone="destructive"
          align="row"
          aria-expanded={asking === act.key}
          onclick={() => {
            asking = asking === act.key ? null : act.key;
          }}>{act.label}</Button
        >
        {#if asking === act.key}
          <div
            class="ms-space-3 flex flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 shadow-tile"
            role="alertdialog"
            aria-label={act.ask}
          >
            <p class="type-label text-ink-strong">{act.ask}</p>
            <p class="type-meta text-ink-muted">{act.what}</p>
            <div class="flex justify-end gap-space-2">
              <Button
                variant="ghost"
                size="sm"
                onclick={() => {
                  asking = null;
                }}>{w.cancel}</Button
              >
              <Button variant="destructive" size="sm">{act.verb}</Button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
