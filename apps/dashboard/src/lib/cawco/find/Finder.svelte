<script lang="ts">
  /**
   * Find (docs/tom/find-and-mention-chosen.md, Option 1 with its must-fixes):
   * one field and one list whose unit is a session or a thread, the reason
   * it matched under it. Its contents only; the host hangs it (the glass's
   * card on the desk, a sheet from the glass on a phone).
   *
   * Desk, top to bottom: the field; a Go-to row when a kind word or a strong
   * name match asks for one; sessions that match by what they are (the hub,
   * per keystroke); "Where … was said" (every machine, once typing settles),
   * its who-said chips and coverage at its head; the hints. Nothing typed,
   * the doorway: Waiting for you, then today's sessions.
   *
   * Phone, the same parts upside down: the field above the keyboard and the
   * best match nearest it, "Where … was said" furthest up.
   *
   * The field keeps the focus (a WAI-ARIA combobox over a listbox): ↑↓ move
   * the active row, ↵ opens it, → peeks it in place, ← folds, Escape closes.
   */
  import { tick, untrack } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconClose } from "#lib/icons.js";
  import ChevronLeft from "~icons/solar/alt-arrow-left-linear";
  import ChevronRight from "~icons/solar/alt-arrow-right-linear";
  import NeedsYou from "~icons/solar/hand-shake-bold-duotone";
  import SearchIcon from "~icons/solar/magnifer-bold-duotone";
  import Server from "~icons/solar/server-bold-duotone";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { reflow } from "../motion/rows.svelte";
  import Segmented from "../spawn/Segmented.svelte";
  import FindPeek from "./FindPeek.svelte";
  import FindRow from "./FindRow.svelte";
  import type { FindMoment, FindResult, WaitingItem } from "./find-client";
  import { kindGlyph, kindNoun, rowOf, waitingRow } from "./find-rows";
  import {
    type FinderState,
    GRACE_MS,
    type MachineAct,
    type Opening,
    type Spoken,
    type Stop,
    WHO,
  } from "./finder.svelte";

  let {
    finder,
    phone = false,
    onopen,
    onopenwaiting,
    onmachine,
    onclose,
    field = $bindable(null),
  }: {
    finder: FinderState;
    phone?: boolean;
    /** ↵ on a session, a thread or a thing: open it (at a moment, when there is one). */
    onopen: (opening: Opening) => void;
    onopenwaiting: (item: WaitingItem) => void;
    onmachine: (result: FindResult, act: MachineAct) => void;
    /** Escape with nothing folded open. */
    onclose: () => void;
    field?: HTMLInputElement | null;
  } = $props();

  const uid = $props.id();
  const listId = `${uid}-list`;
  /** A stop's element id: keys hold ':' and '#', fine in an id, escaped for a selector. */
  const idOf = (key: string) => `${uid}-${key}`;

  const stopKey = (r: FindResult) => `${r.kind}:${r.id}`;

  // ---- Waits that outlast the grace (DESIGN.md, The Real Wait Rule) ----
  let namesLate = $state(false);
  let everyLate = $state(false);
  const namesWaiting = $derived(finder.names.state === "asking");
  const everyWaiting = $derived(finder.searching);
  $effect(() => {
    if (!namesWaiting) {
      namesLate = false;
      return;
    }
    const t = setTimeout(() => {
      namesLate = true;
    }, GRACE_MS);
    return () => clearTimeout(t);
  });
  $effect(() => {
    if (!everyWaiting) {
      everyLate = false;
      return;
    }
    const t = setTimeout(() => {
      everyLate = true;
    }, GRACE_MS);
    return () => clearTimeout(t);
  });

  // ---- Keys ----
  const step = (n: number) => finder.move(phone ? -n : n);

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "ArrowRight": {
        const input = event.currentTarget as HTMLInputElement;
        // The caret moving in the words comes first.
        if (input.selectionStart !== input.value.length) {
          return;
        }
        event.preventDefault();
        finder.peek();
        break;
      }
      case "ArrowLeft": {
        const input = event.currentTarget as HTMLInputElement;
        if (
          finder.peeked === null &&
          finder.unfolded.size === 0 &&
          finder.view === "find"
        ) {
          return;
        }
        if (
          input.selectionStart !== input.value.length &&
          finder.view === "find"
        ) {
          return;
        }
        if (finder.fold()) {
          event.preventDefault();
        }
        break;
      }
      case "Enter":
        event.preventDefault();
        commit(finder.active);
        break;
      case "Escape":
        event.preventDefault();
        if (!finder.fold()) {
          onclose();
        }
        break;
      default:
    }
  }

  function commit(stop: Stop | null) {
    if (!stop) {
      return;
    }
    finder.chosen = stop.key;
    switch (stop.type) {
      case "waiting":
        finder.showWaiting();
        return;
      case "fold":
        if (finder.unfolded.has(stop.key)) {
          finder.unfolded.delete(stop.key);
        } else {
          finder.unfolded.add(stop.key);
        }
        return;
      case "act":
        onmachine(stop.result, stop.act);
        return;
      case "wait-item":
        onopenwaiting(stop.item);
        return;
      default: {
        const opening = finder.opening();
        if (opening) {
          onopen(opening);
        }
      }
    }
  }

  const pick = (key: string) => {
    finder.chosen = key;
    commit(finder.active);
  };
  const hover = (key: string) => {
    if (finder.chosen !== key) {
      finder.chosen = key;
    }
  };
  const openMoment = (result: Spoken, moment: FindMoment) =>
    onopen({ result, moment });

  // The active row stays in view as the keys walk the list.
  let list = $state<HTMLElement | null>(null);
  $effect(() => {
    const key = finder.active?.key;
    if (!(key && list)) {
      return;
    }
    untrack(() => {
      tick().then(() => {
        document
          .getElementById(idOf(key))
          ?.scrollIntoView({ block: "nearest" });
      });
    });
  });

  const typedText = (event: Event) => {
    finder.text = (event.currentTarget as HTMLInputElement).value;
    finder.chosen = null;
    finder.peeked = null;
    finder.unfolded.clear();
    finder.ask();
  };

  const clear = () => {
    finder.text = "";
    finder.chosen = null;
    finder.peeked = null;
    finder.ask();
    field?.focus();
  };

  // ---- What the list holds ----
  const activeKey = $derived(finder.active?.key ?? null);
  const goTo = $derived(finder.goTo);
  const nameRows = $derived(finder.shownNameRows);
  const saidRows = $derived(finder.saidRows);
  const today = $derived.by(() => {
    const start = new Date(finder.now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  });
  const doorwayToday = $derived(
    nameRows.filter((r) => (r.lastActivity ?? 0) >= today)
  );
  const doorwayEarlier = $derived(
    nameRows.filter((r) => (r.lastActivity ?? 0) < today)
  );
  const waitingCount = $derived(finder.waitingItems.length);

  /**
   * Whether "Where … was said" stands: while the machines are asked, when
   * they found something, when one didn't answer (its coverage is said), or
   * while a who-said chip narrows it (so the chip can be undone). Every
   * machine answered with nothing: it is not drawn at all.
   */
  const saidShown = $derived(
    finder.typed &&
      !finder.nothing &&
      (finder.searching ||
        saidRows.length > 0 ||
        finder.missing.length > 0 ||
        finder.by !== null)
  );
  const machineCount = $derived(
    finder.coverage?.machines.length || finder.knownMachines
  );
  const answered = $derived(
    (finder.coverage?.machines ?? []).filter((m) => m.answered).length
  );

  /** What the footer says ↵ does on the active row. */
  const enterHint = $derived.by(() => {
    const stop = finder.active;
    if (
      (stop?.type === "row" && stop.section === "said") ||
      stop?.type === "moment"
    ) {
      return "open at that line";
    }
    if (stop?.type === "fold") {
      return "show all";
    }
    return "open";
  });

  /** The peek's said line: asked, missing, or what came back. */
  function momentsState(result: Spoken) {
    if (result.kind !== "conversation") {
      return { state: "ok" as const };
    }
    const { machine } = result;
    const gone = finder.missing.find((m) => m.machineId === machine.id);
    if (gone) {
      return { state: "missing" as const, machine: machine.name };
    }
    if (finder.searching) {
      return { state: "asking" as const, machine: machine.name };
    }
    return { state: "ok" as const };
  }

  const hueOfMissing = $derived(finder.missing.map((m) => m.name).join(", "));
  const announce = $derived.by(() => {
    if (finder.hubDown) {
      return "Can't reach the hub.";
    }
    if (finder.nothing) {
      return `No sessions for “${finder.text.trim()}”`;
    }
    if (finder.searching) {
      return `${nameRows.length} found by name. Searching ${machineCount || ""} machines.`;
    }
    if (finder.typed) {
      const gone = finder.missing.length
        ? ` ${hueOfMissing} didn't answer.`
        : "";
      return `${nameRows.length + saidRows.length + goTo.length} found.${gone}`;
    }
    return "";
  });
</script>

{#snippet field_()}
  <div class={["field", { phone }]}>
    <SearchIcon class="lead" aria-hidden="true" />
    <input
      bind:this={field}
      aria-activedescendant={activeKey ? idOf(activeKey) : undefined}
      aria-autocomplete="list"
      aria-controls={listId}
      aria-expanded="true"
      aria-label="Find a session, or a task, preview, decision"
      autocapitalize="off"
      autocomplete="off"
      enterkeyhint="go"
      oninput={typedText}
      {onkeydown}
      placeholder="Find a session, or a task, preview, decision…"
      role="combobox"
      spellcheck="false"
      type="text"
      value={finder.text}
    />
    {#if finder.text}
      <button
        class="clear"
        aria-label="Clear the words"
        onclick={clear}
        type="button"
      >
        <IconClose />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet rowFor(result: Spoken, section: "names" | "said")}
  {@const key = stopKey(result)}
  {@const row = rowOf(
    result,
    finder.now,
    section === "said" ? "moment" : "name"
  )}
  <FindRow
    id={idOf(key)}
    active={activeKey === key}
    now={finder.now}
    onhover={() => hover(key)}
    onpeek={() => finder.togglePeek(key)}
    onpick={() => pick(key)}
    peekable={phone}
    peeked={finder.peeked === key}
    {phone}
    {row}
  />
  {#if finder.peeked === key}
    <div class="peek-slot" data-flip transition:unfold>
      <FindPeek
        id={`${idOf(key)}-peek`}
        {activeKey}
        {idOf}
        keyOf={(i) => `${key}#m${i}`}
        moments={finder.peekMoments(result)}
        momentsState={momentsState(result)}
        now={finder.now}
        onopen={(moment) => openMoment(result, moment)}
        onretry={() => finder.retry()}
        {phone}
        {result}
      />
    </div>
  {/if}
{/snippet}

{#snippet goToRow(result: FindResult)}
  {@const key = stopKey(result)}
  <FindRow
    id={idOf(key)}
    active={activeKey === key}
    now={finder.now}
    onhover={() => hover(key)}
    onpeek={() => finder.togglePeek(key)}
    onpick={() => pick(key)}
    peekable={phone && result.kind === "machine"}
    peeked={finder.peeked === key}
    {phone}
    row={rowOf(result, finder.now)}
  />
  {#if result.kind === "machine" && finder.peeked === key}
    <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
    <div
      class="acts"
      data-flip
      transition:unfold
      role="group"
      aria-label={`${result.title}, what to do`}
    >
      {#each [["start", "Start a session here"], ["see", "See what runs here"]] as const as [act, label] (act)}
        {@const k = `${key}#${act}`}
        <button
          id={idOf(k)}
          class="act"
          aria-selected={activeKey === k}
          data-active={activeKey === k ? "" : undefined}
          data-find-row
          onclick={() => onmachine(result, act)}
          onpointermove={() => hover(k)}
          role="option"
          tabindex="-1"
          type="button"
        >
          <Server aria-hidden="true" />{label}
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet goToSection()}
  {#if goTo.length > 0}
    <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
    <div class="group goto" role="group" aria-label="Go to" data-flip>
      {#each goTo as entry (entry.type === "one" ? stopKey(entry.result) : `fold:${entry.kind}`)}
        {#if entry.type === "one"}
          {@render goToRow(entry.result)}
        {:else}
          {@const key = `fold:${entry.kind}`}
          {@const first = entry.results[0] as FindResult}
          {@const Glyph = kindGlyph(first)}
          {@const open = finder.unfolded.has(key)}
          <button
            id={idOf(key)}
            class={["fold-row", { phone }]}
            aria-label={`${entry.results.length} ${kindNoun(first, entry.results.length)} match “${finder.asked}”, ${open ? "shown" : "folded"}`}
            aria-selected={activeKey === key}
            data-active={activeKey === key ? "" : undefined}
            data-find-row
            data-flip
            onclick={() => pick(key)}
            onpointermove={() => hover(key)}
            role="option"
            tabindex="-1"
            type="button"
          >
            <Glyph class="fold-glyph" aria-hidden="true" />
            <span class="fold-label"
              ><span class="num">{entry.results.length}</span>
              {kindNoun(first, entry.results.length)} match “{finder.asked}”</span
            >
            <ChevronRight
              class={open ? "fold-chev open" : "fold-chev"}
              aria-hidden="true"
            />
          </button>
          {#if open}
            <div class="fold-body" data-flip transition:unfold>
              {#each entry.results as result (stopKey(result))}
                {@render goToRow(result)}
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet namesSection()}
  {#if nameRows.length > 0}
    <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
    <div
      class="group"
      role="group"
      aria-label="Sessions that match by name"
      data-flip
    >
      {#each phone ? [...nameRows].reverse() : nameRows as result (stopKey(result))}
        {@render rowFor(result, "names")}
      {/each}
    </div>
  {:else if namesLate}
    <div class="group" aria-hidden="true">
      <Skeleton class="skeleton-row" />
      <Skeleton class="skeleton-row" />
    </div>
  {/if}
{/snippet}

{#snippet whoChips()}
  <div class={["chips", { phone }]} role="toolbar" aria-label="Who said it">
    {#each WHO as who (who.value)}
      {@const on = (finder.by ?? "anyone") === who.value}
      <button
        class="chip"
        aria-pressed={on}
        onclick={() => {
          if (finder.parsed.me && who.value !== "me") {
            finder.removeWords(["me"]);
          }
          finder.who = who.value;
          finder.askWho();
        }}
        type="button">{who.label}</button
      >
    {/each}
    {#each finder.projectChips as word (word)}
      <span class="chip word" data-flip="pop"
        >{word}<button
          class="chip-x"
          aria-label={`Stop narrowing to ${word}`}
          onclick={() => finder.removeWords([word])}
          type="button"><IconClose /></button
        ></span
      >
    {/each}
    {#if finder.parsed.time}
      <span class="chip word" data-flip="pop"
        >{finder.parsed.time}<button
          class="chip-x"
          aria-label={`Stop narrowing to ${finder.parsed.time}`}
          onclick={() =>
            finder.removeWords((finder.parsed.time as string).split(" "))}
          type="button"><IconClose /></button
        ></span
      >
    {/if}
    {#if finder.searching}
      <span class="searching" aria-hidden="true"
        >{machineCount
          ? `Searching ${machineCount} machines…`
          : "Searching machines…"}<Spinner class="spin" /></span
      >
    {:else if finder.coverage?.asked && finder.missing.length === 0}
      <span class="covered num">All {machineCount} machines answered</span>
    {/if}
  </div>
{/snippet}

{#snippet saidSection()}
  {#if saidShown}
    <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
    <div
      class="group said"
      role="group"
      aria-label={`Where “${finder.saidFor}” was said`}
      data-flip
    >
      <div class="head">Where “{finder.saidFor}” was said</div>
      {@render whoChips()}
      {#if finder.missing.length > 0}
        <div class="coverage" data-flip>
          <span class="num">{answered} of {machineCount}</span> machines<span
            class="dot">·</span
          >{hueOfMissing} didn't<span class="dot">·</span><button
            class="link"
            onclick={() => finder.retry()}
            type="button">Retry</button
          >
        </div>
      {/if}
      {#if saidRows.length > 0}
        {#each phone ? [...saidRows].reverse() : saidRows as result (stopKey(result))}
          {@render rowFor(result, "said")}
        {/each}
      {:else if everyLate}
        <Skeleton class="skeleton-row reason" />
        <Skeleton class="skeleton-row reason" />
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet nothingHere()}
  <div class="nothing" data-flip>
    <p class="nothing-line">No sessions for “{finder.text.trim()}”</p>
    <button class="link" onclick={clear} type="button"
      >Open today's sessions</button
    >
  </div>
{/snippet}

{#snippet doorway()}
  {#if !phone}
    {@render waitingRow_()}
  {/if}
  {#snippet group(label: string, rows: Spoken[])}
    {#if rows.length > 0}
      <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
      <div class="group" role="group" aria-label={label} data-flip>
        <div class="head">{label}</div>
        {#each phone ? [...rows].reverse() : rows as result (stopKey(result))}
          {@render rowFor(result, "names")}
        {/each}
      </div>
    {/if}
  {/snippet}
  {#if phone}
    {@render group("Earlier", doorwayEarlier)}
    {@render group("Today", doorwayToday)}
  {:else}
    {@render group("Today", doorwayToday)}
    {@render group("Earlier", doorwayEarlier)}
  {/if}
  {#if namesLate && nameRows.length === 0}
    <div class="group" aria-hidden="true">
      <Skeleton class="skeleton-row" />
      <Skeleton class="skeleton-row" />
      <Skeleton class="skeleton-row" />
    </div>
  {/if}
  {#if phone}
    {@render waitingRow_()}
  {/if}
{/snippet}

{#snippet waitingRow_()}
  {#if waitingCount > 0}
    <button
      id={idOf("waiting")}
      class={["waiting-row", { phone }]}
      aria-selected={activeKey === "waiting"}
      data-active={activeKey === "waiting" ? "" : undefined}
      data-find-row
      data-flip
      onclick={() => pick("waiting")}
      onpointermove={() => hover("waiting")}
      role="option"
      tabindex="-1"
      type="button"
    >
      <NeedsYou class="waiting-glyph" aria-hidden="true" />
      <span class="waiting-label"
        >Waiting for you<span class="dot">·</span><span class="num"
          >{waitingCount}</span
        ></span
      >
      <ChevronRight class="fold-chev" aria-hidden="true" />
    </button>
  {/if}
{/snippet}

{#snippet findList()}
  <div
    bind:this={list}
    id={listId}
    class={["list kit-edge-fade-block", { phone }]}
    aria-label="Results"
    role="listbox"
    {@attach reflow()}
    {@attach highlight({ rows: "[data-find-row]", hovered: "data-active" })}
  >
    {#if !finder.typed}
      {@render doorway()}
    {:else if finder.nothing}
      {@render nothingHere()}
    {:else if phone}
      {@render saidSection()}
      {#if saidShown && (nameRows.length > 0 || goTo.length > 0)}<hr
          class="rule"
          data-flip
        />{/if}
      {@render namesSection()}
      {@render goToSection()}
    {:else}
      {@render goToSection()}
      {#if goTo.length > 0 && nameRows.length > 0}<hr
          class="rule"
          data-flip
        />{/if}
      {@render namesSection()}
      {@render saidSection()}
    {/if}
  </div>
{/snippet}

{#snippet waitingList()}
  <div class={["waiting-head", { phone }]}>
    <button
      class="back"
      aria-label="Back to find"
      onclick={() => finder.showFind()}
      type="button"><ChevronLeft /></button
    >
    <span class="waiting-title"
      >Waiting for you{#if waitingCount > 0}<span class="dot">·</span><span
          class="num">{waitingCount}</span
        >{/if}</span
    >
    <Segmented
      items={[
        { value: "age", label: "Age" },
        { value: "project", label: "Project" },
      ]}
      label="Sort"
      onchange={(value) => {
        finder.waitingSort = value;
      }}
      value={finder.waitingSort}
    />
  </div>
  <div
    bind:this={list}
    id={listId}
    class={["list kit-edge-fade-block", { phone }]}
    aria-label="Waiting for you"
    role="listbox"
    {@attach reflow()}
    {@attach highlight({ rows: "[data-find-row]", hovered: "data-active" })}
  >
    {#if finder.waiting.state === "ok" && waitingCount === 0}
      <div class="nothing">
        <p class="nothing-line">Nothing waits for you</p>
        <button class="link" onclick={() => finder.showFind()} type="button"
          >Open today's sessions</button
        >
      </div>
    {:else if finder.waiting.state === "asking" || finder.waiting.state === "idle"}
      <Skeleton class="skeleton-row" />
      <Skeleton class="skeleton-row" />
    {:else}
      {#each finder.waitingItems as item (`${item.kind}:${item.id}`)}
        {@const key = `wait:${item.kind}:${item.id}`}
        <FindRow
          id={idOf(key)}
          active={activeKey === key}
          now={finder.now}
          onhover={() => hover(key)}
          onpick={() => pick(key)}
          {phone}
          row={waitingRow(item, finder.now)}
        />
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet fault()}
  <div class="fault" role="alert">
    {#if finder.hubDown}
      Can't reach the hub. Nothing can be found until it's back.
    {:else}
      {finder.refused}.
    {/if}
    <button class="link" onclick={() => finder.retry()} type="button"
      >Retry</button
    >
  </div>
{/snippet}

<div class={["finder", { phone }]}>
  {#if !phone}
    {@render field_()}
  {/if}
  <div class="body">
    {#if finder.hubDown || finder.refused}
      {@render fault()}
    {:else}
      {#key finder.view}
        <div class="view" in:crossIn out:crossOut>
          {#if finder.view === "waiting"}
            {@render waitingList()}
          {:else}
            {@render findList()}
          {/if}
        </div>
      {/key}
    {/if}
  </div>
  {#if phone}
    {@render field_()}
  {:else}
    <div class="hints" aria-hidden="true">
      {#if finder.view === "waiting"}
        <span><kbd>↵</kbd> open</span><span><kbd>←</kbd> back</span><span
          ><kbd>esc</kbd></span
        >
      {:else if finder.stops.length > 0}
        <span><kbd>↵</kbd> {enterHint}</span>
        {#if finder.active?.type === "row" || (finder.active?.type === "goto" && finder.active.result.kind === "machine")}
          <span><kbd>→</kbd> peek</span>
        {/if}
        <span><kbd>esc</kbd></span>
      {:else}
        <span><kbd>esc</kbd></span>
      {/if}
    </div>
  {/if}
  <p class="sr-only" aria-live="polite">{announce}</p>
</div>

<style>
  .finder {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    max-block-size: 100%;
    color: var(--ink-strong);
  }
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
  }
  .view {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    flex: 1 1 auto;
  }

  /* The field: 44px, the search glyph leading, the clear trailing. */
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    block-size: 44px;
    padding-inline: var(--space-3) var(--space-1);
    border-block-end: 1px solid var(--border-hairline);

    & :global(.lead) {
      flex: none;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
    }
    & input {
      flex: 1;
      min-inline-size: 0;
      block-size: 100%;
      border: 0;
      padding: 0;
      background: none;
      font: var(--type-body);
      color: var(--ink-strong);
      caret-color: var(--brand-solid);
      outline: none;

      &::placeholder {
        color: var(--ink-subtle);
        text-overflow: ellipsis;
      }
    }
  }
  .field.phone {
    block-size: 52px;
    border-block-end: 0;
    border-block-start: 1px solid var(--border-hairline);

    & input {
      font-size: 16px;
    }
  }
  .clear {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  .field.phone .clear {
    inline-size: 44px;
    block-size: 44px;
  }

  /* The list: rows on the card's surface, scrolling under the house edge fade. */
  .list {
    isolation: isolate;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1);
    scrollbar-width: none;
  }
  .list.phone {
    justify-content: flex-end;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .rule {
    flex: none;
    margin: var(--space-1) calc(-1 * var(--space-1));
    border: 0;
    border-block-start: 1px solid var(--border-hairline);
  }
  .said {
    border-block-start: 1px solid var(--border-hairline);
    margin-inline: calc(-1 * var(--space-1));
    padding-inline: var(--space-1);
    margin-block-start: var(--space-1);
  }
  .said:first-child {
    border-block-start: 0;
    margin-block-start: 0;
  }

  /* A group's head: uppercase label (DESIGN.md, the slash and @ menu). */
  .head {
    display: flex;
    align-items: center;
    block-size: 28px;
    padding-inline: var(--space-3);
    font: var(--type-caps);
    text-transform: uppercase;
    letter-spacing: var(--track-caps);
    color: var(--ink-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* Who said it: filter chips on a 36px row, coverage at its end. */
  .chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
    min-block-size: 36px;
    padding-inline: var(--space-2);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    block-size: 24px;
    padding-inline: 9px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-muted);
    transition-property: background-color, color, border-color;

    &[aria-pressed="true"] {
      border-color: transparent;
      background: var(--brand-wash);
      color: var(--brand-ink);
    }
    @media (hover: hover) {
      &:not([aria-pressed="true"]):hover {
        background: var(--surface-hover);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      &:active {
        scale: var(--press-scale);
      }
      transition-property: background-color, color, border-color, scale;
    }
  }
  .chips.phone .chip {
    block-size: 32px;
    padding-inline: 12px;
    font-size: 15px;
  }
  .chip.word {
    border-color: transparent;
    background: var(--brand-wash);
    color: var(--brand-ink);
    padding-inline-end: 2px;
  }
  .chip-x {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: inherit;

    & :global(svg) {
      inline-size: var(--icon-sm);
      block-size: var(--icon-sm);
    }
  }
  .searching,
  .covered {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: auto;
    padding-inline-end: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .covered {
    color: var(--ink-subtle);
  }
  .searching :global(.spin) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .coverage {
    display: flex;
    align-items: center;
    block-size: 28px;
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .dot {
    padding-inline: 0.35em;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .link {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    color: var(--link-ink);
    cursor: pointer;

    &:active {
      opacity: 0.72;
    }
  }

  /* A one-line row: Waiting for you, a folded kind. 40px. */
  .waiting-row,
  .fold-row,
  .act {
    inline-size: 100%;
    border: 0;
    background: none;
    text-align: start;
  }
  .waiting-row,
  .fold-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    block-size: 40px;
    padding-inline: var(--space-3);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-row);
    cursor: default;

    &:active {
      background: var(--surface-fill);
    }
    & :global(svg) {
      flex: none;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .waiting-row.phone,
  .fold-row.phone {
    block-size: 52px;
    font-size: 16px;
  }
  .waiting-row :global(.waiting-glyph) {
    color: var(--status-attn-glyph);
  }
  .fold-row :global(.fold-glyph) {
    color: var(--status-idle-glyph);
  }
  .waiting-label,
  .fold-label {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  :global(.fold-chev) {
    color: var(--ink-muted);
  }
  @media (prefers-reduced-motion: no-preference) {
    .fold-row :global(.fold-chev) {
      transition: rotate var(--dur-toggle) var(--ease-in-out);
    }
  }
  .fold-row :global(.fold-chev.open) {
    rotate: 90deg;
  }
  .fold-body {
    display: flex;
    flex-direction: column;
  }
  .peek-slot {
    flex: none;
  }

  .acts {
    display: flex;
    flex-direction: column;
    margin-inline-start: calc(var(--space-3) + var(--icon-md) + var(--space-2));
    padding-inline-start: var(--space-3);
    border-inline-start: 1px solid var(--border-control);
    margin-block-end: var(--space-2);
  }
  .act {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: 32px;
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-row);
    cursor: default;

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
    }
    &:active {
      background: var(--surface-fill);
    }
  }

  .finder :global(.skeleton-row) {
    flex: none;
    block-size: 36px;
    margin: 8px var(--space-3);
  }
  .finder :global(.skeleton-row.reason) {
    block-size: 54px;
  }

  .nothing {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-3) var(--space-3) var(--space-4);
    font: var(--type-body);
  }
  .nothing-line {
    margin: 0;
    color: var(--ink-strong);
  }

  .fault {
    padding: var(--space-3);
    font: var(--type-body);
    color: var(--ink-strong);
  }

  /* Waiting for you, in the card's place. */
  .waiting-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    block-size: 44px;
    padding-inline: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--border-hairline);
  }
  .waiting-title {
    flex: 1;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .back {
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  .waiting-head.phone .back {
    inline-size: 44px;
    block-size: 44px;
  }
  .hints {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    block-size: 32px;
    padding-inline: var(--space-3);
    border-block-start: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-subtle);

    & kbd {
      font: inherit;
      color: var(--ink-muted);
    }
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
