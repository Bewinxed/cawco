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
   * Everything in the list is one keyed sequence (`items`), heads and chips
   * and rows and peeks alike, so a session that is there before a keystroke
   * and after it is the same element: it slides to its new place, rows that
   * leave close, rows that arrive are uncovered (motion/rows `reflow`, The
   * Nothing Jumps Rule). Nothing is destroyed and drawn again.
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
  import { reflow } from "../motion/rows.svelte";
  import Segmented from "../spawn/Segmented.svelte";
  import FindPeek from "./FindPeek.svelte";
  import FindRow from "./FindRow.svelte";
  import type { FindMoment, FindResult, WaitingItem } from "./find-client";
  import { kindGlyph, kindNoun, rowOf, waitingRow } from "./find-rows";
  import {
    type FinderState,
    type GoTo,
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
  /** A stop's element id. */
  const idOf = (key: string) => `${uid}-${key}`;
  const stopKey = (r: FindResult) => `${r.kind}:${r.id}`;

  // ---- Waits that outlast the grace (DESIGN.md, The Real Wait Rule) ----
  let namesLate = $state(false);
  let everyLate = $state(false);
  const namesWaiting = $derived(
    finder.names.state === "asking" || finder.namesPending !== null
  );
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
  /** The caret is in the words, not at their end: ← and → move it. */
  const inWords = (event: KeyboardEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    return input.selectionStart !== input.value.length;
  };

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
      case "ArrowRight":
        if (!inWords(event)) {
          event.preventDefault();
          finder.peek();
        }
        break;
      case "ArrowLeft":
        if (!inWords(event) && finder.fold()) {
          event.preventDefault();
        }
        break;
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
  const nameRows = $derived(finder.shownNameRows);
  const saidRows = $derived(finder.saidRows);
  const waitingCount = $derived(finder.waitingItems.length);
  const today = $derived.by(() => {
    const start = new Date(finder.now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  });

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
        finder.indexing.length > 0 ||
        finder.by !== null)
  );
  const machineCount = $derived(
    finder.coverage?.machines.length ?? finder.askable
  );
  const answered = $derived(
    (finder.coverage?.machines ?? []).filter((m) => m.answered).length
  );
  const missingNames = $derived(finder.missing.map((m) => m.name).join(", "));
  const indexingNames = $derived(
    finder.indexing.map((m) => m.name).join(" and ")
  );
  /** The coverage line stands when the answer is short: a machine missing, or one still indexing. */
  const short = $derived(
    finder.missing.length > 0 || finder.indexing.length > 0
  );
  const machines = (n: number) => (n === 1 ? "1 machine" : `${n} machines`);

  type Fold = Extract<GoTo, { type: "fold" }>;
  type Item =
    | { t: "waiting"; key: string }
    | { t: "head"; key: string; label: string }
    | { t: "chips"; key: string }
    | { t: "coverage"; key: string }
    | { t: "rule"; key: string }
    | { t: "row"; key: string; result: Spoken; section: "names" | "said" }
    | { t: "peek"; key: string; result: Spoken; row: string }
    | { t: "goto"; key: string; result: FindResult }
    | { t: "acts"; key: string; result: FindResult }
    | { t: "fold"; key: string; entry: Fold }
    | { t: "skeleton"; key: string; tall: boolean }
    | { t: "nothing"; key: string };
  /** A section: what stands at its head, then its units (a row and what hangs from it). */
  interface Section {
    key: string;
    lead: Item[];
    units: Item[][];
  }

  const rowUnit = (result: Spoken, section: "names" | "said"): Item[] => {
    const key = stopKey(result);
    const unit: Item[] = [{ t: "row", key, result, section }];
    if (finder.peeked === key) {
      unit.push({ t: "peek", key: `${key}#peek`, result, row: key });
    }
    return unit;
  };
  const gotoUnit = (result: FindResult): Item[] => {
    const key = stopKey(result);
    const unit: Item[] = [{ t: "goto", key, result }];
    if (result.kind === "machine" && finder.peeked === key) {
      unit.push({ t: "acts", key: `${key}#acts`, result });
    }
    return unit;
  };
  const skeletons = (section: string, n: number, tall = false): Item[][] =>
    Array.from({ length: n }, (_, i) => [
      { t: "skeleton", key: `skeleton:${section}:${i}`, tall },
    ]);

  function doorway(): Section[] {
    const recent = (label: string, rows: Spoken[]): Section => ({
      key: label,
      lead: rows.length > 0 ? [{ t: "head", key: `head:${label}`, label }] : [],
      units: rows.map((r) => rowUnit(r, "names")),
    });
    return [
      {
        key: "waiting",
        lead: [],
        units: waitingCount > 0 ? [[{ t: "waiting", key: "waiting" }]] : [],
      },
      recent(
        "Today",
        nameRows.filter((r) => (r.lastActivity ?? 0) >= today)
      ),
      recent(
        "Earlier",
        nameRows.filter((r) => (r.lastActivity ?? 0) < today)
      ),
      {
        key: "loading",
        lead: [],
        units: namesLate && nameRows.length === 0 ? skeletons("names", 3) : [],
      },
    ];
  }

  function typed(): Section[] {
    const goTo: Section = {
      key: "goto",
      lead: [],
      units: finder.goTo.map((entry) => {
        if (entry.type === "one") {
          return gotoUnit(entry.result);
        }
        const key = `fold:${entry.kind}`;
        const fold: Item = { t: "fold", key, entry };
        return finder.unfolded.has(key)
          ? [fold, ...entry.results.flatMap(gotoUnit)]
          : [fold];
      }),
    };
    let nameUnits = nameRows.map((r) => rowUnit(r, "names"));
    if (nameUnits.length === 0 && namesLate) {
      nameUnits = skeletons("names", 2);
    }
    const said: Section = { key: "said", lead: [], units: [] };
    if (saidShown) {
      said.lead.push(
        {
          t: "head",
          key: "head:said",
          label: `Where “${finder.saidFor}” was said`,
        },
        { t: "chips", key: "chips" }
      );
      if (short) {
        said.lead.push({ t: "coverage", key: "coverage" });
      }
      said.units = saidRows.map((r) => rowUnit(r, "said"));
      if (said.units.length === 0 && everyLate) {
        said.units = skeletons("said", 2, true);
      }
    }
    return [goTo, { key: "names", lead: [], units: nameUnits }, said];
  }

  /** The list, in drawn order: a hairline between sections that hold something. */
  const items = $derived.by((): Item[] => {
    if (finder.typed && finder.nothing) {
      return [{ t: "nothing", key: "nothing" }];
    }
    const sections = (finder.typed ? typed() : doorway()).filter(
      (s) => s.lead.length + s.units.length > 0
    );
    const ordered = phone ? [...sections].reverse() : sections;
    return ordered.flatMap((s, i) => [
      ...(i > 0 ? [{ t: "rule", key: `rule:${s.key}` } as Item] : []),
      ...s.lead,
      ...(phone ? [...s.units].reverse() : s.units).flat(),
    ]);
  });

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
  const peekable = $derived(
    finder.active?.type === "row" ||
      (finder.active?.type === "goto" &&
        finder.active.result.kind === "machine")
  );

  /** The peek's said line: asked, missing, or what came back. */
  function momentsState(result: Spoken) {
    if (result.kind !== "conversation") {
      return { state: "ok" as const };
    }
    const { machine } = result;
    if (finder.missing.some((m) => m.machineId === machine.id)) {
      return { state: "missing" as const, machine: machine.name };
    }
    if (finder.searching) {
      return { state: "asking" as const, machine: machine.name };
    }
    return { state: "ok" as const };
  }

  const announce = $derived.by(() => {
    if (finder.hubDown) {
      return "Can't reach the hub.";
    }
    if (finder.nothing) {
      return `No sessions for “${finder.text.trim()}”`;
    }
    if (finder.searching) {
      return `${nameRows.length} found by name. Searching ${machines(finder.askable)}.`;
    }
    if (finder.typed) {
      const gone = finder.missing.length
        ? ` ${missingNames} didn't answer.`
        : "";
      return `${nameRows.length + saidRows.length + finder.goTo.length} found.${gone}`;
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

{#snippet whoChips()}
  <div
    class={["chips", { phone }]}
    data-flip
    role="toolbar"
    aria-label="Who said it"
  >
    {#each WHO as who (who.value)}
      <button
        class="chip"
        aria-pressed={(finder.by ?? "anyone") === who.value}
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
      <span class="chip word mark-line" data-flip="pop"
        ><span>{word}</span><button
          class="chip-x"
          aria-label={`Stop narrowing to ${word}`}
          data-box
          onclick={() => finder.removeWords([word])}
          type="button"><IconClose /></button
        ></span
      >
    {/each}
    {#if finder.parsed.time}
      {@const time = finder.parsed.time}
      <span class="chip word mark-line" data-flip="pop"
        ><span>{time}</span><button
          class="chip-x"
          aria-label={`Stop narrowing to ${time}`}
          data-box
          onclick={() => finder.removeWords(time.split(" "))}
          type="button"><IconClose /></button
        ></span
      >
    {/if}
    {#if finder.searching}
      <span class="searching mark-line" aria-hidden="true"
        ><span>Searching {machines(finder.askable)}…</span><Spinner
          class="spin"
        /></span
      >
    {:else if finder.coverage?.asked && !short}
      <span class="covered"
        >{machineCount === 1
          ? "The machine answered"
          : `All ${machineCount} machines answered`}</span
      >
    {/if}
  </div>
{/snippet}

{#snippet item_(item: Item)}
  {#if item.t === "row"}
    <FindRow
      id={idOf(item.key)}
      active={activeKey === item.key}
      now={finder.now}
      onhover={() => hover(item.key)}
      onpeek={() => finder.togglePeek(item.key)}
      onpick={() => pick(item.key)}
      peekable={phone}
      peeked={finder.peeked === item.key}
      {phone}
      row={rowOf(
        item.result,
        finder.now,
        item.section === "said" ? "moment" : "name"
      )}
    />
  {:else if item.t === "peek"}
    <div class="peek-slot" data-flip>
      <FindPeek
        id={`${idOf(item.row)}-peek`}
        {activeKey}
        {idOf}
        keyOf={(i) => `${item.row}#m${i}`}
        moments={finder.peekMoments(item.result)}
        momentsState={momentsState(item.result)}
        now={finder.now}
        onopen={(moment) => openMoment(item.result, moment)}
        onretry={() => finder.retry()}
        {phone}
        result={item.result}
      />
    </div>
  {:else if item.t === "goto"}
    <FindRow
      id={idOf(item.key)}
      active={activeKey === item.key}
      now={finder.now}
      onhover={() => hover(item.key)}
      onpeek={() => finder.togglePeek(item.key)}
      onpick={() => pick(item.key)}
      peekable={phone && item.result.kind === "machine"}
      peeked={finder.peeked === item.key}
      {phone}
      row={rowOf(item.result, finder.now)}
    />
  {:else if item.t === "acts"}
    {@const row = stopKey(item.result)}
    <!-- biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (WAI-ARIA listbox); a fieldset groups form controls, not options -->
    <div
      class="acts"
      aria-label={`${item.result.title}, what to do`}
      data-flip
      role="group"
    >
      {#each [["start", "Start a session here"], ["see", "See what runs here"]] as const as [act, label] (act)}
        {@const k = `${row}#${act}`}
        <button
          id={idOf(k)}
          class="act mark-line"
          aria-selected={activeKey === k}
          data-active={activeKey === k ? "" : undefined}
          data-find-row
          onclick={() => onmachine(item.result, act)}
          onpointermove={() => hover(k)}
          role="option"
          tabindex="-1"
          type="button"
        >
          <Server aria-hidden="true" data-box /><span>{label}</span>
        </button>
      {/each}
    </div>
  {:else if item.t === "fold"}
    {@const first = item.entry.results[0] as FindResult}
    {@const Glyph = kindGlyph(first)}
    {@const open = finder.unfolded.has(item.key)}
    {@const count = item.entry.results.length}
    <button
      id={idOf(item.key)}
      class={["fold-row mark-line", { phone }]}
      aria-label={`${count} ${kindNoun(first, count)} match “${finder.asked}”, ${open ? "shown" : "folded"}`}
      aria-selected={activeKey === item.key}
      data-active={activeKey === item.key ? "" : undefined}
      data-find-row
      data-flip
      onclick={() => pick(item.key)}
      onpointermove={() => hover(item.key)}
      role="option"
      tabindex="-1"
      type="button"
    >
      <Glyph class="fold-glyph" aria-hidden="true" />
      <span class="fold-label"
        ><span class="num">{count}</span>
        {kindNoun(first, count)} match “{finder.asked}”</span
      >
      <ChevronRight
        class={open ? "fold-chev open" : "fold-chev"}
        aria-hidden="true"
        data-box
      />
    </button>
  {:else if item.t === "waiting"}
    <button
      id={idOf("waiting")}
      class={["waiting-row mark-line", { phone }]}
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
      <NeedsYou class="waiting-glyph" aria-hidden="true" data-box />
      <span class="waiting-label"
        >Waiting for you<span class="sep">·</span><span class="num"
          >{waitingCount}</span
        ></span
      >
      <ChevronRight class="fold-chev" aria-hidden="true" data-box />
    </button>
  {:else if item.t === "head"}
    <div class="head" data-flip role="presentation">{item.label}</div>
  {:else if item.t === "chips"}
    {@render whoChips()}
  {:else if item.t === "coverage"}
    <div class="coverage" data-flip>
      {#if finder.missing.length > 0}
        <span class="num">{answered} of {machines(machineCount)}</span><span
          class="sep">·</span
        >{missingNames} didn't<span class="sep">·</span>
      {/if}
      {#if finder.indexing.length > 0}
        {indexingNames}
        {finder.indexing.length === 1 ? "is" : "are"} still indexing<span
          class="sep">·</span
        >
      {/if}
      <button class="link" onclick={() => finder.retry()} type="button"
        >Retry</button
      >
    </div>
  {:else if item.t === "rule"}
    <hr class="rule" data-flip />
  {:else if item.t === "skeleton"}
    <div class="skeleton-slot" aria-hidden="true" data-flip>
      <Skeleton class={item.tall ? "skeleton-row tall" : "skeleton-row"} />
    </div>
  {:else if item.t === "nothing"}
    <div class="nothing" data-flip>
      <p class="nothing-line">No sessions for “{finder.text.trim()}”</p>
      <button class="link" onclick={clear} type="button"
        >Open today's sessions</button
      >
    </div>
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
    {#each items as item (item.key)}
      {@render item_(item)}
    {/each}
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
    <!-- The back control and the sort are boxes of their own; the title
         stands between them on .mark-text, its x-height on their middle. -->
    <span class="waiting-title mark-text"
      >Waiting for you{#if waitingCount > 0}<span class="sep">·</span><span
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
      <div class="nothing" data-flip>
        <p class="nothing-line">Nothing waits for you</p>
        <button class="link" onclick={() => finder.showFind()} type="button"
          >Open today's sessions</button
        >
      </div>
    {:else if finder.waiting.state === "asking" || finder.waiting.state === "idle"}
      <div class="skeleton-slot" aria-hidden="true" data-flip>
        <Skeleton class="skeleton-row" />
      </div>
      <div class="skeleton-slot" aria-hidden="true" data-flip>
        <Skeleton class="skeleton-row" />
      </div>
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

<div class={["finder", { phone }]}>
  {#if !phone}
    {@render field_()}
  {/if}
  <div class="body">
    {#if finder.hubDown || finder.refused}
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
      {:else}
        {#if finder.stops.length > 0}
          <span><kbd>↵</kbd> {enterHint}</span>
          {#if peekable}
            <span><kbd>→</kbd> peek</span>
          {/if}
        {/if}
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
  .rule {
    flex: none;
    margin: var(--space-1) calc(-1 * var(--space-1));
    border: 0;
    border-block-start: 1px solid var(--border-hairline);
  }

  /* A group's head: uppercase label (DESIGN.md, the slash and @ menu). */
  .head {
    flex: none;
    block-size: 28px;
    padding-inline: var(--space-3);
    font: var(--type-caps);
    line-height: 28px;
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
    flex: none;
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
    gap: 0.25em;
    color: var(--ink-subtle);
  }
  .searching :global(.spin) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .coverage {
    display: flex;
    align-items: center;
    flex: none;
    block-size: 28px;
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .sep {
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
    overflow: clip;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .list :global(.fold-chev) {
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
  .peek-slot,
  .skeleton-slot {
    flex: none;
  }

  .acts {
    display: flex;
    flex: none;
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

  /* A skeleton at the size of the row it stands for: 52px, or 70px with its reason. */
  .skeleton-slot {
    padding: 8px var(--space-3);
  }
  .finder :global(.skeleton-row) {
    block-size: 36px;
  }
  .finder :global(.skeleton-row.tall) {
    block-size: 54px;
  }

  .nothing {
    display: flex;
    flex: none;
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
