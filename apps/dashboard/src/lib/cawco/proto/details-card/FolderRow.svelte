<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  /**
   * One folder of the project, on the card's Files and locations: the
   * computer that holds it (its mark, name and whether it answers), the
   * folder's whole path, and what the folder is to the project as a word.
   * The Main folder says agents begin there.
   *
   * A press on the row opens its rare acts under it, each a row with its
   * name and one line saying what it does (Move files, Locate folder,
   * Disconnect folder); the Main folder has no Disconnect folder and the
   * Built-in folder is sunk, with no acts. A missing folder says so on the
   * row, with Locate folder as its fix. Disconnect folder asks under the
   * row, in place: one line of what it does, then Disconnect folder or
   * Cancel.
   *
   * The path is cut from its start where the column is narrow, so its end,
   * the folder's own name, always shows.
   */
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import {
    IconChevronDown,
    IconMapPoint,
    IconMinusLinear,
    IconTransfer,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { cn } from "#lib/utils.js";
  import type { Folder, FolderAct } from "./details";
  import { actWords, folderWords } from "./words";

  let {
    folder,
    hue,
    open = false,
    confirming = false,
    running = null,
    sunk = false,
    ontoggle,
    onact,
    onconfirm,
    ondisconnect,
    oncancel,
  }: {
    folder: Folder;
    /** Its computer's place in the fleet: the mark's identity hue. */
    hue: number;
    /** Its acts stand open under it. */
    open?: boolean;
    /** Disconnect folder is asking under it. */
    confirming?: boolean;
    /** A folder act running on it: what it is doing. */
    running?: string | null;
    /** Nothing can be sent: the row reads, and opens nothing. */
    sunk?: boolean;
    ontoggle: () => void;
    onact: (act: FolderAct) => void;
    /** Disconnect folder was pressed: ask under the row. */
    onconfirm: () => void;
    ondisconnect: () => void;
    oncancel: () => void;
  } = $props();

  const id = $props.id();
  const role = $derived(folderWords.role[folder.role]);
  const meta = $derived.by(() => {
    if (folder.readAt) {
      return folderWords.readAt(folder.readAt);
    }
    return folder.machine.online ? folderWords.online : folderWords.offline;
  });
  /** The acts this folder offers, in the order they read. */
  const acts = $derived<
    { act: FolderAct | "disconnect"; icon: typeof IconTransfer }[]
  >([
    { act: "move", icon: IconTransfer },
    { act: "locate", icon: IconMapPoint },
    ...(folder.role === "main"
      ? []
      : [{ act: "disconnect" as const, icon: IconMinusLinear }]),
  ]);
  const actName = (act: FolderAct | "disconnect") =>
    act === "disconnect" ? folderWords.disconnect : actWords[act].name;
  const actLine = (act: FolderAct | "disconnect") =>
    act === "disconnect" ? folderWords.disconnectLine : actWords[act].line;
  /** The Main folder missing stops every agent; another folder missing stops agents only there. */
  const blocks = $derived(folder.missing && folder.role === "main");
</script>

{#snippet machine()}
  <span class="flex min-w-0 items-center gap-space-3">
    <MachineRow
      hue={machineHue(hue, folder.machine.online)}
      icon={machineIcon(folder.machine.os)}
      {meta}
      name={folder.machine.name}
      presence={folder.machine.online ? "online" : "off"}
    >
      {#snippet trailing()}
        <span
          class="mark-line flex flex-none items-center gap-space-1 text-ink-muted"
        >
          <span class="type-label">{role}</span>
          {#if folder.role !== "builtin" && !sunk}
            <IconChevronDown
              aria-hidden="true"
              class={[
                "size-icon-sm transition-transform duration-(--duration-control) ease-out",
                open && "rotate-180",
              ]}
            />
          {/if}
        </span>
      {/snippet}
    </MachineRow>
  </span>
{/snippet}

{#snippet path()}
  <!-- Cut from its start: the folder's own name at its end always shows.
       The marks keep a path's slashes in their order inside the cut. -->
  <span class="block ps-c-details-indent" data-box>
    <span
      class="block truncate text-left font-mono type-meta text-ink-strong"
      dir="rtl"
      title={folder.path}>&lrm;{folder.path}&lrm;</span
    >
  </span>
{/snippet}

<div
  class="flex min-w-0 flex-col"
  data-folder={folder.id}
  data-role={folder.role}
>
  {#if folder.role === "builtin" || sunk}
    <!-- Sunk: it reads, and nothing on it can be pressed. -->
    <div
      class="flex flex-col gap-space-1 rounded-sm border border-border-hairline bg-surface-recess px-space-3 py-space-2"
    >
      {@render machine()}
      {@render path()}
      {#if folder.role === "builtin"}
        <span class="ps-c-details-indent type-meta text-ink-muted"
          >{folderWords.builtinNote(folder.machine.name)}</span
        >
      {:else if folder.role === "main"}
        <span class="ps-c-details-indent type-meta text-ink-muted"
          >{folderWords.mainNote}</span
        >
      {/if}
    </div>
  {:else}
    <button
      class={cn(
        menuItemVariants(),
        "press-tint focus-inset flex w-full flex-col items-stretch gap-space-1 rounded-sm border border-transparent px-space-3 py-space-2 text-start aria-expanded:border-border-hairline aria-expanded:bg-surface-recess not-aria-expanded:can-hover:hover:bg-surface-hover"
      )}
      aria-controls="{id}-acts"
      aria-expanded={open}
      onclick={ontoggle}
      type="button"
    >
      {@render machine()}
      {@render path()}
      {#if running}
        <span
          class="mark-line flex items-center gap-space-2 ps-c-details-indent type-meta text-ink-strong"
          data-box><LiveDot /><span>{running}</span></span
        >
      {:else if folder.role === "main"}
        <span class="ps-c-details-indent type-meta text-ink-muted"
          >{folderWords.mainNote}</span
        >
      {/if}
    </button>
  {/if}

  {#if folder.missing}
    <!-- What is wrong, on the row, with its fix. -->
    <div class="px-space-3 pt-space-1 pb-space-2" data-trouble>
      <div
        class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 ps-c-details-indent"
      >
        <!-- mark-line: the glyph stands at the top of words that may wrap -->
        <span
          class={[
            "flex min-w-0 flex-1 items-start gap-space-2 type-meta",
            blocks ? "text-status-fail-ink" : "text-status-attn-ink",
          ]}
        >
          <IconWarningTriangle
            aria-hidden="true"
            class="mt-px size-icon-sm flex-none"
          />
          <span class="text-pretty">{folderWords.missing}</span>
        </span>
        <Button
          disabled={sunk}
          onclick={() => onact("locate")}
          size="sm"
          variant="outline">{actWords.locate.name}</Button
        >
      </div>
    </div>
  {/if}

  {#if open && !sunk}
    <ul
      id="{id}-acts"
      aria-label={folderWords.actionsFor(role, folder.machine.name)}
      class="m-0 flex list-none flex-col gap-px p-0 ps-c-details-indent pt-space-1"
      transition:unfold
    >
      {#each acts as { act, icon: Glyph } (act)}
        <li>
          <!-- mark-line: the glyph stands at the top of words that may wrap -->
          <button
            class={cn(
              menuItemVariants(),
              "press-tint focus-inset flex w-full items-start gap-space-3 rounded-sm px-space-3 py-space-2 text-start can-hover:hover:bg-surface-hover"
            )}
            data-act={act}
            onclick={() => (act === "disconnect" ? onconfirm() : onact(act))}
            type="button"
          >
            <Glyph aria-hidden="true" class="mt-px size-icon-md flex-none" />
            <span class="flex min-w-0 flex-col gap-px" data-box>
              <span class="type-label text-ink-strong">{actName(act)}</span>
              <span class="type-meta text-pretty text-ink-muted"
                >{actLine(act)}</span
              >
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if confirming && !sunk}
    <div
      class="mt-space-1 ms-c-details-indent flex flex-col gap-space-3 rounded-sm border border-border-hairline bg-surface-recess p-space-3"
      data-confirm="disconnect"
      transition:unfold
    >
      <p class="m-0 type-label text-pretty text-ink-strong">
        {folderWords.disconnectAsk(folder.machine.name)}
      </p>
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <Button onclick={oncancel} size="sm" variant="outline"
          >{folderWords.cancel}</Button
        >
        <Button onclick={ondisconnect} size="sm" variant="destructive"
          >{folderWords.disconnect}</Button
        >
      </div>
    </div>
  {/if}
</div>
