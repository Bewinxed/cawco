<script lang="ts">
  /**
   * What a part with a body of its own shows in that body when it stops on a
   * render error (FaultBoundary), inside the chrome that outlives it: Caw
   * stands whole on the axis, the largest thing, over one headline and one
   * line; under them one action leads, with Show details quiet under it
   * (design/fault-references.md, BitePal).
   *
   * `room`: how much the part gives him. A panel or a sheet, or a whole page,
   * where the fault is the whole of the view and its lead takes the house's
   * coral; or a decision card (`card`), on the card's own shell and width so
   * the page's column keeps its rhythm, its question named so the person
   * knows which call is out, and its lead in an outline: the page's coral
   * stays on Send (DESIGN.md, The Coral Is Where You Act Rule).
   *
   * `again`: the rebuild threw again at once on the same data, so Try again
   * can't help: the way on is Reload page, which reads everything fresh from
   * the hub (a reload is safe: DESIGN.md, Update toast). His pose turns from
   * `needs-you` to `trying` before the words do.
   *
   * He holds his still (`caw`, the bundle's drawing of him: fault/caw.ts),
   * so a part that stands failed for hours plays nothing (emil-design-eng:
   * rare moment, nothing looping).
   */
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { appearOnMount } from "../motion/curves.svelte";
  import type { FaultCaw } from "./caw";
  import FaultActions from "./FaultActions.svelte";

  let {
    what,
    kept,
    question,
    again = false,
    details,
    open = false,
    room = "panel",
    caw,
    onretry,
    onreload,
  }: {
    /** The part, as a sentence names it: "the preview", "your sessions". */
    what: string;
    /** What is safe, where the person would fear for it. */
    kept?: string;
    /** A decision card's question, from its props, which outlive what threw. */
    question?: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    room?: "panel" | "page" | "card";
    caw: FaultCaw;
    onretry: () => void;
    onreload: () => void;
  } = $props();

  /** Side of his still's box. */
  const SIZE = { card: 96, panel: 136, page: 176 } as const;
  const card = $derived(room === "card");
</script>

<div
  data-slot="region-fault"
  data-room={room}
  role="alert"
  class="grid w-full min-w-0 place-items-center not-data-[room=card]:h-full not-data-[room=card]:min-h-0 not-data-[room=card]:flex-1 not-data-[room=card]:overflow-y-auto not-data-[room=card]:overscroll-contain not-data-[room=card]:p-space-5 not-data-[room=card]:max-phone:p-space-3 data-[room=card]:rounded-panel data-[room=card]:bg-surface-raised data-[room=card]:p-(--card-in) data-[room=card]:shadow-tile"
  {@attach appearOnMount()}
>
  <div class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center">
    <div
      data-room={room}
      class="flex-none not-data-[room=card]:mb-space-4 data-[room=card]:mb-space-3"
    >
      {@render caw({ again, size: SIZE[room], head: false })}
    </div>
    <h2 class="m-0 text-center text-balance text-ink-strong type-title">
      {again
        ? regionFaultWords.stillCantShow(what)
        : regionFaultWords.couldntShow(what)}
    </h2>
    {#if question}
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body wrap-anywhere"
      >
        {question}
      </p>
    {/if}
    {#if again || kept}
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body"
      >
        {again ? regionFaultWords.reloadKeeps : kept}
      </p>
    {/if}
    <div
      data-room={room}
      class="w-full min-w-0 not-data-[room=card]:mt-space-5 data-[room=card]:mt-space-4"
    >
      <FaultActions
        {again}
        {details}
        {onreload}
        {onretry}
        {open}
        outline={card}
      />
    </div>
  </div>
</div>
