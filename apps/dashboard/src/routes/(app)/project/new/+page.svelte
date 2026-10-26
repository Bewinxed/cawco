<script lang="ts">
  import { detach } from "@cawco/core/detach";
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
   * setup picks the checkout), with the picked template's stages, and lands
   * on the project's page with his panel open on its Setup thread, the words
   * its first message: they fly into that row, and Caw from where he stands
   * into the thread's seat.
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
  import { idForWords, type SentWords } from "#lib/cawco/id.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { openOnArrival } from "#lib/cawco/project/caw-lead.svelte.js";
  import {
    fitOf,
    nameFrom,
    STARTERS,
    TEMPLATE_CARDS,
    type TemplateCard,
    type TemplateName,
  } from "#lib/cawco/project/new-project.js";
  import TemplateCards from "#lib/cawco/project/TemplateCards.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
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
  /** The prompt a start that did not go through carried, and its id: the same prompt again is the same project. */
  let unsent: SentWords | null = null;
  async function start(text: string, fresh: string) {
    starting = true;
    refused = "";
    again = false;
    unsent = idForWords(unsent, text, fresh);
    let created: Awaited<ReturnType<typeof createProject>>;
    try {
      created = await createProject({
        name: nameFrom(text) || text.trim().slice(0, 60),
        prompt: text,
        promptId: unsent.id,
        ...(selected ? { template: selected } : {}),
      });
      unsent = null;
    } catch (error) {
      draft.restore(text);
      again = unreachable(error);
      refused = again ? THREAD_SEND_UNREACHED : failureWords(error);
      starting = false;
      return;
    }
    made = created.id;
    // It lands on the project's page with his panel open, the Setup thread
    // in it (its newest and only one): the board and the conversation in
    // sight together.
    openOnArrival(created.id);
    // His box carries the project's key before the navigation departs it.
    await tick();
    await goto(`/project/${encodeURIComponent(created.id)}`);
  }
</script>

<svelte:head>
  <title>New project &middot; CawCo</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-c-new-project-w flex-col items-center gap-space-8 px-space-6 pt-(--pad-top) pb-space-8 max-phone:gap-space-6 max-phone:px-space-4 max-phone:pt-space-7 max-phone:pb-space-6"
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
      <!-- His slot holds his height whether or not he is drawn: `c-caw-hero`
           is `CAW_SIZE`; keep them equal. -->
      <div
        data-slot="caw-80"
        class="grid min-h-c-caw-hero place-items-center"
        data-share={made ? `caw:${made}` : undefined}
      >
        <Caw ongone={gone} present={!leaving} size={CAW_SIZE} status="ready" />
      </div>
    {/if}
    <h1 data-slot="title" class="type-title text-center text-ink-strong">
      What are we working on?
    </h1>
    <div
      data-slot="new-page-field"
      class="relative w-full max-w-c-new-project-field-w"
      style:block-size="calc({footHeight}px + var(--space-4))"
    >
      <Composer
        fleet={composerFleet}
        agentName="Caw"
        attach={false}
        {draft}
        onfoot={(foot) => {
          footHeight = foot.stack;
        }}
        onstop={() => undefined}
        onsubmit={(text, _extras, id) => {
          detach(start(text, id), "start");
        }}
        placeholder="A repo, a launch, a brand…"
        sendAgain={again}
        sendError={refused}
        sending={starting}
      />
    </div>
    <!-- As wide as the field, so the chips stand on its composer's column. -->
    <div class="relative w-full max-w-c-new-project-field-w">
      <div
        data-slot="chips"
        class={chipsVariants({
          class: "px-(--chips-px) max-desk:px-space-3",
        })}
        style:--chips-px="calc((100% - var(--c-composer-w)) / 2)"
      >
        {#each STARTERS as text (text)}
          <button
            class={chipVariants({ class: "select-none" })}
            onclick={() => starter(text)}
            type="button"
          >
            {text}
          </button>
        {/each}
      </div>
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
