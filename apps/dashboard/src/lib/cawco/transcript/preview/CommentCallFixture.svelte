<!--
  A design preview, not the product: a `comment_reply` or
  `comment_resolve` call's row as the owner asked for it (10-25, 10-26),
  drawn from the real parts so its states can be judged before
  ToolGroup changes. The row is a tool call's: its line (the call's own
  glyph, verb and server badge, ToolGroup's line), folded; under it one
  chip naming the comment ("Your comment on comment-sizing · answered",
  the pin's pill as its mark). The chip opens the thread in the house hover
  panel (HoverPanel) beside it: what it is on and "Open where it is", then
  the pin's own thread card (PinCard: his comment, every reply, its
  resolve, the reply composer). On a phone the thread opens either under
  the chip in the same panel or as the well's foot sheet (PinFloat
  `sheet`), the one choice the owner makes here (`anchor`). The row's
  chevron opens the exchange inline, as any tool call opens its body:
  ToolGroup's exchange well, his words and the reply up to this call.

  The panel stands inside the frame (no portal; the frame is its
  containing block), so a canvas of many frames draws each one open
  beside its own chip.
-->
<script lang="ts">
  import type { ArtifactKind } from "@cawco/core/artifact-kinds";
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { tick, untrack } from "svelte";
  import {
    describeTool,
    type ToolDescriptor,
  } from "#lib/components/features/tool-cards/descriptors.js";
  import ToolProse from "#lib/components/features/tool-cards/ToolProse.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    IconAgent,
    IconArrowUpRight,
    IconArtifactCanvas,
    IconArtifactPage,
    IconChevronRight,
    IconUser,
    IconWindow,
  } from "#lib/icons.js";
  import { frameSize } from "../../frame-observer";
  import HoverPanel from "../../HoverPanel.svelte";
  import { dur } from "../../motion/curves.svelte";
  import { pressOutside } from "../../press-outside";
  import PinFloat from "../../preview/PinFloat.svelte";
  import PinMark, { markState } from "../../preview/PinMark.svelte";
  import { ComposerDraft } from "../composer-draft.svelte";

  type Shown = "row" | "thread" | "typing" | "expanded" | "open-where";

  let {
    pin,
    artifact,
    agentName,
    call = "reply",
    reply = "",
    shown = "row",
    pointer = "fine",
    anchor = "popover",
    draft = "",
    height = 240,
  }: {
    /** His comment, its thread as it stands now. */
    pin: Pin;
    /** The page, preview or canvas it stands on, as its chip names it. */
    artifact: { id: string; kind: ArtifactKind; name: string };
    /** Who answers in the thread: the session, as its transcript names it. */
    agentName: string;
    /** The call this row is. */
    call?: "reply" | "resolve";
    /** The call's own words (its `text`); none for a resolve that said nothing. */
    reply?: string;
    /** What stands open: the folded row, its thread, a reply being written, the row unfolded, or the thread with Open where it is in focus. */
    shown?: Shown;
    /** A mouse (`fine`: resting on the chip opens it too) or a finger (`touch`: a tap opens it). */
    pointer?: "fine" | "touch";
    /** Where a phone's thread opens: under its chip, or as the foot sheet. */
    anchor?: "popover" | "sheet";
    /** Words already in the reply. */
    draft?: string;
    /** The frame's height, px: room for what opens. */
    height?: number;
  } = $props();

  const panelId = $props.id();

  /** The call as the harness recorded it: ToolGroup's line describes it from these. */
  const line: ToolDescriptor = $derived(
    describeTool(
      `mcp__cawco__comment_${call}`,
      { pin: pin.id, text: reply },
      `Answered [${pinName(pin)}](cawco:pin/${artifact.id}/${pin.number}).`,
      "success"
    )
  );
  const Icon = $derived(line.icon);

  /** The exchange as it stood at this call (ToolGroup's `exchangeOf` rule): up to the reply, then the reply. */
  const exchange = $derived.by(() => {
    const at = reply
      ? pin.thread.findIndex(
          (entry) => entry.by === "agent" && entry.text.trim() === reply.trim()
        )
      : -1;
    return at === -1 ? pin.thread : pin.thread.slice(0, at + 1);
  });

  /** The chip's state word: answered while open, resolved once it is. */
  const stateWord = $derived(pin.resolvedAt ? "resolved" : "answered");
  const chipLabel = $derived(`Your comment on ${artifact.name}`);
  /** Each kind's glyph, as its artifact chip draws it (ArtifactReference). */
  const GLYPHS: Partial<Record<ArtifactKind, typeof IconWindow>> = {
    canvas: IconArtifactCanvas,
    page: IconArtifactPage,
  };
  const KindGlyph = $derived(GLYPHS[artifact.kind] ?? IconWindow);

  let root = $state<HTMLDivElement>();
  let chip = $state<HTMLButtonElement>();
  let open = $state(untrack(() => shown !== "row" && shown !== "expanded"));
  let expanded = $state(untrack(() => shown === "expanded"));
  /** Where the panel stands in the frame, px, unscaled. */
  let place = $state({ x: 0, y: 0, origin: 0, span: 0, room: 0 });

  const replyDraft = new ComposerDraft({ byReference: true });
  $effect(() => {
    const words = draft;
    untrack(() => {
      replyDraft.text = words;
    });
  });

  /** A phone's frame: 640px and narrower, as the product's phone line. */
  let width = $state(0);
  const phone = $derived(width > 0 && width < 640);
  const sheet = $derived(phone && anchor === "sheet");

  /**
   * The panel's place in the frame. Beside the chip at its right, level
   * with it (ChipPanel's stand), pulled back inside the frame where the room
   * there is narrower than the panel can grow; on a phone, under the chip,
   * the frame's width less its insets.
   */
  function stand(): void {
    if (!(root && chip)) {
      return;
    }
    const frame = root.getBoundingClientRect();
    const scale = frame.width / root.offsetWidth || 1;
    const box = chip.getBoundingClientRect();
    const top = (box.top - frame.top) / scale;
    const right = (box.right - frame.left) / scale;
    const bottom = (box.bottom - frame.top) / scale;
    const css = getComputedStyle(root);
    const inset = Number.parseFloat(
      css.getPropertyValue("--hover-panel-inset")
    );
    const most = Number.parseFloat(css.getPropertyValue("--hover-panel-max"));
    const span = root.offsetWidth - 2 * inset;
    const widest = Math.min(most, span);
    if (phone) {
      const y = Math.round(bottom + inset / 2);
      place = {
        x: inset,
        y,
        origin: 0,
        span,
        room: root.offsetHeight - y - inset,
      };
      return;
    }
    const y = Math.round(top);
    place = {
      x: Math.round(
        Math.max(inset, Math.min(right + 4, root.offsetWidth - widest - inset))
      ),
      y,
      origin: Math.round((bottom - top) / 2),
      span,
      room: root.offsetHeight - y - inset,
    };
  }

  /** The frame's width, read in the next frame as it changes. */
  const sized = frameSize<HTMLDivElement>((node) => {
    width = node.offsetWidth;
    if (untrack(() => open)) {
      stand();
    }
  });

  // Open from its args: placed once the frame has its width.
  $effect(() => {
    if (open && width > 0 && chip) {
      untrack(stand);
    }
  });

  // A press outside the panel and the chip, or Escape, puts it away.
  $effect(() => {
    if (!(open && root)) {
      return;
    }
    const panel = root.querySelector(`[id="${CSS.escape(panelId)}"]`);
    const stop = panel
      ? pressOutside(panel, (event) => {
          if (!(event.target instanceof Node && chip?.contains(event.target))) {
            open = false;
          }
        })
      : () => undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        open = false;
        chip?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      stop();
      window.removeEventListener("keydown", key);
    };
  });

  async function press(event: MouseEvent): Promise<void> {
    clearTimeout(restTimer);
    if (open) {
      open = false;
      return;
    }
    stand();
    open = true;
    // Opened from the keys, focus goes in with it.
    if (event.detail === 0) {
      await tick();
      root
        ?.querySelector<HTMLElement>(
          `[id="${CSS.escape(panelId)}"] [data-open-where]`
        )
        ?.focus();
    }
  }

  /* Resting a mouse on the chip opens it after --dur-peek (a finger taps). */
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  function rest(): void {
    clearTimeout(restTimer);
    if (pointer !== "fine" || open) {
      return;
    }
    restTimer = setTimeout(() => {
      stand();
      open = true;
    }, dur("--dur-peek"));
  }
  $effect(() => () => clearTimeout(restTimer));

  // The thread with Open where it is in focus: the act under the keyboard's ring.
  $effect(() => {
    if (shown !== "open-where" || !open || place.span === 0 || !root) {
      return;
    }
    const at = root;
    tick().then(() =>
      at
        .querySelector<HTMLElement>("[data-open-where]")
        ?.focus({ preventScroll: true, focusVisible: true } as FocusOptions)
    );
  });
