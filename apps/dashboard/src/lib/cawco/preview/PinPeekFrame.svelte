<script lang="ts">
  /**
   * A pin's peek and its whole thread over a page's well (PinPeekFrame.stories.ts):
   * the pill as the page draws it, at `mark`, and beside it the thread's own
   * card (PinFloat holding PinCard), as its peek (`peek`: what it stands on,
   * his words and the latest reply) or whole, as the pane draws them. The
   * pins are the design graph spec's, as the hub keeps them.
   */
  import type { Pin } from "@cawco/core/comments/model";
  import { pinName } from "@cawco/core/pin-name";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import PinCard from "./PinCard.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    pin,
    peek,
    mark,
    width,
    height,
  }: {
    pin: Pin;
    /** Its peek (true), or the whole thread a press opens. */
    peek: boolean;
    /** The pill's box in the well, px. */
    mark: { h: number; w: number; x: number; y: number };
    /** The well's size, px. */
    width: number;
    height: number;
  } = $props();

  const draft = new ComposerDraft();
  const nothing = () => undefined;
</script>

<div
  class="relative h-(--frame-h) w-(--frame-w) overflow-hidden bg-surface-page"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  <span
    class="absolute start-(--mark-x) top-(--mark-y)"
    style:--mark-x="{mark.x}px"
    style:--mark-y="{mark.y}px"
  >
    <PinMark number={pin.number} state={markState(pin)} />
  </span>
  <div
    data-slot="pin-room"
    class="@container absolute inset-0 pointer-events-none"
  >
    <PinFloat
      label={`Comment ${pin.number}`}
      {mark}
      onpress={peek ? nothing : undefined}
      pin={pin.number}
      room={{ w: width, h: height }}
      slot={peek ? "pin-peek" : "pin-card"}
    >
      <PinCard
        agentName="Continue CawCo open tasks"
        {draft}
        link={`https://p-3487.bewinxed.com/__cawco/page/ece517b8-b3ef-472e-8cf4-9ec9f4cfd4af/#pin-${pin.number}`}
        marked
        name={pin.movedAt ? "Element gone" : pinName(pin)}
        onclose={nothing}
        ondelete={() => Promise.resolve()}
        onfind={nothing}
        onplace={nothing}
        onreply={nothing}
        onresolve={nothing}
        onretry={nothing}
        parent={null}
        {peek}
        {pin}
        problem={null}
      />
    </PinFloat>
  </div>
</div>
