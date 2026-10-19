<script lang="ts">
  /**
   * One variation's section: its name and what it does differently, its
   * Pick, then its frames state by state on the desk's side card and the
   * phone's sheet: the whole plan with four delegates out; a step opened to
   * its description; the step that waits on two others; a delegate opened
   * to its report; and live.
   */
  import DeskPlan from "./DeskPlan.svelte";
  import { plan } from "./fixtures";
  import LiveFrame from "./LiveFrame.svelte";
  import PhonePlan from "./PhonePlan.svelte";
  import Pick from "./Pick.svelte";
  import PlanBody, { type Variation } from "./PlanBody.svelte";

  let {
    variation,
    name,
    line,
    differs,
    live,
    recommended = false,
    names,
    loaded,
  }: {
    variation: Variation;
    name: string;
    /** Its case in one sentence, on its Pick. */
    line: string;
    /** What it does differently from the others, a line each. */
    differs: string[];
    /** What its live frame adds, in its caption. */
    live: string;
    recommended?: boolean;
    names: Record<string, string>;
    loaded: number;
  } = $props();

  /** A phone opens a step in place in One ledger, on a page of its own otherwise. */
  const paged = $derived(variation !== "a");
  const READER = "a11y-check-44e";
</script>

{#snippet desk(caption: string, open: string[] = [], focus?: string)}
  <figure data-kind="desk" data-phone="hide">
    <DeskPlan fit={!focus} {focus} {plan}>
      <PlanBody {loaded} {open} {plan} {variation} />
    </DeskPlan>
    <figcaption>Desk · {caption}</figcaption>
  </figure>
{/snippet}

{#snippet phone(
  caption: string,
  open: string[] = [],
  pushed?: string,
  focus?: string
)}
  <figure data-kind="phone">
    <PhonePlan {focus} {plan}>
      <PlanBody {loaded} {open} phone {plan} {pushed} {variation} />
    </PhonePlan>
    <figcaption>Phone · {caption}</figcaption>
  </figure>
{/snippet}

<section
  aria-labelledby="{variation}-head"
  class="variation"
  data-variation={variation}
  id="variation-{variation}"
>
  <header class="head">
    <h2 id="{variation}-head">
      {name}{#if recommended}<span class="recommended">Recommended</span>{/if}
    </h2>
    <ul class="differs">
      {#each differs as one (one)}
        <li>{one}</li>
      {/each}
    </ul>
  </header>
  <Pick {line} {name} {names} option={variation} {recommended} />

  <div class="frames">
    {@render desk(
      "The whole plan with four delegates out: one working, one waiting on you, one queued, one failed"
    )}
    {@render phone("The whole plan in the sheet, every row a finger's height")}
    {@render desk(
      "The date picker opened to its description and its own steps",
      ["a2"],
      "a2"
    )}
    {#if paged}
      {@render phone(
        "The date picker opened on a page of its own, pushed in from the side",
        [],
        "a2"
      )}
    {:else}
      {@render phone(
        "The date picker opened in place to its description and its own steps",
        ["a2"],
        undefined,
        "a2"
      )}
    {/if}
    {@render desk(
      "The end-to-end booking waits on the date picker and the deposit, opened to say so",
      ["a6"],
      "a3"
    )}
    {#if paged}
      {@render phone(
        "The end-to-end booking on its page, saying what it starts after",
        [],
        "a6"
      )}
    {:else}
      {@render phone(
        "The end-to-end booking waits on two steps, opened in place",
        ["a6"],
        undefined,
        "a6"
      )}
    {/if}
    {@render desk(
      "The screen reader check failed, opened to its steps and its report",
      [READER],
      variation === "c" ? undefined : "a5"
    )}
    {#if paged}
      {@render phone(
        "The failed screen reader check on its page: its steps and its report",
        [],
        READER
      )}
    {:else}
      {@render phone(
        "The failed screen reader check opened in place to its report",
        [READER],
        undefined,
        "a5"
      )}
    {/if}
    <LiveFrame {loaded} {variation} what={live} />
  </div>
</section>

<style>
  .variation {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    scroll-margin-block-start: var(--space-5);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--border-hairline);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-inline-size: 72ch;

    & h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      font: var(--type-title);
      text-wrap: balance;
    }
  }
  .recommended {
    display: inline-flex;
    align-items: center;
    block-size: 20px;
    padding-inline: 6px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-label);
    font-weight: var(--weight-body);
  }
  .differs {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding-inline-start: var(--space-5);
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;

    & li::marker {
      color: var(--ink-muted);
    }
  }
  .frames {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    gap: var(--space-8) var(--space-7);
  }
  .frames > :global(figure) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    max-inline-size: 780px;
    margin: 0;
  }
  .frames > :global(figure[data-kind="phone"]) {
    inline-size: min(390px, 100%);
  }
  .frames :global(figcaption) {
    max-inline-size: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  @media (width < 700px) {
    .head,
    .frames :global(figcaption) {
      padding-inline: var(--space-4);
    }
    .variation > :global(.pick) {
      padding-inline: var(--space-4);
    }
    .frames {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-7);
    }
    .frames > :global(figure) {
      inline-size: 100%;
      max-inline-size: 100%;
    }
    .frames > :global(figure[data-phone="hide"]) {
      display: none;
    }
  }
</style>
