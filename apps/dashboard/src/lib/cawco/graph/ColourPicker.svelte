<script lang="ts">
  /**
   * The colour picker of a colour control (DialColour): Ark UI's
   * ColorPicker drawn inline (Zag's machine, maintained by the Chakra team),
   * a saturation and brightness area, hue and opacity sliders, and the
   * platform's eyedropper where the browser has one. A colour picked is
   * written back in the form and precision `value` was written in (dials.ts
   * `colourLike`). Its host places it: in the kit's Popover under the field
   * on a desk, under its row across the face on a phone (Dials).
   */
  import {
    ColorPicker,
    type ColorPickerValueChangeDetails,
    parseColor,
  } from "@ark-ui/svelte/color-picker";
  import { graphWords } from "@cawco/core/words/graph";
  import { IconPipette } from "#lib/icons.js";
  import { colourLike, rgbaOf } from "./dials";

  const words = graphWords.dials;

  let {
    value,
    wide = false,
    onchange,
    onclose,
  }: {
    value: string;
    /** Across a face (a phone's): its area half as tall as wide, so it and its sliders stand in the drawer. */
    wide?: boolean;
    onchange: (next: string) => void;
    /** Escape on a thumb: the host puts the picker away. */
    onclose: () => void;
  } = $props();

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
   * popover never hears it: a thumb's Escape puts the picker away as the
   * popover's own would.
   */
  const close = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onclose();
    }
  };
  const thumb =
    "block size-space-4 rounded-pill border-2 border-surface-page shadow-knob outline-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-1";
</script>

<ColorPicker.Root
  class="flex flex-col gap-space-3"
  inline
  onValueChange={pick}
  value={picked}
>
  <ColorPicker.Area
    aria-label={words.area}
    class={["relative w-full touch-none", wide ? "aspect-2/1" : "aspect-4/3"]}
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
          size="var(--spacing-space-2)"
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
