<script lang="ts">
  /**
   * A browser artifact's address in the artifact panel's head (PreviewPane's
   * `address` item): the page in front, at the head's centre as a browser's
   * toolbar holds its address, so no band claims a row over the stream
   * (BrowserView). Who has control is said by its glyph (a globe while the
   * agent drives, a lock while the person holds it, the Private chip
   * beside) and in its name. It is no control: Take over or Hand back,
   * trailing, is the head's one act. `as="menu"` is the same as More's
   * first line, where the head has no room for it; the origin wraps there.
   */
  import { browserWords } from "@cawco/core/words/browser";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconGlobe, IconLock } from "#lib/icons.js";
  import OriginText from "../OriginText.svelte";

  let {
    origin,
    mine,
    as = "bar",
  }: {
    /** The page in front's origin; null while it shows none. */
    origin: string | null;
    /** The person holds the browser. */
    mine: boolean;
    /** In the head, or as More's line. */
    as?: "bar" | "menu";
  } = $props();

  const control = $derived(
    mine ? browserWords.youHaveControl : browserWords.agentDriving
  );
</script>

{#snippet held()}
  {#if mine}
    <Badge aria-hidden="true" data-box data-slot="browser-private"
      ><span>{browserWords.private}</span></Badge
    >
  {/if}
  <span class="sr-only" data-slot="browser-control">{control}</span>
{/snippet}

{#snippet glyph()}
  {#if mine}<IconLock />{:else}<IconGlobe />{/if}
{/snippet}

{#if as === "menu"}
  <DropdownMenu.Label data-slot="browser-address">
    <span class="mark-line flex items-center gap-space-2">
      {@render glyph()}
      <span class="min-w-0 wrap-anywhere" data-slot="browser-origin"
        >{#if origin}<OriginText
            {origin}
          />{:else}{browserWords.noPage}{/if}</span
      >
      {@render held()}
    </span>
  </DropdownMenu.Label>
{:else}
  <BarGlass form="group">
    <div
      aria-label={`${origin ?? browserWords.noPage}, ${control}`}
      class="mark-line flex h-c-bar-item min-w-0 max-w-c-browser-address-w items-center gap-space-1 ps-space-2 pe-space-3 type-meta text-ink-strong"
      data-mine={mine || undefined}
      data-slot="browser-address"
      role="status"
      title={origin ?? undefined}
    >
      <span aria-hidden="true" class="mark-cell flex-none text-ink-muted"
        >{@render glyph()}</span
      >
      <!-- One line, cut at its end: the origin as plain words, since a
           label break (OriginText's `<wbr>`) breaks a nowrap line too. -->
      <span
        aria-hidden="true"
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        data-slot="browser-origin">{origin ?? browserWords.noPage}</span
      >
      {@render held()}
    </div>
  </BarGlass>
{/if}
