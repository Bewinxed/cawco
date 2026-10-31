<script lang="ts">
  /**
   * What a part with a body of its own shows in that body when it stops on a
   * render error (RegionBoundary), inside the chrome that outlives it: Caw
   * stands whole on the axis, the largest thing, over one headline and one
   * line; under them one action leads, in the house's coral, since the fault
   * is the whole of this view, and Show details stands quiet under it
   * (design/fault-references.md, BitePal).
   *
   * `again`: the rebuild threw again at once on the same data, so Try again
   * can't help: the way on is Reload page, which reads everything fresh from
   * the hub (a reload is safe: DESIGN.md, Update toast). His pose turns from
   * `needs-you` to `trying` before the words do.
   *
   * He holds his still, so a part that stands failed for hours plays
   * nothing (emil-design-eng: rare moment, nothing looping). If his file
   * does not load his box stays empty and the fault still reads.
   */
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import Caw from "../home/Caw.svelte";
  import { appearOnMount } from "../motion/curves.svelte";
  import FaultActions from "./FaultActions.svelte";

  let {
    what,
    kept,
    again = false,
    details,
    open = false,
    room = "panel",
    onretry,
    onreload,
  }: {
    /** The part, as a sentence names it: "the preview", "your sessions". */
    what: string;
    /** What is safe, where the person would fear for it. */
    kept?: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    /** How much the part gives him: a panel or a sheet, or a whole page. */
    room?: "panel" | "page";
    onretry: () => void;
    onreload: () => void;
  } = $props();

  /** Side of his still's box. */
  const SIZE = { panel: 136, page: 176 } as const;
</script>

<div
  data-slot="region-fault"
  role="alert"
  class="grid h-full min-h-0 w-full min-w-0 flex-1 place-items-center overflow-y-auto overscroll-contain p-space-5 max-phone:p-space-3"
  {@attach appearOnMount()}
>
  <div class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center">
    <div class="mb-space-4 flex-none">
      <Caw status={again ? "trying" : "needs-you"} still size={SIZE[room]} />
    </div>
    <h2 class="m-0 text-center text-balance text-ink-strong type-title">
      {again
        ? regionFaultWords.stillCantShow(what)
        : regionFaultWords.couldntShow(what)}
    </h2>
    {#if again || kept}
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body"
      >
        {again ? regionFaultWords.reloadKeeps : kept}
      </p>
    {/if}
    <div class="mt-space-5 w-full min-w-0">
      <FaultActions {again} {details} {onreload} {onretry} {open} />
    </div>
  </div>
</div>
