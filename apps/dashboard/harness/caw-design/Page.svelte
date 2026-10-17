<script lang="ts">
  /**
   * Caw's panel: what to pick, then what was fixed from his pins. Every
   * state is the panel at its real size (Panel: 380 × 640 on a desk, the
   * sheet's width on a phone), set in a grid of real-size columns, so a
   * wide screen fits more panels on a row and never stretches one.
   *
   * A decision is a section with `data-cawco-choice`, each option's Pick a
   * `data-option` (the hub's overlay keeps the picks and reflects them; the
   * page mirrors them through `cawco.on("picks")` where it is served).
   */
  import type { Snippet } from "svelte";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconCheck } from "#lib/icons.js";
  import Panel from "./Panel.svelte";
  import { DECIDED, DECISIONS, FIXES, type Fix } from "./sections";
  import Blocked from "./states/Blocked.svelte";
  import FiledTasks from "./states/FiledTasks.svelte";
  import {
    fixtureOf,
    MACHINES,
    MANY_MACHINES,
    PROJECT_ID,
    READ_PROBLEM,
    READ_RAW,
    SUGGESTED,
    SUGGESTED_MANY,
    type Suggestion,
  } from "./states/fixtures";
  import ReadFailed from "./states/ReadFailed.svelte";
  import Resize from "./states/Resize.svelte";
  import Suggestions from "./states/Suggestions.svelte";
  import TodayAlert from "./TodayAlert.svelte";
  import TodayTasks from "./TodayTasks.svelte";

  // The thread on show: his reply that filed three tasks, among three threads.
  const {
    threads,
    messages,
    tasks: filed,
  } = fixtureOf("reply-tasks-described", "a", 3);
  const current = threads[0].id;
  const reply =
    Object.values(messages)
      .flat()
      .find((one) => one.author === "caw" && one.tasks?.length)?.body ?? "";
  const COMPOSER = { placeholder: "Message the project…" };

  /** His picks: the hub's, where the page is served with its overlay. */
  const picks = $state<Record<string, string | null>>({
    [DECIDED.id]: DECIDED.picked,
  });
  const served = typeof window.cawco?.on === "function";
  $effect(() =>
    served
      ? window.cawco.on("picks", (state) => {
          for (const [choice, held] of Object.entries(state)) {
            picks[choice] = held?.options?.[0] ?? null;
          }
        })
      : undefined
  );
  /** Unserved, the page keeps the pick itself; served, the overlay does. */
  const pick = (choice: string, option: string) => () => {
    if (!served) {
      picks[choice] = option;
    }
  };

  const drafts = new Map<string, ComposerDraft>();
  const draftOf = (key: string) => {
    let draft = drafts.get(key);
    if (!draft) {
      draft = new ComposerDraft();
      drafts.set(key, draft);
    }
    return draft;
  };
  const fill = (key: string) => (text: string) => {
    draftOf(key).text = text;
  };
</script>

