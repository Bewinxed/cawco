<!--
  A design preview, not the product: a `comment_reply` or `comment_resolve`
  call's row as the owner asked for it (10-25, 10-26), live on the dev
  bench (/dev/comment-chip) before ToolGroup changes. The row is a tool
  call's: its line (the call's glyph, verb and server badge, ToolGroup's
  line), folded; under it one chip naming the comment ("Your comment on
  comment-sizing · answered", the pin's pill as its mark). Pressing the
  chip, or resting a mouse on it, opens the thread in the house hover panel
  (HoverPanel, portalled as SessionReference's is) beside it: what it is on
  and Open where it is, then the pin's thread card (PinCard `fromChip`: his
  comment, every reply, Resolve or Reopen, the reply composer). On a phone
  the thread opens under the chip in the same panel, or as the well's foot
  sheet (PinFloat `sheet`): the owner's one choice here (`anchor`). The
  row's chevron opens the exchange inline, as any tool call opens its body:
  ToolGroup's exchange well, his words and the reply up to this call.

  The thread is this bench's own copy: a reply sent lands in it, Resolve
  and Reopen change it, and nothing reaches the hub.
-->
<script lang="ts">
  import type { ArtifactKind } from "@cawco/core/artifact-kinds";
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { Portal } from "bits-ui";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
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
  import HoverPanel from "../../HoverPanel.svelte";
  import { newId } from "../../id";
  import { dur } from "../../motion/curves.svelte";
  import { pressOutside } from "../../press-outside";
  import PinCard from "../../preview/PinCard.svelte";
  import PinFloat from "../../preview/PinFloat.svelte";
  import PinMark, { markState } from "../../preview/PinMark.svelte";
  import { ComposerDraft } from "../composer-draft.svelte";

  let {
    pin: given,
    artifact,
    agentName,
    call = "reply",
    reply = "",
    anchor = "popover",
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
    /** Where a phone's thread opens: under its chip, or as the foot sheet. */
    anchor?: "popover" | "sheet";
  } = $props();

  /** The live hub this pin's page lives on: where Open where it is goes. */
  const HUB = "https://outpost.bewinxed.com";

  const panelId = $props.id();
  /** The thread as this bench holds it: replies and resolves land here. */
  let pin = $state(untrack(() => structuredClone($state.snapshot(given))));

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

  /** A phone: under 640px, the product's phone line. */
  const narrow = new MediaQuery("(width < 640px)");
  /** A mouse: resting on the chip opens it too. */
  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  const sheet = $derived(narrow.current && anchor === "sheet");

  let chip = $state<HTMLButtonElement>();
  let open = $state(false);
  let expanded = $state(false);
  /** Where the panel stands in the viewport, px. */
  let place = $state({ x: 0, y: 0, origin: 0, span: 0, room: "" });
  /** Desk: as tall as the thread needs, up to the sheet's cap, pulled up to stand whole. */
  const DESK_ROOM =
    "min(var(--c-sheet-max-h), calc(100dvh - 2 * var(--hover-panel-inset)))";

  const replyDraft = new ComposerDraft({ byReference: true });

  /** A token's length in px, as the root computes it. */
  const px = (name: string): number =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(name)
    );

  /**
   * The panel's place. Beside the chip at its right, level with it
   * (ChipPanel's stand), pulled back inside the viewport where the room
   * there is narrower than the panel can grow; on a phone, under the chip,
   * the viewport's width less its insets.
   */
  function stand(): void {
    if (!chip) {
      return;
    }
    const box = chip.getBoundingClientRect();
    const inset = px("--hover-panel-inset");
    const span = innerWidth - 2 * inset;
    if (narrow.current) {
      // Under the chip, never over it: the room below it, the viewport's foot less its inset.
      const y = Math.round(box.bottom + 4);
      place = {
        x: inset,
        y,
        origin: 0,
        span,
        room: `${innerHeight - y - inset}px`,
      };
      return;
    }
    const widest = Math.min(px("--hover-panel-max"), span);
    place = {
      x: Math.round(
        Math.max(inset, Math.min(box.right + 4, innerWidth - widest - inset))
      ),
      y: Math.round(box.top),
      origin: Math.round(box.height / 2),
      span,
      room: DESK_ROOM,
    };
  }

  // While it stands open: a press outside it and the chip, or Escape, puts it
  // away; scrolling keeps it at its chip, and a chip scrolled out of view
  // puts it away (ChipPanel's rules).
  $effect(() => {
    if (!open) {
      return;
    }
    const panel = document.getElementById(sheet ? `${panelId}-sheet` : panelId);
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
    let frame = 0;
    const follow = (event: Event) => {
      if (
        frame ||
        sheet ||
        (event.target instanceof Node && panel?.contains(event.target))
      ) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = chip?.getBoundingClientRect();
        if (!box || box.bottom <= 0 || box.top >= innerHeight) {
          open = false;
          return;
        }
        stand();
      });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      stop();
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
    };
  });

  function press(): void {
    clearTimeout(restTimer);
    if (open) {
      open = false;
      return;
    }
    // A phone's thread under its chip: the chip goes to the top first, so the
    // thread has the screen's height under it.
    if (narrow.current && !sheet && chip) {
      chip.scrollIntoView({ block: "start", behavior: "instant" });
    }
    stand();
    open = true;
  }

  /* Resting a mouse on the chip opens it after --dur-peek; a finger taps. */
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  function rest(): void {
    clearTimeout(restTimer);
    if (!fine.current || open) {
      return;
    }
    restTimer = setTimeout(() => {
      stand();
      open = true;
    }, dur("--dur-peek"));
  }
  $effect(() => () => clearTimeout(restTimer));

  /** A reply sent here lands in the thread, his own entry, sent; on a resolved thread it reopens it. */
  function answer(text: string): void {
    const at = new Date().toISOString();
    pin.thread.push({
      id: newId(),
      by: "person",
      text,
      at,
      sentAt: at,
    });
    pin.resolvedAt = undefined;
    pin.resolvedBy = undefined;
    replyDraft.text = "";
  }
  function resolve(resolved: boolean): void {
    pin.resolvedAt = resolved ? new Date().toISOString() : undefined;
    pin.resolvedBy = resolved ? "person" : undefined;
  }
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
      href={`${HUB}/artifact/${encodeURIComponent(artifact.id)}?pin=${pin.number}`}
      icon={IconArrowUpRight}
      label="Open where it is"
      pad="none"
      rel="noopener"
      size="sm"
      target="_blank"
      variant="link"
    />
  </div>
{/snippet}

