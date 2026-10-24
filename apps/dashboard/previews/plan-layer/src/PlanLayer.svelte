<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * PlanPane (lib/cawco/plan/PlanPane.svelte) as main draws it, fed from
   * fixtures instead of the hub: the kit's floating surface rising out of
   * the tray row its ring stands on, across the composer's width, over the
   * transcript's foot, capped at the room up to the dock's top less 16px
   * (PlanPane.svelte:99-111). Its head, its one scrolling column, its Steps
   * and Spec parts are main's; the steps part is the variant's.
   *
   * `openAt` names the row the column opens at (scrolled so that row stands
   * at the column's top, the row before it peeking a step over it); unset,
   * it opens at its top.
   */
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { popOut } from "#lib/cawco/motion/pop.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconClose } from "#lib/icons.js";

  let {
    steps,
    spec,
    openAt,
    onclose,
  }: {
    steps: Snippet;
    spec: (string | string[])[];
    openAt?: string;
    onclose: () => void;
  } = $props();

  const titleId = $props.id();
  let section = $state<HTMLElement>();

  /** PlanPane's `room`, as it is. */
  const room: Attachment<HTMLElement> = (node) => {
    const row = node.offsetParent;
    const dock = node.closest('[data-slot="dock"]');
    if (row && dock) {
      const over =
        row.getBoundingClientRect().top - dock.getBoundingClientRect().top;
      node.style.setProperty("--plan-room", `${Math.max(0, over - 16)}px`);
    }
  };

  /**
   * Where it opens: `openAt`'s row at the column's top, a step of the row
   * before it showing under the edge fade, read through the scale the
   * surface's entrance holds it at as this runs.
   */
  const opens: Attachment<HTMLElement> = (body) => {
    const at = openAt;
    if (!at) {
      body.dataset.opened = "top";
      return;
    }
    // Once the faces are in (a row's height is its words' wrap) and a frame
    // on, when the room's cap stands on the surface.
    document.fonts.ready.then(() =>
      requestAnimationFrame(() => openOn(body, at))
    );
  };

  function openOn(body: HTMLElement, at: string): void {
    const row = body.querySelector<HTMLElement>(
      `[data-plan-row="${CSS.escape(at)}"]`
    );
    if (!row) {
      return;
    }
    const host = section;
    if (!host) {
      return;
    }
    const peek = Number.parseFloat(
      getComputedStyle(body).getPropertyValue("--open-peek")
    );
    // The surface's entrance scales it while this reads (its `scale`, now):
    // a distance drawn inside it is that much of its distance in layout.
    const scale = Number.parseFloat(getComputedStyle(host).scale) || 1;
    const drawn =
      row.getBoundingClientRect().top - body.getBoundingClientRect().top;
    const top = drawn / scale - body.clientTop + body.scrollTop;
    body.scrollTop = Math.max(0, top - peek);
    body.dataset.opened = at;
  }

  function shut(): void {
    const ring = section?.parentElement?.querySelector<HTMLElement>(
      '[data-slot="plan-ring"]'
    );
    onclose();
    ring?.focus();
  }
  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      shut();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  data-slot="plan"
  aria-labelledby={titleId}
  class={floatingSurface({
    class:
      "absolute start-0 end-0 bottom-(--plan-foot) z-1 flex flex-col max-h-(--plan-room) p-0 overflow-clip origin-bottom-right rtl:origin-bottom-left pointer-events-auto",
  })}
  data-side="top"
  data-state="open"
  {onkeydown}
  style:--plan-foot="calc(100% + var(--space-2))"
  bind:this={section}
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <header
    data-slot="plan-head"
    class="flex items-center gap-space-2 py-space-2 pe-space-2 ps-space-4 border-b border-b-border-hairline"
  >
    <h2
      class="flex-auto min-w-0 m-0 flex items-baseline gap-space-2 text-size-label font-medium text-ink-strong"
      id={titleId}
    >
      <span class="flex-none">{planWords.plan}</span>
    </h2>
    <Button
      aria-label="Close"
      class="touch-hit"
      onclick={shut}
      size="icon-sm"
      variant="ghost"><IconClose /></Button
    >
  </header>
  <div
    data-slot="body"
    class="kit-edge-fade-block flex-auto min-h-0 overflow-y-auto overscroll-contain touch-pan-y pbs-space-3 pbe-space-4 px-space-4 flex flex-col gap-space-2 [--open-peek:var(--space-5)]"
    style:--more-px="0"
    {@attach opens}
  >
    <h3
      class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
    >
      {planWords.steps}
    </h3>
    {@render steps()}
    <h3
      class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
    >
      {planWords.spec}
    </h3>
    <!-- MessageBody's column, the spec's paragraphs in it. -->
    <div
      data-slot="spec"
      class="max-w-c-measure text-size-body leading-body font-normal text-ink-strong flex flex-col gap-space-3"
    >
      {#each spec as part, i (i)}
        {#if typeof part === "string"}
          <p class="m-0">{part}</p>
        {:else}
          <ul class="m-0 ps-space-5 flex flex-col gap-space-1 list-disc">
            {#each part as item (item)}
              <li>{item}</li>
            {/each}
          </ul>
        {/if}
      {/each}
    </div>
  </div>
</section>
