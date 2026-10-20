<script lang="ts">
  /**
   * Caw's one panel (advisor report §2): four zones top to bottom, one
   * scroll between them, the message box at the foot.
   *
   *   HEAD      the thread's name (its menu) · Off · Open as a tab / Close
   *   WAITING   other projects' asks, a row each with its act; absent with none
   *   THREAD    this project's conversation; a blocking state takes its centre
   *   COMPOSER  the real message box, his seat on its ledge, his ask grown into it
   *
   * The message box stands as the thread pane's dock does (ThreadPane,
   * docked): over the room's foot, the room keeping clear under its last
   * line all that stands over its foot (his seat's top down) and a step, so at rest nothing
   * stands under the box, and his ask has the room above it to grow into.
   *
   * - `desk`: the panel's card at --c-panel-w by --c-caw-panel-h on the
   *   page's ground at its trailing side, as it hangs under the top bar's
   *   glass (DESIGN.md, Caw's panel), the card's radius, edge and overlay
   *   shadow. The field is 4px wider each side, so the frame (388) fits a
   *   phone's decision card at legible type.
   * - `phone`: a 390 × 844 screen (the bench's phone): the real bar glass
   *   (kit BarGlass, its phone form read off the `shell` container), joined,
   *   and the panel as the sheet under it from the bar's floor to the
   *   screen's foot, its trailing side the screen's edge and square, its
   *   leading side the bar's 12px phone edge.
   *
   * The hung card itself (kit HangCard) is not mounted: its Caw frame sizes
   * by the window (`100vw`) and squares its phone side by the window's
   * breakpoint, and a canvas frame is not a window. The card is drawn here
   * from the same tokens.
   *
   * - `title`: what the head names the thread by (Head `named` or
   *   `offscreen`); with `offscreen` the name hides while your first
   *   message, which it repeats, is in the room's view.
   * - `centre`: the thread's room holds one block at its middle.
   * - `latest`: the room opens scrolled to its end, as the thread pane does.
   */
  import type { Snippet } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import Caw, { type CawStatus } from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import Composer, {
    type ComposerAsk,
  } from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import type { Waiting as WaitingRow } from "./fixtures";
  import Head from "./Head.svelte";
  import TodayHead from "./TodayHead.svelte";
  import Waiting from "./Waiting.svelte";

  let {
    form,
    name,
    title = "named",
    off = false,
    waiting = [],
    composer = true,
    ask = null,
    busy = false,
    pose = "ready",
    centre = false,
    latest = false,
    today = false,
    whole = false,
    children,
  }: {
    form: "desk" | "phone";
    /** The thread's name; null for a new thread. */
    name: string | null;
    title?: "named" | "offscreen";
    off?: boolean;
    waiting?: WaitingRow[];
    /** The message box stands: false where there is nothing to write to. */
    composer?: boolean;
    ask?: ComposerAsk | null;
    /** His turn is under way: the box offers Stop. */
    busy?: boolean;
    /** His seat's pose on the composer. */
    pose?: CawStatus;
    centre?: boolean;
    latest?: boolean;
    /** The floating thread's head as it ships (TodayHead), in place of the panel's. */
    today?: boolean;
    /** The thread fits the room whole: a frame that compares it shows all of it. */
    whole?: boolean;
    children?: Snippet;
  } = $props();

  const phone = $derived(form === "phone");
  const draft = new ComposerDraft();
  /** Caw's still box on the composer: 56px at a desk, 48px on a phone (ThreadPane `seatSize`). */
  const seat = $derived(phone ? 48 : 56);
  /**
   * What the room keeps clear under its last line: from the top of what
   * stands over its foot (his seat on the box, the box itself, the cards
   * over it) to the room's foot, and a step. Read from where they are
   * drawn, in the layout's px (the canvas may zoom the frame).
   */
  let reach = $state(0);
  let boxRow = $state<HTMLElement | null>(null);
  $effect(() => {
    const row = boxRow;
    const box = row?.querySelector<HTMLElement>("[data-slot=composer]");
    if (!(row && box)) {
      return;
    }
    const read = () => {
      const foot = row.getBoundingClientRect();
      const zoom = foot.height / (row.offsetHeight || foot.height || 1);
      const tops = [
        box,
        ...row.querySelectorAll<HTMLElement>(
          "[data-slot=perch], [data-slot=stack], [data-slot=ask]"
        ),
      ]
        .map((one) => one.getBoundingClientRect())
        .filter((one) => one.height > 0)
        .map((one) => one.top);
      reach = (foot.bottom - Math.min(...tops)) / zoom;
    };
    read();
    const sized = frameObserver(read);
    sized.observe(box);
    for (const one of row.querySelectorAll(
      "[data-slot=perch], [data-slot=ask]"
    )) {
      sized.observe(one);
    }
    return () => sized.disconnect();
  });
  const clear = $derived(
    composer ? `calc(${reach}px + var(--space-4))` : "var(--space-4)"
  );
  /** The thread's room: what scrolls between the head and the message box. */
  let room = $state<HTMLElement | null>(null);
  /** Your first message is in the room's view. */
  let firstSeen = $state(false);
  // Opened at its latest, the room rides its end as what it holds or keeps
  // clear changes size (his seat drawn, the box's height read), as the
  // thread pane rides its tail: pinned once, it stood short of its end.
  $effect(() => {
    const view = room;
    const column = view?.firstElementChild;
    if (!(latest && view && column)) {
      return;
    }
    const pin = () => {
      view.scrollTop = view.scrollHeight;
    };
    pin();
    const sized = frameObserver(pin);
    sized.observe(column);
    sized.observe(view);
    return () => sized.disconnect();
  });
  $effect(() => {
    if (!room) {
      return;
    }
    const first = room.querySelector("[data-panel-said] > li");
    if (!first) {
      firstSeen = false;
      return;
    }
    const watch = new IntersectionObserver(
      ([entry]) => {
        firstSeen = entry?.isIntersecting ?? false;
      },
      { root: room }
    );
    watch.observe(first);
    return () => watch.disconnect();
  });
