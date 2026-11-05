<script lang="ts">
  /**
   * One of a review's two moves, Pass on or Send back, wherever it stands:
   * as the head's one prominent act (coral, the task's only coral, since it
   * waits on you), or as a peer at one end of its pair (DESIGN.md, The Peer
   * Rule: 44 tall with a 44 hit, the same quiet fill as its peer, apart by
   * word and place). It stays pending until the hub answers, keeps its
   * place and width, and waits while the other move is pending or the hub
   * isn't answering.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Pending, TaskView } from "./model";

  let {
    move,
    review,
    look,
    pending = null,
    stale = false,
    expanded,
    onpress,
  }: {
    move: "passOn" | "sendBack";
    review: NonNullable<TaskView["review"]>;
    /** The head's prominent act, a peer in a pair, or the prominent act sized as a peer (a pair in the head). */
    look: "prominent" | "peer" | "prominent-peer";
    pending?: Pending | null;
    stale?: boolean;
    /** It opened a question that stands now (Send back's). */
    expanded?: boolean;
    onpress: () => void;
  } = $props();

  const label = $derived(
    move === "passOn"
      ? words.passOn(review.passOn)
      : words.sendBack(review.sendBack)
  );
  const pendingLabel = $derived(
    move === "passOn" ? words.passingOn : words.sendingBack
  );
</script>

<Button
  hit={look === "prominent" ? undefined : "always"}
  size={look === "prominent" ? "default" : "lg"}
  variant={look === "peer" ? "secondary" : "default"}
  {label}
  {pendingLabel}
  pending={pending === move}
  aria-expanded={expanded}
  disabled={stale || (pending !== null && pending !== move)}
  onclick={onpress}
/>
