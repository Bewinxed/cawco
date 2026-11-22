<script lang="ts">
  /**
   * The kit's Sidebar parts in a frame of their own (their states file's):
   * a group of places, one current, each with its glyph and a count, and a
   * labelled group of projects, on the rail's ground, as the app's rail
   * composes them. The rail's context is provided here, as the shell
   * provides it.
   */
  import type { Component } from "svelte";
  import { setSidebar } from "./context.svelte.js";
  import * as Sidebar from "./index.js";

  let {
    places,
    projects,
    current,
  }: {
    /** The places, each its glyph, words and count. */
    places: {
      icon: Component;
      words: string;
      count?: number;
      live?: boolean;
    }[];
    /** The projects listed under their label. */
    projects: string[];
    /** The row that is the current page. */
    current: string;
  } = $props();

  setSidebar({ open: () => true, setOpen: () => undefined });
</script>

<div class="flex w-c-rail-sheet-w max-w-full flex-col py-space-2">
  <Sidebar.Content>
    <Sidebar.Group pad="rail">
      <Sidebar.Menu aria-label="Places" gap="tight">
        {#each places as place (place.words)}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={current === place.words} row="nav">
              <place.icon class="size-icon-md" data-box />
              <span>{place.words}</span>
            </Sidebar.MenuButton>
            {#if place.count}
              <Sidebar.MenuBadge tone={place.live ? "live" : undefined}
                >{place.count}</Sidebar.MenuBadge
              >
            {/if}
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>
    <Sidebar.Group pad="rail">
      <Sidebar.GroupLabel pad="rail" seam="section">Projects</Sidebar.GroupLabel
      >
      <Sidebar.Menu aria-label="Projects" gap="tight">
        {#each projects as project (project)}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={current === project} row="nav">
              <span>{project}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>
  </Sidebar.Content>
</div>
