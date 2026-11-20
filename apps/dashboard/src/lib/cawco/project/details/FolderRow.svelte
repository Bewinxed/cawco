<script lang="ts">
  import { actWords, folderWords } from "@cawco/core/words/project-details";
  /**
   * One folder of the project, one item of Files and locations' list (the
   * list draws the hairline between items), on one grid so every item's
   * columns line up with the next's: its computer's mark in the lead
   * column; the computer's name leading in the label role, what the folder
   * is to the project (Main folder, Extra folder, Built-in folder) at the
   * end of the same line; under them, the folder's path in the meta role
   * and whether the computer answers at the end of that line, the role and
   * the presence on one trailing edge; the chevron in a column of its own,
   * kept empty where there is none, so that edge holds in every item. The
   * Built-in folder wears a folder glyph in place of its computer's mark.
   *
   * Three looks, one meaning each: the Built-in folder, which can't be
   * pressed, has no chevron and no hover; an opened folder and its acts
   * stand on the recess; while CawCo is out of reach every row fades as
   * each disabled control on the card does (50%), and its computer reads
   * as last read (`asOf`): a grey dot, never a live one.
   *
   * A press on the row opens its rare acts under it, each a row with its
   * name and one line saying what it does (Move files, Locate folder,
   * Disconnect folder); the Main folder has no Disconnect folder and the
   * Built-in folder is sunk, with no acts. A missing folder says so on the
   * row, with Locate folder as its fix; a Locate folder named while its
   * computer was offline says where the folder goes once that computer is
   * back, with Call off, in the fix's place. Disconnect folder asks under the
   * row, in place: one line of what it does, then Disconnect folder or
   * Cancel; a refusal stands there in the hub's words.
   *
   * The path is cut from its start where the column is narrow, so its end,
   * the folder's own name, always shows.
   */
  import OsMark from "#lib/cawco/OsMark.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { machineHue } from "#lib/components/ui/machine-row/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import {
    IconChevronDown,
    IconClock,
    IconFolder,
    IconMapPoint,
    IconMinusLinear,
    IconTransfer,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { cn } from "#lib/utils.js";
  import type { Folder, FolderAct, Pending } from "./details";

  let {
    folder,
    hue,
    open = false,
    confirming = false,
    running = null,
    disconnecting,
    callingOff,
    sunk = false,
    still = false,
    asOf = null,
    ontoggle,
    onact,
    onconfirm,
    ondisconnect,
    oncancel,
    oncalloff,
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
    /** Disconnect folder was sent for it: waiting, or the hub's refusal. */
    disconnecting?: Pending;
    /** Call off was sent for its waiting Locate folder: waiting, or the hub's refusal. */
    callingOff?: Pending;
    /** Nothing can be sent: the row reads, and opens nothing. */
    sunk?: boolean;
    /** It only reads here (the folder a step acts on): flat, with no acts. */
    still?: boolean;
    /** CawCo is out of reach: when the details shown were read. */
    asOf?: string | null;
    ontoggle: () => void;
    onact: (act: FolderAct) => void;
    /** Disconnect folder was pressed: ask under the row. */
    onconfirm: () => void;
    ondisconnect: () => void;
    oncancel: () => void;
    /** Call off its waiting Locate folder. */
    oncalloff: () => void;
  } = $props();

  const id = $props.id();
  const role = $derived(folderWords.role[folder.role]);
  /** When what the row says of its computer was read, if not just now. */
  const readAt = $derived(folder.readAt ?? asOf);
  const meta = $derived.by(() => {
    if (readAt) {
      return folderWords.asOf(folder.machine.online, readAt);
    }
    return folder.machine.online ? folderWords.online : folderWords.offline;
  });
  /** Live only while read just now: a presence read earlier is never shown as live. */
  const presence = $derived(
    folder.machine.online && !readAt ? "online" : "off"
  );
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
  const pressable = $derived(folder.role !== "builtin" && !sunk && !still);
</script>

