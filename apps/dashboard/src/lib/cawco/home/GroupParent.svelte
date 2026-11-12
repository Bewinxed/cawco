<script lang="ts">
  /**
   * A group of the sidebar's lists (Recent's day, project, area or machine;
   * Projects' area or machine) as a tree parent: its own tree mark (a day
   * the calendar, an area the layers, a machine its OS mark, a project its
   * ProjectMark) and its name, the rows under it hung from that mark by the
   * rail's nesting lines (tree-lines.ts). The row is the switch that
   * folds them; folded, its mark shows how many it holds. It is the row's
   * own box a regroup moves (`data-regroup`), a parent the regroup makes
   * fading in where it stands and one it removes fading out where it stood
   * (motion/share `regroup`).
   *
   * A project's group in Recent is that project said again, so it answers
   * to the project's menu (FolderMenu: right-click on a desk, a long press
   * under a finger), as its row in Projects does; an end asked from it
   * unfolds under this row (`endAt`).
   */
  import { IconCalendar, IconLayers } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import FolderMenu from "../FolderMenu.svelte";
  import { markHue } from "../mark";
  import { landRegroup } from "../motion/share.svelte";
  import OsMark from "../OsMark.svelte";
  import ProjectMark from "../ProjectMark.svelte";
  import { folderOf } from "../projects";
  import RailProjectEnd from "../RailProjectEnd.svelte";
  import { newSession } from "../spawn/new-session.svelte";
  import TreeMark from "../TreeMark.svelte";
  import { grouping } from "./grouping.svelte";
  import { machineOs, projectHue } from "./recent.svelte";

  let {
    by,
    label,
    path,
    groupKey,
    count,
    endAt,
  }: {
    by: "day" | "project" | "area" | "machine";
    label: string;
    /** Its path in its list: its fold's name, and its key for a regroup's flight. */
    path: string;
    /** Its key at its level: a project's id (its hue), a machine's (its mark). */
    groupKey: string;
    /** The rows it holds: said on its mark while they are folded. */
    count: number;
    /** Where an end asked from a project group's menu unfolds (project-end.svelte.ts): under this row. */
    endAt?: string;
  } = $props();

  const open = $derived(!grouping.folded(path));
  const regroupKey = $derived(`regroup:group:${path}`);
  /** The project a project group stands for; none for the sessions in no project. */
  const project = $derived(
    by === "project" && groupKey ? cawco.project(groupKey) : undefined
  );
  /** The row: an end's tray hands the focus back to it. */
  let rowEl = $state<HTMLButtonElement | null>(null);
</script>

<!-- A disclosure, so a button; the rail's hover ghost lands on it as on any
     row (`data-rail-row`). Under a finger it is the touch floor tall. -->
{#snippet row()}
  <button
    bind:this={rowEl}
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
        fill={open ? undefined : `var(--color-mark-${markHue(path)})`}
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
    <span
      class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap"
      >{label}</span
    >
  </button>
{/snippet}

{#if project && endAt}
  <FolderMenu
    cwd={folderOf(project)}
    {endAt}
    onnew={() => newSession({ projectId: project.id })}
    {project}
  >
    {@render row()}
  </FolderMenu>
  <!-- An end asked from this row's menu, under it; its stops park under
       the project's own row in Projects. -->
  <RailProjectEnd at={endAt} opener={() => rowEl} projectId={project.id} />
{:else}
  {@render row()}
{/if}
