<script lang="ts">
  /**
   * New project (design §5, PRD §5.6): Caw at 80px asks "What are we working
   * on?"; one field and `Start`, four starter chips that fly their words into
   * it, and six template cards with Caw peeking over the one the words fit.
   *
   * One live Caw at a time: the first fit sends the 80px Caw away and he
   * peeks over the card; a different fit moves the peek to it; no fit sends
   * the peek away and the 80px Caw comes back. A tap on a card picks it
   * whatever fits; until one is tapped the fitting card is the pick.
   *
   * Start makes the project with Caw (its folder on the hub its place until
   * setup picks the checkout), with the picked template's stages, and opens
   * its Setup thread with the words as its first message: they fly into
   * that row, and Caw from where he stands into the thread's seat.
   */
  import { tick } from "svelte";
  import { cawco, createProject } from "#lib/cawco/client.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import CawField from "#lib/cawco/project/CawField.svelte";
  import {
    fitOf,
    nameFrom,
    STARTERS,
    TEMPLATE_CARDS,
    type TemplateCard,
    type TemplateName,
  } from "#lib/cawco/project/new-project.js";
  import TemplateCards from "#lib/cawco/project/TemplateCards.svelte";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import { goto } from "$app/navigation";

  /** Caw's side here, on the page and over a card. */
  const CAW_SIZE = 80;
  /** How long typing rests before the fit runs. */
  const FIT_AFTER_MS = 300;

  let words = $state("");
  let fit = $state<TemplateName | null>(null);
  /** The card the person tapped; until then the fitting card is the pick. */
  let tapped = $state<TemplateName | null>(null);
  const selected = $derived(tapped ?? fit);

  // The fit runs once typing has rested.
  $effect(() => {
    const now = words;
    const timer = setTimeout(() => {
      fit = fitOf(now);
    }, FIT_AFTER_MS);
    return () => clearTimeout(timer);
  });

  /**
   * Which Caw is live: the page's (`page`), or the peek over a card
   * (`peek`); `leaving` while the one on screen goes, so the other comes
   * only once he has.
   */
  let caw = $state<"page" | "peek">("page");
  let leaving = $state(false);
  $effect(() => {
    if ((caw === "page") === (fit !== null)) {
      leaving = true;
    }
  });
  function gone() {
    leaving = false;
    caw = fit ? "peek" : "page";
  }

  /** Each chip's words fly into the field under a key of their own. */
  let flights = $state(0);
  function starter(text: string) {
    flights += 1;
    words = text;
    // A press runs the fit at once: there is no typing to wait for.
    fit = fitOf(text);
  }

  const noMachine = $derived(cawco.onlineMachines.length === 0);
  const metaOf = (card: TemplateCard): string =>
    card.template === "code" && noMachine
      ? "Needs a machine online"
      : card.meta;

  /** The project Start made: Caw departs under its key as the page goes. */
  let made = $state<string | null>(null);

  async function start(text: string, id: string) {
    const created = await createProject({
      name: nameFrom(text) || text.trim().slice(0, 60),
      prompt: text,
      promptId: id,
      ...(selected ? { template: selected } : {}),
    });
    made = created.id;
    // His box carries the project's key before the navigation departs it.
    await tick();
    await goto(
      created.setupThread
        ? threadHref(created.setupThread.id)
        : `/project/${encodeURIComponent(created.id)}`
    );
  }
</script>

<svelte:head>
  <title>New project &middot; CawCo</title>
</svelte:head>

<main class="new-project">
  <div class="ask">
    <div
      class="caw-80"
      data-share={made && caw === "page" ? `caw:${made}` : undefined}
    >
      {#if caw === "page"}
        <Caw ongone={gone} present={!leaving} size={CAW_SIZE} status="ready" />
      {/if}
    </div>
    <h1 class="title">What are we working on?</h1>
    <div class="field">
      <CawField
        action={{
          label: "Start",
          pendingLabel: "Starting…",
          empty: "Say what the project is, then Start.",
        }}
        autofocus
        flies
        label="What are we working on?"
        lands={flights ? `starter:${flights}` : undefined}
        onsend={start}
        placeholder="A repo, a launch, a brand…"
        bind:text={words}
      />
    </div>
    <div class="chips">
      {#each STARTERS as text (text)}
        <button
          class="chip"
          data-share="starter:{flights + 1}"
          onclick={() => starter(text)}
          type="button"
        >
          {text}
        </button>
      {/each}
    </div>
  </div>

  <div class="cards">
    <TemplateCards
      cards={TEMPLATE_CARDS}
      {fit}
      {metaOf}
      onpeekgone={gone}
      peek={caw === "peek"}
      peekPresent={!leaving}
      peekShare={made ? `caw:${made}` : undefined}
      peekSize={CAW_SIZE}
      bind:selected={
        () => selected,
        (next) => {
    tapped = next;
  }
      }
    />
  </div>
</main>

<style>
  .new-project {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
    inline-size: 100%;
    max-inline-size: 72rem;
    margin-inline: auto;
    padding: calc(var(--space-8) * 2) var(--space-6) var(--space-8);
  }
  .ask {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    inline-size: 100%;
  }
  .caw-80 {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  .title {
    font: var(--type-title);
    color: var(--ink-strong);
    text-align: center;
  }
  .field {
    inline-size: 100%;
    max-inline-size: 520px;
  }
  /* Prompt's option chips (.qopts): 30px, 8px radius, label type. */
  .chips {
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    max-inline-size: 40rem;
  }
  .chip {
    min-block-size: 30px;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font-family: var(--font-body);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    cursor: pointer;
    transition: var(--transition-control);
  }
  @media (hover: hover) {
    .chip:hover {
      background: var(--surface-hover);
    }
  }
  .chip:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 2px;
  }
  .cards {
    inline-size: 100%;
  }
  @media (max-width: 639px) {
    .new-project {
      gap: var(--space-6);
      padding: var(--space-7) var(--space-4) var(--space-6);
    }
  }
</style>
