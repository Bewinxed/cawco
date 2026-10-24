<script lang="ts">
  import { spawnWords } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  /** Project chip + popover (§1.4, §2.7): pick, clear, or create a project. */
  import {
    IconAddCircle as Add,
    IconSuccess as Check,
    IconCloseTab as Clear,
    IconChevronDown as Down,
    IconToolFiles as Files,
    IconFolder as Folder,
  } from "#lib/icons.js";
  import NsPopover from "./NsPopover.svelte";
  import type { ProjectItem } from "./ns-types";

  let {
    projects,
    projectId,
    home,
    open,
    onchange,
    onpick,
    onclear,
    oncreate,
  }: {
    projects: ProjectItem[];
    projectId: string | undefined;
    /** The chosen machine's home folder, absolute: a new project's folder is offered under it. */
    home: string | undefined;
    open: boolean;
    onchange: (open: boolean) => void;
    onpick: (project: ProjectItem) => void;
    onclear: () => void;
    oncreate: (draft: { name: string; path: string }) => Promise<void>;
  } = $props();
  const project = $derived(projects.find((row) => row.id === projectId));
  /** Where a new project's folder is offered: `code` under the machine's home, sent absolute. */
  const codeDir = $derived(home ? `${home}/code` : undefined);
  let draft = $state<{ name: string; path: string } | null>(null);
  let creating = $state(false);
  let createError = $state("");
  const slug = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, "-");
  $effect(() => {
    if (!open) {
      draft = null;
      createError = "";
    }
  });
  function onName(value: string) {
    if (!draft) {
      return;
    }
    const follows =
      draft.path === "" ||
      (codeDir !== undefined &&
        draft.path === `${codeDir}/${slug(draft.name)}`);
    draft = {
      name: value,
      path:
        follows && codeDir !== undefined
          ? `${codeDir}/${slug(value)}`
          : draft.path,
    };
  }
  async function create() {
    if (!draft) {
      return;
    }
    creating = true;
    createError = "";
    try {
      await oncreate({ name: draft.name.trim(), path: draft.path.trim() });
      draft = null;
    } catch (cause) {
      createError = failureWords(cause);
    } finally {
      creating = false;
    }
  }
</script>

<NsPopover
  gap={2}
  id="session-project"
  label={spawnWords.project.chip(project?.name ?? spawnWords.project.none)}
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass={chipVariants({
    variant: "setting",
    tone: project ? undefined : "muted",
    // Never wider than its row: a long name ends in its ellipsis.
    class: "min-w-0",
  })}
