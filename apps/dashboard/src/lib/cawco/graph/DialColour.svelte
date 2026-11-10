<script lang="ts">
  /**
   * A colour control (core stage.ts `CanvasDial`, kind `color`): one field,
   * its swatch leading and the colour as written after it (Framer's and
   * Rive's colour rows). A press on the swatch opens the picker under the
   * field (ColourPicker, Ark UI's). On a desk it is drawn in the kit's
   * Popover, so it stands over everything on the face, escapes its scroller
   * and closes as every popover does; on a phone (`inline`) the swatch only
   * toggles it, and Dials unfolds it under the row across the face, so it
   * covers neither the rows above it, the faces' switch nor the drawing it
   * tunes. While his colour differs from the agent's,
   * the swatch is split: the agent's colour leading, his trailing. The
   * value too long for its field ends in an ellipsis, its whole in its
   * title. The field takes any colour the browser
   * reads, typed or pasted (hex, rgb(), hsl(), oklch(), color(display-p3 …));
   * one it reads as none says so under the field and is not set; Escape
   * puts the last colour back.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import ColourPicker from "./ColourPicker.svelte";
  import { isColour } from "./dials";

  const words = graphWords.dials;

  let {
    value,
    was = null,
    inline = false,
    label,
    open = $bindable(false),
    onOpenChange,
    onchange,
  }: {
    value: string;
    /** The agent's colour while his differs; null while they agree. */
    was?: string | null;
    /** Its picker unfolds under its row, its host's (a phone's): the swatch only toggles it. */
    inline?: boolean;
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
      oninput={(event) => {
        typing = event.currentTarget.value;
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

<div class="flex min-w-0 flex-col gap-space-1">
  {#if inline}
    <!-- The picker unfolds under the row, across the face (Dials). -->
    {@render field(toggle)}
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
        <ColourPicker
          {onchange}
          onclose={() => {
            open = false;
            onOpenChange?.(false);
          }}
          {value}
        />
      </Popover.Content>
    </Popover.Root>
  {/if}
  {#if refused}
    <p class="m-0 type-meta text-status-fail-ink" id="{uid}-refused">
      {words.notAColour}
    </p>
  {/if}
</div>
