<script lang="ts">
  /**
   * The head of Caw's panel (advisor report §2, HEAD): one row on the
   * panel's raised surface over a hairline. It says which thread you are
   * in and nothing about Caw: the bar's head already draws him, his seat
   * on the composer is his state, and the page names the project.
   *
   * - The thread's name leads, in the label role, and is the thread menu:
   *   his other threads, then New thread. A new thread says "New thread".
   * - `title`: whose words the name is.
   *   - `named`: the few words Caw gave the thread when he first answered,
   *     always shown (they are not your first message, so nothing repeats).
   *   - `offscreen`: your first message's first line (hub caw.ts
   *     `titleFrom`, today's title), shown only while that message is off
   *     screen (`hidden` says it is in view); with it in view the menu is
   *     the chevron alone, its name read by assistive tech.
   * - `off`: an Off chip after the name, its press turns him on (it
   *   changes what a message does).
   * - Trailing: Open as a tab on a desk, Close on a phone.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconChevronDown,
    IconClose,
    IconMaximize,
    IconPlus,
  } from "#lib/icons.js";
  import { THREADS } from "./fixtures";

  let {
    form,
    name,
    hidden = false,
    off = false,
  }: {
    form: "desk" | "phone";
    /** The thread's name; null for a new thread. */
    name: string | null;
    /** The name stands hidden: your first message, which it repeats, is in view. */
    hidden?: boolean;
    off?: boolean;
  } = $props();

  const phone = $derived(form === "phone");
  const shown = $derived(name ?? "New thread");
</script>

<div
  class={[
    "flex min-block-c-btn-h-lg shrink-0 items-center gap-space-2 border-border-hairline border-be py-space-1",
    phone ? "ps-space-4 pe-space-2" : "ps-space-3 pe-space-1",
  ]}
  data-panel-head
>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={hidden ? shown : undefined}
          class="mark-line press-tint -ms-space-2 flex min-inline-0 items-center gap-space-1 rounded-sm px-space-2 py-space-1 text-ink-strong text-label hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-solid"
          data-panel-thread={hidden ? "hidden" : "named"}
          type="button"
        >
          {#if !hidden}
            <span
              class="min-inline-0 overflow-clip text-ellipsis whitespace-nowrap"
              data-panel-name>{shown}</span
            >
          {/if}
          <IconChevronDown
            aria-hidden="true"
            class="size-icon-sm shrink-0 text-ink-muted"
          />
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start">
      {#each THREADS as one (one)}
        <DropdownMenu.Item
          ><span
            class="min-inline-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{one}</span
          ></DropdownMenu.Item
        >
      {/each}
      <DropdownMenu.Separator />
      <DropdownMenu.Item
        ><IconPlus aria-hidden="true" /><span>New thread</span
        ></DropdownMenu.Item
      >
    </DropdownMenu.Content>
  </DropdownMenu.Root>
  {#if off}
    <Button
      class="shrink-0"
      data-panel-off
      label="Off"
      size="xs"
      variant="secondary"
    />
  {/if}
  <span class="ms-auto flex shrink-0 items-center">
    {#if phone}
      <Button
        aria-label="Close"
        icon={IconClose}
        size="icon-sm"
        variant="ghost"
      />
    {:else}
      <Button
        aria-label="Open as a tab"
        icon={IconMaximize}
        size="icon-sm"
        variant="ghost"
      />
    {/if}
  </span>
</div>
