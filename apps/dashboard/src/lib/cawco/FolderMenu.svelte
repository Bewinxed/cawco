<script lang="ts">
  /**
   * Right-click on a folder — the rail's header and the board's group card are
   * the same directory said twice, so they answer to the same menu. What it
   * offers depends on whether the directory is registered: an ad-hoc cwd is
   * only somewhere work happens, and there is nothing to pin or to forget.
   */
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconAlignLeft,
    IconChevronUp,
    IconExternal,
    IconPalette,
    IconPin,
    IconPlus,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { deleteProject, type ProjectRow } from "./client.svelte";
  import { folderPrefs } from "./folder-prefs.svelte";
  import { HUES } from "./identity";
  import { rail } from "./rail.svelte";

  interface Props {
    children: Snippet;
    /** The directory itself: what every preference here is keyed by. */
    cwd: string;
    /** What the reader calls this directory — the folder's own heading. */
    name: string;
    /** Shut every other folder. Only the rail has folders to shut. */
    oncollapseothers?: () => void;
    /** Start a session here, prefilled with this directory. */
    onnew: () => void;
    /** Flatten this folder's sessions into plain rows. Rail only. */
    onungroup?: () => void;
    /** Set when the directory is registered; an ad-hoc cwd has none. */
    project?: ProjectRow | null;
  }

  let {
    name,
    cwd,
    project = null,
    onnew,
    onungroup,
    oncollapseothers,
    children,
  }: Props = $props();

  const pickedHue = $derived(folderPrefs.chosenHue(cwd));

  /** A swatch shows the colour it would apply, at the ink lightness it lands on. */
  const swatch = (hue: number) => `--identity-h: ${hue}`;

  const pinned = $derived(project ? rail.isPinned(project.id) : false);

  let confirmingForget = $state(false);
  let busy = $state(false);
  /** The last forget went through (a failed one leaves the dialog open). */
  let forgotten = $state(false);

  async function forget() {
    if (!project) {
      return;
    }
    busy = true;
    forgotten = false;
    try {
      await deleteProject(project.id);
      forgotten = true;
      confirmingForget = false;
    } finally {
      busy = false;
    }
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="contents">
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content>
    <ContextMenu.Item onSelect={onnew}>
      <IconPlus />
      New session here
    </ContextMenu.Item>
    {#if project}
      <ContextMenu.Item onSelect={() => goto(`/project/${project.id}`)}>
        <IconExternal />
        Open project page
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => rail.togglePin(project.id)}>
        {#if pinned}
          <IconPin />
          Unpin from rail
        {:else}
          <IconPin />
          Pin to rail
        {/if}
      </ContextMenu.Item>
    {/if}
    {#if onungroup}
      <ContextMenu.Item onSelect={onungroup}>
        <IconAlignLeft />
        Ungroup folder
      </ContextMenu.Item>
    {/if}

    <!-- A submenu rather than a dialog: the panel stays beside the folder it
         is about, and a colour picked with the folder out of sight is a colour
         picked blind. It also stays open, so hue and mark are one visit. -->
    <ContextMenu.Sub>
      <!-- The kit's sub-trigger is the one menu row without the item's gap. -->
      <ContextMenu.SubTrigger class="gap-2.5">
        <IconPalette class="size-4" />
        Customize
      </ContextMenu.SubTrigger>
      <ContextMenu.SubContent
        class="w-64 rounded-[var(--radius-lg)] p-3 shadow-xl"
      >
        <div class="flex items-center justify-between pb-2 pl-1">
          <span class="text-label font-medium text-muted-foreground"
            >Colour</span
          >
          {#if pickedHue !== undefined}
            <button
              class="rounded-full px-2 py-0.5 text-label text-muted-foreground
                     transition-colors duration-(--dur-control) hover:bg-accent hover:text-foreground"
              onclick={() => folderPrefs.setHue(cwd, undefined)}
              type="button"
            >
              Auto
            </button>
          {/if}
        </div>
        <div
          class="grid grid-cols-6 gap-1.5"
          {@attach highlight({ rows: "button", axis: "xy" })}
        >
          {#each HUES as hue (hue)}
            {@const on = folderPrefs.hue(cwd) === hue}
            <button
              aria-pressed={on}
              class="focus-inset flex size-8 items-center justify-center rounded-full transition-colors
                     duration-(--dur-control)
                     aria-pressed:outline-solid aria-pressed:outline-[length:var(--focus-ring-width)]
                     aria-pressed:outline-offset-[var(--focus-ring-inset)] aria-pressed:outline-[var(--ink-strong)]
                     aria-pressed:focus-visible:outline-[var(--focus-ring)]"
              onclick={() => folderPrefs.setHue(cwd, hue)}
              title="Hue {hue}{pickedHue === undefined && on
                ? " (automatic)"
                : ""}"
              type="button"
            >
              <!-- The chosen hue is ringed where the focus ring would be, in
                   ink; focus on it recolours that one ring. -->
              <span
                class="identity-ink size-5 rounded-full bg-current"
                style={swatch(hue)}
              ></span>
            </button>
          {/each}
        </div>
      </ContextMenu.SubContent>
    </ContextMenu.Sub>

    {#if oncollapseothers}
      <ContextMenu.Item onSelect={oncollapseothers}>
        <IconChevronUp />
        Collapse other folders
      </ContextMenu.Item>
    {/if}

    {#if project}
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => {
          confirmingForget = true;
        }}
        variant="destructive"
      >
        <IconTrash />
        Forget project…
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>

<AlertDialog.Root bind:open={confirmingForget}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Forget {name}?</AlertDialog.Title>
      <AlertDialog.Description>
        The grouping is removed. The checkout and its sessions stay on disk.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action>
        {#snippet child({
          props,
        })}
          <Button
            {...props}
            failed={!forgotten}
            label="Forget"
            onclick={forget}
            pending={busy}
            pendingLabel="Forgetting…"
          />
        {/snippet}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
