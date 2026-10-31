<script lang="ts" module>
  import type { ImageSettingsValue } from "./image-settings.js";

  /** The EyeDropper API (WICG), where the browser has it. */
  interface EyeDropperLike {
    open: () => Promise<{ sRGBHex: string }>;
  }
  type EyeDropperClass = new () => EyeDropperLike;

  function eyeDropperClass(): EyeDropperClass | undefined {
    if (typeof window === "undefined" || !("EyeDropper" in window)) {
      return;
    }
    return (window as unknown as { EyeDropper: EyeDropperClass }).EyeDropper;
  }

  export interface ImageSettingsProps {
    /** What was last applied: Apply waits for a change from it. */
    applied?: ImageSettingsValue | null;
    /** It opens with an apply already running (a story's seam). */
    applying?: boolean;
    /** The colour it opens with, as typed: a hex or an oklch value. */
    colour?: string;
    /** Nothing can be changed or applied. */
    disabled?: boolean;
    /** Why, said under the title while it is disabled. */
    disabledReason?: string;
    /**
     * The browser offers the EyeDropper. Read from the browser when unset;
     * a story forces it.
     */
    eyeDropper?: boolean;
    /** It opens with the last apply's failure standing (a story's seam). */
    failure?: string;
    height?: string;
    /** Whether the aspect ratio is kept as it opens. */
    locked?: boolean;
    /** Applies the settings; a rejection is told in the panel. */
    onapply?: (settings: ImageSettingsValue) => Promise<void>;
    /** The width and height it opens with, as typed. */
    width?: string;
  }
</script>