</script>

{#snippet where()}
  <!-- What the thread is on, and the way to it there: the panel's head. -->
  <div
    class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
    data-slot="thread-where"
  >
    <span class="mark-line flex min-w-0 flex-1 items-center gap-space-1">
      <KindGlyph aria-hidden="true" class="size-icon-sm flex-none" data-box />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{artifact.name}</span
      >
    </span>
    <Button
      data-open-where
      icon={IconArrowUpRight}
      label="Open where it is"
      pad="none"
      size="sm"
      variant="link"
    />
  </div>
{/snippet}

{#snippet thread()}
  {#await import("../../preview/PinCard.svelte") then { default: PinCard }}
    <PinCard
      {agentName}
      draft={replyDraft}
      link={`https://outpost.bewinxed.com/a/${artifact.id}?pin=${pin.number}`}
      marked={false}
      name={pinName(pin)}
      onclose={() => {
        open = false;
        chip?.focus();
      }}
      ondelete={() => Promise.resolve()}
      onfind={() => undefined}
      onplace={() => undefined}
      onreply={() => undefined}
      onresolve={() => undefined}
      onretry={() => undefined}
      parent={null}
      {pin}
      problem={null}
    />
  {/await}
{/snippet}

<div
  bind:this={root}
  {@attach sized}
  class="tx-columns relative min-h-(--frame-h) transform-gpu overflow-clip bg-surface-page py-space-4"
  data-slot="comment-call-fixture"
  style:--frame-h="{height}px"
>
  <div data-slot="tools" data-tx-rail class="rail-row mt-0">
    <div data-slot="row">
      <!-- The call's line: a tool call's, folded; its chevron opens the exchange. -->
      <button
        aria-controls="{panelId}-exchange"
        aria-expanded={expanded}
        data-slot="trow"
        class="select-none group/trow rail-line press-tint w-full min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong bg-transparent border-none border-current rounded-xs p-0 m-0 text-start"
        data-state={expanded ? "open" : "closed"}
        onclick={() => {
          expanded = !expanded;
        }}
        type="button"
      >
        <span data-slot="rail-cell" class="rail-cell">
          <span
            data-slot="glyph"
            class="col-start-1 row-start-1 grid place-items-center {line.color}"
            ><Icon class="size-icon-md block" /></span
          >
        </span>
        <span
          class="font-medium text-ink-strong text-size-label flex-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{line.label}</span
        >
        {#if line.chip}
          <Badge class="flex-none" data-box kind="meta" variant="secondary"
            ><span>{line.chip}</span></Badge
          >
        {/if}
        <span
          data-slot="chev"
          class="flex-none grid place-items-center text-ink-muted motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out group-state-open/trow:rotate-90"
          data-box><IconChevronRight class="size-icon-md block" /></span
        >
      </button>
      <!-- The comment it answered: one chip, which opens its thread. -->
      <p
        data-slot="call-chips"
        class="flex flex-wrap items-baseline gap-x-space-1 gap-y-space-1 m-0 ms-(--x-hang) mt-space-1 mb-space-2 text-size-label"
      >
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${chipLabel}, ${stateWord}`}
          class={chipVariants({ variant: "inline" })}
          data-pin-chip={`${artifact.id}/${pin.number}`}
          data-state={markState(pin)}
          onclick={press}
          onpointerenter={rest}
          onpointerleave={() => clearTimeout(restTimer)}
          type="button"
          bind:this={chip}
        >
          <span data-slot="mark" class="inline-flex flex-none" data-box>
            <PinMark number={pin.number} size="inline" state={markState(pin)} />
          </span>
          <span data-slot="label">{chipLabel}</span>
          <span class="flex-none text-ink-muted" data-slot="state"
            >· {stateWord}</span
          >
        </button>
      </p>
      {#if expanded}
        <!-- Unfolded, the exchange whole: ToolGroup's well, his words and the
             reply up to this call, each by its speaker's glyph. -->
        <ol
          id="{panelId}-exchange"
          data-slot="pin-exchange"
          class="flex flex-col gap-space-3 m-0 mt-space-1 mb-space-3 ms-(--fields-start) p-space-3 list-none rounded-sm bg-surface-recess"
          style:--fields-start={"calc(var(--x-hang) - var(--space-3))"}
        >
          {#each exchange as said (said.id)}
            {@const Speaker = said.by === "agent" ? IconAgent : IconUser}
            <li
              data-slot="exchange-entry"
              class="flex items-start gap-space-2 min-w-0 text-size-body leading-body"
              data-by={said.by}
            >
              <span class="sr-only"
                >{said.by === "agent" ? "Agent: " : "You: "}</span
              >
              <span
                aria-hidden="true"
                class="mark-cell text-ink-muted data-you:text-brand-ink"
                data-box
                data-you={said.by === "person" || undefined}
                ><Speaker class="size-icon-sm" /></span
              >
              <div
                class="flex flex-col gap-space-1 flex-1 min-w-0 wrap-anywhere text-pretty"
              >
                <ToolProse source={said.text} />
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  </div>

  {#if sheet}
    {#if open}
      <!-- A phone, the sheet: the well's foot sheet the thread takes in a preview (PinFloat). -->
      <PinFloat
        label={chipLabel}
        mark={null}
        pin={pin.number}
        room={{ w: width, h: height }}
        sheet
        slot="pin-card"
      >
        {@render where()}
        {@render thread()}
      </PinFloat>
    {/if}
  {:else}
    <HoverPanel
      aria-label={chipLabel}
      id={panelId}
      key={open && place.span > 0 ? pin.id : null}
      onclose={() => {
        open = false;
      }}
      role="dialog"
      side="right"
      style="--x: {place.x}px; --y: {place.y}px; --origin: {place.origin}px; --room: {place.room}px; --span: {place.span}px"
    >
      {#snippet children()}
        <div
          class="flex min-h-0 min-w-0 w-(--thread-w) max-h-(--thread-h) flex-col gap-space-2"
          data-slot="thread-panel"
          style:--thread-h="calc({place.room}px - 2 * var(--space-3) - 2px)"
          style:--thread-w="calc(min(var(--hover-panel-max), {place.span}px) - 2
          * var(--space-3) - 2px)"
        >
          {@render where()}
          {@render thread()}
        </div>
      {/snippet}
    </HoverPanel>
  {/if}
</div>
