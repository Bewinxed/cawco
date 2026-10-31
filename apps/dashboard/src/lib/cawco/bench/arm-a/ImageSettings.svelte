<script lang="ts" module>
  /** The browser's colour picker (WICG EyeDropper), where it has one. */
  interface EyeDropperApi {
    open: () => Promise<{ sRGBHex: string }>;
  }
  type EyeDropperCtor = new () => EyeDropperApi;

  function eyeDropperCtor(): EyeDropperCtor | null {
    if (typeof window === "undefined") {
      return null;
    }
    return (
      (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null
    );
  }
</script>

<script lang="ts">
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  /**
   * The image settings: the colour and the size of an image about to be
   * generated, applied once. Every value stays as it was typed; a value that
   * does not pass is flagged beside its field with the nearest one that
   * would, and Apply waits until both pass. Its state is its props, so each
   * state can be forced (ImageSettings.stories.ts).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconLink, IconTick } from "#lib/icons.js";
  import {
    CUSTOM,
    type ImageSettingsValue,
    lockedSide,
    megapixels,
    nearestSide,
    PRESETS,
    presetFor,
    ratioWords,
    readColour,
    readSide,
    SIDE_STEP,
    type SideReading,
    SWATCHES,
    sameSettings,
  } from "./image-settings.js";
  import { imageSettingsWords as words } from "./words.js";

  let {
    colour = $bindable("coral"),
    customColour = $bindable(""),
    preset = $bindable("1:1"),
    width = $bindable("1024"),
    height = $bindable("1024"),
    locked = $bindable(false),
    applied = $bindable(null),
    pending = $bindable(false),
    disabled = false,
    eyeDropper = eyeDropperCtor() !== null,
    onapply,
  }: {
    /** A house accent's id, or `custom` for the typed colour. */
    colour?: string;
    /** The custom colour as typed: hex or oklch. */
    customColour?: string;
    /** A preset's ratio, or `custom`. */
    preset?: string;
    /** The sides as typed, in pixels. */
    width?: string;
    height?: string;
    /** Width and height keep their ratio. */
    locked?: boolean;
    /** What Apply last sent; null before the first. */
    applied?: ImageSettingsValue | null;
    /** Apply's work is running. */
    pending?: boolean;
    /** Nothing can change (an image is generating). */
    disabled?: boolean;
    /** The browser has EyeDropper; without it no picker is drawn. */
    eyeDropper?: boolean;
    /** Sends the settings; Apply shows its done check once it resolves. */
    onapply?: (value: ImageSettingsValue) => Promise<void> | void;
  } = $props();

  const uid = $props.id();

  // A field's fault is said once its edit is committed (a blur, Enter or
  // Apply), never against half-typed words.
  let editing = $state<"colour" | "width" | "height" | null>(null);

  const swatch = $derived(SWATCHES.find((s) => s.id === colour) ?? null);
  const custom = $derived(readColour(customColour));
  const chosenValue = $derived(
    swatch?.value ?? (custom.ok ? custom.value : null)
  );
  const chosenName = $derived.by(() => {
    if (swatch) {
      return swatch.name;
    }
    // A custom colour typed but not yet read is still the person's pick.
    return customColour.trim() === "" ? words.noColour : words.custom;
  });
  /** The line under the custom field: its fault, why it is idle, or the hint. */
  const colourHelp = $derived.by(() => {
    if (colourFault) {
      return colourFault;
    }
    if (swatch && customColour.trim() !== "") {
      return words.customIdle(swatch.name);
    }
    return words.customHint;
  });
  const colourFault = $derived.by(() => {
    if (swatch || custom.ok || custom.fault === "empty") {
      return null;
    }
    if (editing === "colour") {
      return null;
    }
    const typed = customColour.trim();
    return custom.fault === "hex-length"
      ? words.colourFault["hex-length"](typed, custom.digits)
      : words.colourFault[custom.fault](typed);
  });

  const w = $derived(readSide(width));
  const h = $derived(readSide(height));
  const both = $derived(w.ok && h.ok ? { width: w.px, height: h.px } : null);

  /** The ratio the lock keeps, width over height: the sides it opened with. */
  const ratioOf = (a: string, b: string): number => {
    const x = readSide(a);
    const y = readSide(b);
    return x.ok && y.ok ? x.px / y.px : 1;
  };
  let lockRatio = $state(ratioOf(width, height));

  type Side = "width" | "height";
  const sideFault = (side: Side, reading: SideReading) => {
    if (reading.ok || editing === side) {
      return null;
    }
    const name = side === "width" ? words.width : words.height;
    if (reading.fault === "empty") {
      return { name, side, text: words.sideFault.empty(name), nearest: null };
    }
    const text =
      reading.fault === "nan"
        ? words.sideFault.nan(name, side === "width" ? width : height)
        : words.sideFault[reading.fault](name);
    return { name, side, text, nearest: reading.nearest };
  };
  const sideFaults = $derived(
    [sideFault("width", w), sideFault("height", h)].filter((f) => f !== null)
  );

  const value = $derived<ImageSettingsValue | null>(
    chosenValue && both ? { colour: chosenValue, ...both } : null
  );
  const unchanged = $derived(sameSettings(value, applied));
  const canApply = $derived(!disabled && value !== null && !unchanged);

  /** Why the last Apply failed, as its sender said it; null once it is sent again. */
  let failure = $state<string | null>(null);

  const status = $derived.by(() => {
    if (disabled) {
      return words.disabled;
    }
    if (pending) {
      return "";
    }
    if (failure !== null) {
      return words.applyFailed(failure);
    }
    if (value === null) {
      return words.fixToApply;
    }
    return unchanged ? words.applied : "";
  });

  function pickSwatch(next: string | undefined) {
    if (next) {
      colour = next;
    }
  }

  function setSides(next: { width: number; height: number }) {
    width = String(next.width);
    height = String(next.height);
  }

  function pickPreset(next: string | undefined) {
    if (!next) {
      return;
    }
    preset = next;
    const found = PRESETS.find((p) => p.id === next);
    if (found) {
      setSides(found);
      lockRatio = found.width / found.height;
    } else {
      queueMicrotask(() => document.getElementById(`${uid}-width`)?.focus());
    }
  }

  /** A side was typed: the other follows under the lock, and the preset follows both. */
  function sideTyped(side: Side) {
    const reading = side === "width" ? readSide(width) : readSide(height);
    if (locked && reading.ok) {
      const other = lockedSide(reading.px, lockRatio, side);
      if (side === "width") {
        height = String(other);
      } else {
        width = String(other);
      }
    }
    const wNow = readSide(width);
    const hNow = readSide(height);
    preset = wNow.ok && hNow.ok ? presetFor(wNow.px, hNow.px) : CUSTOM;
  }

  function toggleLock(next: boolean) {
    locked = next;
    if (next && both) {
      lockRatio = both.width / both.height;
    }
  }

  /** ArrowUp and ArrowDown step a side by 8 px, Shift by 64. */
  function stepSide(event: KeyboardEvent, side: Side) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const reading = side === "width" ? w : h;
    let from = 1024;
    if (reading.ok) {
      from = reading.px;
    } else if (reading.fault !== "empty") {
      from = reading.nearest;
    }
    const step = SIDE_STEP * (event.shiftKey ? 8 : 1);
    const next = String(
      nearestSide(from + (event.key === "ArrowUp" ? step : -step))
    );
    if (side === "width") {
      width = next;
    } else {
      height = next;
    }
    editing = null;
    sideTyped(side);
  }

  function useNearest(side: Side, px: number) {
    if (side === "width") {
      width = String(px);
    } else {
      height = String(px);
    }
    sideTyped(side);
    document.getElementById(`${uid}-${side}`)?.focus();
  }

  let picking = $state(false);
  async function pickFromScreen() {
    const Ctor = eyeDropperCtor();
    if (!Ctor) {
      return;
    }
    picking = true;
    try {
      const { sRGBHex } = await new Ctor().open();
      customColour = sRGBHex.toLowerCase();
      colour = CUSTOM;
    } catch {
      // Escape closes the picker with no colour: nothing changes.
    } finally {
      picking = false;
    }
  }

  let form = $state<HTMLFormElement | null>(null);

  /** The first field still flagged, which a refused Apply takes the caret to. */
  function firstFlagged(): HTMLElement | null {
    if (!(swatch || custom.ok)) {
      return document.getElementById(`${uid}-custom`);
    }
    if (!w.ok) {
      return document.getElementById(`${uid}-width`);
    }
    return h.ok ? null : document.getElementById(`${uid}-height`);
  }

  /**
   * Enter commits a field's edit, so its fault is said at once: a form whose
   * Apply is disabled has no implicit submission (HTML, 4.10.21.2), and one
   * whose Apply is ready submits as well.
   */
  function commitOnEnter(event: KeyboardEvent) {
    if (event.key === "Enter") {
      editing = null;
    }
  }

  async function apply(event: SubmitEvent) {
    event.preventDefault();
    editing = null;
    if (pending || disabled) {
      return;
    }
    if (!value) {
      firstFlagged()?.focus();
      return;
    }
    if (unchanged) {
      return;
    }
    const sent = value;
    failure = null;
    pending = true;
    try {
      await onapply?.(sent);
      applied = sent;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      pending = false;
    }
  }

  const colourHelpId = `${uid}-colour-help`;
  const sizeHelpId = `${uid}-size-help`;
