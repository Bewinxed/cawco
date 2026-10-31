<script lang="ts">
  /**
   * Option 3, the design with my choices: one live stage shows the result,
   * the decisions list with every pick applied and the recommendation
   * standing in where none is made, and each question is a control beside
   * it. A press on a segment picks and the stage follows. Compare splits
   * the stage: what stands now on one side, the answer under the pointer
   * or the focus on the other. All stands the stage at every size at once.
   * On a phone the stage is on top, folding to give the controls the screen.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import { IconChevronDown, IconChevronUp } from "#lib/icons.js";
  import AnswerGroup from "../shared/AnswerGroup.svelte";
  import AnswerHead from "../shared/AnswerHead.svelte";
  import { DecisionState, type Seed } from "../shared/decision.svelte";
  import { keysOn } from "../shared/keys";
  import LiveFrame from "../shared/LiveFrame.svelte";
  import NeedsList from "../shared/NeedsList.svelte";
  import NoteBox from "../shared/NoteBox.svelte";
  import QuestionHead from "../shared/QuestionHead.svelte";
  import {
    type Answer,
    type ListLook,
    type Question,
    SIZE_ORDER,
    SIZES,
    type Size,
  } from "../shared/request";
  import SendBar from "../shared/SendBar.svelte";
  import Situation from "../shared/Situation.svelte";
  import SizeSwitch from "../shared/SizeSwitch.svelte";

  let {
    seed = {},
    height,
    size: startSize,
  }: {
    seed?: Seed;
    /** The window's height; the controls scroll inside it. */
    height: number;
    /** The stage's size it opens at; desk where none is named. */
    size?: Size | "all";
  } = $props();

  const dec = new DecisionState(untrack(() => seed));
  let chosenSize = $state<Size | "all" | null>(
    untrack(() => startSize ?? null)
  );
  let comparing = $state(false);
  let folded = $state(false);
  /** The answer under the pointer or the focus, drawn beside the stage while comparing. */
  let looking = $state<{ q: Question; a: Answer } | null>(null);

  const size = $derived<Size | "all">(chosenSize ?? "desk");
  const look = $derived(dec.look());
  const roots = $derived(dec.questions.filter((q) => !q.after));
  const children = (q: Question) =>
    dec.questions.filter((one) => one.after?.question === q.id);

  function keys(event: KeyboardEvent) {
    const focused = (event.target as HTMLElement | null)
      ?.closest("[data-question]")
      ?.getAttribute("data-question");
    dec.keys(event, dec.questions.find((q) => q.id === focused) ?? null);
  }

  function lookAt(q: Question, a: Answer) {
    looking = { q, a };
  }
</script>

