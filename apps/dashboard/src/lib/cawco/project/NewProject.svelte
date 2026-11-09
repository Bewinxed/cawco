<script lang="ts">
  /**
   * New project (design §5, PRD §5.6): Caw at 80px asks "What are we working
   * on?"; the session Composer, four starter chips that put their words in
   * it, and six template cards with Caw peeking over the one the words fit.
   *
   * One live Caw at a time: the first fit sends the 80px Caw away and he
   * peeks over the card; a different fit moves the peek to it; no fit sends
   * the peek away and the 80px Caw comes back. The fit is a hint and never a
   * pick: only a tap picks a card, typing and chips leave the tap where it
   * is, and a tap on the picked card clears it.
   *
   * The send makes the project with Caw (`create`), carrying the tapped
   * template or none and no name (Caw names it); `onmade` takes the page to
   * it. A refusal puts the words back in the composer with the reason over
   * them.
   *
   * Its state arrives as props, so every state stands in a story
   * (NewProject.stories.ts): where the fleet stands (`fleet`, read from the
   * home's `machines`: nothing is claimed while it is read). The field's
   * placeholder types its examples once and rests (TypedExamples), and the
   * cards' glyphs keep their sections' hues (decision page
   * `onboarding-design`, cards `describe-hint` and `card-hues`).
   */
  import { detach } from "@cawco/core/detach";
  import { onboardingWords } from "@cawco/core/words/onboarding";
  import { tick } from "svelte";
  import type { createProject } from "#lib/cawco/client.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import {
    fitOf,
    STARTERS,
    TEMPLATE_CARDS,
    type TemplateName,
  } from "#lib/cawco/project/new-project.js";
  import TemplateCards from "#lib/cawco/project/TemplateCards.svelte";
  import { TypedExamples } from "#lib/cawco/project/typed-examples.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import {
    failureWords,
    PROMPT_UNREACHED,
    unreachable,
  } from "#lib/platform/hub-read.js";
  import { idForWords, type SentWords } from "#lib/platform/id.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";

  let {
    fleet,
    create,
    onmade,
    onmachines,
    still = false,
    words: firstWords = "",
    tapped: firstTapped = null,
    refusal,
  }: {
    /**
     * Where the fleet stands (home-state `machines`): `reading` until the
     * hub is live and has listed them, so no line claims an empty fleet
     * over a list still being read.
     */
    fleet: "reading" | "none" | "offline" | "online";
    /** Makes the project from the words (client `createProject`). */
    create: typeof createProject;
    /** The project is made: the page goes to it. */
    onmade: (id: string) => Promise<unknown> | undefined;
    /** No machine online: Add machine, or Check machines, from what asked. */
    onmachines: (anchor: HTMLElement, fleet: "none" | "offline") => void;
    /** Stands still as with reduced motion (a story of that state). */
    still?: boolean;
    /** Words already in the field (a draft kept, a story). */
    words?: string;
    /** The card already tapped (a story). */
    tapped?: TemplateName | null;
    /** A send that was refused, its words back in the field (a story). */
    refusal?: { reason: string; again: boolean };
  } = $props();

  /** Caw's side here, on the page and over a card. */
  const CAW_SIZE = 80;
  /** How long typing rests before the fit runs. */
  const FIT_AFTER_MS = 300;

  /** The words, in the session Composer: its field takes the caret on arrival. */
  const draft = new ComposerDraft();
  draft.focusWanted = true;
  draft.text = firstWords;
  const words = $derived(draft.text);

  /**
   * The placeholder typing its examples while the field is empty, the tab
   * shown and motion allowed (typed-examples.svelte.ts); focus does not stop
   * it, a first letter does, and an emptied field starts it again.
   */
  const typed = new TypedExamples(
    onboardingWords.examples,
    onboardingWords.placeholder
  );
  $effect(() =>
    typed.run(words.length === 0 && !still && !starting && !tapped)
  );
  let fit = $derived<TemplateName | null>(fitOf(firstWords));
  /**
   * The card the person tapped, the one pick: the frame stands on it and
   * nowhere else, whatever the words fit.
   */
  let tapped = $derived<TemplateName | null>(firstTapped);
  /** A card picked on the cards, or the picked one tapped again (null). */
  function tap(next: TemplateName | null) {
    tapped = next;
    // The template shapes what the words start: the caret goes to the
    // field, whose placeholder asks for what that work needs said.
    if (next) {
      draft.focusWanted = true;
    }
  }

  /** The prompt's fit, now: where Caw peeks, never the pick. */
  function refit(text: string) {
    fit = fitOf(text);
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
  let caw = $derived<"page" | "peek">(fitOf(firstWords) ? "peek" : "page");
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

  /**
   * A chip's words into the composer, the caret after them: an empty field
   * takes them whole; words already there keep their place, the chip's
   * going on a line under them, so a press never takes what was typed.
   */
  function starter(text: string) {
    const typedWords = draft.text.trimEnd();
    const next = typedWords ? `${typedWords}\n${text}` : text;
    draft.text = next;
    draft.focusWanted = true;
    // A press runs the fit at once: there is no typing to wait for.
    refit(next);
  }

  /** No machine online, known: Caw's conversation can't start. */
  const machineless = $derived(fleet === "none" || fleet === "offline");

  /** The project the send made: Caw departs under its key as the page goes. */
  let made = $state<string | null>(null);

  /** The send is out; it stays so through the navigation it ends in. */
  let starting = $state(false);
  let refused = $derived(refusal?.reason ?? "");
  /** The send never reached the hub: its line offers Send again. */
  let again = $derived(refusal?.again ?? false);
  /** What the Composer stands over its foot: its box holds that much room. */
  let footHeight = $state(0);
  /**
   * The field's box: the composer's standing as it reports it, and until it
   * has (the server's paint, the frames before it mounts) its panel at rest
   * (`c-composer-panel`), so the composer never stands over the question
   * and nothing moves once it reports.
   */
  const footBox = $derived(
    footHeight > 0
      ? `calc(${footHeight}px + var(--space-4))`
      : "calc(var(--c-composer-panel) + var(--space-4))"
  );

  /** The prompt a start that did not go through carried, and its id: the same prompt again is the same project. */
  let unsent: SentWords | null = null;
  async function start(text: string, fresh: string) {
    starting = true;
    // The words stay in the field while the project is made: the composer
    // empties it as they leave, and an empty field reads as words lost.
    draft.restore(text);
    refused = "";
    again = false;
    unsent = idForWords(unsent, text, fresh);
    let created: Awaited<ReturnType<typeof createProject>>;
    try {
      created = await create({
        prompt: text,
        promptId: unsent.id,
        ...(tapped ? { template: tapped } : {}),
      });
      unsent = null;
    } catch (error) {
      again = unreachable(error);
      refused = again ? PROMPT_UNREACHED : failureWords(error);
      starting = false;
      return;
    }
    made = created.id;
    // His box carries the project's key before the navigation departs it.
    await tick();
    await onmade(created.id);
  }
</script>

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
      {onboardingWords.ask}
    </h1>
    <div
      data-slot="new-page-field"
      class="relative w-full max-w-c-new-project-field-w"
      style:block-size={footBox}
    >
      <Composer
        fleet={composerFleet}
        agentName="Caw"
        attach={false}
        {draft}
        held={machineless}
        heldWhy={fleet === "none"
          ? onboardingWords.noMachine
          : onboardingWords.noneOnline}
        onfoot={(foot) => {
          footHeight = foot.stack;
        }}
        onstop={() => undefined}
        onsubmit={(text, _extras, id) => {
          detach(start(text, id), "start");
        }}
        label={onboardingWords.ask.replace(/\?$/u, "")}
        placeholder={tapped ? onboardingWords.templateAsks[tapped] : typed.text}
        sendAgain={again}
        sendError={refused}
        sending={starting}
      />
    </div>
    {#if machineless}
      <!-- Known, not guessed: the line stands only once the hub has listed
           the machines. The words stay in the field (the draft survives a
           reload) and Send waits; the cards stay. -->
      <div
        data-slot="no-machine"
        class="mark-line flex w-full max-w-c-new-project-field-w flex-wrap items-center justify-center gap-x-space-3 gap-y-space-2"
      >
        <span class="type-body text-center text-pretty text-ink-muted"
          >{fleet === "none"
            ? onboardingWords.noMachine
            : onboardingWords.noneOnline}</span
        >
        <Button
          aria-haspopup="dialog"
          data-box
          label={fleet === "none"
            ? onboardingWords.addMachine
            : onboardingWords.checkMachines}
          onclick={(event: MouseEvent) =>
            onmachines(
              event.currentTarget as HTMLElement,
              fleet === "none" ? "none" : "offline"
            )}
          size="sm"
          variant="outline"
        />
      </div>
    {/if}
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
            disabled={starting}
            onclick={() => starter(text)}
            type="button"
          >
            {text}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- On a phone the field fills the column, inset as the house
       composer is from its dock: the cards' edges stand on the field's, as
       the chips' do. -->
  <div data-slot="cards" class="w-full max-phone:px-space-3">
    <TemplateCards
      cards={TEMPLATE_CARDS}
      {fit}
      metaOf={(card) => card.meta}
      onpeekgone={gone}
      peek={caw === "peek"}
      peekPresent={!leaving}
      peekShare={made ? `caw:${made}` : undefined}
      peekSize={CAW_SIZE}
      bind:selected={() => tapped, tap}
      disabled={starting}
    />
  </div>
</main>