</script>

{#snippet perch()}
  <div class="w-(--seat)" style:--seat="{seat}px">
    <Caw ledge size={seat} status={pose} />
  </div>
{/snippet}

{#snippet body()}
  {#if today}
    <TodayHead />
  {:else}
    <Head {form} hidden={title === "offscreen" && firstSeen} {name} {off} />
  {/if}
  <Waiting {form} rows={waiting} />
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      bind:this={room}
      class="kit-edge-fade-block relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-recess"
      data-panel-room
      data-panel-whole={whole || undefined}
    >
      <div
        class={[
          "flex min-h-full min-w-0 flex-col gap-space-5 pt-space-4 pb-(--clear)",
          phone ? "px-space-4" : "px-space-3",
          centre && "justify-center",
        ]}
        style:--clear={clear}
      >
        {@render children?.()}
      </div>
    </div>
    {#if composer}
      <!-- The real message box over the room's foot, as the thread pane's
           dock stands (ThreadPane `composer-dock`). The stage has no hub, so
           his ask's card reads as unreachable: its wait line ("Reconnecting")
           and its buttons' disabled dim are the hub's absence, not the state
           drawn, and the frame shows the card as it stands with the hub live. -->
      <div
        bind:this={boxRow}
        class={[
          "pointer-events-none absolute inset-0 [&_[data-slot=lift]]:hidden [&_[data-slot=prompts]]:hidden",
          ask && "[&_[data-slot=wait]]:hidden [&_button:disabled]:opacity-100",
        ]}
        data-panel-composer
      >
        <Composer
          agentName="Caw"
          {ask}
          {busy}
          commands={[]}
          {draft}
          mentionsFrom={null}
          onstop={() => undefined}
          onsubmit={() => undefined}
          {perch}
          placeholder="Message Caw…"
          recallOf="caw-panel-page"
        />
      </div>
    {/if}
  </div>
{/snippet}

<!-- The app's tooltip provider, as its layout stands it over every page. -->
<Tooltip.Provider>
  {#if phone}
    <!-- The screen, its own edge drawn over everything in it, so the
         sheet's square trailing side stands on a drawn edge; the `shell`
         container, so the bar's glass takes its phone form. -->
    <div
      class="@container/shell relative flex h-c-bench-phone-h w-full flex-col overflow-hidden rounded-lg bg-surface-page after:pointer-events-none after:absolute after:inset-0 after:z-50 after:rounded-lg after:border after:border-border-hairline"
      data-panel-form="phone"
    >
      <!-- The phone's bar, its hairline floor, and Caw's glass tucked into
           the screen's trailing edge (DESIGN.md, top bar's trailing edge),
           joined while the panel hangs from it. -->
      <div
        class="relative flex h-c-top-bar-h shrink-0 justify-end border-b border-border-hairline bg-surface-recess"
      >
        <BarGlass joined>
          {#snippet head()}
            <span
              class="grid place-items-center"
              data-bar-item
              data-box
              data-panel-glass><CawFace size={24} status={pose} /></span
            >
          {/snippet}
        </BarGlass>
      </div>
      <div
        class="relative ms-c-bar-phone-edge flex min-h-0 flex-1 flex-col overflow-hidden rounded-bl-lg border-s border-b border-border-control bg-surface-raised"
        data-panel
      >
        {@render body()}
      </div>
    </div>
  {:else}
    <div
      class="relative flex w-full justify-end bg-surface-page px-space-1 py-space-3"
      data-panel-form="desk"
    >
      <div
        class="relative flex h-c-caw-panel-h w-c-panel-w max-w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border-control bg-surface-raised shadow-overlay"
        data-panel
      >
        {@render body()}
      </div>
    </div>
  {/if}
</Tooltip.Provider>
