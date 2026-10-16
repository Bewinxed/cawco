<script lang="ts" module>
  import type { FsEntry } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";

  /** Where the picker reads a machine's folders: the fleet's socket, or an artifact tab's own. */
  export interface FolderReader {
    /** A folder's entries, over the `fs` verb. */
    list: (machineId: string, path: string) => Promise<FsEntry[]>;
    /** Where the machine was working last: the folder the picker opens on. */
    recent: (machineId: string) => string | null;
  }
</script>

<script lang="ts">
  import {
    dur,
    easeDrawer,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  /** Walks a machine's filesystem over the `fs` verb so a cwd can be picked, not typed. */
  import { IconArrowUp, IconCheck, IconFolder } from "#lib/icons.js";

  let {
    machineId,
    value,
    onSelect,
    folders,
  }: {
    machineId: string;
    value: string;
    onSelect: (path: string) => void;
    folders: FolderReader;
  } = $props();

  let open = $state(false);
  let path = $state("/");
  let entries = $state<FsEntry[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  /**
   * Which way the last move went: into a folder (1), up a level (-1), or
   * nowhere (0, the listing the panel opens on).
   */
  let direction = $state<-1 | 0 | 1>(0);

  /**
   * A folder's listing arrives from the side it lies on: entering a folder
   * slides it in from 8% to the right, going up a level from 8% to the left,
   * over --dur-panel on the drawer curve, fading in as it comes. The listing
   * it replaces goes at once. With reduced motion, the fade alone.
   */
  function drill(_node: Element, from: -1 | 0 | 1) {
    if (from === 0) {
      return { duration: 0 };
    }
    const travel = motionOk.current ? from * 8 : 0;
    return {
      duration: dur("--dur-panel"),
      easing: easeDrawer,
      css: (t: number, u: number) =>
        `opacity: ${t}; transform: translateX(${(u * travel).toFixed(2)}%)`,
    };
  }

  /** Skeleton rows while a folder is read: a row's height, a few name widths. */
  const SKELETON_WIDTHS = ["w-28", "w-40", "w-24"];

  /** Only lives while the panel is open — a directory may have changed by the next visit. */
  const cache = new Map<string, FsEntry[]>();

  const TRAILING_SLASHES = /(?!^)\/+$/;

  const dirs = $derived(
    entries
      .filter((entry) => entry.kind === "dir" && !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const parent = $derived(
    path === "/" ? null : path.replace(/\/[^/]+$/, "") || "/"
  );

  const join = (dir: string, name: string) =>
    dir === "/" ? `/${name}` : `${dir}/${name}`;

  /** Whatever the field already says, else where this machine was working last. */
  function seed(): string {
    if (value.startsWith("/")) {
      return trim(value);
    }
    return trim(folders.recent(machineId) ?? "/");
  }

  /** Typed cwds arrive with trailing slashes; `parent` and `join` assume none. */
  const trim = (dir: string) => dir.replace(TRAILING_SLASHES, "");

  async function go(next: string, way: -1 | 0 | 1) {
    direction = way;
    path = next;
    errorMessage = null;
    const cached = cache.get(next);
    if (cached) {
      entries = cached;
      return;
    }
    loading = true;
    try {
      const listed = await folders.list(machineId, next);
      cache.set(next, listed);
      // A faster click already moved on; that listing wins.
      if (path !== next) {
        return;
      }
      entries = listed;
    } catch (err) {
      if (path !== next) {
        return;
      }
      entries = [];
      errorMessage = failureWords(err);
    } finally {
      loading = false;
    }
  }

  function collapse() {
    open = false;
    cache.clear();
  }

  function toggle() {
    if (open) {
      collapse();
      return;
    }
    open = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the panel opens immediately, the listing fills in when it arrives
    void go(seed(), 0);
  }

  function use() {
    onSelect(path);
    collapse();
  }
</script>

<svelte:window
  onkeydown={(event: KeyboardEvent) => {
    if (open && event.key === "Escape") {
      collapse();
    }
  }}
/>

<Collapsible.Root class="flex flex-col" onOpenChange={toggle} {open}>
  <Collapsible.Trigger
    class="mark-line flex items-center gap-1.5 self-start text-meta text-ink-muted transition-colors hover:text-ink-strong"
  >
    <IconFolder class="size-icon-md" />
    <span>Browse</span>
  </Collapsible.Trigger>

  <Collapsible.Content>
    <div class="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <div class="flex items-center gap-2">
        <Button
          aria-label="Parent directory"
          disabled={!parent}
          onclick={() => parent && go(parent, -1)}
          size="icon-xs"
          variant="ghost"
        >
          <IconArrowUp />
        </Button>
        <span class="truncate font-mono text-meta text-ink-muted" title={path}
          >{path}</span
        >
      </div>

      <div class="max-h-56 overflow-y-auto overflow-x-hidden">
        {#key path}
          <div in:drill={direction}>
            {#if loading}
              <div aria-label="Reading directory" role="status">
                {#each SKELETON_WIDTHS as width (width)}
                  <div class="flex h-[30px] items-center gap-[7px] px-[11px]">
                    <Skeleton class="size-icon-md shrink-0" />
                    <Skeleton class="h-icon-sm {width}" />
                  </div>
                {/each}
              </div>
            {:else if errorMessage}
              <span class="block px-2 py-space-1 text-meta text-error-9"
                >{errorMessage}</span
              >
            {:else}
              {#each dirs as dir (dir.name)}
                <Button
                  class="w-full justify-start font-mono text-label font-normal"
                  onclick={() => go(join(path, dir.name), 1)}
                  press="tint"
                  size="sm"
                  variant="ghost"
                >
                  <IconFolder class="shrink-0 opacity-70" />
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{dir.name}</span
                  >
                </Button>
              {:else}
                <span class="block px-2 py-space-1 text-meta text-ink-muted"
                  >No subdirectories.</span
                >
              {/each}
            {/if}
          </div>
        {/key}
      </div>

      <div class="flex justify-end">
        <Button onclick={use} size="xs">
          <IconCheck />
          <span>Use this directory</span>
        </Button>
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
