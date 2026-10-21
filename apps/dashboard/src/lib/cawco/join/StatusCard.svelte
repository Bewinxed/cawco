<script lang="ts">
  /**
   * The status card: the one block Connect a machine's tray holds from the
   * first sign-in to the join (DESIGN.md, The One Object Rule). A glyph, one
   * sentence, the five-phase rail, and a meta line with Show steps and Show
   * output; what they fold opens under the card, so nothing above it moves.
   *
   * While it runs nothing in it changes size: the sentence box is one line
   * on the desk (truncated inside, the whole step its title) and two on a
   * phone, the rail one height, the meta's two rows one line each (two for
   * the waiting line on a phone). Steps advance by filling segments and
   * morphing the words only. "Still going" and the step's elapsed figure
   * join the waiting line once a step outlasts three breaths (The One Loop
   * Rule), the figure tabular so it ticks without moving its neighbours.
   *
   * The glyphs share one cell and cross-fade on `data-tone`, the new one
   * from 0.6 over --dur-toggle (the task ring's finish). The join's beats
   * come from the tray (`data-moment="join"`, JoinTray): each part here
   * waits for its own.
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import IconChevronRight from "~icons/solar/alt-arrow-right-linear";
  import IconSuccess from "~icons/solar/check-circle-bold-duotone";
  import IconError from "~icons/solar/close-circle-bold-duotone";
  import IconAlert from "~icons/solar/danger-circle-bold-duotone";
  import IconEye from "~icons/solar/eye-bold-duotone";
  import IconEyeClosed from "~icons/solar/eye-closed-bold-duotone";
  import IconPauseCircle from "~icons/solar/pause-circle-bold-duotone";
  import CawMark from "../home/CawMark.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { arriveAt } from "./arrive";
  import CopyBox from "./CopyBox.svelte";
  import { type CardView, elapsedWords } from "./join-view";
  import PhaseRail from "./PhaseRail.svelte";

  let {
    card,
    phone = false,
    names = true,
    caw = true,
    arrival = null,
    sentenceDelay = 0,
    cawDelay = 0,
    password = $bindable(""),
    onretry,
  }: {
    card: CardView;
    /** The sheet's layout: the sentence may take two lines, no phase names. */
    phone?: boolean;
    /** The phases' names under the rail (desk only). */
    names?: boolean;
    /** Caw's done loop beside the name once joined. */
    caw?: boolean;
    /** The one time Caw's done loop plays (the add's id); null rests him. */
    arrival?: string | null;
    /** The join's beat for the sentence's morph, ms. */
    sentenceDelay?: number;
    /** The join's beat for Caw's loop, ms. */
    cawDelay?: number;
    /** Typed into the refused sign-in's field; the tray sends it with Retry. */
    password?: string;
    /** Enter in the refused sign-in's field. */
    onretry?: () => void;
  } = $props();

  const id = $props.id();
  const running = $derived(card.tone === "running");

  /** A step outlasting three breaths says it is still going (ms, read off `--breath`). */
  let stillAfter = $state(Number.POSITIVE_INFINITY);
  const readBreath: Attachment<HTMLElement> = (probe) => {
    const value = getComputedStyle(probe).transitionDuration;
    const seconds = Number.parseFloat(value);
    // Three breaths (The One Loop Rule: longer rhythms are breath multiples).
    stillAfter = 3 * (value.endsWith("ms") ? seconds : seconds * 1000);
  };

  /** The clock, once a second while a step is timed. */
  let now = $state(Date.now());
  $effect(() => {
    if (card.stepSince === null) {
      return;
    }
    now = Date.now();
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });
  const elapsed = $derived(
    card.stepSince === null ? 0 : Math.max(0, now - card.stepSince)
  );
  const stillGoing = $derived(running && elapsed >= stillAfter);

  let stepsOpen = $state(false);
  let outputOpen = $state(untrack(() => card.outputOpen));
  let passwordShown = $state(false);
  /** A failure that carries a tail opens the output by itself, once. */
  $effect(() => {
    if (card.outputOpen) {
      outputOpen = true;
    }
  });

  let detailsOpen = $state(false);
  const hasSteps = $derived(card.steps.length > 0);
  const hasOutput = $derived(card.lines.length > 0);
  /** Settled states fold only what they have; a running card keeps the row. */
  const foldRow = $derived(
    running || hasSteps || hasOutput || card.details !== null
  );
  const joined = $derived(card.tone === "done");
  /** The joined glyph: the readiness's own, the plain check before one is known. */
  const ReadinessGlyph = $derived.by(() => {
    const glyph = card.joined?.glyph ?? IconSuccess;
    return glyph === "spinner" ? null : glyph;
  });
</script>

