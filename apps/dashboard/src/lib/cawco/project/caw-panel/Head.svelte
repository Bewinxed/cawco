<script lang="ts">
  import type { CawStatus } from "#lib/cawco/home/Caw.svelte";
  /**
   * The head of Caw's panel, one 44px row on the panel's raised surface over
   * a hairline: whose panel it is, which thread, and what you can do to the
   * panel. Pins 8, 23 and 28 asked what it is for; this answers who, which
   * and what next, and says nothing else.
   *
   * - Caw's mark (28px, his still in his pose) in the 28px lead column, the
   *   words `space-3` after it (DESIGN.md, Caw's panel: one row grid).
   * - `who`: "Caw" over the thread's name, the thread's name a menu of his
   *   other threads (the switcher), shown only while `named`: the name is
   *   your first message's first line, so with that message in view it
   *   would say it twice. A new thread, with no message yet, says "New
   *   thread". `name`: "Caw" alone, never the thread's name.
   * - Both list the threads in More, so switching never waits on the name.
   * - Beside "Caw", a fact you'd act on as a Badge (pin 12, applied): what
   *   waits on you, the budget, off. Nothing when there is nothing.
   * - Desk: a popover, which Escape and a press outside close (HIG,
   *   Popovers), so New thread and More trail and there is no Close. Phone:
   *   Close is last (DESIGN.md, Drawer's head), New thread moves into
   *   More so the thread's name keeps its room at 390.
   * - `menu`: More stands open, drawn in the panel (no portal), taking no
   *   focus and locking no scroll, for a frame that shows what it holds.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconChevronDown,
    IconClose,
    IconMaximize,
    IconMore,
    IconPlus,
    IconUser,
  } from "#lib/icons.js";
  import { THREADS } from "./fixtures";

  let {
    form,
    kind = "who",
    thread,
    fact = null,
    pose = "ready",
    wide = null,
    menu = false,
    named = true,
  }: {
    form: "desk" | "phone";
    kind?: "who" | "name";
    /** The thread on show; null for a new one. */
    thread: string | null;
    /** A fact you'd act on, as a Badge beside his name. */
    fact?: { text: string; tone: BadgeVariant } | null;
    pose?: CawStatus;
    /** The resize option that puts Wide panel in More: whether it is wide now. */
    wide?: { on: boolean; toggle: () => void } | null;
    /** More stands open in the frame. */
    menu?: boolean;
    /** Your first message, the thread's name, is off screen: the name may stand here. */
    named?: boolean;
  } = $props();

  /** More, held open in the frame: in the panel, no focus taken, no scroll locked, a press outside keeping it. */
  const held = $derived(
    menu
      ? {
          portalProps: { disabled: true },
          strategy: "absolute" as const,
          preventScroll: false,
          trapFocus: false,
          onOpenAutoFocus: (event: Event) => event.preventDefault(),
          onCloseAutoFocus: (event: Event) => event.preventDefault(),
          onInteractOutside: (event: Event) => event.preventDefault(),
          onEscapeKeydown: (event: Event) => event.preventDefault(),
        }
      : {}
  );

  const phone = $derived(form === "phone");
  const name = $derived(thread ?? "New thread");
</script>

<div
  class={[
    "grid min-block-(--c-btn-h-lg) shrink-0 grid-cols-[var(--c-row-lead)_minmax(0,1fr)_auto] items-center gap-x-(--space-3) border-(--border-hairline) border-be py-(--space-1)",
    phone ? "px-(--space-4)" : "px-(--space-3)",
  ]}
  data-panel-head={kind}
>
  <!-- mark-line: Caw stands centred on his name and the thread's line together -->
  <span class="grid place-items-center" data-box
    ><CawFace size={28} status={pose} /></span
  >
  <div class="flex min-inline-0 flex-col items-start">
    <div
      class="mark-line flex min-inline-0 max-inline-full items-center gap-(--space-2)"
    >
      <span class="text-(--ink-strong) text-label">Caw</span>
      {#if fact}
        <Badge data-box class="min-inline-0" data-panel-fact variant={fact.tone}
          ><span class="mark-text min-inline-0 overflow-clip text-ellipsis"
            >{fact.text}</span
          ></Badge
        >
      {/if}
    </div>
    {#if kind === "who" && (named || thread === null)}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="mark-line press-tint -mx-(--space-1) flex min-inline-0 max-inline-full cursor-pointer items-center gap-(--space-1) rounded-xs px-(--space-1) text-(--ink-muted) text-meta hover:bg-(--surface-hover) focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-(--focus-ring) focus-visible:outline-solid"
              data-panel-thread
              type="button"
            >
              <span
                class="min-inline-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{name}</span
              >
              <IconChevronDown
                aria-hidden="true"
                class="size-(--icon-sm) shrink-0"
              />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="start"
          class="max-inline-[min(var(--c-panel-w),calc(100vw-var(--space-6)))]"
        >
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
    {/if}
  </div>
  <div
    class="-me-(--space-2) flex items-center gap-(--space-1) pointer-coarse:gap-(--space-5)"
  >
    {#if !phone}
      <Button
        aria-label="New thread"
        icon={IconPlus}
        size="icon-sm"
        variant="ghost"
      />
    {/if}
    <DropdownMenu.Root open={menu}>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label="More"
            icon={IconMore}
            size="icon-sm"
            variant="ghost"
          />
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        class="max-inline-[min(var(--c-panel-w),calc(100vw-var(--space-6)))] min-inline-44"
        {...held}
      >
        {#each THREADS as one (one)}
          <DropdownMenu.Item
            ><span class="min-inline-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{one}</span
            ></DropdownMenu.Item
          >
        {/each}
        <DropdownMenu.Separator />
        {#if phone}
          <DropdownMenu.Item
            ><IconPlus aria-hidden="true" /><span>New thread</span
            ></DropdownMenu.Item
          >
        {/if}
        <DropdownMenu.Item
          ><IconUser aria-hidden="true" /><span>Caw's session</span
          ></DropdownMenu.Item
        >
        <DropdownMenu.Item
          ><IconMaximize aria-hidden="true" /><span>Open as a tab</span
          ></DropdownMenu.Item
        >
        {#if wide && !phone}
          <DropdownMenu.Separator />
          <DropdownMenu.CheckboxItem
            checked={wide.on}
            onCheckedChange={wide.toggle}
            ><span>Wide panel</span></DropdownMenu.CheckboxItem
          >
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    {#if phone}
      <Button
        aria-label="Close"
        class="size-7"
        icon={IconClose}
        size="icon-sm"
        variant="ghost"
      />
    {/if}
  </div>
</div>
