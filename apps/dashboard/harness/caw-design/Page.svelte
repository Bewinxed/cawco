<script lang="ts">
  /**
   * Caw's panel: what to pick, the board he decided, then what was fixed
   * from his pins. Every frame is drawn in one form, which the control
   * under the intro picks and the address keeps (`?form=phone`): the
   * desk's floating panel at 380 × 640, or the panel on a 390 × 844 phone.
   * Each frame's caption says its form first. A decision's options share
   * one row, which scrolls sideways where the window can't hold them, so
   * no option ever wraps under another. The phone's frame (E) is drawn on
   * a phone whatever the switch says.
   *
   * A decision is a section with `data-cawco-choice`, each option's Pick a
   * `data-option` (the hub's overlay keeps the picks and reflects them; the
   * page mirrors them through `cawco.on("picks")` where it is served).
   */
  import type { ThreadMessage } from "@cawco/core";
  import type { Snippet } from "svelte";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { FORMS, type Form, formIn, formWords } from "./form";
  import Panel from "./Panel.svelte";
  import { DECIDED, DECISIONS, FIXES } from "./sections";
  import CawSays from "./states/CawSays.svelte";
  import Conversation from "./states/Conversation.svelte";
  import FiledTasks from "./states/FiledTasks.svelte";
  import {
    fixtureOf,
    MACHINES,
    PROJECT_ID,
    PROJECT_NAME,
    READ_RAW,
    SUGGESTED_MANY,
  } from "./states/fixtures";
  import Notice from "./states/Notice.svelte";
  import Resize from "./states/Resize.svelte";
  import StarterChips from "./states/StarterChips.svelte";
  import StarterRows from "./states/StarterRows.svelte";
  import TodayTasks from "./TodayTasks.svelte";

  // The thread on show: his reply that filed three tasks, among three threads.
  const {
    threads,
    messages,
    tasks: filed,
  } = fixtureOf("reply-tasks-described", "a", 3);
  const current = threads[0].id;
  const said: ThreadMessage[] = messages[current] ?? [];
  /** A longer thread, for the frames that scroll: an earlier exchange first. */
  const longer: ThreadMessage[] = [...(messages[threads[1].id] ?? []), ...said];
  const COMPOSER = { placeholder: "Message the project…" };
  /** While no machine can run him, the box keeps your words for him. */
  const KEPT = { placeholder: "Caw reads it when a machine is back" };
  const READ = {
    title: "The hub couldn't open this thread",
    line: "Your messages are kept.",
  };
  const START = {
    title: "Caw can't start",
    line: "No machine is online to run him.",
  };
  const ASK_CAW =
    "This thread's history won't open. Can you find out why from the hub's log?";

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
  const formOf = (phoneOnly: boolean | undefined): Form =>
    phoneOnly ? "phone" : form;

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

