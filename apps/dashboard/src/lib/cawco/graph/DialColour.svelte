<script lang="ts">
  /**
   * A colour control (core stage.ts `CanvasDial`, kind `color`): one field,
   * its swatch leading and the colour as written after it (Framer's and
   * Rive's colour rows). A press on the swatch opens the picker under the
   * field: Ark UI's ColorPicker (Zag's machine, maintained by the Chakra
   * team: a saturation and brightness area, hue and opacity sliders, the
   * platform's eyedropper where the browser has one). On a desk it is drawn
   * in the kit's Popover, so it stands over everything on the face, escapes
   * its scroller and closes as every popover does; on a phone it unfolds
   * under the field inside the face, so it covers neither the rows above
   * it, the faces' switch nor the drawing it tunes. A colour picked is
   * written back in the notation and precision the value was written in
   * (dials.ts `colourLike`). While his colour differs from the agent's,
   * the swatch is split: the agent's colour leading, his trailing. The
   * value too long for its field ends in an ellipsis, its whole in its
   * title. The field takes any colour the browser
   * reads, typed or pasted (hex, rgb(), hsl(), oklch(), color(display-p3 …));
   * one it reads as none says so under the field and is not set; Escape
   * puts the last colour back.
   */
  import {
    ColorPicker,
    type ColorPickerValueChangeDetails,
    parseColor,
  } from "@ark-ui/svelte/color-picker";
  import { graphWords } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconPipette } from "#lib/icons.js";
  import { colourLike, isColour, rgbaOf } from "./dials";

  const words = graphWords.dials;

  let {
    value,
    was = null,
    label,
    open = $bindable(false),
    onOpenChange,
    onchange,
  }: {
    value: string;
    /** The agent's colour while his differs; null while they agree. */
    was?: string | null;
    /** Its name, said to a reader. */
    label: string;
    /** The picker stands open. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onchange: (next: string) => void;
  } = $props();

  const uid = $props.id();
  /** The colour while he types it; null while he doesn't. */
  let typing = $state<string | null>(null);
  let frame = $state<HTMLElement | null>(null);
  const refused = $derived(
    typing !== null && typing.trim() !== "" && !isColour(typing)
  );
  const keep = () => {
    const next = typing?.trim() ?? null;
    if (next !== null && isColour(next) && next !== value) {
      onchange(next);
    }
    if (next === null || isColour(next)) {
      typing = null;
    }
  };
  /** The colour as the picker holds it. */
  const picked = $derived(parseColor(rgbaOf(value)));
  const pick = (details: ColorPickerValueChangeDetails) => {
    const next = colourLike(details.value.toString("rgba"), value);
    if (next !== value) {
      onchange(next);
    }
  };
  /** The browser can take a colour from the screen (Chromium's EyeDropper). */
  const dropper = typeof window !== "undefined" && "EyeDropper" in window;
  /**
   * Zag's thumbs keep Escape to themselves (`stopPropagation`), so the
   * popover never hears it: a thumb's Escape closes the picker as the
   * popover's own would.
   */
  const close = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      open = false;
      onOpenChange?.(false);
    }
  };
  /** Under the phone line the picker unfolds in the face instead of over it. */
  const phone = new MediaQuery("(width < 640px)");
  const thumb =
    "block size-space-4 rounded-pill border-2 border-surface-page shadow-knob outline-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-1";
</script>

{#snippet swatch()}
  <!-- The colour as set; while it differs from the agent's, the agent's
       leading and his trailing. -->
  <span
    aria-hidden="true"
    class="checker grid size-space-6 grid-flow-col overflow-clip rounded-xs border border-border-control shadow-xs"
  >
    {#if was !== null}
      <span class="block size-full bg-(--was)" style:--was={was}></span>
    {/if}
    <span class="block size-full bg-(--swatch)" style:--swatch={value}></span>
  </span>
{/snippet}

{#snippet field(trigger: Snippet)}
  <InputGroup.Root bind:ref={frame}>
    <InputGroup.Addon look="swatch">
      {@render trigger()}
    </InputGroup.Addon>
    <InputGroup.Input
      aria-describedby={refused ? `${uid}-refused` : undefined}
      aria-invalid={refused || undefined}
      aria-label={label}
      autocomplete="off"
      field="colour"
      onblur={keep}
      oninput={(event: Event) => {
        typing = (event.currentTarget as HTMLInputElement).value;
      }}
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter") {
          keep();
        } else if (event.key === "Escape" && typing !== null) {
          event.preventDefault();
          event.stopPropagation();
          typing = null;
        }
      }}
      spellcheck={false}
      title={value}
      value={typing ?? value}
    />
  </InputGroup.Root>
{/snippet}

