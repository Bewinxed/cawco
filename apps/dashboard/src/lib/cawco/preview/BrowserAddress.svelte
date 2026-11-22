<script lang="ts">
  /**
   * Where a live browser is, and who drives it: in the artifact panel's
   * head after its title on a desk (PreviewPane's `address` item), and on a
   * phone floating at the stream's foot (BrowserView), as a browser keeps
   * its address in its toolbar on a desk and over the page's foot on a
   * phone. No band claims a row over the stream.
   *
   * It shows the place (address.ts `placeOf`): the registrable domain is
   * never cut, what stands before it gives way first; an https scheme goes
   * unsaid. Who drives is its glyph, the words in its name and tooltip (a
   * list's state rule): the agent's ghost while it drives, the pointer
   * once the person holds the browser, its words then saying what holding
   * it means (nothing done here reaches the agent). No chip: a "Private"
   * mark louder than the address said nothing of what was private; no
   * padlock: it read as a secure connection.
   * It stands only while the browser is live; the stream's own face says
   * every other state. `as="menu"` is the same as More's first line, where
   * a desk's head lacks the room; the origin wraps there.
   */
  import { browserWords } from "@cawco/core/words/browser";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconAgentLinear, IconInteractLinear } from "#lib/icons.js";
  import { placeOf } from "./address";

  let {
    origin,
    mine,
    connecting = false,
    as = "bar",
  }: {
    /** The page in front's origin; null while it shows none. */
    origin: string | null;
    /** The stream is not drawn yet: with no origin, what the page is is not known, so the address says it connects rather than that no page is open. */
    connecting?: boolean;
    /** The person holds the browser. */
    mine: boolean;
    /** In the head (or over the stream's foot), or as More's line. */
    as?: "bar" | "menu";
  } = $props();

  /** Who drives, in words: the glyph's tooltip and the address's name. While the person holds it, what that means for the agent too. */
  const control = $derived(
    mine
      ? `${browserWords.youHaveControl}. ${browserWords.privateLine}`
      : browserWords.agentDriving
  );
  const place = $derived(origin ? placeOf(origin) : null);
  /** What stands for the origin when there is none: no page is open, once that is known. */
  const none = $derived(
    connecting ? browserWords.connecting : browserWords.noPage
  );
  const name = $derived(`${origin ?? none}, ${control}`);
</script>

{#snippet glyph()}
  {#if mine}
    <IconInteractLinear data-slot="browser-driver" />
  {:else}
    <IconAgentLinear data-slot="browser-driver" />
  {/if}
{/snippet}

{#snippet held()}
  <span class="sr-only" data-slot="browser-control">{control}</span>
{/snippet}

{#if as === "menu"}
  <DropdownMenu.Label data-slot="browser-address">
    <span class="mark-line flex items-center gap-space-2" title={control}>
      {@render glyph()}
      <span class="min-w-0 wrap-anywhere" data-slot="browser-origin"
        >{#if place}{place.scheme}{place.lead}{place.domain}{:else}{none}{/if}</span
      >
      {@render held()}
    </span>
  </DropdownMenu.Label>
{:else}
  <BarGlass form="group">
    <div
      aria-label={name}
      class="mark-line flex h-c-bar-item min-w-0 max-w-80 items-center gap-space-1 ps-space-2 pe-space-3 type-meta text-ink-strong"
      data-mine={mine || undefined}
      data-slot="browser-address"
      role="status"
      title={origin ? `${origin} · ${control}` : control}
    >
      <span aria-hidden="true" class="mark-cell flex-none text-ink-muted"
        >{@render glyph()}</span
      >
      <!-- The place on one line: what leads the domain gives way first,
           from its end; the domain never. -->
      <span
        aria-hidden="true"
        class="flex min-w-0"
        data-box
        data-slot="browser-origin"
      >
        {#if place}
          {#if place.scheme}<span class="flex-none text-ink-muted"
              >{place.scheme}</span
            >{/if}
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted"
            >{place.lead}</span
          ><span class="flex-none whitespace-nowrap">{place.domain}</span>
        {:else}
          <span class="whitespace-nowrap">{none}</span>
        {/if}
      </span>
      {@render held()}
    </div>
  </BarGlass>
{/if}