</script>

<TooltipProvider>
  <form
    class="flex flex-col gap-space-6 rounded-lg bg-surface-raised p-space-5 text-body text-ink-strong shadow-tile"
    aria-labelledby="{uid}-title"
    novalidate
    onsubmit={apply}
    bind:this={form}
  >
    <h2 id="{uid}-title" class="type-title m-0 text-balance">
      {words.title}
    </h2>

    <fieldset
      class="m-0 flex min-w-0 flex-col gap-space-4 border-0 p-0"
      {disabled}
    >
      <legend class="type-label mb-space-3 p-0 text-ink-strong">
        {words.colour}
      </legend>

      <!-- The chosen colour, drawn and said: its swatch, its name, its value. -->
      <div class="flex min-w-0 items-center gap-space-3">
        <span
          class="grid size-c-btn-h-lg flex-none place-items-center rounded-md border border-border-control bg-surface-recess"
          aria-hidden="true"
        >
          {#if chosenValue}
            <span
              class="size-c-btn-h rounded-sm bg-(--chosen) outline outline-border-hairline -outline-offset-1"
              style:--chosen={chosenValue}
            ></span>
          {:else}
            <span
              class="size-c-btn-h rounded-sm border border-dashed border-border-control-strong"
            ></span>
          {/if}
        </span>
        <output
          class="flex min-w-0 flex-col gap-space-1"
          aria-live="polite"
          for="{uid}-custom"
        >
          <span class="type-label text-ink-row">
            <MorphText text={chosenName} />
          </span>
          {#if chosenValue}
            <span class="type-code wrap-anywhere text-ink-muted">
              {chosenValue}
            </span>
          {/if}
        </output>
      </div>

      <!-- The kit's option chip draws no disabled look of its own (ui/chip
           `option`): the group fades here, as the kit's other controls do. -->
      <div class={disabled ? "opacity-50" : undefined}>
        <OptionGroup
          aria-label={words.accents}
          onenter={() => form?.requestSubmit()}
          {disabled}
          bind:value={
            () => (swatch ? [swatch.id] : []), (v) => pickSwatch(v[0])
          }
        >
          {#each SWATCHES as s (s.id)}
            <OptionGroupItem value={s.id}>
              <span
                class="size-icon-md flex-none rounded-xs bg-(--swatch) outline outline-border-hairline -outline-offset-1"
                aria-hidden="true"
                data-box
                style:--swatch={s.value}
              ></span>
              <span>{s.name}</span>
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      </div>

      <div class="flex min-w-0 flex-col gap-space-2" {@attach morph()}>
        <div
          class="flex min-w-0 flex-wrap items-center justify-between gap-space-2"
        >
          <label class="type-label text-ink-muted" for="{uid}-custom">
            {words.custom}
          </label>
          {#if eyeDropper}
            <Button
              {disabled}
              label={words.pickFromScreen}
              pending={picking}
              pendingLabel={words.picking}
              onclick={pickFromScreen}
              size="xs"
              variant="outline"
            />
          {/if}
        </div>
        <Input
          id="{uid}-custom"
          face="mono"
          aria-describedby={colourHelpId}
          aria-invalid={colourFault ? true : undefined}
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          bind:value={customColour}
          onblur={() => {
            editing = null;
          }}
          oninput={() => {
            editing = "colour";
            colour = CUSTOM;
          }}
          onkeydown={commitOnEnter}
        />
        <p
          id={colourHelpId}
          class="type-meta m-0 text-pretty wrap-anywhere {colourFault
            ? 'text-status-fail-ink'
            : 'text-ink-muted'}"
        >
          <MorphText text={colourHelp} wrap />
        </p>
      </div>
    </fieldset>

    <fieldset
      class="m-0 flex min-w-0 flex-col gap-space-4 border-0 p-0"
      {disabled}
    >
      <legend class="type-label mb-space-3 p-0 text-ink-strong">
        {words.size}
      </legend>

      <div class={disabled ? "opacity-50" : undefined}>
        <OptionGroup
          aria-label={words.presets}
          onenter={() => form?.requestSubmit()}
          {disabled}
          bind:value={() => [preset], (v) => pickPreset(v[0])}
        >
          {#each PRESETS as p (p.id)}
            <OptionGroupItem value={p.id}>
              <span
                class="grid size-icon-md flex-none place-items-center"
                aria-hidden="true"
                data-box
              >
                <span
                  class="aspect-(--ratio) rounded-hair border border-current {p.width >=
                  p.height
                    ? 'w-icon-sm'
                    : 'h-icon-sm'}"
                  style:--ratio="{p.width} / {p.height}"
                ></span>
              </span>
              <span class="tabular-nums">{p.id}</span>
            </OptionGroupItem>
          {/each}
          <OptionGroupItem value={CUSTOM}>
            <span
              class="grid size-icon-md flex-none place-items-center"
              aria-hidden="true"
              data-box
            >
              <span
                class="size-icon-sm rounded-hair border border-dashed border-current"
              ></span>
            </span>
            <span>{words.customSize}</span>
          </OptionGroupItem>
        </OptionGroup>
      </div>

      <div class="flex items-end gap-space-2">
        {#each ["width", "height"] as const as side, i (side)}
          {@const reading = side === "width" ? w : h}
          {@const invalid = !reading.ok && editing !== side}
          <div class="flex min-w-0 flex-1 flex-col gap-space-2">
            <label class="type-label text-ink-muted" for="{uid}-{side}">
              {side === "width" ? words.width : words.height}
            </label>
            <InputGroup.Root>
              {#if side === "width"}
                <InputGroup.Input
                  id="{uid}-width"
                  aria-describedby={sizeHelpId}
                  aria-invalid={invalid ? true : undefined}
                  autocomplete="off"
                  enterkeyhint="done"
                  inputmode="numeric"
                  bind:value={width}
                  onblur={() => {
                    editing = null;
                  }}
                  oninput={() => {
                    editing = "width";
                    sideTyped("width");
                  }}
                  onkeydown={(event) => {
                    commitOnEnter(event);
                    stepSide(event, "width");
                  }}
                />
              {:else}
                <InputGroup.Input
                  id="{uid}-height"
                  aria-describedby={sizeHelpId}
                  aria-invalid={invalid ? true : undefined}
                  autocomplete="off"
                  enterkeyhint="done"
                  inputmode="numeric"
                  bind:value={height}
                  onblur={() => {
                    editing = null;
                  }}
                  oninput={() => {
                    editing = "height";
                    sideTyped("height");
                  }}
                  onkeydown={(event) => {
                    commitOnEnter(event);
                    stepSide(event, "height");
                  }}
                />
              {/if}
              <InputGroup.Addon align="inline-end">
                <span>{words.px}</span>
              </InputGroup.Addon>
            </InputGroup.Root>
          </div>
          {#if i === 0}
            <div class="flex-none">
              <Tip label={words.lock} side="top">
                {#snippet children(tip)}
                  <Toggle
                    {...tip}
                    aria-label={words.lock}
                    pressed={locked}
                    onPressedChange={toggleLock}
                  >
                    <IconLink aria-hidden="true" />
                  </Toggle>
                {/snippet}
              </Tip>
            </div>
          {/if}
        {/each}
      </div>

      <div
        id={sizeHelpId}
        class="flex min-w-0 flex-col gap-space-2"
        {@attach morph()}
      >
        {#each sideFaults as fault (fault.side)}
          <div
            class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
            in:unfold
            out:unfold
          >
            <p class="type-meta m-0 min-w-0 text-pretty text-status-fail-ink">
              {fault.text}
            </p>
            {#if fault.nearest !== null}
              <Button
                aria-label={words.useNearestFor(fault.name, fault.nearest)}
                figures="tabular"
                onclick={() =>
                  fault.nearest !== null &&
                  useNearest(fault.side, fault.nearest)}
                size="xs"
                variant="outline"
              >
                <span>{words.useNearest(fault.nearest)}</span>
              </Button>
            {/if}
          </div>
        {/each}
        <p class="type-meta m-0 tabular-nums text-ink-muted" aria-live="polite">
          {#if both}
            <span
              >{words.ratio}
              {ratioWords(both.width, both.height)}{locked
                ? words.ratioKept
                : ""}</span
            >
            <span aria-hidden="true"> · </span>
            <span>{megapixels(both.width, both.height)} {words.megapixels}</span
            >
          {:else}
            <span>{words.readoutWaits}</span>
          {/if}
        </p>
      </div>
    </fieldset>

    <div
      class="flex flex-wrap items-center justify-between gap-x-space-4 gap-y-space-3 border-t border-border-hairline pt-space-5"
      {@attach morph()}
    >
      <p
        class="mark-line type-meta m-0 flex min-w-0 items-center gap-space-1 {failure !==
          null && !pending
          ? 'text-status-fail-ink'
          : 'text-ink-muted'}"
        aria-live="polite"
      >
        {#if status === words.applied}
          <IconTick
            class="size-icon-sm flex-none text-status-done-glyph"
            aria-hidden="true"
          />
        {/if}
        <span class="text-pretty"><MorphText text={status} wrap /></span>
      </p>
      <Button
        class="ms-auto"
        disabled={!(canApply || pending)}
        failed={failure !== null}
        label={words.apply}
        {pending}
        pendingLabel={words.applying}
        type="submit"
      />
    </div>
  </form>
</TooltipProvider>
