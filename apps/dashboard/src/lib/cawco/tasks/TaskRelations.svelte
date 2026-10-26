<script lang="ts">
  /**
   * A task's relations. Waits on and Unblocks always stand (what a session reads
   * first): every wait, its own and its whole's, unsettled first, each by
   * the house's chip for what it is (a task's row, a decision card's or a
   * pin's chip, a session's, a pull request's or run's link) and where it
   * stands, a flagged one as "Blocked: … closed unmerged". Part of, Parts,
   * Found in and Duplicate of stand only when the task has one. One "Link ▾"
   * writes a link: pick what, then the task, or paste a card, a pin or a
   * GitHub link. Unblocks and Parts are other tasks' links, read off the
   * hub's flags, so they are opened, not unlinked, here.
   */
  import Choice from "#lib/cawco/config/Choice.svelte";
  import type {
    TaskLinks,
    TaskSummary,
    TaskView,
    TaskWait,
  } from "#lib/cawco/project-tasks.js";
  import { referenceOf } from "#lib/cawco/references.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconChevronDown, IconClose, IconLink } from "#lib/icons.js";

  let {
    task,
    tasks,
    onlink,
    onopen,
  }: {
    task: TaskView;
    tasks: TaskSummary[];
    /** Writes one link change; throws the hub's refusal. */
    onlink: (links: TaskLinks) => Promise<void>;
    onopen: (id: string) => void;
  } = $props();

  const byId = $derived(new Map(tasks.map((each) => [each.id, each])));

  type LinkKind = "waitsOn" | "partOf" | "duplicateOf";
  let open = $state(false);
  let kind = $state<LinkKind>("waitsOn");
  let query = $state("");
  const candidates = $derived(
    tasks.filter(
      (each) =>
        each.id !== task.id &&
        !task.waitsOn.includes(each.id) &&
        each.id !== task.partOf &&
        `${each.id} ${each.title}`.toLowerCase().includes(query.toLowerCase())
    )
  );
  /** A pasted card (`page#card`), pin (`page/3`), session or GitHub link: only a wait takes one. */
  const pasted = $derived(
    kind === "waitsOn" && /[#/]|^https?:/i.test(query.trim())
      ? query.trim()
      : null
  );

  const KINDS: { value: LinkKind; label: string }[] = [
    { value: "waitsOn", label: "Waits on" },
    { value: "partOf", label: "Part of" },
    { value: "duplicateOf", label: "Duplicate of" },
  ];

  async function write(target: string) {
    open = false;
    query = "";
    await onlink(
      kind === "waitsOn" ? { waitsOn: [target] } : { [kind]: target }
    );
  }
</script>

{#snippet ref(id: string, remove?: () => void)}
  <span
    class="flex items-center gap-space-1 min-h-c-btn-h-sm min-w-0 pe-space-1 rounded-sm bg-surface-recess"
  >
    <button
      class="select-none flex flex-auto items-center gap-space-2 min-w-0 min-h-c-btn-h-sm px-space-2 border-none border-current rounded-sm bg-transparent text-start press-tint focus-inset"
      onclick={() => onopen(id)}
      title={byId.get(id)?.title}
      type="button"
    >
      <span class="flex-none type-meta font-mono liga-none text-ink-muted"
        >{id}</span
      >
      {#if byId.get(id)}
        <span
          class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
          >{byId.get(id)?.title}</span
        >
      {/if}
    </button>
    {#if remove}
      <Button
        aria-label="Unlink {id}"
        onclick={remove}
        size="icon-xs"
        variant="ghost"><IconClose /></Button
      >
    {/if}
  </span>
{/snippet}

{#snippet wait(one: TaskWait)}
  {#if one.kind === "task" && byId.has(one.target)}
    {@render ref(
      one.target,
      one.via
        ? undefined
        : () => onlink({ waitsOn: [one.target], remove: true })
    )}
  {:else}
    {@const drawn = one.href.startsWith("cawco:")
      ? referenceOf(one.href)
      : null}
    <span
      class="flex items-center gap-space-1 min-h-c-btn-h-sm min-w-0 px-space-2 pe-space-1 rounded-sm bg-surface-recess"
    >
      <span class="flex-auto min-w-0 overflow-clip text-ellipsis type-label">
        {#if drawn?.draw === "element"}
          <drawn.element id={drawn.id} kind={drawn.kind} label={one.label} />
        {:else if one.href.startsWith("http")}
          <a
            class="text-ink-strong"
            href={one.href}
            rel="noreferrer"
            target="_blank">{one.label}</a
          >
        {:else}
          <span class="text-ink-strong">{one.label}</span>
        {/if}
      </span>
      {#if !one.via}
        <Button
          aria-label="Unlink {one.label}"
          onclick={() => onlink({ waitsOn: [one.target], remove: true })}
          size="icon-xs"
          variant="ghost"><IconClose /></Button
        >
      {/if}
    </span>
  {/if}
  <span class="ps-space-2 type-meta text-ink-muted">
    {one.flag ? `Blocked: ${one.label} ${one.flag}` : one.state}{#if one.via}
      · through {byId.get(one.via)?.title ?? one.via}{/if}
  </span>
{/snippet}

{#snippet row(
  name: string,
  ids: string[],
  remove: ((id: string) => void) | null
)}
  <div
    class="grid grid-cols-(--edge-cols) items-box-start gap-space-2"
    style:--edge-cols="var(--c-task-edge-label-w) minmax(0, 1fr)"
  >
    <span class="pt-space-1 type-label text-ink-muted">{name}</span>
    <div data-slot="edge-list" class="flex flex-col gap-space-1 min-w-0">
      {#each ids as id (id)}
        {@render ref(id, remove ? () => remove(id) : undefined)}
      {:else}
        <span class="pt-space-1 type-meta text-ink-subtle">None</span>
      {/each}
    </div>
  </div>
{/snippet}

<section class="flex flex-col gap-space-2">
  <div class="flex items-end gap-space-2">
    <h3 class={sectionHeadVariants({ inset: "flush", class: "flex-auto" })}>
      Relations
    </h3>
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} size="xs" variant="ghost"
            ><IconLink /><span>Link</span><IconChevronDown /></Button
          >
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="end" width="wide">
        <div data-slot="pick" class="flex flex-col gap-space-2">
          <Choice
            label="Edge"
            onchange={(next) => {
              kind = next as LinkKind;
            }}
            options={KINDS}
            value={kind}
          />
          <Input
            aria-label={kind === "waitsOn"
              ? "Find a task, or paste a card, pin or GitHub link"
              : "Find a task"}
            autocomplete="off"
            placeholder={kind === "waitsOn"
              ? "Find a task, or paste a link…"
              : "Find a task…"}
            bind:value={query}
          />
          <ul
            class="flex flex-col max-h-c-task-candidates-max-h m-0 p-0 overflow-y-auto list-none"
          >
            {#if pasted}
              <li>
                <button
                  class={menuItemVariants({
                    class:
                      "select-none flex items-center gap-space-2 w-full text-start",
                  })}
                  data-menu-item
                  onclick={() => write(pasted)}
                  type="button"
                >
                  <span
                    class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
                    >Wait on {pasted}</span
                  >
                </button>
              </li>
            {/if}
            {#each candidates as each (each.id)}
              <li>
                <button
                  class={menuItemVariants({
                    class:
                      "select-none flex items-center gap-space-2 w-full text-start",
                  })}
                  data-menu-item
                  onclick={() => write(each.id)}
                  type="button"
                >
                  <span
                    class="flex-none type-meta font-mono liga-none text-ink-muted"
                    >{each.id}</span
                  >
                  <span
                    class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
                    >{each.title}</span
                  >
                </button>
              </li>
            {:else}
              {#if !pasted}
                <li class="pt-space-1 type-meta text-ink-subtle">
                  No task matches.
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
  <div
    class="grid grid-cols-(--edge-cols) items-box-start gap-space-2"
    style:--edge-cols="var(--c-task-edge-label-w) minmax(0, 1fr)"
  >
    <span class="pt-space-1 type-label text-ink-muted">Waits on</span>
    <div data-slot="edge-list" class="flex flex-col gap-space-1 min-w-0">
      {#each task.waits as one (one.target)}
        <div class="flex flex-col min-w-0">{@render wait(one)}</div>
      {:else}
        <span class="pt-space-1 type-meta text-ink-subtle">None</span>
      {/each}
    </div>
  </div>
  {@render row("Unblocks", task.unblocks, null)}
  {#if task.partOf}
    {@render row("Part of", [task.partOf], (id) =>
      onlink({ partOf: id, remove: true })
    )}
  {/if}
  {#if task.parts.length > 0}
    {@render row("Parts", task.parts, null)}
  {/if}
  {#if task.foundIn && byId.has(task.foundIn)}
    {@render row("Found in", [task.foundIn], null)}
  {:else if task.foundInNamed}
    <!-- Found in a pin's thread: the pin's own chip. -->
    {@const drawn = referenceOf(task.foundInNamed.href)}
    <div
      class="grid grid-cols-(--edge-cols) items-box-start gap-space-2"
      style:--edge-cols="var(--c-task-edge-label-w) minmax(0, 1fr)"
    >
      <span class="pt-space-1 type-label text-ink-muted">Found in</span>
      <span class="pt-space-1 min-w-0 type-label">
        {#if drawn.draw === "element"}
          <drawn.element
            id={drawn.id}
            kind={drawn.kind}
            label={task.foundInNamed.label}
          />
        {:else}
          <span class="text-ink-strong">{task.foundInNamed.label}</span>
        {/if}
      </span>
    </div>
  {/if}
  {#if task.duplicateOf}
    {@render row("Duplicate of", [task.duplicateOf], (id) =>
      onlink({ duplicateOf: id, remove: true })
    )}
  {/if}
</section>
