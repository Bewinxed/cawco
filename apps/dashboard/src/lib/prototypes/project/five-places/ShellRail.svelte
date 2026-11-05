<script lang="ts">
  /**
   * The shell's rail as it stands, drawn plain so the desk frames show the
   * room the project really has: the fleet's projects, this one chosen. It
   * is not this option's to change; under 1024 it is the shell's burger
   * sheet.
   */
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";

  let { project }: { project: string } = $props();

  const PROJECTS = ["Cawco-Dev", "Cawco", "GuardianGeckoBot", "uwucloud"];
</script>

<nav
  aria-label={words.openMenu}
  class="flex h-full w-c-sidebar-w flex-none flex-col gap-space-1 bg-surface-recess px-space-3 pt-space-3"
>
  <span
    class="flex h-c-top-bar-h items-center px-space-2 font-wordmark text-ink-strong type-title"
    >{words.wordmark}</span
  >
  {#each PROJECTS as name (name)}
    <a
      aria-current={name === project ? "page" : undefined}
      class="press-tint flex h-c-rail-row-h items-center rounded-md px-space-3 type-label text-ink-row can-hover:not-aria-current-page:hover:bg-surface-hover aria-current-page:bg-selected-bg aria-current-page:text-selected-ink"
      href={`#project-${name}`}
    >
      {name}
    </a>
  {/each}
</nav>