{#snippet stage(one: ListLook, at: Size, label: string)}
  <LiveFrame size={at} {label}>
    <NeedsList look={one} />
  </LiveFrame>
{/snippet}

{#snippet control(q: Question, nested: boolean)}
  {@const picked = dec.picks[q.id]?.[0]}
  {@const shown = q.answers.find((a) => a.id === (picked ?? dec.standing(q)))}
  {@const recommended = q.answers.find((a) => a.recommended)}
  <section
    class={[
      "flex flex-col gap-space-3",
      nested && "ms-space-3 border-border-hairline border-s ps-space-4",
    ]}
    aria-label={q.question}
    data-question={q.id}
  >
    <QuestionHead {dec} question={q} level={3} />
    <AnswerGroup {dec} question={q} layout="list">
      {#each q.answers as answer, i (answer.id)}
        <div
          class="contents"
          role="presentation"
          onpointerenter={() => lookAt(q, answer)}
          onfocusin={() => lookAt(q, answer)}
        >
          <AnswerHead {dec} question={q} {answer} index={i} lines={false} />
        </div>
      {/each}
    </AnswerGroup>
    {#if shown}
      <div class="flex flex-col gap-space-1">
        <p class="type-body text-ink-strong">{shown.line}</p>
        <p class="type-body text-ink-muted">{shown.cost}</p>
        <details class="type-meta text-ink-muted">
          <summary>What changes</summary>
          <p class="pt-space-1 type-body text-ink-strong">{shown.builds}</p>
        </details>
      </div>
    {:else if recommended}
      <p class="type-meta text-ink-muted">
        The stage shows {recommended.name} until you pick.
      </p>
    {/if}
    <NoteBox {dec} question={q} folded />
    {#each children(q) as child (child.id)}
      {@render control(child, true)}
    {/each}
  </section>
{/snippet}

<div
  class="@container flex h-(--proto-h) w-full flex-col overflow-clip bg-surface-page text-ink-strong"
  style:--proto-h="{height}px"
  {@attach keysOn(keys)}
>
  <SendBar {dec}>
    {#snippet centre()}
      <div class="flex items-center gap-space-2 @max-phone:hidden">
        <SizeSwitch
          bind:value={
            () => size,
            (next) => {
              chosenSize = next;
            }
          }
          all
          label="Stage size"
        />
        <Toggle
          size="sm"
          variant="outline"
          bind:pressed={comparing}
          disabled={size === "all"}
        >
          <span>Compare</span>
        </Toggle>
      </div>
    {/snippet}
  </SendBar>

  <div class="flex min-h-0 flex-1 @max-phone:flex-col">
    <div
      class={[
        "flex min-w-0 flex-1 flex-col gap-space-3 overflow-auto px-space-5 pt-space-2 pb-space-5",
        "@max-phone:flex-none @max-phone:px-0 @max-phone:pb-space-2",
        folded ? "@max-phone:h-auto" : "@max-phone:h-(--stage-h)",
      ]}
      style:--stage-h="{Math.round(height * 0.5)}px"
    >
      <div class="hidden items-center gap-space-2 px-space-4 @max-phone:flex">
        <div class="min-w-0 flex-1">
          <SizeSwitch
            bind:value={
              () => size,
              (next) => {
                chosenSize = next;
              }
            }
            all
            label="Stage size"
          />
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={folded ? "Show the stage" : "Fold the stage"}
          onclick={() => {
            folded = !folded;
          }}
        >
          {#if folded}<IconChevronDown />{:else}<IconChevronUp />{/if}
        </Button>
      </div>
      {#if !folded}
        {#if size === "all"}
          {#each SIZE_ORDER as at (at)}
            <div class="flex flex-col gap-space-1">
              <span class="type-label text-ink-muted @max-phone:px-space-4"
                >{SIZES[at].word}</span
              >
              {@render stage(
                look,
                at,
                `The decisions list with your picks, ${SIZES[at].word}`
              )}
            </div>
          {/each}
        {:else if comparing}
          <div class="flex flex-wrap items-start gap-space-5">
            <div class="flex max-w-full flex-col gap-space-1">
              <span class="type-label text-ink-muted">As it stands</span>
              {@render stage(look, size, "As it stands")}
            </div>
            <div class="flex max-w-full flex-col gap-space-1">
              <span class="type-label text-ink-muted">
                {looking ? looking.a.name : "Point at an answer to see it here"}
              </span>
              {@render stage(
                looking ? dec.lookWith(looking.q, looking.a) : look,
                size,
                looking ? looking.a.name : "As it stands"
              )}
            </div>
          </div>
        {:else}
          {@render stage(
            look,
            size,
            `The decisions list with your picks, ${SIZES[size].word}`
          )}
        {/if}
      {/if}
    </div>

    <aside
      class="flex w-details flex-none flex-col gap-space-6 overflow-auto border-border-hairline border-s px-space-5 pt-space-4 pb-space-8 @max-phone:w-full @max-phone:flex-1 @max-phone:border-s-0 @max-phone:border-t @max-phone:px-space-4"
      aria-label="Questions"
    >
      {#if dec.sinceWords}
        <p class="type-meta text-ink-strong">{dec.sinceWords}</p>
      {/if}
      <Situation {dec} />
      {#each roots as q (q.id)}
        {@render control(q, false)}
      {/each}
      <p class="type-body text-ink-muted">{dec.signOff}</p>
    </aside>
  </div>
</div>
