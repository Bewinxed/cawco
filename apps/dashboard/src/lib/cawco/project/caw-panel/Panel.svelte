<script lang="ts">
  /**
   * Caw's panel as each option on the decision page draws it, in the form
   * its story names: three rows, the head, the thread that scrolls, and the
   * message box as the panel's last row (decided: nothing passes under it).
   *
   * - `desk`: the panel at --c-panel-w by --c-caw-panel-h, hanging at the
   *   trailing side of the page's field as it hangs under the top bar's
   *   glass (DESIGN.md, Caw's panel), the card's radius, the overlay shadow.
   * - `phone`: a 390 × 844 screen (a device's size, not a design length)
   *   with the panel as the house sheet (DESIGN.md, Drawer): full-bleed,
   *   flush on the foot, 85% tall, its grabber, its top hairline, over the
   *   scrim.
   * - `resize` (pin 11, desk only): `edges`, the rail's own grip on the
   *   panel's two free edges and their corner; `corner`, an L outside the
   *   free corner; `menu`, Wide panel in More. Every drag holds the top
   *   trailing corner where the glass is, so the panel grows down and toward
   *   the page.
   * - `centre`: the thread's room holds one block at its middle (a blocking
   *   state takes the panel's centre).
   */
  import type { Snippet } from "svelte";
  import type { CawStatus } from "#lib/cawco/home/Caw.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Head from "./Head.svelte";
  import Resize from "./Resize.svelte";

  let {
    form,
    head = "who",
    thread = null,
    fact = null,
    pose = "ready",
    composer = "Message Caw",
    resize = null,
    centre = false,
    children,
  }: {
    form: "desk" | "phone";
    head?: "who" | "name";
    thread?: string | null;
    fact?: { text: string; tone: BadgeVariant } | null;
    pose?: CawStatus;
    /** The message box's placeholder; null where it can't stand. */
    composer?: string | null;
    resize?: "edges" | "corner" | "menu" | null;
    centre?: boolean;
    children?: Snippet;
  } = $props();

  const phone = $derived(form === "phone");
  const draft = new ComposerDraft();
  /** The size a drag or Wide panel gave it; null at rest (the tokens). */
  let size = $state<{ w: number; h: number } | null>(null);
  const REST_W = 380;
  const WIDE_W = 560;
  const wide = $derived(
    resize === "menu"
      ? {
          on: (size?.w ?? REST_W) > REST_W,
          toggle: () => {
            size = (size?.w ?? REST_W) > REST_W ? null : { w: WIDE_W, h: 640 };
          },
        }
      : null
  );
</script>

{#snippet body()}
  <Head {fact} {form} kind={head} {pose} {thread} {wide} />
  <div
    class="kit-edge-fade-block relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-(--surface-recess)"
    data-panel-room
  >
    <div
      class={[
        "flex min-h-full min-w-0 flex-col gap-(--space-5) py-(--space-4)",
        phone ? "px-(--space-4)" : "px-(--space-3)",
        centre && "justify-center",
      ]}
    >
      {#if head === "name" && thread}
        <p
          class="min-w-0 text-(--ink-strong) text-label [overflow-wrap:anywhere] [text-wrap:balance]"
          data-panel-thread-row
        >
          {thread}
        </p>
      {/if}
      {@render children?.()}
    </div>
  </div>
  {#if composer !== null}
    <!-- The real message box as the panel's last row: its dock in the flow
         at the row's width, its shell opaque (nothing passes under it). -->
    <div
      class={[
        "shrink-0 bg-(--surface-recess) pt-(--space-1) [&_.kit-dock-shell]:bg-(--surface-raised) [&_.kit-dock-shell]:backdrop-filter-none [&_[data-slot=composer]]:mx-0 [&_[data-slot=composer]]:w-full [&_[data-slot=dock]>.prompts]:hidden [&_[data-slot=dock]]:static [&_[data-slot=dock]]:z-auto [&_[data-slot=lift]]:hidden",
        phone
          ? "px-(--space-4) pb-[calc(var(--space-4)+env(safe-area-inset-bottom,0px))]"
          : "px-(--space-2) pb-(--space-2)",
      ]}
      data-panel-composer
      style:--c-composer-w="100%"
    >
      <Composer
        agentName="Caw"
        commands={[]}
        {draft}
        mentionsFrom={null}
        onstop={() => undefined}
        onsubmit={() => undefined}
        placeholder={composer}
        recallOf="caw-panel-page"
      />
    </div>
  {/if}
{/snippet}

<!-- The app's tooltip provider, as its layout stands it over every page. -->
<Tooltip.Provider>
  {#if phone}
    <div
      class="relative h-[844px] w-full overflow-hidden bg-(--surface-page)"
      data-panel-form="phone"
    >
      <div class="absolute inset-0 bg-(--scrim)"></div>
      <div
        class="absolute inset-x-0 bottom-0 flex h-[85%] flex-col overflow-hidden rounded-t-lg border-(--border-hairline) border-t bg-(--surface-raised) shadow-(--shadow-drawer)"
        data-panel
      >
        <span
          aria-hidden="true"
          class="mx-auto mt-(--space-2) block h-1.5 w-[100px] max-w-[40%] shrink-0 rounded-(--radius-pill) bg-(--border-control)"
        ></span>
        {@render body()}
      </div>
    </div>
  {:else}
    <div
      class="flex w-full justify-end bg-(--surface-page) p-(--space-3)"
      data-panel-form="desk"
    >
      <div
        class="relative flex h-(--c-caw-panel-h) w-(--c-panel-w) max-w-full shrink-0 flex-col rounded-lg bg-(--surface-raised) shadow-(--shadow-overlay)"
        data-panel
        style:--c-panel-w={size ? `${size.w}px` : undefined}
        style:--c-caw-panel-h={size ? `${size.h}px` : undefined}
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
          {@render body()}
        </div>
        {#if resize === "edges" || resize === "corner"}
          <Resize
            mode={resize}
            onsize={(next) => {
              size = next;
            }}
            rest={{ w: REST_W, h: 640 }}
          />
        {/if}
      </div>
    </div>
  {/if}
</Tooltip.Provider>
