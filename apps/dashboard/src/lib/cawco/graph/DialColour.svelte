<script lang="ts">
  /**
   * A colour control (core stage.ts `CanvasDial`, kind `color`): one field,
   * its swatch leading and the colour as written after it (Framer's and
   * Rive's colour rows). A press on the swatch opens the picker under the
   * field: Ark UI's ColorPicker (Zag's machine, maintained by the Chakra
   * team: a saturation and brightness area, hue and opacity sliders, the
   * platform's eyedropper where the browser has one), drawn inline in the
   * kit's Popover, so it stands over everything on the face, escapes its
   * scroller and closes as every popover does. A colour picked is written
   * back in the notation the value was written in (dials.ts `colourLike`:
   * an oklch() stays an oklch()). The field takes any colour the browser
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
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconPipette } from "#lib/icons.js";
  import { colourLike, isColour, rgbaOf } from "./dials";

  const words = graphWords.dials;

  let {
    value,
    label,
    open = $bindable(false),
    onOpenChange,
    onchange,
  }: {
    value: string;
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
  const thumb =
    "block size-space-4 rounded-pill border-2 border-surface-page shadow-knob outline-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-1";
</script>

<div class="flex min-w-0 flex-col gap-space-1">
  <Popover.Root
    bind:open
    onOpenChange={(next: boolean) => onOpenChange?.(next)}
  >
    <InputGroup.Root bind:ref={frame}>
      <InputGroup.Addon look="swatch">
        <!-- The swatch: the colour as set, and the picker's trigger. -->
        <Popover.Trigger aria-label={words.pick(label)} look="swatch">
          <span
            aria-hidden="true"
            class="checker block size-space-6 overflow-clip rounded-xs border border-border-control shadow-xs"
          >
            <span class="block size-full bg-(--swatch)" style:--swatch={value}
            ></span>
          </span>
        </Popover.Trigger>
      </InputGroup.Addon>
      <InputGroup.Input
        aria-describedby={refused ? `${uid}-refused` : undefined}
        aria-invalid={refused || undefined}
        aria-label={label}
        autocomplete="off"
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
        value={typing ?? value}
      />
    </InputGroup.Root>
    <!-- The picker hangs from the whole field, its leading edge on the
         field's, over everything on the face; on a phone too it keeps its
         own width, so it covers as little of the drawing it tunes. -->
    <Popover.Content
      align="start"
      customAnchor={frame}
      gap="snug"
      ownWidth
      side="bottom"
      width="narrow"
    >
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
    </Popover.Content>
  </Popover.Root>
  {#if refused}
    <p class="m-0 type-meta text-status-fail-ink" id="{uid}-refused">
      {words.notAColour}
    </p>
  {/if}
</div>