<!-- The thread as every frame draws it: his reply and the tasks it filed,
     as rows (the advisor's pick for them). -->
{#snippet thread(list: ThreadMessage[] = said)}
  <div class="words-col">
    <Conversation messages={list}>
      {#snippet tasks()}
        <FiledTasks form="rows" projectId={PROJECT_ID} tasks={filed} />
      {/snippet}
    </Conversation>
  </div>
{/snippet}

<!-- One state's frame inside an option that shows two. -->
{#snippet stateFrame(label: string, panel: Snippet)}
  <div class="state">
    <p class="state-name">{label}</p>
    {@render panel()}
  </div>
{/snippet}

{#snippet option(choice: string, id: string, drawn: Form)}
  {#if choice === "head"}
    <Panel
      composer={COMPOSER}
      {current}
      form={drawn}
      head={id === "name-only" ? "name" : "who"}
      {threads}
    >
      {@render thread()}
    </Panel>
  {:else if choice === "notices"}
    <div class="states">
      {#snippet read()}
        <Panel
          composer={COMPOSER}
          {current}
          draft={draftOf(`read-${id}`)}
          form={drawn}
          {threads}
        >
          {#if id === "alert-row"}
            <Notice
              act="Retry"
              line={READ.line}
              onsecond={() => fill(`read-${id}`)(ASK_CAW)}
              raw={READ_RAW}
              second="Ask Caw"
              tint="destructive"
              title={READ.title}
            />
          {:else}
            <div class="words-col">
              <CawSays
                acts={["Retry", "Ask Caw"]}
                line={READ.line}
                onact={(act) =>
                  act === "Ask Caw" ? fill(`read-${id}`)(ASK_CAW) : undefined}
                raw={READ_RAW}
                title={READ.title}
              />
            </div>
          {/if}
        </Panel>
      {/snippet}
      {#snippet start()}
        <Panel composer={KEPT} {current} form={drawn} {threads}>
          {@render thread()}
          {#if id === "caw-says"}
            <div class="words-col">
              <CawSays
                acts={["Check machines"]}
                line={START.line}
                rows={MACHINES}
                title={START.title}
              />
            </div>
          {/if}
          {#snippet notice()}
            {#if id === "alert-row"}
              <Notice
                act="Check machines"
                line={START.line}
                rows={MACHINES}
                tint="warning"
                title={START.title}
              />
            {/if}
          {/snippet}
        </Panel>
      {/snippet}
      {@render stateFrame("The thread can't be read", read)}
      {@render stateFrame("Caw can't start", start)}
    </div>
  {:else if choice === "suggestions"}
    <Panel
      composer={COMPOSER}
      draft={draftOf(`starters-${id}`)}
      form={drawn}
      {threads}
    >
      <div class="greet" data-design-greeting>
        <span class="greet-caw" data-caw-status="ready"
          ><Caw size={48} status="ready" /></span
        >
        <p class="greet-words">What's next for {PROJECT_NAME}?</p>
      </div>
      <div class="starters">
        {#if id === "chips"}
          <StarterChips
            onpick={fill(`starters-${id}`)}
            starters={SUGGESTED_MANY}
          />
        {:else}
          <StarterRows
            onpick={fill(`starters-${id}`)}
            starters={SUGGESTED_MANY}
          />
        {/if}
      </div>
    </Panel>
  {:else if choice === "phone-frame"}
    <Panel
      composer={COMPOSER}
      {current}
      form={drawn}
      frame={id === "hang" ? "hang" : "sheet"}
      {threads}
    >
      {@render thread()}
    </Panel>
  {:else if choice === "filed-tasks"}
    <Panel composer={COMPOSER} {current} form={drawn} {threads}>
      <div class="words-col">
        <Conversation messages={said}>
          {#snippet tasks()}
            {#if id === "today"}
              <TodayTasks tasks={filed} />
            {:else}
              <FiledTasks
                form={id === "rows" ? "rows" : "cards"}
                projectId={PROJECT_ID}
                tasks={filed}
              />
            {/if}
          {/snippet}
        </Conversation>
      </div>
    </Panel>
  {:else if choice === "resize"}
    <Panel
      composer={COMPOSER}
      {current}
      form={drawn}
      {threads}
      wide={id === "wide-in-menu"}
    >
      {@render thread()}
      {#snippet extra()}
        {#if id === "corner-grip"}<Resize form={drawn} mode="grip" />{/if}
        {#if id === "edge-handles"}<Resize form={drawn} mode="edges" />{/if}
      {/snippet}
    </Panel>
  {/if}
{/snippet}

{#snippet his(words: string[])}
  <ul class="said">
    {#each words as one, at (at)}
      <li><q>{one}</q></li>
    {/each}
  </ul>
{/snippet}

<!-- The app's tooltip provider, as its layout stands it over every page. -->
<Tooltip.Provider>
  <main class="page" data-form={form}>
    <header class="intro">
      <h1 class="h1">Caw's panel</h1>
      <p class="lede">
        Six choices, the board you decided, then what changed from your pins.
        Every panel is at its real size, as a desk or a phone draws it. Each
        choice changes one part; the rest of every panel is drawn as
        recommended.
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
      {@const drawn = formOf(decision.phoneOnly)}
      <section class="part" data-cawco-choice={decision.id}>
        <header class="head">
          <h2 class="h2">{decision.question}</h2>
          <p class="why">{decision.differs}</p>
          {#if decision.note}<p class="note">{decision.note}</p>{/if}
        </header>
        <div class="row" data-design-row data-form={drawn}>
          {#each decision.options as one (one.id)}
            <figure class="frame" data-design-frame={drawn}>
              <figcaption class="caption">
                <span class="name"
                  ><span class="form">{formWords(drawn)}</span> · {one.name}</span
                >
                <span class="acts">
                  {#if one.recommended}
                    <Badge data-design-recommended>Recommended</Badge>
                  {/if}
                  <Button
                    aria-pressed={picks[decision.id] === one.id}
                    data-option={one.id}
                    label={picks[decision.id] === one.id ? "Picked" : "Pick"}
                    onclick={pick(decision.id, one.id)}
                    size="sm"
                    variant={picks[decision.id] === one.id
                      ? "default"
                      : "outline"}
                  />
                </span>
              </figcaption>
              <div class="frames" data-design-option={one.id}>
                {@render option(decision.id, one.id, drawn)}
              </div>
            </figure>
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
      {#each FIXES.filter((one) => one.shows) as fix (fix.changed)}
        <div class="row" data-design-fix={fix.shows} data-form={form}>
          <figure class="frame" data-design-frame={form}>
            <figcaption class="caption">
              <span class="name"
                ><span class="form">{formWords(form)}</span> · decided</span
              >
            </figcaption>
            <div class="frames" data-design-option="decided">
              <Panel composer={COMPOSER} {current} end={48} {form} {threads}>
                {@render thread(longer)}
              </Panel>
            </div>
          </figure>
          <div class="fix beside">
            {@render his(fix.said)}
            <p class="changed">{fix.changed}</p>
          </div>
        </div>
      {/each}
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

    display: flex;
    flex-direction: column;
    gap: calc(var(--space-8) * 2);
    min-block-size: 100dvh;
    padding: var(--space-8) var(--pad);
    background: var(--surface-page);
    color: var(--ink-strong);

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
  .why,
  .note {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The decision's one plain line on why its options stand as they do. */
  .note {
    color: var(--ink-strong);
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
    --frame-w: var(--c-panel-w);

    display: grid;
    grid-auto-columns: max-content;
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

    &[data-form="phone"] {
      --frame-w: 390px;
    }
    /* A window a phone's width: the row runs the window edge to edge, so a
       390px phone frame snaps to its start whole, every frame at x 0, and
       the captions keep the page's inset. */
    @media (width < 640px) {
      column-gap: var(--space-4);
      margin-inline: calc(var(--pad) * -1);
      padding-inline: 0;

      & .caption {
        padding-inline: var(--pad);
      }
    }
  }
  /* A decided fix beside its frame: his words and what changed. */
  .beside {
    grid-row: 1 / span 2;
    align-self: start;
    inline-size: min(48ch, 80vw);
    padding-block-start: calc(var(--c-btn-h-sm) + var(--space-3));
  }
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
    inline-size: var(--frame-w);
    min-block-size: var(--c-btn-h-sm);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
  .frames {
    display: flex;
    min-inline-size: 0;
  }
  /* An option that shows two states: each its own panel, side by side,
     named over it in the meta role. */
  .states {
    display: flex;
    gap: var(--space-4);
  }
  /* Each state snaps to the row's start on its own, so a phone's window
     shows either whole. */
  .state {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    scroll-snap-align: start;
  }
  .state-name {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Caw's prose on the text column the message box's words stand on. */
  .words-col {
    min-inline-size: 0;
    padding-inline: var(--space-3);
  }
  /* An empty thread opens on his greeting, from the top: Caw beside the
     words as he stands beside a notice's, the line in the title role. */
  .greet {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    padding-inline: var(--space-3);
  }
  .greet-caw {
    display: block;
  }
  .greet-words {
    margin: 0;
    font: var(--type-title);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  /* The starters stand at the foot of an empty thread, on the message
     box. */
  .starters {
    margin-block-start: auto;
    min-inline-size: 0;
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
