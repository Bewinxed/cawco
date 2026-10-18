<script lang="ts">
  /**
   * PROPOSED (pins 7 and 9: "this whole title bar needs to be rethought",
   * "i haven't seen anyone design a modal like this before"): the panel's
   * head as the platform draws each of its two shapes.
   *
   * - On a desk the panel is a popover, which closes on a press outside it
   *   or Escape (CawFloat); HIG, Popovers: "Use a Close button for
   *   confirmation and guidance only." So no Close: the thread's title at
   *   the leading edge, on the content's start edge, and New thread (+)
   *   and More (…) trailing.
   * - On a phone it is a sheet (DESIGN.md, Drawer): the 100×6 grabber, then
   *   the iOS sheet toolbar. HIG, Sheets: "the Cancel button belongs on the
   *   leading edge of the top toolbar", so Close leads, the title is
   *   centred between two sides of one width, and New thread and More
   *   trail. Swiping down still dismisses (the kit sheet).
   * - The title is one line, truncated: "New thread" for one not yet
   *   started. With more than one thread it is the control that opens the
   *   thread list (chevron); with one it is plain text.
   * - More holds Caw's session (his lead session's card: harness and
   *   model) and Open as a tab.
   */
  import {
    CAW_DENIED_TOOLS,
    type CawHarness,
    type HarnessKind,
    type ThreadSummary,
  } from "@cawco/core";
  import { clock } from "#lib/cawco/home/home-state.svelte.js";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconCheck,
    IconChevronDown,
    IconClose,
    IconMaximize,
    IconMore,
    IconPlus,
    IconUser,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import type { Form } from "../form";
  import Resize from "./Resize.svelte";

  let {
    form,
    threads,
    current,
    lead,
    projectName,
    wide = false,
  }: {
    /** The panel's form, as its frame names it: the desk's popover or the phone's sheet. */
    form: Form;
    threads: ThreadSummary[];
    /** The thread on show; "" for a new thread not yet started. */
    current: string;
    lead: CawLead;
    projectName: string;
    /** The panel resizes by a "Wide panel" item in More (pin 11, option B). */
    wide?: boolean;
  } = $props();

  const phone = $derived(form === "phone");
  /** Wide panel is a desk item only: a phone's sheet has no size to choose. */
  const widens = $derived(wide && !phone);
  const on = $derived(threads.find((one) => one.id === current) ?? null);
  const title = $derived(on?.title ?? "New thread");
  const leadId = $derived(lead.view?.leadInstanceId ?? null);

  let bar = $state<HTMLElement | null>(null);
  /** The panel's own controls, which the toolbar's act through. */
  const press = (label: string) =>
    bar
      ?.closest("[data-caw-panel]")
      ?.querySelector<HTMLElement>(`[data-caw-head] [aria-label="${label}"]`)
      ?.click();

  // His session's card, opened from More, anchored to it.
  let more = $state<HTMLElement | null>(null);
  let cardOpen = $state(false);
  /** The harnesses Caw runs on, as the hub lists them (its `CAW_HARNESSES`). */
  const HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];
  const runsCaw = (harness: HarnessKind): harness is CawHarness =>
    (HARNESSES as HarnessKind[]).includes(harness);
  let choosing = $state(false);
  /** His harness and model, as his lead session's card keeps them (CawThread's `kept`). */
  const kept = $derived(
    lead.view
      ? {
          harness: lead.view.harness,
          model: lead.view.model,
          harnesses: HARNESSES,
          onchoose: ({
            harness,
            model,
          }: {
            harness: HarnessKind;
            model: string;
          }) => {
            if (!runsCaw(harness)) {
              return;
            }
            choosing = true;
            lead.configure(
              harness === lead.view?.harness
                ? { model: model || null }
                : { harness, model: model || null }
            );
          },
          pending: choosing && lead.moving,
          refused: choosing ? lead.refused : null,
        }
      : null
  );
</script>

<div
  bind:this={bar}
  class="flex min-w-0 flex-none flex-col border-[var(--border-hairline)] border-b"
  data-design-toolbar
