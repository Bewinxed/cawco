<script lang="ts">
  /**
   * A colour dial (core stage.ts `CanvasDial`, kind `color`): one field,
   * its swatch leading and the colour as written after it (MagicPath's and
   * Rive's colour rows). The swatch is the platform's colour picker (an
   * `<input type="color">` over it), which takes `#rrggbb` alone; the
   * field takes any colour the browser reads, typed or pasted (hex of 3,
   * 4, 6 or 8 digits, rgb(), hsl(), oklch(), color(display-p3 …)), so a
   * format, an opacity or a wide-gamut colour is typed. A colour typed
   * that the browser reads as none says so under the field and is not set;
   * Escape puts the last colour back. No house colour control exists to
   * reach for: the field is the kit's, the picker the platform's.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { hexOf, isColour } from "./dials";

  const words = graphWords.dials;

  let {
    value,
    changed,
    label,
    onchange,
  }: {
    value: string;
    changed: boolean;
    /** Its name, said to a reader. */
    label: string;
    onchange: (next: string) => void;
  } = $props();

  const uid = $props.id();
  /** The colour while he types it; null while he doesn't. */
  let typing = $state<string | null>(null);
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
</script>

<div class="flex min-w-0 flex-col gap-space-1">
  <InputGroup.Root>
    <InputGroup.Addon look="swatch">
      <!-- The swatch: the colour as set, the platform's picker over it. -->
      <span
        aria-hidden="true"
        class="block size-space-6 rounded-xs border border-border-control bg-(--swatch) shadow-xs"
        style:--swatch={value}
      ></span>
      <input
        aria-label={words.pick(label)}
        class="absolute inset-0 size-full opacity-0"
        oninput={(event: Event) =>
          onchange((event.currentTarget as HTMLInputElement).value)}
        type="color"
        value={hexOf(value)}
      />
    </InputGroup.Addon>
    <InputGroup.Input
      aria-describedby={refused ? `${uid}-refused` : undefined}
      aria-invalid={refused || undefined}
      aria-label={label}
      autocomplete="off"
      face="mono"
      text="label"
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
      tone={changed ? "edited" : undefined}
      value={typing ?? value}
    />
  </InputGroup.Root>
  {#if refused}
    <p class="m-0 type-meta text-status-fail-ink" id="{uid}-refused">
      {words.notAColour}
    </p>
  {/if}
</div>
