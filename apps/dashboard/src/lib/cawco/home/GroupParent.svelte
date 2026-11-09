<script lang="ts">
  /**
   * A group of the sidebar's lists (Recent's day, project, area or machine;
   * Projects' area or machine) as a tree parent: its own tree mark (a day
   * the calendar, an area the layers, a machine its OS mark, a project its
   * ProjectMark) and its name, the rows under it hung from that mark by the
   * rail's nesting lines (app.css .kit-nest). The row is the switch that
   * folds them; folded, its mark shows how many it holds. It is the row's
   * own box a regroup moves (`data-regroup`), a parent the regroup makes
   * fading in where it stands and one it removes fading out where it stood
   * (motion/share `regroup`).
   */
  import { IconCalendar, IconLayers } from "#lib/icons.js";
  import { markHue } from "../mark";
  import { landRegroup } from "../motion/share.svelte";
  import OsMark from "../OsMark.svelte";
  import ProjectMark from "../ProjectMark.svelte";
  import TreeMark from "../TreeMark.svelte";
  import { grouping } from "./grouping.svelte";
  import { machineOs, projectHue } from "./recent.svelte";

  let {
    by,
    label,
    path,
    groupKey,
    count,
  }: {
    by: "day" | "project" | "area" | "machine";
    label: string;
    /** Its path in its list: its fold's name, and its key for a regroup's flight. */
    path: string;
    /** Its key at its level: a project's id (its hue), a machine's (its mark). */
    groupKey: string;
    /** The rows it holds: said on its mark while they are folded. */
    count: number;
  } = $props();

  const open = $derived(!grouping.folded(path));
  const regroupKey = $derived(`regroup:group:${path}`);
</script>

<!-- A disclosure, so a button; the rail's hover ghost lands on it as on any
     row (`data-rail-row`). Under a finger it is the touch floor tall. -->
<button
  aria-expanded={open}
  class="select-none mark-line press-tint focus-inset m-0 flex w-full min-w-0 h-(--row-compact-h) coarse:h-c-btn-h-lg items-center gap-(--row-compact-gap) rounded-sm border-none border-current bg-transparent py-0 ps-(--row-compact-gap) pe-(--row-compact-pad-end) text-start type-label text-ink-row"
  data-rail-row
  data-regroup={regroupKey}
  data-regroup-parent
  onclick={() => grouping.toggle(path)}
  type="button"
  {@attach landRegroup(() => regroupKey)}
>
  {#if by === "project"}
    <ProjectMark
      count={open ? 0 : count}
      hue={projectHue(groupKey)}
      name={label}
      {open}
      rowToggles
    />
  {:else}
    <!-- A bare glyph while it is open, as the rail's own glyphs stand; folded,
         its count stands on a tile in its own hue, with the deck behind. -->
    <TreeMark
      count={open ? 0 : count}
      countIsStatus
      fill={open ? undefined : `var(--mark-${markHue(path)})`}
      {open}
      rowToggles
    >
      {#snippet face()}
        {#if by === "machine"}
          <OsMark class="size-icon-sm" os={machineOs(groupKey)} />
        {:else if by === "area"}
          <IconLayers aria-hidden="true" class="size-icon-sm" />
        {:else}
          <IconCalendar aria-hidden="true" class="size-icon-sm" />
        {/if}
      {/snippet}
    </TreeMark>
  {/if}
  <span class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap"
    >{label}</span
  >
</button>