{#snippet fold(
  what: string,
  open: boolean,
  shown: boolean,
  controls: string,
  toggle: () => void
)}
  <!-- A fold with nothing to show yet keeps its place, unseen. -->
  <span class="contents" class:invisible={!shown}>
    <Button
      aria-controls={controls}
      aria-expanded={open}
      disabled={!shown}
      onclick={toggle}
      pad="none"
      size="xs"
      tone="quiet"
      variant="link"
    >
      <span
        data-slot="chev"
        aria-hidden="true"
        class="inline-grid motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out data-open:rotate-90"
        data-open={open || undefined}
        data-box><IconChevronRight class="size-icon-sm" /></span
      >
      <!-- "Show steps" and "Hide steps" in one cell as wide as the wider
           (The Steady Swap Rule): the fold never changes width. The cell
           stands as a box on the line; each wording trims itself to its
           x-height (mark-text), as a grid cell's label does. -->
      <span class="grid *:col-start-1 *:row-start-1" data-box>
        <span
          class="mark-text"
          aria-hidden={open || undefined}
          class:invisible={open}>Show {what}</span
        >
        <span
          class="mark-text"
          aria-hidden={!open || undefined}
          class:invisible={!open}>Hide {what}</span
        >
      </span>
    </Button>
  </span>
{/snippet}

<!-- No gap here: a closed fold takes no room at all, so one mounting with
     the first step line moves nothing (its own content holds its space). -->