{#snippet thread()}
  <PinCard
    {agentName}
    draft={replyDraft}
    fromChip
    link={`${HUB}/artifact/${encodeURIComponent(artifact.id)}?pin=${pin.number}`}
    marked={false}
    name={pinName(pin)}
    onclose={() => {
      open = false;
      chip?.focus();
    }}
    ondelete={() => Promise.resolve()}
    onfind={() => undefined}
    onplace={() => undefined}
    onreply={answer}
    onresolve={resolve}
    onretry={() => undefined}
    parent={null}
    {pin}
    problem={null}
  />
{/snippet}

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
      aria-controls={sheet ? `${panelId}-sheet` : panelId}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`${chipLabel}, ${stateWord}`}
      class={chipVariants({ variant: "inline", class: "scroll-mt-space-3" })}
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
<Portal>
  {#if sheet}
    {#if open}
      <!-- A phone, the sheet: the well's foot sheet a preview's thread takes (PinFloat). -->
      <div
        class="pointer-events-none fixed inset-0 z-(--layer-float)"
        data-slot="thread-sheet-room"
        id="{panelId}-sheet"
      >
        <PinFloat
          label={chipLabel}
          mark={null}
          pin={pin.number}
          room={{ w: innerWidth, h: innerHeight }}
          sheet
          slot="pin-card"
        >
          {@render where()}
          {@render thread()}
        </PinFloat>
      </div>
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
      style="--x: {place.x}px; --y: {place.y}px; --origin: {place.origin}px; --room: {place.room}; --span: {place.span}px"
    >
      {#snippet children()}
        <div
          class="flex min-h-0 min-w-0 w-(--thread-w) max-h-(--thread-h) flex-col gap-space-2"
          data-slot="thread-panel"
          style:--thread-h="calc(var(--room) - 2 * var(--space-3) - 2px)"
          style:--thread-w="calc(min(var(--hover-panel-max), {place.span}px) - 2
          * var(--space-3) - 2px)"
        >
          {@render where()}
          {@render thread()}
        </div>
      {/snippet}
    </HoverPanel>
  {/if}
</Portal>
