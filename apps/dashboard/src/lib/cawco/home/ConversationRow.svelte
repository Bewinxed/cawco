<script lang="ts">
  /**
   * A conversation with things waiting on you in it, as a row of Caw's
   * panel (home `ConversationItem`): its session's mark, its name and how
   * long its newest ask has waited, that ask in the words it is asked, and,
   * when more than one waits, how many. A press opens the conversation with
   * that ask up on its composer, which holds every ask and pick of the
   * conversation and its delegates (home/chat-asks); with no answers
   * provided (a bench), it opens the conversation.
   *
   * The project is named only when the lane spans several, the machine
   * only when every ask in it waits on one offline, dimmed as a stale row is.
   */
  import { questionsOf } from "@cawco/core/question";
  import { needsRowWords } from "@cawco/core/words/needs-rows";
  import { rowHref } from "../links";
  import SessionMark from "../SessionMark.svelte";
  import { cawOf } from "../session-status";
  import { span } from "../span";
  import { type ConversationItem, clock } from "./home-state.svelte";
  import NeedsMeta from "./NeedsMeta.svelte";
  import NeedsRow from "./NeedsRow.svelte";
  import { answersHere } from "./needs-answer.svelte";

  let {
    item,
    stale,
    onchoose,
  }: {
    item: ConversationItem;
    /** The hub is not live: the row stands dimmed. */
    stale: boolean;
    /** The row was chosen: it opens, and the panel closes. */
    onchoose: () => void;
  } = $props();

  const answersOf = answersHere();
  const answers = $derived(answersOf());

  /** Its newest ask, in the words it is asked: a question's question, a permission's summary, a page's ask. */
  const want = $derived.by(() => {
    const [newest] = item.items;
    if (!newest) {
      return "";
    }
    if (newest.kind === "artifact") {
      return newest.title;
    }
    return newest.isQuestion
      ? (questionsOf(newest.request.toolName, newest.request.input)?.[0]
          ?.question ?? newest.ask)
      : newest.ask;
  });

  /** How many wait, when more than one does; its project when the lane spans several; its machine when offline. */
  const meta = $derived(
    [
      item.waiting > 1 ? needsRowWords.waiting(item.waiting) : null,
      answers?.manyProjects && item.project ? item.project.name : null,
      item.stale ? "machine offline" : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );
</script>

<NeedsRow
  held={stale || item.stale}
  href={answers ? undefined : rowHref(item.instanceId)}
  kind="conversation"
  {onchoose}
  onpress={answers ? () => answers.press(item) : undefined}
  share="pane:{item.instanceId}"
  title={item.title}
  {want}
  wait={span(clock.now - item.raisedAt)}
>
  {#snippet lead()}
    <SessionMark
      caw={cawOf(item.instanceId)}
      id={item.instanceId}
      place={item.cwd || item.machineId}
      status="idle"
    />
  {/snippet}
  {#snippet below()}
    {#if meta}
      <NeedsMeta text={meta} />
    {/if}
  {/snippet}
</NeedsRow>
