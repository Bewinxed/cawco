<script lang="ts">
  /**
   * The app's shell around a project's page, for the prototype's frames:
   * the real rail (Sidebar, reading the projects and machines the story
   * writes into their stores), the top bar's glass (BarGlass and its
   * items), and the project's pane (ProjectPaneFrame) holding what the
   * page draws. The Shell itself draws the workspace from the route and
   * the hub, so its parts are mounted here as it places them: the rail at
   * the desk line and up, the pane beside it. `narrow` is the frame's own
   * width under the phone line, as the Shell's narrow answer is.
   */
  import type { Snippet } from "svelte";
  import ProjectPaneFrame from "#lib/cawco/project/ProjectPaneFrame.svelte";
  import Sidebar from "#lib/cawco/Sidebar.svelte";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import BarItem from "#lib/components/ui/bar-glass/bar-item.svelte";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  import { IconSearch, IconServerLinear } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";

  let {
    narrow = $bindable(false),
    children,
  }: {
    /** The frame is under the phone line (640): the page draws its phone face. */
    narrow?: boolean;
    /** The project's page: its bar, its view bar and its board. */
    children: Snippet;
  } = $props();

  let railOpen = $state(true);
  setSidebar({
    open: () => railOpen,
    setOpen: (open: boolean) => {
      railOpen = open;
    },
  });

  /** The phone line, `--breakpoint-phone`. */
  const PHONE = 640;
  /** The frame's width, read as it mounts and in the next frame after a change. */
  const measure = frameSize(
    (node: HTMLElement) => node.clientWidth,
    (width) => {
      narrow = width < PHONE;
    }
  );
  /** The glass's items beside Caw's head, as the top bar holds them on a desk. */
  const ITEMS = [
    { icon: IconSearch, label: "Jump to session" },
    { icon: IconServerLinear, label: "Machines" },
  ];
</script>

<div
  data-slot="shell"
  class="@container/shell relative flex h-dvh w-full bg-surface-recess overflow-hidden"
  {@attach measure}
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
    <div
      class="flex h-c-top-bar-h flex-none items-center bg-surface-raised border-b border-b-border-hairline pe-space-6 @max-desk/shell:pe-c-bar-phone-edge"
    >
      <div
        class="ms-auto flex min-w-0 items-center @max-desk/shell:self-stretch"
      >
        <BarGlass>
          {#snippet head()}
            <BarItem label="Caw" tip={false}>
              <span
                data-slot="bar-symbol"
                aria-hidden="true"
                class="block rounded-pill bg-ink-muted"
              ></span>
            </BarItem>
          {/snippet}
          {#each ITEMS as item (item.label)}
            <BarItem icon={item.icon} label={item.label} layout="desk" />
          {/each}
        </BarGlass>
      </div>
    </div>
    <div class="relative flex-auto min-h-0 overflow-hidden">
      <ProjectPaneFrame>
        {@render children()}
      </ProjectPaneFrame>
    </div>
  </div>
</div>
