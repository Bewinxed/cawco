<script lang="ts">
  import { failureWords } from "#lib/cawco/hub-read.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  /** Project chip + popover (§1.4, §2.7): pick, clear, or create a project. */
  import Add from "~icons/solar/add-circle-bold-duotone";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Check from "~icons/solar/check-circle-bold-duotone";
  import Clear from "~icons/solar/close-square-bold-duotone";
  import Folder from "~icons/solar/folder-bold-duotone";
  import Files from "~icons/solar/folder-with-files-bold-duotone";
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
  label={`Project: ${project?.name ?? "No project"}`}
  {onchange}
  {open}
  rows="[data-fh]"
  triggerClass="ns-chip-btn"
  triggerTone={project ? undefined : "muted"}
>
  {#snippet trigger()}
    <Files class="text-hue-amber-500" />
    {#key project?.id}
      <span data-slot="chip-label" class="swap"
        >{project?.name ?? "No project"}</span
      >
    {/key}
    {#if project}
      <!-- literal: 18px box -->
      <!-- biome-ignore lint/a11y/useSemanticElements: the clear control sits inside the chip trigger, which is already a button; buttons cannot nest -->
      <span
        data-slot="clear"
        class="clear ns-check relative -mr-space-row inline-flex size-(--box) items-center justify-center rounded-xs text-ink-subtle transition-[background-color,color] dur-control ease-out hover:bg-surface-hover hover:text-ink-strong"
        style:--box="18px"
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
        title="Clear project"><Clear class="size-icon-sm" /></span
      >
    {:else}
      <Down data-slot="chevron" />
    {/if}
  {/snippet}
  {#if draft}
    <!-- literal: 8px gap -->
    <div class="ns-panel grid gap-(--gap) p-space-1" style:--gap="8px">
      <!-- literal: 8px gap, 36px / 44px height, 10px inline padding -->
      <label
        data-slot="project-chip-field"
        class="field-shell flex h-(--h) max-phone:h-(--h-phone) items-center gap-(--gap) rounded-md border border-border-control bg-surface-raised px-(--pad-x) shadow-xs"
        style:--gap="8px"
        style:--h="36px"
        style:--h-phone="44px"
        style:--pad-x="10px"
      >
        <Files class="size-icon-md flex-none text-ink-subtle" />
        <!-- literal: 1.4 line height, 1rem on a phone -->
        <input
          aria-label="Project name"
          autocapitalize="off"
          class="min-w-0 flex-1 border-none border-current bg-transparent p-0 font-body text-size-body leading-(--lh) font-normal text-ink-strong outline-off max-phone:text-(length:--fs-phone)"
          oninput={(event) => onName(event.currentTarget.value)}
          placeholder="Project name"
          spellcheck="false"
          style:--fs-phone="1rem"
          style:--lh="1.4"
          value={draft.name}
        />
      </label>
      <!-- literal: 8px gap, 36px / 44px height, 10px inline padding -->
      <label
        data-slot="project-chip-field"
        class="field-shell flex h-(--h) max-phone:h-(--h-phone) items-center gap-(--gap) rounded-md border border-border-control bg-surface-raised px-(--pad-x) shadow-xs"
        style:--gap="8px"
        style:--h="36px"
        style:--h-phone="44px"
        style:--pad-x="10px"
      >
        <Folder class="size-icon-md flex-none text-ink-subtle" />
        <!-- literal: 1.4 line height, 1rem on a phone -->
        <input
          aria-label="Project path"
          autocapitalize="off"
          class="min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-body leading-(--lh) font-normal text-ink-strong outline-off max-phone:text-(length:--fs-phone)"
          oninput={(event) => {
            if (draft) {
              draft = { ...draft, path: event.currentTarget.value };
            }
          }}
          placeholder={codeDir ? `${codeDir}/project` : "/path/to/project"}
          spellcheck="false"
          style:--fs-phone="1rem"
          style:--lh="1.4"
          value={draft.path}
        />
      </label>
      <!-- literal: 6px gap -->
      <div
        data-slot="actions"
        class="mt-space-row flex items-center justify-end gap-(--gap)"
        style:--gap="6px"
      >
        <span
          class="type-meta min-w-0 flex-1 truncate text-status-fail-ink"
          role="alert">{createError}</span
        >
        <button
          class="ns-btn touch-hit"
          data-size="sm"
          onclick={() => {
            draft = null;
          }}
          type="button"
        >
          Back
        </button>
        <button
          data-slot="primary"
          aria-busy={creating || undefined}
          aria-disabled={creating || undefined}
          class="ns-btn touch-hit"
          data-size="sm"
          data-variant="primary"
          disabled={!(draft.name.trim() && draft.path.trim())}
          onclick={whileIdle(() => creating, create)}
          type="button"
        >
          <PendingContent
            failed={createError !== ""}
            label="Create"
            pending={creating}
            pendingLabel="Creating…"
          />
        </button>
      </div>
    </div>
  {:else}
    {#each projects as row, index (row.id)}
      {@const on = row.id === projectId}
      <!-- literal: 10px gap, 44px height, 6px 8px padding, 24px tile -->
      <button
        data-slot="row"
        aria-pressed={on}
        class="ns-in press-tint relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-strong transition-[background-color] dur-toggle ease-out aria-pressed:bg-surface-fill motion-safe:transition-[background-color,transform]"
        data-fh="1"
        onclick={() => onpick(row)}
        style={`--delay:${index * 35}ms`}
        style:--gap="10px"
        style:--h="44px"
        style:--pad-x="8px"
        style:--pad-y="6px"
        type="button"
      >
        <span
          data-slot="tile"
          class="ns-tile size-(--tile) text-(--hue)"
          style:--hue={row.hue}
          style:--tile="24px"><Files class="size-icon-md" /></span
        >
        <span data-slot="text" class="min-w-0 flex-1">
          <span data-slot="name" class="type-label block">{row.name}</span>
          <span
            data-slot="meta"
            class="type-meta block truncate text-ink-subtle">{row.path}</span
          >
        </span>
        {#if on}
          <Check class="ns-check size-icon-md flex-none text-ink-strong" />
        {/if}
      </button>
    {/each}
    <!-- literal: 1px rule -->
    <div
      data-slot="divider"
      class="mx-space-row my-space-1 h-(--h) bg-border-hairline"
      style:--h="1px"
    ></div>
    <!-- literal: 10px gap, 40px height, 6px 8px padding, 24px tile -->
    <button
      data-slot="row"
      data-add
      class="ns-in press-tint relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-muted transition-[background-color] dur-toggle ease-out hover:text-ink-strong motion-safe:transition-[background-color,transform]"
      data-fh="1"
      onclick={() => {
        draft = { name: "", path: "" };
      }}
      style="--delay:110ms"
      style:--gap="10px"
      style:--h="40px"
      style:--pad-x="8px"
      style:--pad-y="6px"
      type="button"
    >
      <span
        data-slot="tile"
        class="ns-tile size-(--tile)"
        data-variant="dashed"
        style:--tile="24px"><Add class="size-icon-md" /></span
      >
      <span data-slot="name" class="type-label block">New project…</span>
    </button>
  {/if}
</NsPopover>

<style>
  /* residual: pseudo */
  /* A little larger than the mark, never larger than the chip: a 44px target
     here reached over the label, so clicking the project's name cleared it. */
  .clear::before {
    content: "";
    position: absolute;
    inset: calc(var(--space-1) * -1);
  }
  /* residual: keyframes */
  .swap {
    @media (prefers-reduced-motion: no-preference) {
      animation: ns-in var(--ns-row-ms) var(--ease-out) both;
    }
  }
</style>
