<script lang="ts">
  /**
   * New project (design §5, PRD §5.6): Caw at 80px asks "What are we working
   * on?"; the session Composer, four starter chips that put their words in
   * it, and six template cards with Caw peeking over the one the words fit.
   *
   * One live Caw at a time: the first fit sends the 80px Caw away and he
   * peeks over the card; a different fit moves the peek to it; no fit sends
   * the peek away and the 80px Caw comes back. A tap on a card picks it
   * whatever fits; until one is tapped the fitting card is the pick.
   *
   * The send makes the project with Caw (its folder on the hub its place until
   * setup picks the checkout), with the picked template's stages, and opens
   * its Setup thread with the words as its first message: they fly into
   * that row, and Caw from where he stands into the thread's seat.
   */
  import { tick } from "svelte";
  import { barGlass } from "#lib/cawco/bar-glass.svelte.js";
  import { cawco, createProject } from "#lib/cawco/client.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import {
    failureWords,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
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
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { goto } from "$app/navigation";

  /** Caw's side here, on the page and over a card. */
  const CAW_SIZE = 80;
  /** How long typing rests before the fit runs. */
  const FIT_AFTER_MS = 300;

  /** The words, in the session Composer: its field takes the caret on arrival. */
  const draft = new ComposerDraft();
  draft.focusWanted = true;
  const words = $derived(draft.text);
  let fit = $state<TemplateName | null>(null);
  /**
   * The card the person tapped: it is the pick until the prompt fits
   * another card. Untapped, the fitting card is the pick, so the frame
   * stands on the fit or the tap and nowhere else.
   */
  let tapped = $state<TemplateName | null>(null);
  const selected = $derived(tapped ?? fit);
  /** A card picked on the cards: the tap. */
  function tap(next: TemplateName | null) {
    tapped = next;
  }

  /** The prompt's fit, now: a new fit releases the tap and the frame follows it. */
  function refit(text: string) {
    const next = fitOf(text);
    if (next !== null && next !== fit) {
      tapped = null;
    }
    fit = next;
  }

  // The fit runs once typing has rested.
  $effect(() => {
    const now = words;
    const timer = setTimeout(() => refit(now), FIT_AFTER_MS);
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

  /** A chip's words into the composer, the caret after them. */
  function starter(text: string) {
    draft.text = text;
    draft.focusWanted = true;
    // A chip is a new prompt, never a pick: the frame goes to its fit.
    tapped = null;
    // A press runs the fit at once: there is no typing to wait for.
    refit(text);
  }

  const noMachine = $derived(cawco.onlineMachines.length === 0);
  const metaOf = (card: TemplateCard): string =>
    card.template === "code" && noMachine
      ? "Needs a machine online"
      : card.meta;

  /** The project the send made: Caw departs under its key as the page goes. */
  let made = $state<string | null>(null);

  /** The send is out; it stays so through the navigation it ends in. */
  let starting = $state(false);
  let refused = $state("");
  /** The send never reached the hub: its line offers Send again. */
  let again = $state(false);
  /** What the Composer stands over its foot: its box holds that much room. */
  let footHeight = $state(0);

  /**
   * The words go as a thread tab's send does (ThreadPane): a refusal puts
   * them back in the composer with the reason over them.
   */
  async function start(text: string, id: string) {
    starting = true;
    refused = "";
    again = false;
    let created: Awaited<ReturnType<typeof createProject>>;
    try {
      created = await createProject({
        name: nameFrom(text) || text.trim().slice(0, 60),
        prompt: text,
        promptId: id,
        ...(selected ? { template: selected } : {}),
      });
    } catch (error) {
      draft.restore(text);
      again = unreachable(error);
      refused = again ? THREAD_SEND_UNREACHED : failureWords(error);
      starting = false;
      return;
    }
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

<!-- literal: 72rem, 570px, 40rem, 80px -->
<main
  class="mx-auto flex w-full max-w-(--measure) flex-col items-center gap-space-8 px-space-6 pt-(--pad-top) pb-space-8 max-phone:gap-space-6 max-phone:px-space-4 max-phone:pt-space-7 max-phone:pb-space-6"
  style:--measure="72rem"
  style:--pad-top="calc(var(--space-8) * 2)"
>
  <!-- His slot goes with him when he peeks over a card, and comes back
       with him: the hero's height tweens (morph) rather than leaving a band. -->
  <div
    data-slot="ask"
    class="flex w-full flex-col items-center gap-space-4"
    {@attach morph()}
  >
    {#if caw === "page"}
      <div
        data-slot="caw-80"
        class="grid min-h-(--caw-min) place-items-center"
        data-share={made ? `caw:${made}` : undefined}
        style:--caw-min="80px"
      >
        <Caw ongone={gone} present={!leaving} size={CAW_SIZE} status="ready" />
      </div>
    {/if}
    <h1 data-slot="title" class="type-title text-center text-ink-strong">
      What are we working on?
    </h1>
    <div
      data-slot="new-page-field"
      class="relative h-(--field-h) w-full max-w-(--field-max)"
      style:--field-h="calc({footHeight}px + var(--space-4))"
      style:--field-max="570px"
    >
      <Composer
        agentName="Caw"
        attach={false}
        {draft}
        onfoot={(foot) => {
          footHeight = foot.stack;
        }}
        onstop={() => undefined}
        onsubmit={(text, _extras, id) => {
          // biome-ignore lint/complexity/noVoid: the start's own state is the composer's sending and its refusal
          void start(text, id);
        }}
        placeholder="A repo, a launch, a brand…"
        sendAgain={again}
        sendError={refused}
        sending={starting}
      />
    </div>
    <div
      data-slot="chips"
      class="kit-chips max-w-(--chips-max) justify-center"
      style:--chips-max="40rem"
    >
      {#each STARTERS as text (text)}
        <button
          class="kit-chip touch-hit"
          onclick={() => starter(text)}
          type="button"
        >
          {text}
        </button>
      {/each}
    </div>
  </div>

  <div data-slot="cards" class="w-full">
    <TemplateCards
      action={noMachine
        ? {
            template: "code",
            label: "Check machines",
            onclick: () => {
              barGlass.open = "machines";
            },
          }
        : undefined}
      cards={TEMPLATE_CARDS}
      {fit}
      {metaOf}
      onpeekgone={gone}
      peek={caw === "peek"}
      peekPresent={!leaving}
      peekShare={made ? `caw:${made}` : undefined}
      peekSize={CAW_SIZE}
      bind:selected={() => selected, tap}
    />
  </div>
</main>