{#snippet said()}
  <p class="m-0 text-[var(--ink-strong)] text-body [text-wrap:pretty]">
    {reply}
  </p>
{/snippet}

{#snippet hero(key: string, line: string | undefined, items: Suggestion[])}
  <EmptyState
    class="[&_.kit-empty-action]:self-stretch"
    {line}
    title="What's next for Harbour site?"
  >
    {#snippet mark()}
      <div class="mb-(--space-3)" data-caw-status="ready">
        <Caw size={80} status="ready" />
      </div>
    {/snippet}
    {#snippet action()}
      <Suggestions {items} onpick={fill(key)} />
    {/snippet}
  </EmptyState>
{/snippet}

{#snippet option(choice: string, id: string)}
  {#if choice === "filed-tasks"}
    <Panel composer={COMPOSER} {current} {threads}>
      {@render said()}
      {#if id === "today"}
        <TodayTasks tasks={filed} />
      {:else}
        <FiledTasks
          form={id === "rows" ? "rows" : "cards"}
          projectId={PROJECT_ID}
          tasks={filed}
        />
      {/if}
    </Panel>
  {:else if choice === "read-failed"}
    <Panel
      composer={COMPOSER}
      {current}
      draft={draftOf(`read-${id}`)}
      {threads}
    >
      {#if id === "today"}
        <p
          class="m-auto max-w-[46ch] p-(--space-6) text-[var(--ink-muted)] text-body"
        >
          The thread could not be read: {READ_PROBLEM}
        </p>
      {:else}
        <ReadFailed
          mark={id === "caw" ? "caw" : "solar"}
          onask={id === "caw" ? fill(`read-${id}`) : null}
          raw={READ_RAW}
        />
      {/if}
    </Panel>
  {:else if choice === "cannot-start"}
    <Panel
      composer={id === "box-stays"
        ? { placeholder: "Caw reads it when a machine is back" }
        : null}
      {current}
      {threads}
    >
      {@render said()}
      {#snippet foot()}
        {#if id === "today"}
          <TodayAlert words="No machine is online, so Caw can't start." />
        {:else}
          <Blocked
            act="Check machines"
            line="No machine is online to run him."
            mono
            rows={MACHINES}
            shell
            status="needs-you"
            title="Caw can't start"
          />
        {/if}
      {/snippet}
    </Panel>
  {:else if choice === "resize"}
    <Panel
      composer={COMPOSER}
      {current}
      {threads}
      wide={id === "wide-in-menu"}
    >
      {@render said()}
      <FiledTasks form="cards" projectId={PROJECT_ID} tasks={filed} />
      {#snippet extra()}
        {#if id === "corner-grip"}<Resize mode="grip" />{/if}
        {#if id === "edge-handles"}<Resize mode="edges" />{/if}
      {/snippet}
    </Panel>
  {/if}
{/snippet}

{#snippet fixed(shows: NonNullable<Fix["shows"]>)}
  {#if shows === "suggestions"}
    <Panel composer={COMPOSER} draft={draftOf("suggestions")} {threads}>
      {@render hero("suggestions", undefined, SUGGESTED_MANY)}
    </Panel>
  {:else if shows === "title-bar"}
    <Panel composer={COMPOSER} {current} {threads}>{@render said()}</Panel>
  {:else if shows === "why-cannot-start"}
    <Panel {current} {threads}>
      {@render said()}
      {#snippet foot()}
        <Blocked
          act="Check machines"
          line="No machine is online to run him."
          mono
          open
          rows={MANY_MACHINES}
          shell
          status="needs-you"
          title="Caw can't start"
        />
      {/snippet}
    </Panel>
  {:else if shows === "off"}
    <Panel composer={COMPOSER} draft={draftOf("off")} {threads}>
      {@render hero(
        "off",
        "Caw is off, so he acts only when you write to him.",
        SUGGESTED
      )}
    </Panel>
  {/if}
{/snippet}

{#snippet words(said: string[])}
  <ul class="said">
    {#each said as one, at (at)}
      <li><q>{one}</q></li>
    {/each}
  </ul>
{/snippet}

{#snippet stage(caption: Snippet, panel: Snippet)}
  <figure class="frame">
    <figcaption class="caption">{@render caption()}</figcaption>
    {@render panel()}
  </figure>
{/snippet}

<!-- The app's tooltip provider, as its layout stands it over every page. -->
<Tooltip.Provider>
  <main class="page">
    <header class="intro">
      <h1 class="h1">Caw's panel</h1>
      <p class="lede">
        Four choices to make, then what changed from your pins. Every panel
        is at its real size.
      </p>
    </header>

    {#each DECISIONS as decision (decision.id)}
      <section class="part" data-cawco-choice={decision.id}>
        <header class="head">
          <h2 class="h2">{decision.question}</h2>
          <p class="why">{decision.differs}</p>
        </header>
        <div class="frames">
          {#each decision.options as one (one.id)}
            {#snippet caption()}
              <span class="name">{one.name}</span>
              <Button
                aria-pressed={picks[decision.id] === one.id}
                data-option={one.id}
                label={picks[decision.id] === one.id ? "Picked" : "Pick"}
                onclick={pick(decision.id, one.id)}
                size="sm"
                variant={picks[decision.id] === one.id ? "default" : "outline"}
              />
            {/snippet}
            {#snippet panel()}
              {@render option(decision.id, one.id)}
            {/snippet}
            {@render stage(caption, panel)}
          {/each}
        </div>
      </section>
    {/each}

    <section class="part" data-cawco-choice={DECIDED.id}>
      <header class="head">
        <h2 class="h2">{DECIDED.question}</h2>
        <p class="why">
          Decided: {DECIDED.options.find((one) => one.id === picks[DECIDED.id])
            ?.name ?? "not yet"}.
        </p>
      </header>
      <div class="decided" role="group" aria-label={DECIDED.question}>
        {#each DECIDED.options as one (one.id)}
          {@const chosen = picks[DECIDED.id] === one.id}
          <!-- His pick reads as chosen and takes no press: a press on it
               would take it back. -->
          <Button
            aria-pressed={chosen}
            class={chosen ? "pointer-events-none" : undefined}
            data-option={one.id}
            icon={chosen ? IconCheck : undefined}
            label={one.name}
            onclick={pick(DECIDED.id, one.id)}
            size="sm"
            variant={chosen ? "default" : "outline"}
          />
        {/each}
      </div>
    </section>

    <section class="part">
      <header class="head">
        <h2 class="h2">Fixed from your pins</h2>
      </header>
      <div class="frames">
        {#each FIXES.filter((one) => one.shows) as fix (fix.shows)}
          {#snippet caption()}
            <div class="fix">
              {@render words(fix.said)}
              <p class="changed">{fix.changed}</p>
            </div>
          {/snippet}
          {#snippet panel()}
            {@render fixed(fix.shows as NonNullable<Fix["shows"]>)}
          {/snippet}
          {@render stage(caption, panel)}
        {/each}
      </div>
      <ul class="notes">
        {#each FIXES.filter((one) => !one.shows) as fix (fix.changed)}
          <li class="fix">
            {@render words(fix.said)}
            <p class="changed">{fix.changed}</p>
          </li>
        {/each}
      </ul>
    </section>
  </main>
</Tooltip.Provider>

<style>
  /* One start edge for the whole page; the reading measure on its words,
     the panels at their real width in as many columns as fit. */
  .page {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-8) * 2);
    min-block-size: 100dvh;
    padding: var(--space-8) var(--space-7);
    background: var(--surface-page);
    color: var(--ink-strong);

    @media (width < 640px) {
      padding: var(--space-6) var(--space-3);
    }
  }
  .intro,
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-inline-size: 60ch;
  }
  .h1 {
    margin: 0;
    font: var(--type-title);
    font-size: var(--text-display, var(--text-title));
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .h2 {
    margin: 0;
    font: var(--type-title);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .lede,
  .why {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-inline-size: 0;
  }
  /* Real-size columns: a wide screen adds columns, never width. Each frame
     takes two rows of the grid (subgrid), so the captions of a row share
     one height and the panels beside each other start on one line. */
  .frames {
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--c-panel-w));
    gap: var(--space-8) var(--space-7);
    align-items: start;

    @media (width < 640px) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .frame {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    row-gap: var(--space-3);
    min-inline-size: 0;
    margin: 0;
  }
  .caption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-inline-size: 0;
    min-block-size: var(--c-btn-h-sm);
  }
  .name {
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .decided {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .fix {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    max-inline-size: 60ch;
  }
  .said {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .changed {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .notes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 36ch), 1fr));
    gap: var(--space-6) var(--space-7);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