{#snippet face()}
  <!-- mark-line: the mark spans the item's two lines, centred beside both -->
  <span
    class="grid w-full min-w-0 grid-cols-folder-row items-baseline gap-x-space-3 gap-y-px"
  >
    <span
      class={iconTileVariants({
        class: "row-span-2 self-center text-(color:--folder-hue)",
      })}
      style:--folder-hue={machineHue(hue, folder.machine.online)}
    >
      {#if folder.role === "builtin"}
        <IconFolder aria-hidden="true" class="size-icon-md flex-none" />
      {:else}
        <OsMark
          aria-hidden="true"
          class="size-icon-md flex-none"
          os={folder.machine.os}
        />
      {/if}
    </span>
    <span class="min-w-0 truncate type-label text-ink-strong"
      >{folder.machine.name}</span
    >
    <span class="text-end type-meta whitespace-nowrap text-ink-muted"
      >{role}</span
    >
    <span class="row-span-2 self-center">
      {#if pressable}
        <IconChevronDown
          aria-hidden="true"
          class={[
            "block size-icon-sm text-ink-muted transition-transform duration-(--duration-control) ease-out",
            open && "rotate-180",
          ]}
        />
      {/if}
    </span>
    <!-- The path, cut from its start so the folder's own name at its end
         always shows; the marks keep a path's slashes in their order
         inside the cut. -->
    <span
      class="col-start-2 block min-w-0 truncate text-left font-mono type-meta text-ink-muted"
      dir="rtl"
      title={folder.path}>&lrm;{folder.path}&lrm;</span
    >
    <span
      class="mark-line flex items-center justify-end gap-space-1 type-meta whitespace-nowrap text-ink-muted"
      data-box
      ><span
        class={[
          "size-(--status-dot-size) flex-none rounded-pill",
          presence === "online" ? "bg-presence-online" : "bg-presence-off",
        ]}
        data-box
      ></span><span>{meta}</span></span
    >
    {#if folder.role === "builtin"}
      <span class="col-start-2 col-end-4 type-meta text-pretty text-ink-muted"
        >{folderWords.builtinNote}</span
      >
    {/if}
    {#if running}
      <span
        class="mark-line col-start-2 col-end-4 flex items-center gap-space-2 type-meta text-ink-strong"
        data-box><LiveDot /><span>{running}</span></span
      >
    {/if}
  </span>
{/snippet}

<!-- Opened, the item and its acts stand on the recess. -->
<div
  class={[
    "flex min-w-0 flex-col motion-safe:transition-[background-color] motion-safe:duration-(--duration-control) motion-safe:ease-out",
    open && pressable && "bg-surface-recess pb-space-2",
  ]}
  data-folder={folder.id}
  data-role={folder.role}
>
  {#if pressable}
    <button
      class={cn(
        menuItemVariants(),
        "press-tint focus-inset flex w-full rounded-none px-space-3 py-space-2 text-start not-aria-expanded:can-hover:hover:bg-surface-hover"
      )}
      aria-controls="{id}-acts"
      aria-expanded={open}
      onclick={ontoggle}
      type="button"
    >
      {@render face()}
    </button>
  {:else}
    <!-- Flat: it reads, and nothing on it can be pressed. -->
    <div class={["flex px-space-3 py-space-2", sunk && "opacity-50"]}>
      {@render face()}
    </div>
  {/if}

  {#if folder.locateTo}
    <!-- Its fix, waiting for its computer, with Call off. -->
    <div
      class="flex flex-col gap-space-2 ms-space-3 ps-c-details-indent pe-space-3 pt-space-1 pb-space-2"
      data-waits
    >
      <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2">
        <!-- mark-line: the glyph stands at the top of words that may wrap -->
        <span
          class="flex min-w-0 flex-1 items-start gap-space-2 type-meta text-ink-muted"
        >
          <IconClock aria-hidden="true" class="mt-px size-icon-sm flex-none" />
          <span class="min-w-0 text-pretty wrap-anywhere"
            >{folderWords.locateWaits(
              folder.locateTo,
              folder.machine.name
            )}</span
          >
        </span>
        {#if !still}
          <Button
            disabled={sunk}
            onclick={oncalloff}
            pending={Boolean(callingOff && !callingOff.refused)}
            size="sm"
            variant="outline">{folderWords.callOff}</Button
          >
        {/if}
      </div>
      <RowFault again={oncalloff} reason={callingOff?.refused ?? null} />
    </div>
  {:else if folder.missing}
    <!-- What is wrong, on the row, with its fix. -->
    <div
      class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 ms-space-3 ps-c-details-indent pe-space-3 pt-space-1 pb-space-2"
      data-trouble
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
      {#if !still}
        <Button
          disabled={sunk}
          onclick={() => onact("locate")}
          size="sm"
          variant="outline">{actWords.locate.name}</Button
        >
      {/if}
    </div>
  {/if}

  {#if open && pressable}
    <ul
      id="{id}-acts"
      aria-label={folderWords.actionsFor(role, folder.machine.name)}
      class="m-0 flex list-none flex-col gap-px p-0 ms-space-1 ps-c-details-indent pe-space-3 pt-space-1"
      transition:unfold
    >
      {#each acts as { act, icon: Glyph } (act)}
        <li>
          <!-- mark-line: the glyph stands at the top of words that may wrap -->
          <button
            class={cn(
              menuItemVariants(),
              "press-tint focus-inset flex w-full items-start gap-space-3 rounded-sm px-space-2 py-space-1 text-start can-hover:hover:bg-surface-hover"
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

  {#if (confirming || disconnecting) && !sunk}
    <div
      class="mx-space-3 mb-space-3 flex flex-col gap-space-3 rounded-sm border border-border-hairline bg-surface-recess p-space-3"
      data-confirm="disconnect"
      transition:unfold
    >
      <p class="m-0 type-label text-pretty text-ink-strong">
        {folderWords.disconnectAsk(folder.machine.name)}
      </p>
      <RowFault again={ondisconnect} reason={disconnecting?.refused ?? null} />
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <Button onclick={oncancel} size="sm" variant="outline"
          >{folderWords.cancel}</Button
        >
        <Button
          onclick={ondisconnect}
          pending={Boolean(disconnecting && !disconnecting.refused)}
          size="sm"
          variant="destructive">{folderWords.disconnect}</Button
        >
      </div>
    </div>
  {/if}
</div>
