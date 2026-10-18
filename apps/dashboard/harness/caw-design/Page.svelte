<script lang="ts">
  /**
   * Caw's panel: what to pick, the board he decided, then what was fixed
   * from his pins. Every frame is drawn in one form, which the control
   * under the intro picks and the address keeps (`?form=phone`): the
   * desk's floating panel at 380 × 640, or the sheet on a 390 × 844 phone.
   * Each frame's caption says its form first. A decision's options share
   * one row, which scrolls sideways where the window can't hold them, so
   * no option ever wraps under another.
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
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { FORMS, type Form, formIn, formWords } from "./form";
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

  /** The form every frame draws, kept in the address. */
  let form = $state<Form>(formIn(location.search));
  const choose = (next: string) => {
    if (next !== "desk" && next !== "phone") {
      return;
    }
    form = next;
    const url = new URL(location.href);
    url.searchParams.set("form", next);
    history.replaceState(history.state, "", url);
  };
  const words = $derived(formWords(form));

  /** The empty board's frame: a device's size, scaled to fit the column. */
  const BOARD = {
    desk: {
      w: 1280,
      h: 800,
      not: "the app's rail and top bar, where a desk's views stand",
    },
    phone: { w: 390, h: 844, not: "the app's top bar" },
  };
  const device = $derived(BOARD[form]);
  let room = $state(0);
  const scale = $derived(room > 0 ? Math.min(1, room / device.w) : 1);

  /** His picks: the hub's, where the page is served with its overlay. */
  const picks = $state<Record<string, string | null>>({});
  /** The hub's overlay, where it serves the page (preview-overlay page.ts). */
  const overlay = (
    window as Window & {
      cawco?: {
        on?: (
          event: "picks",
          listener: (
            state: Record<string, { options?: string[] } | undefined>
          ) => void
        ) => () => void;
      };
    }
  ).cawco;
  const served = typeof overlay?.on === "function";
  $effect(() =>
    served
      ? overlay?.on?.("picks", (state) => {
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
    <Panel {form} composer={COMPOSER} {current} {threads}>
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
      {form}
      composer={COMPOSER}
      {current}
      draft={draftOf(`read-${id}`)}
      {threads}
    >
      {#if id === "today"}
        <p
          class="m-0 max-w-[60ch] py-(--space-6) text-[var(--ink-muted)] text-body"
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
      {form}
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
      {form}
      composer={COMPOSER}
      {current}
      {threads}
      wide={id === "wide-in-menu"}
    >
      {@render said()}
      <FiledTasks form="cards" projectId={PROJECT_ID} tasks={filed} />
      {#snippet extra()}
        {#if id === "corner-grip"}<Resize {form} mode="grip" />{/if}
        {#if id === "edge-handles"}<Resize {form} mode="edges" />{/if}
      {/snippet}
    </Panel>
  {/if}
{/snippet}

{#snippet fixed(shows: NonNullable<Fix["shows"]>)}
  {#if shows === "suggestions"}
    <Panel {form} composer={COMPOSER} draft={draftOf("suggestions")} {threads}>
      {@render hero("suggestions", undefined, SUGGESTED_MANY)}
    </Panel>
  {:else if shows === "title-bar"}
    <Panel {form} composer={COMPOSER} {current} {threads}
      >{@render said()}</Panel
    >
  {:else if shows === "why-cannot-start"}
    <Panel {form} {current} {threads}>
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
    <Panel {form} composer={COMPOSER} draft={draftOf("off")} {threads}>
      {@render hero(
        "off",
        "Caw is off, so he acts only when you write to him.",
        SUGGESTED
      )}
    </Panel>
  {/if}
{/snippet}

{#snippet his(said: string[])}
  <ul class="said">
    {#each said as one, at (at)}
      <li><q>{one}</q></li>
    {/each}
  </ul>
{/snippet}

{#snippet stage(caption: Snippet, panel: Snippet)}
  <figure class="frame" data-design-frame={form}>
    <figcaption class="caption">{@render caption()}</figcaption>
    {@render panel()}
  </figure>
{/snippet}

<!-- The app's tooltip provider, as its layout stands it over every page. -->
<Tooltip.Provider>
  <main class="page" data-form={form}>
    <header class="intro">
      <h1 class="h1">Caw's panel</h1>
      <p class="lede">
        Four choices to make, the board you decided, then what changed from your
        pins. Every panel is at its real size, as a desk or a phone draws it.
      </p>
      <ToggleGroup.Root
        aria-label="Draw every panel as"
        class="mt-(--space-3) self-start"
        data-design-forms
        onValueChange={choose}
        type="single"
        value={form}
      >
        {#each FORMS as one (one.id)}
          <ToggleGroup.Item value={one.id}>{one.name}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </header>

    {#each DECISIONS as decision (decision.id)}
      <section class="part" data-cawco-choice={decision.id}>
        <header class="head">
          <h2 class="h2">{decision.question}</h2>
          <p class="why">{decision.differs}</p>
        </header>
        <div class="row" data-design-row>
          {#each decision.options as one (one.id)}
            {#snippet caption()}
              <span class="name"
                ><span class="form">{words}</span> · {one.name}</span
              >
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

    <section class="part" data-design-decided>
      <header class="head">
        <h2 class="h2">{DECIDED.question}</h2>
        <p class="why">Decided: {DECIDED.now}</p>
      </header>
      <figure
        class="frame board"
        data-design-frame={form}
        bind:clientWidth={room}
      >
        <figcaption class="caption">
          <span class="name"
            ><span class="form">{form === "phone" ? "Phone" : "Desk"}</span> ·
            the empty board, {device.w} × {device.h}, shown at {Math.round(
              scale * 100
            )}%. Not drawn: {device.not}.</span
          >
        </figcaption>
        <div
          class="device"
          style:block-size="{device.h * scale}px"
          style:inline-size="{device.w * scale}px"
        >
          <iframe
            data-design-board-frame={form}
            src="?board={form}"
            style:block-size="{device.h}px"
            style:inline-size="{device.w}px"
            style:scale
            title="The empty board, as a {form === 'phone'
              ? 'phone'
              : 'desk'} draws it"
          ></iframe>
        </div>
      </figure>
    </section>

    <section class="part">
      <header class="head">
        <h2 class="h2">Fixed from your pins</h2>
      </header>
      <div class="row" data-design-row>
        {#each FIXES.filter((one) => one.shows) as fix (fix.shows)}
          {#snippet caption()}
            <div class="fix">
              <span class="name"><span class="form">{words}</span></span>
              {@render his(fix.said)}
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
            {@render his(fix.said)}
            <p class="changed">{fix.changed}</p>
          </li>
        {/each}
      </ul>
    </section>
  </main>
</Tooltip.Provider>

<style>
  /* One start edge for the whole page; the reading measure on its words,
     the frames at their real size. A frame is the form's: the desk's panel,
     or a 390 × 844 phone's screen (a device's size, not a design length). */
  .page {
    --pad: var(--space-7);
    --frame-w: var(--c-panel-w);

    display: flex;
    flex-direction: column;
    gap: calc(var(--space-8) * 2);
    min-block-size: 100dvh;
    padding: var(--space-8) var(--pad);
    background: var(--surface-page);
    color: var(--ink-strong);

    &[data-form="phone"] {
      --frame-w: 390px;
    }

    @media (width < 640px) {
      --pad: var(--space-3);
      padding-block: var(--space-6);
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
  /* One row of real-size frames, never wrapped: where the window can't
     hold them the row scrolls sideways, each frame snapping to the start
     edge, and runs on to the window's trailing edge so the next frame
     peeks there. Each frame takes the row's two tracks (subgrid), so the
     captions share one height and the panels start on one line. */
  .row {
    display: grid;
    grid-auto-columns: var(--frame-w);
    grid-auto-flow: column;
    grid-template-rows: auto auto;
    column-gap: var(--space-7);
    align-items: start;
    margin-inline-end: calc(var(--pad) * -1);
    padding-inline-end: var(--pad);
    padding-block-end: var(--space-3);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;

    @media (width < 640px) {
      column-gap: var(--space-4);
    }
  }
  /* A frame in a row snaps its start to the row's. */
  .frame {
    display: grid;
    grid-row: span 2;
    scroll-snap-align: start;
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
  /* The form leads every caption, a step under the option's name. */
  .form {
    color: var(--ink-muted);
  }
  /* The empty board: a device's whole screen, scaled down to the column
     where it is wider, its scale said in the caption. */
  .board {
    grid-template-rows: auto auto;
  }
  .device {
    overflow: hidden;
    border-radius: var(--radius-lg);
    box-shadow:
      var(--shadow-tile),
      0 0 0 1px var(--border-hairline);
  }
  .device > iframe {
    display: block;
    border: 0;
    transform-origin: 0 0;
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
