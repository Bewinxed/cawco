<script lang="ts">
  /**
   * PROPOSED (head, A; pins: "this whole title bar needs to be rethought",
   * "i haven't seen anyone design a modal like this before", "is this phone
   * view? desktop view?"): the panel's toolbar. It answers who (Caw), which
   * thread, and what you can do to the panel, in one 44px row; no status
   * words (his pose is his status).
   *
   * It stands on the panel's row grid (DESIGN.md, Caw's panel): Caw's 28px
   * mark centred in the 28px lead column, the words on the text column
   * --space-3 after it, and the last control's ink on the trailing edge
   * --space-3 in from the panel's (its box hangs past by its glyph's inset).
   *
   * - `who` (A1): "Caw" (label, ink-strong) over the thread's name (meta,
   *   ink-muted, chevron), the two lines one menu button (ThreadSwitch).
   * - `name` (A2): Caw's mark and "Caw" alone; the thread is the body's
   *   first row (Panel draws it).
   * - Desk: the panel is a popover, which a press outside or Escape closes
   *   (HIG, Popovers: "Use a Close button for confirmation and guidance
   *   only"), so New thread and More trail and there is no Close.
   * - Phone: DESIGN.md's Drawer, the sheet's 100×6 grabber over the row and
   *   Close last at the trailing edge, a 28px ghost with a 16px glyph and
   *   44px under a finger. Hanging from his tab (`grabber` off) it is the
   *   same row with Close and no grabber. Three 44px controls leave the
   *   thread's name too little room at 390, so New thread goes into More
   *   first (the artifact panel head's overflow rule), leaving More and
   *   Close.
   * - More holds Caw's session (his lead session's card) and Open as a tab.
   */
  import {
    CAW_DENIED_TOOLS,
    type CawHarness,
    type HarnessKind,
    type ThreadSummary,
  } from "@cawco/core";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconClose,
    IconMaximize,
    IconMore,
    IconPlus,
    IconUser,
  } from "#lib/icons.js";
  import type { Form } from "../form";
  import Resize from "./Resize.svelte";
  import ThreadSwitch from "./ThreadSwitch.svelte";

  let {
    form,
    kind,
    grabber,
    threads,
    current,
    lead,
    projectName,
    wide = false,
  }: {
    /** The panel's form, as its frame names it: the desk's popover or the phone's sheet. */
    form: Form;
    /** A1, Caw over the thread, or A2, Caw alone. */
    kind: "who" | "name";
    /** The phone sheet's grabber over the row. */
    grabber: boolean;
    threads: ThreadSummary[];
    /** The thread on show; "" for a new thread not yet started. */
    current: string;
    lead: CawLead;
    projectName: string;
    /** The panel resizes by a "Wide panel" item in More (the resize decision's option). */
    wide?: boolean;
  } = $props();

  const phone = $derived(form === "phone");
  /** Wide panel is a desk item only: a phone's panel has no size to choose. */
  const widens = $derived(wide && !phone);
  const leadId = $derived(lead.view?.leadInstanceId ?? null);

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

<div class={["head", { phone }]} data-design-head={kind} data-design-toolbar>
  {#if grabber}
    <span aria-hidden="true" class="grabber" data-design-grabber></span>
  {/if}
  <div class="row" data-design-toolbar-row>
    {#if kind === "who"}
      <ThreadSwitch {current} look="line" {threads} />
    {:else}
      <div class="alone">
        <span class="mark" data-design-head-mark
          ><CawFace size={28} status="ready" /></span
        >
        <span class="who">Caw</span>
      </div>
    {/if}
    <div class="trail" data-design-trail>
      {#if !phone}
        <Button
          aria-label="New thread"
          icon={IconPlus}
          size="icon-sm"
          variant="ghost"
        />
      {/if}
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
          {#if phone}
            <DropdownMenu.Item>
              <IconPlus aria-hidden="true" />
              <span>New thread</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
          {/if}
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
          <DropdownMenu.Item>
            <IconMaximize aria-hidden="true" />
            <span>Open as a tab</span>
          </DropdownMenu.Item>
          {#if widens}
            <DropdownMenu.Separator />
            <Resize {form} mode="wide" />
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {#if phone}
        <!-- The Drawer's Close: a 28px ghost, a 16px glyph, 44px under a
             finger (the kit button's .touch-hit). -->
        <Button
          aria-label="Close"
          class="close size-7"
          data-design-close
          icon={IconClose}
          onclick={() => {
            lead.open = false;
          }}
          size="icon-sm"
          variant="ghost"
        />
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
  .head {
    display: flex;
    flex: none;
    flex-direction: column;
    min-inline-size: 0;
    border-block-end: 1px solid var(--border-hairline);
  }
  /* DESIGN.md, Drawer: a 100×6 grabber. */
  .grabber {
    display: block;
    inline-size: 100px;
    max-inline-size: 40%;
    block-size: 6px;
    margin: var(--space-2) auto 0;
    border-radius: var(--radius-pill);
    background: var(--border-control);
  }
  /* 44px: label over meta is 35.1px of words, --space-1 above and below. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--space-2);
    min-block-size: var(--c-btn-h-lg);
    padding-block: var(--space-1);
    padding-inline: var(--head-inset);
  }
  .alone {
    display: grid;
    grid-template-columns: var(--lead-col) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    min-inline-size: 0;
  }
  .mark {
    display: grid;
    place-items: center;
  }
  .who {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* The last control's glyph ink on the trailing edge: the ghost's box
     hangs past by the glyph's inset in it, its hover fill and hit area
     whole. */
  .trail {
    --ink-inset: calc((var(--c-btn-h-sm) - var(--icon-md)) / 2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-end: calc(var(--ink-inset) * -1);
  }
  /* Under a finger each control keeps its whole 44px area without meeting
     the next one's (The 44 Touch Rule): a 30px ghost reaches 7px past its
     edge, the 28px Close 8px, so they stand --space-5 apart. */
  @media (pointer: coarse) {
    .trail {
      --hit-gap-x: var(--space-5);
      gap: var(--space-5);
    }
  }
  .phone .trail {
    --ink-inset: calc((28px - var(--icon-md)) / 2);
  }
</style>
