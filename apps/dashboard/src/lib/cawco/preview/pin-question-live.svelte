<script lang="ts" module>
  import type { PermissionResult } from "@cawco/core/session-messages";

  /** His answer as the hub writes it in the thread: the options he picked, or his own words. */
  export function saidOf(result: PermissionResult): string | null {
    const input = result.behavior === "allow" ? result.updatedInput : null;
    const given =
      typeof input === "object" && input !== null && "answers" in input
        ? input.answers
        : undefined;
    const said =
      typeof given === "object" && given !== null
        ? Object.values(given).flat().join(", ")
        : "";
    return said || null;
  }
</script>

<script lang="ts">
  /**
   * A pin's thread whose agent reply carries a question (shaping tsk-521):
   * the real PinCard in the real PinFloat beside its pill, as the artifact
   * panel stands it, on the routines page. The reply draws its question as
   * the question card draws it everywhere (Prompt): its options, Other and
   * Answer. Answered, the question leaves the thread and his answer stands
   * as his entry under it, as the hub writes it; the same question answered
   * in Needs you does the same (`asking`, `said`).
   */
  import type { Pin, ThreadEntry } from "@cawco/core/comments/model";
  import { CLAUDE } from "@cawco/core/harness/claude";
  import { named } from "@cawco/core/named";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { PIN_QUESTION } from "../home/needs-fixtures";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import PinCard from "./PinCard.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    asking = true,
    said = null,
    onanswer = () => undefined,
  }: {
    /** The question still stands on the pin. */
    asking?: boolean;
    /** His answer, once given, here or in Needs you. */
    said?: string | null;
    onanswer?: (result: PermissionResult) => void;
  } = $props();

  const AT = "2026-11-26T09:00:00.000Z";
  const at = (minutes: number) =>
    new Date(Date.parse(AT) + minutes * 60_000).toISOString();
  const ASK = PIN_QUESTION.request.requestId;
  const FIRST: ThreadEntry[] = [
    {
      id: "e1",
      by: "person",
      text: "What happens when this fails? It just says Failed and keeps going.",
      at: at(0),
      sentAt: at(0),
    },
    {
      id: "e2",
      by: "agent",
      text: "Today a failed run is only a line in the run list, and the next run goes ahead on schedule. Whether a second failure in a row should stop it is your call.",
      at: at(4),
      ask: ASK,
    },
  ];
  const thread = $derived<ThreadEntry[]>(
    said
      ? [
          ...FIRST,
          { id: "e3", by: "person", text: said, at: at(9), sentAt: at(9) },
        ]
      : FIRST
  );
  const questions = $derived(asking ? { [ASK]: PIN_QUESTION.request } : {});

  function answer(_ask: string, result: PermissionResult): string | null {
    onanswer(result);
    return null;
  }

  const pin = $derived({
    anchor: { element: "routine-failures" },
    at: AT,
    by: "person",
    elements: [],
    id: "p-3",
    kind: "comment",
    number: 3,
    sentAt: thread.findLast((one) => one.by === "person")?.sentAt,
    seenAt: "9999",
    thread,
  } satisfies Pin);

  const draft = new ComposerDraft();
  /** What the thread's other controls do here: nothing; the thread's question is this fixture's. */
  const unheard = {
    onclose: () => undefined,
    ondelete: () => Promise.resolve(),
    onfind: () => undefined,
    onplace: () => undefined,
    onreply: () => undefined,
    onresolve: () => undefined,
    onretry: () => undefined,
  };
  const MARK = { x: 24, y: 72, w: 20, h: 20 };
  /** The page the pin stands on, as it lays out: the room the card is placed in. */
  let room = $state({ w: 0, h: 0 });
  const measure = frameSize(
    (node: HTMLElement) => ({ w: node.clientWidth, h: node.clientHeight }),
    (next) => {
      room = next;
    }
  );
</script>

<div
  class="@container relative h-c-caw-panel-h w-full bg-surface-raised"
  data-slot="pin-room"
  {@attach measure}
>
  <span
    class="absolute top-(--mark-y) start-(--mark-x)"
    style:--mark-y="{MARK.y}px"
    style:--mark-x="{MARK.x}px"
  >
    <PinMark state={markState(pin)} number={pin.number} tail="bottom-start" />
  </span>
  {#if room.w > 0}
    <PinFloat
      label="Comment {pin.number}"
      mark={MARK}
      open
      pin={pin.number}
      {room}
      sheet={room.w < 480}
      slot="pin-card"
    >
      <PinCard
        agentName={named(CLAUDE.words.name)}
        {draft}
        link="/artifact/routines-shape#pin-3"
        name="Failure rule"
        onanswer={answer}
        {...unheard}
        parent="Routine form"
        {pin}
        problem={null}
        {questions}
        session="s-ask-routine-failures"
      />
    </PinFloat>
  {/if}
</div>
