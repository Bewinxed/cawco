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
   *   with the panel hanging from Caw's glass tucked into the bar's trailing
   *   edge (DESIGN.md, Caw's panel: "On the phone it hangs from his tucked
   *   tab"): the real HangCard, its top on the bar's floor line, its
   *   trailing side the screen's edge (square, no edge drawn), its leading
   *   side the 12px margin, no scrim. The glass is drawn here: the Shell's
   *   own is in its top bar, which a frame can't mount.
   * - `resize` (pin 11, desk only): `edges`, the rail's own grip on the
   *   panel's two free edges and their corner; `corner`, an L outside the
   *   free corner; `menu`, Wide panel in More. Every drag holds the top
   *   trailing corner where the glass is, so the panel grows down and toward
   *   the page.
   * - `centre`: the thread's room holds one block at its middle (a blocking
   *   state takes the panel's centre).
   */
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import type { CawStatus } from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
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
  /** Caw's glass on the phone's bar: what the panel hangs from. */
  let glass = $state<HTMLElement | null>(null);
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
    class="kit-edge-fade-block relative min-block-0 flex-1 overflow-y-auto overscroll-contain bg-(--surface-recess) [scrollbar-gutter:stable]"
    data-panel-room
  >
    <div
      class={[
        "flex min-block-full min-inline-0 flex-col gap-(--space-5) py-(--space-4)",
        phone ? "px-(--space-4)" : "px-(--space-3)",
        centre && "justify-center",
      ]}
    >
      {#if head === "name" && thread}
        <p
          class="min-inline-0 text-(--ink-strong) text-label wrap-anywhere text-balance"
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
         at the row's width, its shell opaque (nothing passes under it).
         Composer's own rules are unlayered (Svelte scoped), so a utility
         reaching into it is marked important to win over them: unmarked,
         its dock stayed `position: absolute` over the whole panel, the box
         drawn over the thread's foot. -->
    <div
      class={[
        "shrink-0 bg-(--surface-recess) pbs-(--space-1) [&_.kit-dock-shell]:bg-(--surface-raised)! [&_.kit-dock-shell]:backdrop-filter-none! [&_[data-slot=composer]]:mx-0! [&_[data-slot=composer]]:inline-full! [&_[data-slot=dock]>.prompts]:hidden! [&_[data-slot=dock]]:static! [&_[data-slot=dock]]:z-auto! [&_[data-slot=lift]]:hidden!",
        phone
          ? "px-(--space-4) pbe-[calc(var(--space-4)+env(safe-area-inset-bottom,0px))]"
          : "px-(--space-2) pbe-(--space-2)",
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
      class="@container relative block-[844px] inline-full overflow-hidden bg-(--surface-page)"
      data-panel-form="phone"
    >
      <!-- The phone's bar, its hairline floor, and Caw's glass tucked into
           the screen's trailing edge: the tabs' top to the floor line, square
           on the screen's side, his 24px head in it (DESIGN.md, top bar's
           trailing edge). While the panel hangs it is the panel's surface
           with its edge, run on down through the 4px neck, its leading foot
           flaring out by radius-lg into the panel's top edge (DESIGN.md,
           Caw's panel). -->
      <div
        class="relative block-(--c-top-bar-h) border-(--border-hairline) border-be bg-(--surface-recess)"
      >
        <span
          bind:this={glass}
          class="absolute inset-e-0 inset-bs-[calc(var(--c-top-bar-h)-var(--c-tab-row-h))] inset-be-px grid inline-(--c-bar-caw-glass-phone) justify-items-center rounded-ss-full border-(--border-control) border-bs border-s bg-(--surface-raised) pbs-(--space-1) [--flare:var(--radius-lg)]"
          data-box
          data-panel-glass
          ><CawFace
            size={24}
            status={pose}
          /><!-- Its foot: the leading
               flank curving out by --flare into the card's top edge, a
               quarter turn in the glass's edge ink, the glass's surface
               under it; the card's cut (HangCard's neck) shows its own edge
               exactly where this stroke meets its top row. --><span
            aria-hidden="true"
            class="absolute -inset-s-(--flare) inset-be-0 block size-(--flare) bg-[radial-gradient(circle_at_0_0,transparent_calc(var(--flare)-1px),var(--border-control)_calc(var(--flare)-1px),var(--border-control)_var(--flare),var(--surface-raised)_var(--flare))]"
            data-panel-glass-foot
          ></span></span
        >
      </div>
      {#if glass}
        <!-- The real hanging card (DESIGN.md, A card that hangs from its
             anchor), drawn in this frame: bits-ui's own content (HangCard
             `as`), which has no portal, placed `absolute` in the screen. -->
        <Popover.Root open>
          <HangCard
            align="end"
            as={PopoverPrimitive.Content}
            anchor={glass}
            avoidCollisions={false}
            class="flex block-(--c-caw-panel-h) w-[calc(100cqi-var(--c-bar-phone-edge))] flex-col gap-0 overflow-hidden rounded-ee-none p-0 after:border-e-0"
            customAnchor={glass}
            data-panel
            forceMount
            onEscapeKeydown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => event.preventDefault()}
            side="bottom"
            sideOffset={0}
            strategy="absolute"
            trapFocus={false}
          >
            {@render body()}
          </HangCard>
        </Popover.Root>
      {/if}
    </div>
  {:else}
    <div
      class="flex inline-full justify-end bg-(--surface-page) p-(--space-3)"
      data-panel-form="desk"
    >
      <div
        class="relative flex block-(--c-caw-panel-h) inline-(--c-panel-w) max-inline-full shrink-0 flex-col rounded-lg bg-(--surface-raised) shadow-(--shadow-overlay)"
        data-panel
        style:--c-panel-w={size ? `${size.w}px` : undefined}
        style:--c-caw-panel-h={size ? `${size.h}px` : undefined}
      >
        <div
          class="flex min-block-0 flex-1 flex-col overflow-hidden rounded-lg"
        >
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
