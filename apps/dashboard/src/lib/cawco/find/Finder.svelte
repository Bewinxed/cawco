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
  import Server from "~icons/solar/server-bold-duotone";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import Segmented from "../spawn/Segmented.svelte";
  import FindField from "./FindField.svelte";
  import FindPeek from "./FindPeek.svelte";
  import FindRow from "./FindRow.svelte";
  import type { FindMoment, FindResult, WaitingItem } from "./find-client";
  import { kindGlyph, kindNoun, rowOf, waitingRow } from "./find-rows";
  import {
    type FinderState,
    type GoTo,
    type MachineAct,
    type Opening,
    type Spoken,
    type Stop,
    WHO,
  } from "./finder-state.svelte";

  let {
    finder,
    phone = false,
    onopen,
    onopenwaiting,
    onmachine,
    onclose,
    field = $bindable(null),
    class: className,
  }: {
    finder: FinderState;
    phone?: boolean;
    /** Where it stands in its host (FinderCard: it fills Jump's sheet on a phone). */
    class?: string;
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

  // ---- Asks in flight ----
  /**
   * A section with nothing drawn yet stands placeholder rows from the frame
   * its ask goes out (owner: "there should be a placeholder while it's
   * loading and smoothly expand to what it should be"), so the card opens
   * at about the size of its answer and the answer lands in place; the
   * card's box follows any difference (HangCard's morph). A section that
   * has rows keeps them drawn while the next answer is asked.
   */
  const namesWaiting = $derived(
    finder.names.state === "asking" || finder.namesPending !== null
  );
  const everyWaiting = $derived(finder.searching);

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
      case "goto":
      case "moment":
      case "row":
        break;
    }
    const opening = finder.opening();
    if (opening) {
      onopen(opening);
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
  /**
   * What is being searched, counted only when there is something to count:
   * before the names answer says how many machines a find asks, or with no
   * machine to ask, it is the hub alone that searches (never "Searching 0
   * machines…").
   */
  const searchingWords = $derived(
    finder.askable > 0
      ? `Searching ${machines(finder.askable)}…`
      : "Searching the hub…"
  );

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
        units:
          namesWaiting && nameRows.length === 0 ? skeletons("names", 3) : [],
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
    if (nameUnits.length === 0 && namesWaiting) {
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
      if (said.units.length === 0 && everyWaiting) {
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
      return "Nothing can be searched until the hub is back.";
    }
    if (finder.nothing) {
      return `No sessions for “${finder.text.trim()}”`;
    }
    if (finder.searching) {
      return `${nameRows.length} found by name. ${searchingWords.replace("…", ".")}`;
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
  <!-- biome-ignore lint/a11y/useAriaActivedescendantWithTabindex: FindField renders a native input, which is tabbable already -->
  <FindField
    aria-activedescendant={activeKey ? idOf(activeKey) : undefined}
    aria-autocomplete="list"
    aria-controls={listId}
    aria-expanded="true"
    aria-label="Find a session, or a task, preview, decision"
    autocapitalize="off"
    autocomplete="off"
    enterkeyhint="go"
    onclear={clear}
    oninput={typedText}
    {onkeydown}
    {phone}
    placeholder="Find a session, or a task, preview, decision…"
    role="combobox"
    spellcheck="false"
    type="text"
    value={finder.text}
    bind:input={field}
  />
{/snippet}

{#snippet whoChips()}
  <div
    data-slot="chips"
    class="flex items-center flex-none flex-wrap gap-space-1 min-h-c-btn-h px-space-2"
    data-flip
    role="toolbar"
    aria-label="Who said it"
  >
    {#each WHO as who (who.value)}
      <button
        class="inline-flex items-center gap-space-row h-c-pill-h px-space-3 border border-border-control rounded-pill bg-surface-raised type-label text-ink-muted transition-property-[background-color,color,border-color] motion-safe:transition-property-[background-color,color,border-color,scale] aria-pressed:border-transparent aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover motion-safe:active:scale-(--press-scale) group-data-phone/finder:h-space-8"
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
      <span
        class="mark-line inline-flex items-center gap-space-row h-c-pill-h ps-space-3 pe-space-row border border-transparent rounded-pill bg-brand-wash type-label text-brand-ink transition-property-[background-color,color,border-color] motion-safe:transition-property-[background-color,color,border-color,scale] hover:bg-surface-hover motion-safe:active:scale-(--press-scale) group-data-phone/finder:h-space-8"
        data-flip="pop"
        ><span>{word}</span><button
          class="grid place-items-center size-icon-lg border-none border-current rounded-pill bg-transparent"
          aria-label={`Stop narrowing to ${word}`}
          data-box
          onclick={() => finder.removeWords([word])}
          type="button"><IconClose class="size-icon-sm" /></button
        ></span
      >
    {/each}
    {#if finder.parsed.time}
      {@const time = finder.parsed.time}
      <span
        class="mark-line inline-flex items-center gap-space-row h-c-pill-h ps-space-3 pe-space-row border border-transparent rounded-pill bg-brand-wash type-label text-brand-ink transition-property-[background-color,color,border-color] motion-safe:transition-property-[background-color,color,border-color,scale] hover:bg-surface-hover motion-safe:active:scale-(--press-scale) group-data-phone/finder:h-space-8"
        data-flip="pop"
        ><span>{time}</span><button
          class="grid place-items-center size-icon-lg border-none border-current rounded-pill bg-transparent"
          aria-label={`Stop narrowing to ${time}`}
          data-box
          onclick={() => finder.removeWords(time.split(" "))}
          type="button"><IconClose class="size-icon-sm" /></button
        ></span
      >
    {/if}
    {#if finder.searching}
      <span
        data-slot="searching"
        class="mark-line inline-flex items-center gap-space-2 ms-auto pe-space-1 type-meta text-ink-muted"
        aria-hidden="true"><span>{searchingWords}</span><Spinner /></span
      >
    {:else if finder.coverage?.asked && !short}
      <span
        data-slot="covered"
        class="inline-flex items-center gap-space-1 ms-auto pe-space-1 type-meta text-ink-subtle"
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
    <div data-slot="peek-slot" class="flex-none" data-flip>
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
      data-slot="acts"
      class="flex flex-none flex-col ms-(--acts-ms) ps-space-3 border-s border-s-border-control mb-space-2"
      aria-label={`${item.result.title}, what to do`}
      data-flip
      role="group"
    >
      {#each [["start", "Start a session here"], ["see", "See what runs here"]] as const as [act, label] (act)}
        {@const k = `${row}#${act}`}
        <button
          id={idOf(k)}
          class="mark-line flex items-center gap-space-2 w-full h-space-8 px-space-2 border-none border-current rounded-sm bg-transparent text-start type-label text-ink-row cursor-default active:bg-surface-fill"
          aria-selected={activeKey === k}
          data-active={activeKey === k ? "" : undefined}
          data-find-row
          onclick={() => onmachine(item.result, act)}
          onpointermove={() => hover(k)}
          role="option"
          tabindex="-1"
          type="button"
        >
          <Server
            class="size-icon-md text-ink-muted"
            aria-hidden="true"
            data-box
          /><span>{label}</span>
        </button>
      {/each}
    </div>
  {:else if item.t === "fold"}
    {@const first = item.entry.results[0] as FindResult}
    {@const Glyph = kindGlyph(first)}
    {@const open = finder.unfolded.has(item.key)}
    {@const count = item.entry.results.length}
    <button
      data-slot="fold-row"
      id={idOf(item.key)}
      class="mark-line flex items-center gap-space-2 flex-none w-full h-c-find-line-h px-space-3 border-none border-current rounded-sm bg-transparent text-start type-label text-ink-row cursor-default active:bg-surface-fill group-data-phone/finder:h-c-find-phone-h"
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
      <Glyph
        class="flex-none size-icon-md text-status-idle-glyph"
        aria-hidden="true"
      />
      <span class="flex-1 min-w-0 overflow-clip whitespace-nowrap text-ellipsis"
        ><span data-slot="num" class="num">{count}</span>
        {kindNoun(first, count)} match “{finder.asked}”</span
      >
      <ChevronRight
        class="flex-none size-icon-md text-ink-muted motion-safe:transition-[rotate] motion-safe:duration-(--dur-toggle) motion-safe:ease-in-out data-open:rotate-90"
        aria-hidden="true"
        data-box
        data-open={open || undefined}
      />
    </button>
  {:else if item.t === "waiting"}
    <button
      id={idOf("waiting")}
      class="mark-line flex items-center gap-space-2 flex-none w-full h-c-find-line-h px-space-3 border-none border-current rounded-sm bg-transparent text-start type-label text-ink-row cursor-default active:bg-surface-fill group-data-phone/finder:h-c-find-phone-h"
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
      <NeedsYou
        class="flex-none size-icon-md text-status-attn-glyph"
        aria-hidden="true"
        data-box
      />
      <span class="flex-1 min-w-0 overflow-clip whitespace-nowrap text-ellipsis"
        >Waiting for you<span class="px-space-1">·</span><span
          data-slot="num"
          class="num">{waitingCount}</span
        ></span
      >
      <ChevronRight
        class="flex-none size-icon-md text-ink-muted"
        aria-hidden="true"
        data-box
      />
    </button>
  {:else if item.t === "head"}
    <div
      data-slot="head"
      class="flex-none h-c-find-head-h px-space-3 type-caps leading-c-find-head-h uppercase tracking-caps text-ink-muted truncate"
      data-flip
      role="presentation"
    >
      {item.label}
    </div>
  {:else if item.t === "chips"}
    {@render whoChips()}
  {:else if item.t === "coverage"}
    <div
      data-slot="coverage"
      class="flex items-center flex-none h-c-find-head-h px-space-3 type-meta text-ink-muted"
      data-flip
    >
      {#if finder.missing.length > 0}
        <span data-slot="num" class="num"
          >{answered} of {machines(machineCount)}</span
        ><span class="px-space-1">·</span>{missingNames} didn't<span
          class="px-space-1">·</span
        >
      {/if}
      {#if finder.indexing.length > 0}
        {indexingNames}
        {finder.indexing.length === 1 ? "is" : "are"} still indexing<span
          class="px-space-1">·</span
        >
      {/if}
      <button
        class="border-none border-current p-0 bg-transparent text-link-ink active:opacity-72"
        onclick={() => finder.retry()}
        type="button">Retry</button
      >
    </div>
  {:else if item.t === "rule"}
    <hr
      data-slot="rule"
      class="flex-none my-space-1 -mx-space-1 border-t border-t-border-hairline border-r-none border-b-none border-l-none"
      data-flip
    />
  {:else if item.t === "skeleton"}
    <div
      data-slot="skeleton-slot"
      class="flex-none px-space-3 py-space-2"
      aria-hidden="true"
      data-flip
    >
      <Skeleton height={item.tall ? "reason-row" : "control"} />
    </div>
  {:else if item.t === "nothing"}
    <div
      data-slot="nothing"
      class="flex flex-none flex-col items-start gap-space-row pt-space-3 px-space-3 pb-space-4 type-body"
      data-flip
    >
      <p data-slot="nothing-line" class="m-0 text-ink-strong">
        No sessions for “{finder.text.trim()}”
      </p>
      <button
        class="border-none border-current p-0 bg-transparent text-link-ink active:opacity-72"
        onclick={clear}
        type="button">Open today's sessions</button
      >
    </div>
  {/if}
{/snippet}

{#snippet findList()}
  <div
    data-slot="list"
    bind:this={list}
    id={listId}
    class="kit-edge-fade-block isolate flex flex-col flex-auto min-h-0 overflow-y-auto overscroll-contain p-space-1 no-scrollbar group-data-phone/finder:justify-end"
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
  <div
    class="flex items-center gap-space-2 flex-none h-c-row-h ps-space-1 pe-space-2 border-b border-b-border-hairline"
  >
    <button
      class="grid place-items-center size-c-btn-h border-none border-current rounded-md bg-transparent text-ink-muted active:bg-surface-fill group-data-phone/finder:size-c-btn-h-lg"
      aria-label="Back to find"
      onclick={() => finder.showFind()}
      type="button"><ChevronLeft class="size-icon-md" /></button
    >
    <!-- The back control and the sort are boxes of their own; the title
         stands between them on .mark-text, its x-height on their middle. -->
    <span class="mark-text flex-1 type-label text-ink-strong"
      >Waiting for you{#if waitingCount > 0}<span class="px-space-1">·</span
        ><span data-slot="num" class="num">{waitingCount}</span>{/if}</span
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
    data-slot="list"
    bind:this={list}
    id={listId}
    class="kit-edge-fade-block isolate flex flex-col flex-auto min-h-0 overflow-y-auto overscroll-contain p-space-1 no-scrollbar group-data-phone/finder:justify-end"
    aria-label="Waiting for you"
    role="listbox"
    {@attach reflow()}
    {@attach highlight({ rows: "[data-find-row]", hovered: "data-active" })}
  >
    {#if finder.waiting.state === "ok" && waitingCount === 0}
      <div
        data-slot="nothing"
        class="flex flex-none flex-col items-start gap-space-row pt-space-3 px-space-3 pb-space-4 type-body"
        data-flip
      >
        <p data-slot="nothing-line" class="m-0 text-ink-strong">
          Nothing waits for you
        </p>
        <button
          class="border-none border-current p-0 bg-transparent text-link-ink active:opacity-72"
          onclick={() => finder.showFind()}
          type="button">Open today's sessions</button
        >
      </div>
    {:else if finder.waiting.state === "asking" || finder.waiting.state === "idle"}
      <div
        data-slot="skeleton-slot"
        class="flex-none px-space-3 py-space-2"
        aria-hidden="true"
        data-flip
      >
        <Skeleton height="control" />
      </div>
      <div
        data-slot="skeleton-slot"
        class="flex-none px-space-3 py-space-2"
        aria-hidden="true"
        data-flip
      >
        <Skeleton height="control" />
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

<div
  data-slot="finder"
  class={[
    "group/finder flex flex-col min-h-0 max-h-full text-ink-strong",
    className,
  ]}
  data-phone={phone || undefined}
  style:--acts-ms="calc(var(--space-3) + var(--icon-md) + var(--space-2))"
>
  {#if !phone}
    {@render field_()}
  {/if}
  <div data-slot="body" class="relative flex flex-col flex-auto min-h-0">
    {#if finder.hubDown || finder.refused}
      <!-- Where an answer's one line stands ("No sessions for …"): the
           list's own box and the line's, by the field on a phone too. -->
      <div
        data-slot="list"
        class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain p-space-1 no-scrollbar group-data-phone/finder:justify-end"
      >
        <div
          data-slot="nothing"
          class="flex flex-none flex-col items-start gap-space-row pt-space-3 px-space-3 pb-space-4 type-body"
          role="alert"
        >
          <p data-slot="find-fault" class="m-0 text-ink-strong">
            {#if finder.hubDown}
              Nothing can be searched until the hub is back.
            {:else}
              {finder.refused}.
            {/if}
          </p>
          <button
            class="border-none border-current p-0 bg-transparent text-link-ink active:opacity-72"
            onclick={() => finder.retry()}
            type="button">Retry</button
          >
        </div>
      </div>
    {:else}
      {#key finder.view}
        <div class="flex flex-col flex-auto min-h-0" in:crossIn out:crossOut>
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
    <div
      data-slot="hints"
      class="flex items-center gap-space-4 flex-none h-space-8 px-space-3 border-t border-t-border-hairline type-meta text-ink-subtle"
      aria-hidden="true"
    >
      {#if finder.view === "waiting"}
        <span><kbd class="font-body text-ink-muted">↵</kbd> open</span><span
          ><kbd class="font-body text-ink-muted">←</kbd> back</span
        ><span><kbd class="font-body text-ink-muted">esc</kbd></span>
      {:else}
        {#if finder.stops.length > 0}
          <span><kbd class="font-body text-ink-muted">↵</kbd> {enterHint}</span>
          {#if peekable}
            <span><kbd class="font-body text-ink-muted">→</kbd> peek</span>
          {/if}
        {/if}
        <span><kbd class="font-body text-ink-muted">esc</kbd></span>
      {/if}
    </div>
  {/if}
  <p class="sr-only" aria-live="polite">{announce}</p>
</div>