>
  {#snippet trigger()}
    <Files class="text-hue-amber-500" />
    {#key project?.id}
      <span data-slot="chip-label" class="ns-in"
        >{project?.name ?? spawnWords.project.none}</span
      >
    {/key}
    {#if project}
      <!-- Its hit area the house's: 24px under a mouse, 44px under a finger
           (DESIGN.md, The 24 Pointer Rule; The 44 Touch Rule), over the chip
           it ends: a layer over the trigger's own touch area (its
           `touch-hit`, drawn after it), which covered it under a finger, so
           a tap on the ✕ opened the popover instead. -->
      <!-- biome-ignore lint/a11y/useSemanticElements: the clear control sits inside the chip trigger, which is already a button; buttons cannot nest -->
      <span
        data-slot="clear"
        class="ns-check pointer-hit touch-hit select-none relative z-1 -mr-space-row inline-flex size-space-5 items-center justify-center rounded-xs text-ink-subtle transition-[background-color,color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:text-ink-strong"
        onclick={(event) => {
          event.stopPropagation();
          onclear();
        }}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onclear();
          }
        }}
        role="button"
        tabindex="0"
        title={spawnWords.project.clear}><Clear class="size-icon-sm" /></span
      >
    {:else}
      <Down data-slot="chevron" />
    {/if}
  {/snippet}
  {#if draft}
    <div class="ns-panel grid gap-space-2 p-space-1">
      <label
        data-slot="project-chip-field"
        class="field-edge transition-control flex h-c-input-h max-phone:h-c-btn-h-lg items-center gap-space-2 rounded-md border border-border-control bg-surface-raised px-space-3 shadow-xs"
      >
        <Files class="size-icon-md flex-none text-ink-subtle" />
        <input
          aria-label={spawnWords.project.name}
          autocapitalize="off"
          class="type-body min-w-0 flex-1 border-none border-current bg-transparent p-0 text-ink-strong placeholder:text-ink-muted"
          oninput={(event) => onName(event.currentTarget.value)}
          placeholder={spawnWords.project.name}
          spellcheck="false"
          value={draft.name}
        />
      </label>
      <label
        data-slot="project-chip-field"
        class="field-edge transition-control flex h-c-input-h max-phone:h-c-btn-h-lg items-center gap-space-2 rounded-md border border-border-control bg-surface-raised px-space-3 shadow-xs"
      >
        <Folder class="size-icon-md flex-none text-ink-subtle" />
        <input
          aria-label={spawnWords.project.path}
          autocapitalize="off"
          class="min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-body leading-body font-normal text-ink-strong placeholder:text-ink-muted"
          oninput={(event) => {
            if (draft) {
              draft = { ...draft, path: event.currentTarget.value };
            }
          }}
          placeholder={codeDir
            ? `${codeDir}/project`
            : spawnWords.project.pathPlaceholder}
          spellcheck="false"
          value={draft.path}
        />
      </label>
      <div
        data-slot="actions"
        class="mt-space-row flex items-center justify-end gap-space-2"
      >
        <span
          class="type-meta min-w-0 flex-1 truncate text-status-fail-ink"
          role="alert">{createError}</span
        >
        <Button
          onclick={() => {
            draft = null;
          }}
          size="sm"
          variant="outline"
        >
          {spawnWords.form.back}
        </Button>
        <Button
          disabled={!(draft.name.trim() && draft.path.trim())}
          failed={createError !== ""}
          label={spawnWords.project.create}
          onclick={create}
          pending={creating}
          pendingLabel={spawnWords.project.creating}
          size="sm"
        />
      </div>
    </div>
  {:else}
    <!-- One row per project, or, with no machine chosen, per project and
         machine where it has a checkout (its meta line names the machine). -->
    {#each projects as row, index (`${row.id}:${row.machineId}`)}
      {@const on = row.id === projectId}
      <button
        data-slot="row"
        aria-pressed={on}
        class="select-none ns-in press-tint relative flex h-c-row-h w-full items-center gap-space-3 rounded-glide-row border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-strong transition-[background-color] duration-(--dur-toggle) ease-out aria-pressed:bg-selected-bg aria-pressed:text-selected-ink motion-safe:transition-[background-color,transform]"
        data-fh="1"
        data-machine-id={row.machineId}
        data-project-id={row.id}
        onclick={() => onpick(row)}
        style={`--delay:${index * 35}ms`}
        type="button"
      >
        <span data-slot="tile" class={iconTileVariants()} style:color={row.hue}
          ><Files class="size-icon-md" /></span
        >
        <span data-slot="text" class="min-w-0 flex-1">
          <span data-slot="name" class="type-label block">{row.name}</span>
          <span
            data-slot="meta"
            class="type-meta block truncate text-ink-subtle in-aria-pressed:text-selected-ink"
            >{row.machine ? `${row.machine} · ${row.path}` : row.path}</span
          >
        </span>
        {#if on}
          <Check class="ns-check size-icon-md flex-none text-selected-icon" />
        {/if}
      </button>
    {/each}
    <div
      data-slot="divider"
      class="mx-space-row my-space-1 border-t border-border-hairline"
    ></div>
    <button
      data-slot="row"
      data-add
      class="select-none ns-in press-tint relative flex h-c-row-h w-full items-center gap-space-3 rounded-glide-row border-none border-current bg-transparent px-space-2 py-space-2 text-start text-ink-muted transition-[background-color] duration-(--dur-toggle) ease-out hover:text-ink-strong motion-safe:transition-[background-color,transform]"
      data-fh="1"
      onclick={() => {
        draft = { name: "", path: "" };
      }}
      style:--delay={`${projects.length * 35}ms`}
      type="button"
    >
      <span data-slot="tile" class={iconTileVariants({ empty: true })}
        ><Add class="size-icon-md" /></span
      >
      <span data-slot="name" class="type-label block"
        >{spawnWords.project.new}</span
      >
    </button>
  {/if}
</NsPopover>
