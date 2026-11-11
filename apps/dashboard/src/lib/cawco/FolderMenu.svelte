<script lang="ts">
  /**
   * Right-click on a folder — the rail's header and the board's group card are
   * the same directory said twice, so they answer to the same menu. What it
   * offers depends on whether the directory is registered: an ad-hoc cwd is
   * only somewhere work happens, and there is nothing to pin, forget or
   * delete.
   */
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import type { Snippet } from "svelte";
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconArchive,
    IconCollapseOthers,
    IconDeleteForGood,
    IconExternal,
    IconPalette,
    IconPin,
    IconSessionAdd,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import type { ProjectRow } from "./client.svelte";
  import { folderPrefs } from "./folder-prefs.svelte";
  import { HUES } from "./identity";
  import { askEnd, endAtRail, endHost } from "./project-end.svelte";
  import { rail } from "./rail.svelte";

  interface Props {
    children: Snippet;
    /** The directory itself: what every preference here is keyed by. */
    cwd: string;
    /** Where an end asked here unfolds (project-end.svelte.ts): the project's row in the rail unless the menu's own row says another. */
    endAt?: string;
    /** Shut every other folder. Only the rail has folders to shut. */
    oncollapseothers?: () => void;
    /** Start a session here, prefilled with this directory. */
    onnew: () => void;
    /** Set when the directory is registered; an ad-hoc cwd has none. */
    project?: ProjectRow | null;
  }

  let {
    cwd,
    endAt,
    project = null,
    onnew,
    oncollapseothers,
    children,
  }: Props = $props();

  const pickedHue = $derived(folderPrefs.chosenHue(cwd));

  const pinned = $derived(project ? rail.isPinned(project.id) : false);

  /** Where this menu's ends unfold. */
  const endsAt = $derived(
    endAt ?? (project ? endAtRail(project.id) : undefined)
  );

  let open = $state(false);
</script>

<ContextMenu.Root bind:open>
  <ContextMenu.Trigger box="none">
    {@render children()}
  </ContextMenu.Trigger>

  <!-- An end asked here keeps the focus its tray took, under the row:
       the menu doesn't hand it back to the row as it closes. -->
  <ContextMenu.Content
    onCloseAutoFocus={(event) => {
      if (endsAt && endHost.at === endsAt) {
        event.preventDefault();
      }
    }}
  >
    <ContextMenu.Item onSelect={onnew}>
      <IconSessionAdd />
      <span>New session here</span>
    </ContextMenu.Item>
    {#if project}
      <ContextMenu.Item onSelect={() => goto(`/project/${project.id}`)}>
        <IconExternal />
        <span>Open project page</span>
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => rail.togglePin(project.id)}>
        {#if pinned}
          <IconPin />
          <span>Unpin from rail</span>
        {:else}
          <IconPin />
          <span>Pin to rail</span>
        {/if}
      </ContextMenu.Item>
    {/if}

    <!-- A submenu rather than a dialog: the panel stays beside the folder it
         is about, and a colour picked with the folder out of sight is a colour
         picked blind. It also stays open, so hue and mark are one visit. -->
    <ContextMenu.Sub>
      <!-- The kit's sub-trigger is the one menu row without the item's gap. -->
      <ContextMenu.SubTrigger gap="item">
        <IconPalette class="size-icon-md" />
        <span>Customize</span>
      </ContextMenu.SubTrigger>
      <ContextMenu.SubContent frame="panel-high" pad="card" width="wide">
        <div class="flex items-center justify-between pb-2 pl-space-1">
          <span class="text-label font-medium text-ink-muted">Colour</span>
          {#if pickedHue !== undefined}
            <button
              class="select-none rounded-full px-2 py-0.5 text-label text-ink-muted
                     transition-colors duration-(--dur-control) hover:bg-accent hover:text-ink-strong"
              onclick={() => folderPrefs.setHue(cwd, undefined)}
              type="button"
            >
              Auto
            </button>
          {/if}
        </div>
        <div
          data-slot="grid"
          class="grid grid-cols-6 gap-1.5"
          {@attach highlight({ rows: "button", axis: "xy" })}
        >
          {#each HUES as hue (hue)}
            {@const on = folderPrefs.hue(cwd) === hue}
            <button
              aria-pressed={on}
              class="select-none focus-inset flex size-space-8 items-center justify-center rounded-full transition-colors
                     duration-(--dur-control)
                     aria-pressed:outline-solid aria-pressed:outline-(length:--focus-ring-width)
                     aria-pressed:outline-offset-(--focus-ring-inset) aria-pressed:outline-ink-strong
                     aria-pressed:focus-visible:outline-focus-ring"
              onclick={() => folderPrefs.setHue(cwd, hue)}
              title="Hue {hue}{pickedHue === undefined && on
                ? ' (automatic)'
                : ''}"
              type="button"
            >
              <!-- The chosen hue is ringed where the focus ring would be, in
                   ink; focus on it recolours that one ring. A swatch shows the
                   colour it would apply, at the ink lightness it lands on. -->
              <span
                class="identity-ink size-icon-lg rounded-full bg-current"
                style:--identity-h={hue}
              ></span>
            </button>
          {/each}
        </div>
      </ContextMenu.SubContent>
    </ContextMenu.Sub>

    {#if oncollapseothers}
      <ContextMenu.Item onSelect={oncollapseothers}>
        <IconCollapseOthers />
        <span>Collapse other folders</span>
      </ContextMenu.Item>
    {/if}

    {#if project && endsAt}
      <ContextMenu.Separator />
      <!-- Each end unfolds under this row (project-end.svelte.ts). -->
      <ContextMenu.Item onSelect={() => askEnd(project, endsAt, "forget")}>
        <IconArchive />
        <span>{projectEndWords.forgetProject}</span>
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => askEnd(project, endsAt, "delete")}
        variant="destructive"
      >
        <IconDeleteForGood />
        <span>{projectEndWords.deleteProject}</span>
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