<div data-slot="status-card-block" class="flex min-w-0 flex-col">
  <section
    data-slot="status-card"
    data-readiness={card.joined?.kind}
    data-tone={card.tone}
    class="relative grid min-w-0 grid-cols-(--card-cols) gap-x-space-3"
    style:--card-cols="auto minmax(0, 1fr)"
  >
    <span
      aria-hidden="true"
      class="invisible absolute size-0 duration-(--breath)"
      {@attach readBreath}
    ></span>
    <!-- The glyph: five in one cell, the one for the tone shown. -->
    <span
      data-slot="glyph"
      class="grid h-lh items-center text-body *:col-start-1 *:row-start-1 *:opacity-0 *:scale-60 *:data-shown:opacity-100 *:data-shown:scale-100 *:transition-[opacity,scale] *:duration-(--dur-toggle) *:ease-out in-data-[moment=join]:*:delay-(--join-check,0ms)"
    >
      <span
        class="grid place-items-center text-ink-muted"
        data-shown={running || undefined}
        ><span
          class="breathe grid place-items-center data-idle:*:animation-paused"
          data-idle={!running || undefined}
          ><Spinner aria-hidden="true" role="presentation" /></span
        ></span
      >
      <!-- Joined: the machine's readiness glyph, only its hue tinted
           (done for Ready, attn when the Mac needs a hand). -->
      <span
        class="grid place-items-center text-ink-strong data-[hue=attn]:text-status-attn-ink data-[hue=done]:text-status-done-ink"
        data-hue={card.joined?.hue ?? "done"}
        data-joined-glyph
        data-shown={joined || undefined}
      >
        {#if ReadinessGlyph}
          <ReadinessGlyph aria-hidden="true" class="size-icon-md" data-duo />
        {:else}
          <Spinner aria-hidden="true" role="presentation" />
        {/if}
      </span>
      <IconAlert
        class="size-icon-md text-status-attn-ink"
        data-duo
        data-shown={card.tone === "attn" || undefined}
      />
      <IconError
        class="size-icon-md text-status-fail-ink"
        data-duo
        data-shown={card.tone === "fail" || undefined}
      />
      <IconPauseCircle
        class="size-icon-md text-status-idle-ink"
        data-duo
        data-shown={card.tone === "stopped" || undefined}
      />
    </span>

    <div data-slot="words" class="flex min-w-0 flex-col gap-space-2">
      <!-- The live region is the sentence alone: the step, the verdict, the
           failure. The waiting line's figure ticks every second and is
           never read out. -->
      <p
        aria-live="polite"
        data-slot="sentence"
        data-running={running || undefined}
        data-phone={phone || undefined}
        class="m-0 min-w-0 type-body text-pretty text-ink-strong data-running:h-lh data-running:data-phone:h-c-body-two-lines data-running:overflow-clip not-data-phone:data-running:truncate"
        title={card.sentence}
      >
        <MorphText
          delay={sentenceDelay}
          text={card.sentence}
          wrap={phone || !running}
        />
      </p>

      <PhaseRail names={names && !phone && !joined} segments={card.segments} />

      <div data-slot="meta" class="flex min-w-0 flex-col gap-space-1">
        <!-- Joined, Caw stands at the trailing end of the line under the rail
             (on his own line once the words need the room), in the flow, so he
             never stands over the words or the bar. -->
        <!-- mark-line: Caw stands at the line's foot at its trailing end, 40px, not a mark centred on the words -->
        <div
          data-slot="meta-line"
          class="flex min-w-0 flex-wrap items-end justify-between gap-x-space-3"
        >
          {#if card.line}
            <p
              data-slot="line"
              data-running={running || undefined}
              data-phone={phone || undefined}
              class="m-0 min-w-0 flex-1 type-meta text-pretty text-ink-muted data-running:h-lh data-running:data-phone:h-c-meta-two-lines data-running:overflow-clip not-data-phone:data-running:truncate"
            >
              {#if stillGoing}<span class="text-ink-strong"
                  >Still going{" · "}<span class="num"
                    >{elapsedWords(elapsed)}</span
                  ></span
                >{" · "}{/if}{card.line}
            </p>
          {/if}
          {#if joined && caw}
            <!-- Caw's done loop, once, then his still. -->
            <span
              data-slot="caw"
              class="ms-auto flex-none"
              {@attach arriveAt(cawDelay)}
            >
              <CawMark {arrival} delay={cawDelay} size={40} status="done" />
            </span>
          {/if}
        </div>
        {#if foldRow && !joined}
          <div
            data-slot="folds"
            class="flex h-c-btn-h-xs min-w-0 flex-wrap items-center gap-x-space-4"
          >
            {@render fold("steps", stepsOpen, hasSteps, `${id}-steps`, () => {
              stepsOpen = !stepsOpen;
            })}
            {@render fold(
              "output",
              outputOpen,
              hasOutput,
              `${id}-output`,
              () => {
                outputOpen = !outputOpen;
              }
            )}
            {#if card.details}
              {@render fold(
                "details",
                detailsOpen,
                true,
                `${id}-details`,
                () => {
                  detailsOpen = !detailsOpen;
                }
              )}
            {/if}
          </div>
        {/if}
      </div>

      {#if card.copy}
        <CopyBox label={card.copy.label} text={card.copy.text} wrap={phone} />
      {/if}

      {#if card.password}
        <!-- A form of its own, so Enter in the field is Retry. -->
        <form
          data-slot="password"
          class="flex min-w-0 flex-col gap-space-2"
          onsubmit={(event) => {
            event.preventDefault();
            onretry?.();
          }}
        >
          <Label for="{id}-password">Password</Label>
          <InputGroup.Root>
            <InputGroup.Input
              aria-describedby="{id}-password-hint"
              autocapitalize="off"
              autocomplete="current-password"
              id="{id}-password"
              spellcheck="false"
              type={passwordShown ? "text" : "password"}
              bind:value={password}
            />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button
                aria-controls="{id}-password"
                aria-label={passwordShown ? "Hide password" : "Show password"}
                aria-pressed={passwordShown}
                onclick={() => {
                  passwordShown = !passwordShown;
                }}
                size="icon-xs"
              >
                {#if passwordShown}
                  <IconEyeClosed />
                {:else}
                  <IconEye />
                {/if}
              </InputGroup.Button>
            </InputGroup.Addon>
          </InputGroup.Root>
          <span id="{id}-password-hint" class="type-meta text-ink-subtle">
            Used once to add the hub's key, and not kept.
          </span>
        </form>
      {/if}
    </div>
  </section>

  {#if hasSteps}
    <Collapsible.Root open={stepsOpen}>
      <Collapsible.Content fade id="{id}-steps" reveal>
        <ol
          aria-label="Steps"
          class="m-0 flex list-none flex-col gap-space-2 p-0 pt-space-4"
          {@attach reflow()}
        >
          {#each card.steps as step, index (index)}
            {@const last = index === card.steps.length - 1}
            <li
              data-flip
              data-current={(last && running) || undefined}
              class="mark-line flex min-w-0 items-center gap-space-3 type-body text-ink-muted data-current:text-ink-strong"
            >
              {#if last && running}
                <Spinner />
              {:else if last && card.tone === "fail"}
                <IconError
                  aria-hidden="true"
                  class="size-icon-md flex-none text-status-fail-ink"
                />
              {:else if last && card.tone === "stopped"}
                <IconPauseCircle
                  aria-hidden="true"
                  class="size-icon-md flex-none text-status-idle-ink"
                />
              {:else}
                <IconSuccess
                  aria-hidden="true"
                  class="size-icon-md flex-none text-status-done-ink"
                />
              {/if}
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                title={step}>{step}</span
              >
            </li>
          {/each}
        </ol>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}

  {#if card.details}
    <Collapsible.Root open={detailsOpen}>
      <Collapsible.Content fade id="{id}-details" reveal>
        <p
          data-slot="details"
          class="m-0 pt-space-4 type-meta font-mono wrap-anywhere text-ink-muted"
        >
          {card.details}
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}

  {#if hasOutput}
    <Collapsible.Root open={outputOpen}>
      <Collapsible.Content fade id="{id}-output" reveal>
        <div class="pt-space-4">
          <!-- The box's padding stands outside the scroller, and the scroller
               is whole lines tall: its tail, followed to the end, starts on a
               whole line with the padding above it. -->
          <div
            data-slot="output"
            class="rounded-md border border-border-control bg-surface-hover p-space-3"
          >
            <pre
              class="m-0 max-h-c-output-tail overflow-auto overscroll-contain text-size-meta leading-root wrap-anywhere whitespace-pre-wrap text-ink-strong"
              {@attach followTail()}>{card.lines.join("\n")}</pre>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
</div>
