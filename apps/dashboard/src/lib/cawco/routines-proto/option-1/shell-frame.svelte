<script lang="ts">
  /**
   * The app's shell round a page, for a states file: the Shell reads its
   * workspace and its bar's name from the route and the hub, and a stage's
   * route is neither, so this mounts the Shell's own parts where the Shell
   * places them on a desk. The real Sidebar in the rail, at the rail's
   * width; the top bar, the page's name as its crumb and the trailing
   * glass (Caw's head, Jump, the machines); the page in the content's
   * place. The tooltip provider and lightbox are the Shell's own
   * (Overlays).
   */
  import type { Snippet } from "svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconSearch } from "#lib/icons.js";
  import MachinesButton from "../../MachinesButton.svelte";
  import NeedsCaw from "../../NeedsCaw.svelte";
  import Overlays from "../../Overlays.svelte";
  import Sidebar from "../../Sidebar.svelte";

  let { crumb, children }: { crumb: string; children: Snippet } = $props();
</script>

<Overlays>
  <div
    data-slot="shell"
    class="@container/shell relative flex h-dvh w-full bg-surface-recess overflow-hidden"
  >
    <aside
      data-slot="rail"
      class="hidden desk:flex relative w-c-sidebar-w grow-0 shrink-0 basis-c-sidebar-w min-w-0 bg-(--sidebar) border-e border-e-border-hairline"
    >
      <Sidebar narrow={false} toggleRoom />
    </aside>
    <div
      data-slot="shell-main"
      class="relative flex-auto min-w-0 flex flex-col overflow-hidden"
    >
      <header
        data-slot="top"
        class="h-c-top-bar-h shrink-0 flex items-center gap-space-2 py-0 ps-0 pe-space-6 max-desk:ps-space-3"
      >
        <span
          data-slot="crumb"
          class="min-w-0 flex-auto truncate ps-space-7 me-space-3 max-desk:ps-0"
          >{crumb}</span
        >
        <div class="relative ms-auto flex min-w-0 items-center">
          <BarGlass>
            {#snippet head()}
              <NeedsCaw />
            {/snippet}
            <BarItem label="Jump to a session" layout="desk">
              <IconSearch
                aria-hidden="true"
                class="size-icon-md text-ink-muted"
              />
            </BarItem>
            <MachinesButton />
          </BarGlass>
        </div>
      </header>
      <main
        data-slot="shell-content"
        id="main-content"
        class="flex-auto min-h-0 flex flex-col overflow-hidden"
      >
        {@render children()}
      </main>
    </div>
  </div>
</Overlays>