<script lang="ts">
  import { RadioGroup } from "bits-ui";
  import { untrack } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button, pressVariants } from "#lib/components/ui/button/index.js";
  import Card from "#lib/components/ui/card/card.svelte";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconLink, IconTick } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import {
    checkColour,
    checkSize,
    heightFor,
    megapixels,
    PRESETS,
    presetOf,
    ratioOf,
    readPixels,
    type SizeCheck,
    SWATCHES,
    sameSettings,
    stepSize,
    widthFor,
  } from "./image-settings.js";
  import { imageSettingsWords as words } from "./words.js";

  let {
    colour = "#E65D46",
    width = "1024",
    height = "1024",
    locked = true,
    applied = null,
    eyeDropper,
    disabled = false,
    disabledReason,
    applying = false,
    failure,
    onapply = async () => {
      // No host: nothing to hand the settings to.
    },
  }: ImageSettingsProps = $props();

  const id = $props.id();

  const STEP_KEYS: Partial<Record<string, 1 | -1>> = {
    ArrowUp: 1,
    ArrowDown: -1,
  };

  // What the reader has typed and chosen: seeded once from the props, then
  // theirs (an invalid entry is kept as typed).
  let colourText = $state(untrack(() => colour));
  let widthText = $state(untrack(() => width));
  let heightText = $state(untrack(() => height));
  let keepRatio = $state(untrack(() => locked));
  let ratio = $state(
    untrack(() => (readPixels(width) ?? 1) / (readPixels(height) ?? 1))
  );
  /** Custom was picked by hand, so no preset claims the size. */
  let customPicked = $state(false);
  let pending = $state(untrack(() => applying));
  let failed = $state<string | null>(untrack(() => failure ?? null));
  let lastApplied = $state(untrack(() => applied));

  const Dropper = $derived(
    eyeDropper === false ? undefined : eyeDropperClass()
  );
  const canPick = $derived(eyeDropper ?? Dropper !== undefined);

  const colourCheck = $derived(checkColour(colourText));
  const widthCheck = $derived(checkSize(widthText));
  const heightCheck = $derived(checkSize(heightText));

  /** The settings Apply would hand on, once every value holds. */
  const current = $derived(
    colourCheck.ok && widthCheck.ok && heightCheck.ok
      ? {
          colour: colourCheck.css,
          width: widthCheck.px,
          height: heightCheck.px,
        }
      : null
  );
  const isApplied = $derived(sameSettings(current, lastApplied));
  const canApply = $derived(!disabled && current !== null && !isApplied);

  /** The size Apply would hand on: the readout names its ratio and megapixels. */
  const valid = $derived(
    widthCheck.ok && heightCheck.ok
      ? { w: widthCheck.px, h: heightCheck.px }
      : null
  );
  /** The size as typed, where both read as pixels: the presets follow it. */
  const shown = $derived.by(() => {
    const w = readPixels(widthText);
    const h = readPixels(heightText);
    return w && h && w > 0 && h > 0 ? { w, h } : null;
  });
  const chosenPreset = $derived.by(() => {
    if (customPicked || !shown) {
      return "custom";
    }
    return presetOf(shown.w, shown.h)?.id ?? "custom";
  });

  function typeWidth(text: string): void {
    widthText = text;
    const px = readPixels(text);
    if (keepRatio && px !== undefined && px > 0) {
      heightText = String(heightFor(px, ratio));
    }
  }

  function typeHeight(text: string): void {
    heightText = text;
    const px = readPixels(text);
    if (keepRatio && px !== undefined && px > 0) {
      widthText = String(widthFor(px, ratio));
    }
  }

  /** ↑ and ↓ step a dimension along the grid of 8 (Shift: 64), as a design tool's fields do. */
  function stepKeys(
    event: KeyboardEvent,
    text: string,
    type: (text: string) => void
  ): void {
    const direction = STEP_KEYS[event.key];
    if (direction === undefined || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    type(String(stepSize(readPixels(text), direction, event.shiftKey)));
  }

  function setKeepRatio(on: boolean): void {
    keepRatio = on;
    if (on && shown) {
      ratio = shown.w / shown.h;
    }
  }

  function pickPreset(next: string): void {
    if (next === "custom") {
      // The fields stand right under it; focus stays in the group, so the
      // arrows still walk the presets.
      customPicked = true;
      return;
    }
    const preset = PRESETS.find((p) => p.id === next);
    if (!preset) {
      return;
    }
    customPicked = false;
    widthText = String(preset.width);
    heightText = String(preset.height);
    ratio = preset.across / preset.down;
    keepRatio = true;
  }

  async function pickFromScreen(): Promise<void> {
    if (!Dropper) {
      return;
    }
    try {
      const { sRGBHex } = await new Dropper().open();
      const picked = checkColour(sRGBHex);
      colourText = picked.ok ? picked.css : sRGBHex;
    } catch {
      // Escape closed the dropper: the colour stays as it was.
    }
  }

  /** A valid colour is written back in its even form once the field is left. */
  function settleColour(): void {
    if (colourCheck.ok) {
      colourText = colourCheck.css;
    }
  }

  async function apply(): Promise<void> {
    if (!(canApply && current) || pending) {
      return;
    }
    const settings = current;
    pending = true;
    failed = null;
    try {
      await onapply(settings);
      lastApplied = settings;
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      pending = false;
    }
  }

  interface SizeFaultRow {
    check: Extract<SizeCheck, { ok: false }>;
    dimension: string;
    faultId: string;
    type: (text: string) => void;
  }

  /** Each dimension that does not hold, with how to put it right. */
  const sizeFaults = $derived.by(() => {
    const rows: SizeFaultRow[] = [];
    if (!widthCheck.ok) {
      rows.push({
        dimension: words.width,
        check: widthCheck,
        type: typeWidth,
        faultId: `${id}-width-fault`,
      });
    }
    if (!heightCheck.ok) {
      rows.push({
        dimension: words.height,
        check: heightCheck,
        type: typeHeight,
        faultId: `${id}-height-fault`,
      });
    }
    return rows;
  });
</script>

<!-- A size drawn as its shape in a mark's box: its long side the box, its
     short side to scale, no thinner than two parts in five so a long strip
     still reads as a frame. -->
{#snippet frame(across: number, down: number, dashed = false)}
  {@const short = Math.max(
    Math.min(across, down) / Math.max(across, down),
    0.4
  )}
  <span
    class="flex size-icon-md shrink-0 items-center justify-center"
    aria-hidden="true"
    data-box
  >
    <span
      class={cn(
        "h-(--frame-h) w-(--frame-w) rounded-hair border border-current",
        dashed && "border-dashed"
      )}
      style="--frame-w: calc(var(--icon-md) * {across >= down
        ? 1
        : short}); --frame-h: calc(var(--icon-md) * {across >= down
        ? short
        : 1})"
    ></span>
  </span>
{/snippet}