<!-- The phone's swatch: it unfolds the picker in the face. -->
{#snippet toggle()}
  <button
    aria-expanded={open}
    aria-label={words.pick(label)}
    class="pointer-hit touch-hit grid place-items-center rounded-xs outline-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-1"
    data-vaul-no-drag
    onclick={() => {
      open = !open;
      onOpenChange?.(open);
    }}
    type="button"
  >
    {@render swatch()}
  </button>
{/snippet}

<!-- The desk's swatch: the popover's trigger. -->
{#snippet trigger()}
  <Popover.Trigger aria-label={words.pick(label)} look="swatch">
    {@render swatch()}
  </Popover.Trigger>
{/snippet}

{#snippet picker()}
  <ColorPicker.Root
    class="flex flex-col gap-space-3"
    inline
    onValueChange={pick}
    value={picked}
  >
    <ColorPicker.Area
      aria-label={words.area}
      class="relative aspect-4/3 w-full touch-none"
    >
      <ColorPicker.AreaBackground class="size-full rounded-md" />
      <ColorPicker.AreaThumb
        aria-label={words.area}
        class={thumb}
        onkeydown={close}
      />
    </ColorPicker.Area>
    <div class="flex min-w-0 items-center gap-space-3">
      {#if dropper}
        <ColorPicker.EyeDropperTrigger
          aria-label={words.eyedropper}
          class="pointer-hit grid size-c-btn-h-sm flex-none place-items-center rounded-sm text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong press-tint"
        >
          <IconPipette class="size-icon-md" />
        </ColorPicker.EyeDropperTrigger>
      {/if}
      <div class="flex min-w-0 flex-1 flex-col gap-space-3 px-space-2">
        <ColorPicker.ChannelSlider
          channel="hue"
          class="relative flex h-space-3 w-full touch-none items-center"
        >
          <ColorPicker.ChannelSliderTrack
            class="h-space-3 w-full rounded-pill inset-ring inset-ring-border-hairline"
          />
          <ColorPicker.ChannelSliderThumb
            aria-label={words.hue}
            class={[thumb, "-translate-x-1/2 -translate-y-1/2"]}
            onkeydown={close}
          />
        </ColorPicker.ChannelSlider>
        <ColorPicker.ChannelSlider
          channel="alpha"
          class="relative flex h-space-3 w-full touch-none items-center"
        >
          <ColorPicker.TransparencyGrid
            class="absolute inset-0 rounded-pill"
            size="var(--space-2)"
          />
          <ColorPicker.ChannelSliderTrack
            class="relative h-space-3 w-full rounded-pill inset-ring inset-ring-border-hairline"
          />
          <ColorPicker.ChannelSliderThumb
            aria-label={words.alpha}
            class={[thumb, "-translate-x-1/2 -translate-y-1/2"]}
            onkeydown={close}
          />
        </ColorPicker.ChannelSlider>
      </div>
    </div>
  </ColorPicker.Root>
{/snippet}

<div class="flex min-w-0 flex-col gap-space-1">
  {#if phone.current}
    {@render field(toggle)}
    {#if open}
      <!-- Unfolded in the face under its field. -->
      <div class="pt-space-2" data-vaul-no-drag transition:unfold>
        {@render picker()}
      </div>
    {/if}
  {:else}
    <Popover.Root
      bind:open
      onOpenChange={(next: boolean) => onOpenChange?.(next)}
    >
      {@render field(trigger)}
      <!-- The picker hangs from the whole field, its leading edge on the
           field's, over everything on the face. -->
      <Popover.Content
        align="start"
        customAnchor={frame}
        gap="snug"
        side="bottom"
        width="narrow"
      >
        {@render picker()}
      </Popover.Content>
    </Popover.Root>
  {/if}
  {#if refused}
    <p class="m-0 type-meta text-status-fail-ink" id="{uid}-refused">
      {words.notAColour}
    </p>
  {/if}
</div>