>
  {#if phone}
    <span
      aria-hidden="true"
      class="mx-auto mt-(--space-2) block h-1.5 w-[100px] max-w-[40%] rounded-full bg-[var(--border-control)]"
      data-design-grabber
    ></span>
  {/if}
  <div class={["row", { phone }]} data-design-toolbar-row>
    {#if phone}
      <Button
        aria-label="Close"
        class="justify-self-start"
        icon={IconClose}
        onclick={() => {
          lead.open = false;
        }}
        size="icon-sm"
        variant="ghost"
      />
    {/if}
    <div class="title" data-design-title>
      {#if threads.length > 1 && on}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <!-- Its words on the title's edge: the ghost button's own
                   1px edge and 11px inset are taken back on a desk. -->
              <Button
                {...props}
                aria-label={title}
                class={["min-w-0 max-w-full shrink", !phone && "-ms-[12px]"]}
                press="tint"
                size="sm"
                variant="ghost"
              >
                <span
                  class={[
                    "min-w-0 truncate",
                    phone ? "text-title" : "text-label",
                  ]}>{title}</span
                >
                <IconChevronDown aria-hidden="true" class="shrink-0" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            align={phone ? "center" : "start"}
            class="w-[min(20rem,calc(100vw-24px))]"
          >
            {#each threads as one (one.id)}
              <DropdownMenu.Item class="min-w-0 gap-(--space-2)">
                <span class="grid size-(--icon-md) shrink-0 place-items-center">
                  {#if one.id === on?.id}<IconCheck aria-hidden="true" />{/if}
                </span>
                <span class="min-w-0 flex-1 truncate">{one.title}</span>
                <span class="shrink-0 text-[var(--ink-subtle)] text-meta"
                  >{formatAgeShort(one.lastAt, clock.now)}</span
                >
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <span
          class={[
            "min-w-0 truncate text-[var(--ink-strong)]",
            phone ? "text-title" : "text-label",
          ]}>{title}</span
        >
      {/if}
    </div>
    <div class="trail">
      {#if on}
        <Button
          aria-label="New thread"
          icon={IconPlus}
          onclick={() => press("New thread")}
          size="icon-sm"
          variant="ghost"
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                aria-label="More"
                icon={IconMore}
                size="icon-sm"
                variant="ghost"
                bind:ref={more}
              />
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="min-w-44">
            {#if leadId}
              <DropdownMenu.Item
                onSelect={() => {
                  setTimeout(() => {
                    cardOpen = true;
                  });
                }}
              >
                <IconUser aria-hidden="true" />
                <span>Caw's session</span>
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Item onSelect={() => press("Open as a tab")}>
              <IconMaximize aria-hidden="true" />
              <span>Open as a tab</span>
            </DropdownMenu.Item>
            {#if widens}
              <DropdownMenu.Separator />
              <Resize {form} mode="wide" />
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
  </div>
</div>

{#if leadId}
  <Popover.Root
    onOpenChange={(next) => {
      cardOpen = next;
    }}
    open={cardOpen}
  >
    <Popover.Content
      align="end"
      aria-label="Caw's session"
      class="caw-lead-card"
      collisionPadding={12}
      customAnchor={more}
      data-design-lead-card
      side="bottom"
      sideOffset={4}
    >
      <SessionDetails
        dir={1}
        href={current ? `/thread/${encodeURIComponent(current)}` : "/"}
        {kept}
        onclose={() => {
          cardOpen = false;
        }}
        sessionId={leadId}
        title="Caw · lead of {projectName}"
      />
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  /* A desk: the title on the content's start edge (the composer's: --space-7
     in a panel), its actions trailing. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
    min-block-size: calc(var(--c-btn-h-sm) + var(--space-2) * 2);
    padding-block: var(--space-2);
    padding-inline: var(--space-7) var(--space-2);
  }
  .title {
    display: flex;
    min-inline-size: 0;
  }
  .trail {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  /* A phone's sheet: Close leading, the title centred between two sides
     of one width (two icon buttons), the actions trailing. */
  .row.phone {
    --side: calc(var(--c-btn-h-sm) * 2 + var(--space-1));
    grid-template-columns:
      minmax(var(--side), 1fr) minmax(0, max-content)
      minmax(var(--side), 1fr);
    padding-inline: var(--space-2);

    & .title {
      justify-content: center;
    }
    & .trail {
      justify-content: end;
    }
  }
</style>