<Tooltip.Provider>
  <div class="w-full max-w-104" data-image-settings>
    <Card>
      <form
        class="flex flex-col gap-space-6"
        aria-labelledby="{id}-title"
        novalidate
        onsubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <header class="flex flex-col gap-space-1 px-space-5">
          <h2 id="{id}-title" class="type-title text-balance text-ink-strong">
            {words.title}
          </h2>
          {#if disabled && disabledReason}
            <p class="type-meta text-pretty text-ink-muted">{disabledReason}</p>
          {/if}
        </header>

        <fieldset
          class="flex min-w-0 flex-col gap-space-6 px-space-5"
          {disabled}
        >
          <!-- Colour: the house swatches, then the value itself. -->
          <section
            class="flex min-w-0 flex-col gap-space-3"
            aria-labelledby="{id}-colour"
          >
            <div
              class="flex min-h-c-btn-h-sm items-center justify-between gap-space-3"
            >
              <h3 id="{id}-colour" class="type-label text-ink-strong">
                {words.colour}
              </h3>
              {#if canPick}
                <Button
                  class="-me-space-2"
                  aria-describedby="{id}-pick-hint"
                  onclick={pickFromScreen}
                  size="sm"
                  variant="ghost"
                >
                  <span>{words.pickFromScreen}</span>
                </Button>
                <span id="{id}-pick-hint" class="sr-only"
                  >{words.pickFromScreenHint}</span
                >
              {/if}
            </div>

            <RadioGroup.Root
              class="flex flex-wrap gap-space-2"
              aria-label={words.swatches}
              onValueChange={(next) => {
                const swatch = SWATCHES.find((s) => s.id === next);
                if (swatch) {
                  colourText = swatch.css;
                }
              }}
              orientation="horizontal"
              value={colourCheck.ok ? (colourCheck.swatch?.id ?? "") : ""}
            >
              {#each SWATCHES as swatch (swatch.id)}
                <Tip label={swatch.name}>
                  {#snippet children(tip)}
                    <RadioGroup.Item
                      {...tip}
                      class={[
                        pressVariants({ press: "pressable" }),
                        "touch-hit grid size-7 place-items-center rounded-xs border border-border-hairline bg-(--swatch) disabled:opacity-50 can-hover:hover:border-border-control-strong",
                      ]}
                      aria-label={swatch.name}
                      data-swatch={swatch.id}
                      style="--swatch: {swatch.css}"
                      value={swatch.id}
                    >
                      {#snippet children({ checked })}
                        {#if checked}
                          <IconTick
                            aria-hidden="true"
                            class="size-icon-lg text-on-action"
                          />
                        {/if}
                      {/snippet}
                    </RadioGroup.Item>
                  {/snippet}
                </Tip>
              {/each}
            </RadioGroup.Root>

            <div class="flex min-w-0 flex-col gap-space-1" {@attach morph()}>
              <InputGroup.Root>
                <InputGroup.Addon>
                  <span
                    class={cn(
                      "size-5 shrink-0 rounded-xs border",
                      colourCheck.ok
                        ? "border-border-hairline bg-(--swatch)"
                        : "border-border-control-strong border-dashed"
                    )}
                    aria-hidden="true"
                    data-box
                    style:--swatch={colourCheck.ok
                      ? colourCheck.css
                      : undefined}
                  ></span>
                </InputGroup.Addon>
                <InputGroup.Input
                  aria-describedby="{id}-colour-line"
                  aria-invalid={!colourCheck.ok || undefined}
                  aria-label={words.colourField}
                  autocapitalize="off"
                  autocomplete="off"
                  face="mono"
                  onblur={settleColour}
                  placeholder={words.colourPlaceholder}
                  spellcheck="false"
                  bind:value={colourText}
                />
              </InputGroup.Root>
              <p
                id="{id}-colour-line"
                class={cn(
                  "type-meta text-pretty",
                  colourCheck.ok ? "text-ink-muted" : "text-error-11"
                )}
                aria-live="polite"
              >
                {#if colourCheck.ok}
                  {colourCheck.swatch?.name ?? words.customColour}
                {:else}
                  {words.colourFault[colourCheck.fault]}
                {/if}
              </p>
            </div>
          </section>

          <!-- Size: the presets, then width × height with the ratio kept. -->
          <section
            class="flex min-w-0 flex-col gap-space-3"
            aria-labelledby="{id}-size"
          >
            <div
              class="flex min-h-c-btn-h-sm items-center justify-between gap-space-3"
            >
              <h3 id="{id}-size" class="type-label text-ink-strong">
                {words.size}
              </h3>
              {#if valid}
                <p
                  class="mark-line flex min-w-0 items-center gap-space-2 text-ink-muted"
                  aria-live="polite"
                >
                  {@render frame(valid.w, valid.h)}
                  <span
                    class="type-label text-ink-strong tabular-nums"
                    dir="ltr">{ratioOf(valid.w, valid.h)}</span
                  >
                  <span class="type-meta tabular-nums" dir="ltr"
                    >{words.megapixels(megapixels(valid.w, valid.h))}</span
                  >
                </p>
              {/if}
            </div>

            <!-- The same radio group as the swatches, so one keyboard model
                 runs the whole panel: arrows move and pick. -->
            <RadioGroup.Root
              class="grid grid-cols-3 gap-space-2"
              aria-label={words.presets}
              onValueChange={pickPreset}
              orientation="horizontal"
              value={chosenPreset}
            >
              {#each [...PRESETS, null] as preset (preset?.id ?? "custom")}
                <RadioGroup.Item
                  class="press-tint touch-hit flex min-w-0 items-center gap-space-2 rounded-sm border border-border-control bg-surface-raised px-space-2 py-space-2 text-start text-ink-strong transition-control can-hover:hover:not-state-checked:bg-surface-hover state-checked:border-brand-solid state-checked:bg-surface-recess disabled:opacity-50"
                  aria-label={preset
                    ? `${preset.ratio}, ${words.pixels(preset.width, preset.height)}`
                    : `${words.custom}, ${words.anySize}`}
                  value={preset?.id ?? "custom"}
                >
                  {#if preset}
                    {@render frame(preset.across, preset.down)}
                  {:else}
                    {@render frame(1, 1, true)}
                  {/if}
                  <!-- Figures read left to right in every script; a narrow
                       tile breaks the size after its ×, never inside a figure. -->
                  <span class="flex min-w-0 flex-col">
                    <span class="type-label" dir={preset ? "ltr" : undefined}
                      >{preset?.ratio ?? words.custom}</span
                    >
                    <span
                      class="type-meta text-ink-muted tabular-nums"
                      dir="ltr"
                    >
                      {#if preset}
                        {preset.width}×<wbr />{preset.height}
                      {:else}
                        {words.anySizeShort}
                      {/if}
                    </span>
                  </span>
                </RadioGroup.Item>
              {/each}
            </RadioGroup.Root>

            <div class="flex min-w-0 flex-col gap-space-2" {@attach morph()}>
              <div class="flex items-end gap-space-2">
                <label class="flex min-w-0 flex-1 flex-col gap-space-1">
                  <span class="type-meta text-ink-muted">{words.width}</span>
                  <InputGroup.Root>
                    <InputGroup.Input
                      aria-describedby={widthCheck.ok
                        ? undefined
                        : `${id}-width-fault`}
                      aria-invalid={!widthCheck.ok || undefined}
                      autocomplete="off"
                      inputmode="numeric"
                      onkeydown={(event) =>
                        stepKeys(event, widthText, typeWidth)}
                      bind:value={() => widthText, typeWidth}
                    />
                    <InputGroup.Addon align="inline-end"
                      >{words.px}</InputGroup.Addon
                    >
                  </InputGroup.Root>
                </label>
                <Tip label={words.keepRatio}>
                  {#snippet children(tip)}
                    <Toggle
                      {...tip}
                      aria-label={words.keepRatio}
                      data-keep-ratio
                      variant="outline"
                      bind:pressed={() => keepRatio, setKeepRatio}
                    >
                      <IconLink aria-hidden="true" />
                    </Toggle>
                  {/snippet}
                </Tip>
                <label class="flex min-w-0 flex-1 flex-col gap-space-1">
                  <span class="type-meta text-ink-muted">{words.height}</span>
                  <InputGroup.Root>
                    <InputGroup.Input
                      aria-describedby={heightCheck.ok
                        ? undefined
                        : `${id}-height-fault`}
                      aria-invalid={!heightCheck.ok || undefined}
                      autocomplete="off"
                      inputmode="numeric"
                      onkeydown={(event) =>
                        stepKeys(event, heightText, typeHeight)}
                      bind:value={() => heightText, typeHeight}
                    />
                    <InputGroup.Addon align="inline-end"
                      >{words.px}</InputGroup.Addon
                    >
                  </InputGroup.Root>
                </label>
              </div>
              {#if sizeFaults.length > 0}
                <ul class="flex flex-col gap-space-1" aria-live="polite">
                  {#each sizeFaults as { dimension, check, type, faultId } (faultId)}
                    <li
                      class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
                    >
                      <span
                        id={faultId}
                        class="type-meta text-pretty text-error-11"
                        >{words.sizeFault(dimension, check.fault)}</span
                      >
                      {#if check.nearest !== undefined}
                        {@const nearest = check.nearest}
                        <Button
                          aria-label={words.useFor(dimension, nearest)}
                          figures="tabular"
                          onclick={() => type(String(nearest))}
                          size="xs"
                          variant="outline"
                        >
                          <span>{words.use(nearest)}</span>
                        </Button>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </section>
        </fieldset>

        <footer
          class="flex min-w-0 flex-wrap items-center justify-end gap-x-space-4 gap-y-space-2 px-space-5"
        >
          <div class="me-auto min-w-0" aria-live="polite">
            {#if failed}
              <p class="type-meta text-pretty text-error-11" role="alert">
                {words.applyFailed(failed)}
              </p>
            {:else if isApplied && !pending}
              <p class="mark-line flex items-center gap-space-1 text-ink-muted">
                <IconTick
                  aria-hidden="true"
                  class="size-icon-md text-status-done-glyph"
                />
                <span class="type-label">{words.applied}</span>
              </p>
            {/if}
          </div>
          <Button
            class="max-phone:w-full"
            disabled={!(canApply || pending)}
            failed={failed !== null}
            label={words.apply}
            {pending}
            pendingLabel={words.applying}
            type="submit"
          />
        </footer>
      </form>
    </Card>
  </div>
</Tooltip.Provider>
