<script lang="ts">
  /**
   * FIND IN A CONVERSATION: shaping frames (throwaway; this workspace lands
   * nothing). The real PaneTabs over real SessionPanes, each over a real
   * Transcript fed through the client's own state with no hub (head-tint's
   * bench), and find drawn in one of three shapes by `?shape=`:
   *
   * - `composer`: find takes the composer's place, in the composer's own
   *   pill: who said it as the transcript's two speaker marks, the words,
   *   the place and its steps where Send stands.
   * - `jump`: Jump's own card, narrowed to this conversation by a scope
   *   chip: every place a row, the transcript behind following the row.
   * - `head`: a row under the pane's tab, the conversation's own head:
   *   the field over the transcript's column, Jump's who-said chips, the
   *   place and its steps; the composer stays.
   *
   * The words are marked with the CSS Custom Highlight API: every place
   * washed, the one stepped to solid, without touching the rows' DOM.
   */
  import type { PulseFrame } from "@cawco/core/frames";
  import type { SessionPulse } from "@cawco/core/protocol";
  import { MINUTE_MS } from "@cawco/core/time";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import FindField from "#lib/cawco/find/FindField.svelte";
  import FindRow from "#lib/cawco/find/FindRow.svelte";
  import type { Row as FindRowData, Run } from "#lib/cawco/find/find-rows.js";
  import {
    crossIn,
    crossOut,
    dur,
    easeOut,
    motionOk,
    rise,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
    import { disclosureAt } from "#lib/cawco/transcript/disclosure.svelte.js";
  import { askOpenAt } from "#lib/cawco/transcript/open-at.svelte.js";
  import type { Message } from "#lib/cawco/types.js";
  import {
    composerBindings,
    composerOf,
  } from "#lib/cawco/workspace/composer-dock.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import {
    BarFloat,
    BarGlass,
    BarItem,
  } from "#lib/components/ui/bar-glass/index.js";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import HangCard from "#lib/components/ui/hang-card/hang-card.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconAgent,
    IconArrowDownDuotone,
    IconArtifactCanvas,
    IconChevronDown,
    IconChevronUp,
    IconClose,
    IconListRows,
    IconMoveTab,
    IconPaperclip,
    IconPlus,
    IconSearch,
    IconSend,
    IconStars,
    IconToolSearch,
    IconToolTerminal,
    IconUser,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import { benchClick, benchLeaf } from "../tab-bench";

  type Shape = "composer" | "jump" | "head";
  const shape = (page.url.searchParams.get("shape") ?? "composer") as Shape;
  const WORD = "ECONNRESET";
  /** `?in=caw`: the conversation in Caw's panel, docked beside the project page. */
  const inCaw = page.url.searchParams.get("in") === "caw";
  const AGENT = inCaw ? "Caw" : "Claude Code";

  const ids = [
    "f1d0c0de-0000-4000-8000-000000000001",
    "f1d0c0de-0000-4000-8000-000000000002",
    "f1d0c0de-0000-4000-8000-000000000003",
  ];
  const [, MAIN] = ids;
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "idle",
    [ids[1]]: "working",
    [ids[2]]: "idle",
  };

  const now = Date.now();
  const ago = (m: number) => new Date(now - m * MINUTE_MS).toISOString();

  type Said =
    | { k: "user" | "assistant" | "thinking"; at: number; text: string }
    | {
        k: "tool";
        at: number;
        name: string;
        input: Record<string, string>;
        out: string;
      };

  /** The conversation the frame finds in: a relay that gave up after sleep. */
  const RELAY: Said[] = [
    {
      k: "user",
      at: 182,
      text: "Since this morning, after the Mac wakes from sleep the dashboard shows ECONNRESET in the console and never reconnects. The tab strip keeps every machine at Unreachable until I reload. Can you find out why?",
    },
    {
      k: "thinking",
      at: 181,
      text: "The relay sorts socket errors into fatal and transient. An ECONNRESET landing in the fatal bucket would explain a socket that never retries after wake. Its close handler is where that is decided, so read relay.ts first, then reproduce with the relay's own test.",
    },
    {
      k: "assistant",
      at: 180,
      text: "I'll start where the relay's socket closes: its close handler decides whether to retry from the error's code. I'll reproduce it with the relay's test before changing anything.",
    },
    { k: "user", at: 176, text: "Go ahead, reproduce it first." },
    {
      k: "tool",
      at: 134,
      name: "Bash",
      input: {
        command: "bun test packages/hub/test/relay.test.ts -t 'sleep'",
        description: "Run the relay's sleep test",
      },
      out: `bun test v1.3.4
packages/hub/test/relay.test.ts:
✓ relay > reconnects after a clean close [12.41ms]
✓ relay > reconnects after the machine restarts [48.02ms]
✗ relay > reconnects after the host sleeps [5003.17ms]
  Error: read ECONNRESET
      at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
  expect(relay.state).toBe("open")
  Received: "closed"
      at packages/hub/test/relay.test.ts:188:31

 2 pass
 1 fail
Ran 3 tests across 1 file. [5.21s]`,
    },
    {
      k: "tool",
      at: 128,
      name: "Grep",
      input: { pattern: "fatal", path: "packages/hub/src/relay.ts" },
      out: `packages/hub/src/relay.ts:212:  if (code === "ECONNRESET" || code === "EPIPE") return fatal(code);
packages/hub/src/relay.ts:240:  return fatal("refused");`,
    },
    {
      k: "assistant",
      at: 121,
      text: "Reproduced. The relay treats ECONNRESET as fatal (relay.ts line 212), on the old reading that a reset means the machine refused us. After sleep it means the opposite: the Mac's TCP stack dropped every socket while it slept, and the first read after wake is a reset. The relay gives up and never asks again, which is why the tabs stay at Unreachable.\n\nThe fix: a reset is transient. Only a refused connection (`ECONNREFUSED`) after the machine says it is shutting down stays fatal.",
    },
    {
      k: "tool",
      at: 112,
      name: "Edit",
      input: { file_path: "packages/hub/src/relay.ts" },
      out: "ok",
    },
    {
      k: "tool",
      at: 110,
      name: "Bash",
      input: {
        command: "bun test packages/hub/test/relay.test.ts",
        description: "Run the relay's tests",
      },
      out: " 3 pass\n 0 fail\nRan 3 tests across 1 file. [4.87s]",
    },
    {
      k: "user",
      at: 82,
      text: "Does a phone switching from Wi-Fi to cellular take the same path? It throws ECONNRESET too, I think.",
    },
    {
      k: "tool",
      at: 79,
      name: "Bash",
      input: {
        command: "bun test packages/hub/test/relay.test.ts -t 'network change'",
        description: "Run the network change test",
      },
      out: `✓ relay > retries after the network changes [1042.88ms]
  reset (ECONNRESET) → retry in 1.0 s → open
 1 pass
 0 fail`,
    },
    {
      k: "assistant",
      at: 77,
      text: "It does, and it takes the fixed path now: the switch resets the socket, the relay retries a second later, and the phone's tabs come back without a reload. I added the case to the test so it stays that way.",
    },
    { k: "user", at: 40, text: "Commit it and write the release note line." },
    {
      k: "tool",
      at: 38,
      name: "Bash",
      input: {
        command:
          "git commit -am 'The relay retries a reset connection after sleep'",
        description: "Commit the fix",
      },
      out: "[ws/relay-sleep 4e1c9a2] The relay retries a reset connection after sleep\n 2 files changed, 31 insertions(+), 6 deletions(-)",
    },
    {
      k: "assistant",
      at: 37,
      text: 'Committed on the branch. The release note line: "Machines come back on their own after the Mac sleeps: the hub\'s relay no longer gives up on a connection reset (ECONNRESET), only on a machine that said it was shutting down."',
    },
    {
      k: "user",
      at: 12,
      text: "Now check the push probe still passes on the phone.",
    },
  ];

  /** The other tabs: short, so the strip reads as a real group. */
  const OTHER: Said[] = [
    {
      k: "user",
      at: 300,
      text: "Rebuild the token sheet from the resolver and check nothing drifted.",
    },
    {
      k: "assistant",
      at: 296,
      text: "Rebuilt. Two tokens moved: the hang shadow's room and the find row's height, both from edits made on main this morning.",
    },
  ];

  function history(id: string, said: Said[]): Message[] {
    return said.map((s, n) => {
      const base = { instanceId: id, timestamp: ago(s.at) };
      if (s.k === "tool") {
        return {
          ...base,
          id: `${id}-tool-${n}`,
          toolCallId: `${id}-call-${n}`,
          type: "tool.use",
          content: "",
          metadata: {
            toolName: s.name,
            toolInput: s.input,
            toolResult: s.out,
            toolStatus: "success",
          },
        } as Message;
      }
      return {
        ...base,
        id: `${id}-${s.k}-${n}`,
        type: s.k,
        content: s.text,
      } as Message;
    });
  }

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        frame: (frame: PulseFrame) => void;
        state: {
          sessions: Record<string, ReturnType<typeof blankSession>>;
        };
      };
    }
  ).__cawcoDebug;
  for (const id of ids) {
    const session = blankSession(id);
    session.machineId = "bench";
    session.cwd = "/home/bewinxed/cockpit";
    session.harness = "claude";
    session.messages = history(id, id === MAIN ? RELAY : OTHER);
    session.initialized = true;
    debug.state.sessions[id] = session;
    debug.frame({
      kind: "pulse",
      instanceId: id,
      pulse: {
        activity: DOING[id],
        at: now,
        busy: DOING[id] === "working",
        currentTool: null,
        instanceId: id,
        runningSubagents: 0,
      },
    });
  }

  const leaf = $state<LeafNode>(untrack(() => benchLeaf("find-shape", ids, "1")));

  const PLACE = 3;
  const PLACES = 8;

  // ── The places, as find steps through them ─────────────────────────────
  interface Place {
    /** Whose words: the person's, or the agent's (its reasoning and tools too). */
    by: "me" | "agent";
    /** The tool call whose fold it is in; null for words said in the open. */
    call: string | null;
    docId: string;
    /** The words just before the match, to tell this place's mark apart. */
    needle: string;
  }
  const allPlaces: Place[] = RELAY.flatMap((s, n): Place[] => {
    const text = s.k === "tool" ? s.out : s.text;
    const at = text.indexOf(WORD);
    if (at < 0) {
      return [];
    }
    return [
      {
        docId: s.k === "tool" ? `${MAIN}-tool-${n}` : `${MAIN}-${s.k}-${n}`,
        call: s.k === "tool" ? `${MAIN}-call-${n}` : null,
        by: s.k === "user" ? "me" : "agent",
        needle: text.slice(Math.max(0, at - 10), at),
      },
    ];
  });
  // ── The places, as Jump's rows draw them ───────────────────────────────
  const runsOf = (text: string): Run[] =>
    text
      .split(WORD)
      .flatMap((part, i) =>
        i === 0
          ? [{ matched: false, text: part }]
          : [
              { matched: true, text: WORD },
              { matched: false, text: part },
            ]
      )
      .filter((r) => r.text !== "");

  const cut = (text: string, room = 64): string => {
    const at = text.indexOf(WORD);
    const from = Math.max(0, at - room);
    const to = Math.min(text.length, at + WORD.length + room);
    return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/gu, " ")}${to < text.length ? "…" : ""}`;
  };

  /** A place's row face: who or what said it, and what kind of words. */
  function faceOf(s: Said): {
    glyph: FindRowData["glyph"];
    title: string;
    word: string;
  } {
    switch (s.k) {
      case "user":
        return { glyph: IconUser, title: "You", word: "Message" };
      case "assistant":
        return { glyph: IconAgent, title: AGENT, word: "Message" };
      case "thinking":
        return { glyph: IconStars, title: AGENT, word: "Reasoning" };
      default:
        return {
          glyph: s.name === "Grep" ? IconToolSearch : IconToolTerminal,
          title: `${s.name} output`,
          word: s.input.command ?? `${s.input.pattern} in ${s.input.path}`,
        };
    }
  }

  const placeRows: FindRowData[] = RELAY.flatMap((s, n) => {
    const text = s.k === "tool" ? s.out : s.text;
    if (!text.includes(WORD)) {
      return [];
    }
    const { glyph, title, word } = faceOf(s);
    const excerpt = cut(text);
    return [
      {
        at: now - s.at * MINUTE_MS,
        breathes: false,
        glyph,
        key: `place-${n}`,
        meta: [],
        reason: { source: "", parts: runsOf(excerpt) },
        secrets: [],
        spoken: `${title}: ${excerpt}`,
        state: { tone: "quiet" as const, word },
        title,
        titleParts: [{ matched: false, text: title }],
      },
    ];
  });

  // ── Marks ──────────────────────────────────────────────────────────────
  let stage = $state<HTMLElement | null>(null);

  function mark() {
    const root = stage?.querySelector<HTMLElement>(`[data-pane="${MAIN}"]`);
    if (!(root && "highlights" in CSS)) {
      return;
    }
    const all: Range[] = [];
    let current: Range | null = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      if (node.parentElement?.closest("[data-find-frame]")) {
        continue;
      }
      let at = text.indexOf(WORD);
      while (at >= 0) {
        const range = new Range();
        range.setStart(node, at);
        range.setEnd(node, at + WORD.length);
        const needle = currentPlace?.needle;
        if (
          current === null &&
          needle !== undefined &&
          text.slice(Math.max(0, at - needle.length), at) === needle
        ) {
          current = range;
        } else {
          all.push(range);
        }
        at = text.indexOf(WORD, at + WORD.length);
      }
    }
    if (shape === "composer" && !finding) {
      CSS.highlights.delete("find-place");
      CSS.highlights.delete("find-current");
      return;
    }
    CSS.highlights.set("find-place", new Highlight(...all));
    CSS.highlights.set(
      "find-current",
      current ? new Highlight(current) : new Highlight()
    );
  }

  // ── The composer's place, for the composer shape ────────────────────────
  let pill = $state<{ x: number; y: number; w: number; h: number } | null>(
    null
  );
  function measure() {
    const cin = stage?.querySelector<HTMLElement>(
      `[data-slot="dock"] [data-slot="cin"]`
    );
    if (!cin) {
      return;
    }
    const r = cin.getBoundingClientRect();
    pill = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (shape === "composer") {
      // The transcript's own Jump to latest stands down while find is open:
      // find's Back where you were is in its place.
      for (const span of stage?.querySelectorAll("button > span") ?? []) {
        if (span.textContent === "Jump to latest") {
          const button = span.parentElement as HTMLElement;
          button.style.visibility = finding ? "hidden" : "";
        }
      }
    }
    const pane = stage?.querySelector<HTMLElement>(`[data-pane="${MAIN}"]`);
    if (pane && stage) {
      paneTop =
        pane.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    }
  }
  let paneTop = $state(0);
  const bound = $derived(composerBindings.get(MAIN));

  let glass = $state<HTMLElement | null>(null);
  let glassRoom = $state(0);

  onMount(() => {
    if (shape !== "composer") {
      goTo(allPlaces[PLACE - 1]);
    }
    glass = document.querySelector<HTMLElement>("[data-bar-group]");
    if (glass && stage) {
      glassRoom =
        stage.getBoundingClientRect().right -
        glass.getBoundingClientRect().left;
    }
    // Marked and measured once a frame at most, never inside the mutation
    // that asked: the transcript's own motion runs on undisturbed.
    let asked = 0;
    const schedule = () => {
      if (asked === 0) {
        asked = requestAnimationFrame(() => {
          asked = 0;
          mark();
          measure();
        });
      }
    };
    const observer = new MutationObserver(schedule);
    if (stage) {
      observer.observe(stage, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    const tick = setInterval(schedule, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onkey);
    const opening =
      shape === "composer" ? setTimeout(openFind, 1200) : undefined;
    return () => {
      observer.disconnect();
      cancelAnimationFrame(asked);
      clearInterval(tick);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onkey);
      clearTimeout(opening);
      CSS.highlights.delete("find-place");
      CSS.highlights.delete("find-current");
      for (const id of ids) {
        delete debug.state.sessions[id];
      }
    };
  });

  const narrow = new MediaQuery("(max-width: 640px)");
  const phone = $derived(narrow.current);
  /** A narrow conversation (a phone, Caw's panel): the head takes two rows. */
  const compact = $derived(phone || inCaw);
  const draft = new ComposerDraft();

  let who = $state<"anyone" | "me" | "agent">("anyone");
  const WHO = [
    { value: "anyone", label: "Anyone" },
    { value: "me", label: "You" },
    { value: "agent", label: AGENT },
  ] as const;

  // ── The composer's find state ──────────────────────────────────────────
  /** Find grown out of the composer: Command-F opens it, Escape folds it back. */
  let finding = $state(shape !== "composer");
  /** The message being written, set aside while find is open. */
  const DRAFT = "Check the push probe next";
  let findField = $state<HTMLInputElement | null>(null);
  let attachOpen = $state(false);
  const shownPlaces = $derived(
    allPlaces.filter((p) => who === "anyone" || p.by === who)
  );
  /** The place stepped to, by its record. */
  let atDoc = $state(allPlaces[PLACE - 1].docId);
  const currentPlace = $derived(
    shownPlaces.find((p) => p.docId === atDoc) ?? shownPlaces[0]
  );
  const placeNo = $derived(
    currentPlace ? shownPlaces.indexOf(currentPlace) + 1 : 0
  );

  function goTo(place: Place | undefined) {
    if (!place) {
      return;
    }
    atDoc = place.docId;
    if (place.call) {
      disclosureAt(MAIN, place.call).set(true);
    }
    askOpenAt(MAIN, place.docId);
  }
  function step(by: 1 | -1) {
    const n = shownPlaces.length;
    if (n === 0) {
      return;
    }
    goTo(shownPlaces[(placeNo - 1 + by + n) % n]);
  }
  function openFind() {
    finding = true;
    goTo(currentPlace);
    queueMicrotask(() => findField?.focus());
  }
  function closeFind() {
    finding = false;
    // Back where you were: the conversation's newest turn.
    askOpenAt(MAIN, `${MAIN}-user-${RELAY.length - 1}`);
  }
  function onkey(event: KeyboardEvent) {
    if (shape !== "composer") {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openFind();
    } else if (event.key === "Escape" && finding) {
      event.preventDefault();
      closeFind();
    }
  }

  /** The glyph leaving a control's box as its next one comes in (Composer `glyphOut`). */
  function glyphOut(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; scale: ${1 - u * 0.75}; filter: blur(calc(var(--space-1) * ${u}))`,
    };
  }

  /** The head row's own height, so the transcript starts under it. */
  let headH = $state(0);
  const headTop = $derived(phone ? 0 : paneTop);
  const paneInset = $derived(
    shape === "head" && !inCaw ? Math.max(0, headTop + headH - paneTop) : 0
  );
</script>

<svelte:head>
  <title>Find in a conversation: {shape} | CawCo</title>
  <style>
    [data-shape="composer"] [data-slot="dock"] [data-slot="cin"] {
      visibility: hidden;
    }
    [data-shape] [data-marked]::before {
      opacity: 0;
    }
    [data-find-frame] [data-find-row][data-active] {
      background-color: var(--surface-hover);
    }
    [data-slot="hub-band-slot"] {
      display: none;
    }
    ::highlight(find-place) {
      background-color: var(--brand-wash);
      color: inherit;
    }
    ::highlight(find-current) {
      background-color: var(--brand-solid);
      color: var(--on-brand);
    }
  </style>
</svelte:head>

{#snippet placeStep()}
  <span
    data-slot="place"
    class="num flex-none type-label text-ink-muted tabular-nums"
    aria-live="polite">{placeNo} of {shownPlaces.length}</span
  >
  <button
    class="select-none grid place-items-center flex-none size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:bg-surface-hover active:bg-surface-fill"
    onclick={() => step(-1)}
    aria-label="Previous place"
    title="Previous place"
    type="button"><IconChevronUp class="size-icon-md" /></button
  >
{/snippet}

{#snippet chips()}
  <div
    class="flex items-center flex-none gap-space-1"
    role="toolbar"
    aria-label="Who said it"
  >
    {#each WHO as one (one.value)}
      <button
        class="select-none inline-flex items-center h-c-pill-h px-space-3 border border-border-control rounded-pill bg-surface-raised type-label text-ink-muted aria-pressed:border-transparent aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover"
        aria-pressed={who === one.value}
        onclick={() => {
          who = one.value;
        }}
        type="button">{one.label}</button
      >
    {/each}
  </div>
{/snippet}

{#snippet headRow()}
  <!-- The conversation's head: on a desk one row on the chosen tab's sheet;
       narrow (a phone's top bar, Caw's panel under its bar) the words, the
       place and Close in one row and who said it under them. -->
  <div
    data-find-frame
    class="pointer-events-auto flex flex-col bg-surface-recess border-b border-b-border-hairline"
    bind:offsetHeight={headH}
  >
    <div
      class="flex items-center gap-space-2 h-c-find-phone-h ps-(--head-x) pe-space-3"
      style:--head-x={compact ? "var(--space-4)" : "var(--space-7)"}
    >
      <label class="flex flex-auto items-center gap-space-2 min-w-0 h-full">
        <IconSearch
          class="flex-none size-icon-md text-ink-muted"
          aria-hidden="true"
        />
        <input
          class="flex-1 min-w-0 h-full border-none p-0 bg-transparent type-body text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
          aria-label="Find in this conversation"
          placeholder="Find in this conversation"
          value={WORD}
        />
      </label>
      {#if !compact}
        {@render chips()}
      {/if}
      <div class="flex items-center flex-none gap-space-1">
        {@render placeStep()}
        <button
          class="select-none grid place-items-center flex-none size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:bg-surface-hover"
          aria-label="Next place"
          onclick={() => step(1)}
          title="Next place"
          type="button"><IconChevronDown class="size-icon-md" /></button
        >
      </div>
      <button
        class="select-none grid place-items-center flex-none size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:bg-surface-hover"
        aria-label="Close find"
        title="Close find"
        type="button"><IconClose class="size-icon-md" /></button
      >
    </div>
    {#if compact}
      <div class="flex items-center px-space-4 pb-space-2">
        {@render chips()}
      </div>
    {/if}
  </div>
{/snippet}

{#if inCaw}
  <!-- Caw's panel docked beside the project page (CawFloat's docked card:
       12px radius, raised surface, the tile shadow), its bar floating over
       the conversation as ProjectConversation's does. -->
  <div
    bind:this={stage}
    data-shape={shape}
    class="absolute inset-0 flex justify-end bg-surface-shelf text-ink-strong"
  >
    <div
      class="relative flex min-h-0 w-c-panel-w m-space-6 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
    >
      <div
        class="relative flex h-full min-h-0 flex-auto flex-col"
        style:--bar-room="var(--c-top-bar-h)"
      >
        {#if shape === "head"}
          <div
            class="absolute inset-x-0 top-0 z-1 pt-(--c-top-bar-h) bg-surface-recess"
          >
            {@render headRow()}
          </div>
        {/if}
        <BarFloat tint="bg-surface-recess">
          {#snippet trailing()}
            <BarGlass form="group">
              <BarItem icon={IconListRows} label="Session details" />
              <BarItem icon={IconPlus} label="New conversation" />
              <BarItem icon={IconMoveTab} label="Open as a tab" />
            </BarGlass>
            <BarGlass form="group">
              <BarItem icon={IconClose} label="Hide Caw" />
            </BarGlass>
          {/snippet}
        </BarFloat>
        <div
          data-slot="well"
          data-pane={MAIN}
          class="relative flex min-h-0 flex-auto flex-col"
        >
          <SessionPane
            active
            browsing={null}
            browsingCwd=""
            browsingHarness={undefined}
            docked={{
              draft,
              headRoom:
                shape === "head"
                  ? `calc(var(--c-top-bar-h) + ${headH}px)`
                  : "var(--c-top-bar-h)",
            }}
            focused
            viewId={MAIN}
            visible
          />
        </div>
      </div>
    </div>
  </div>
{:else}
  <div
    bind:this={stage}
    data-shape={shape}
    class="@container/leaf pointer-events-none absolute inset-0 flex flex-col text-ink-strong"
    onclickcapture={benchClick(leaf)}
  >
    <div
      class="pointer-events-auto bg-surface-shelf"
      style:margin-inline-end="{glassRoom}px"
    >
      <PaneTabs {leaf} />
    </div>
    <div
      data-slot="stack"
      class="pointer-events-auto relative flex min-h-0 min-w-0 flex-auto overflow-hidden bg-surface-recess"
    >
      {#each ids as id (id)}
        {@const shown = leaf.active === id}
        <div
          data-slot="slot"
          class="absolute inset-x-0 bottom-0 flex data-hidden:pointer-events-none data-hidden:content-visibility-hidden"
          data-hidden={!shown || undefined}
          data-pane={id}
          style:top="{paneInset}px"
        >
          <SessionPane
            active={shown}
            browsing={null}
            browsingCwd=""
            browsingHarness="claude"
            focused={shown}
            viewId={id}
            visible={shown}
          />
        </div>
      {/each}
      {#if bound}
        <div data-slot="dock" class="pointer-events-none absolute inset-0 z-1">
          <Composer
            fleet={composerFleet}
            {...composerOf(bound)}
            showing={MAIN}
            trayRows={[]}
          />
        </div>
      {/if}
    </div>
    {#if shape === "head"}
      <div
        class="absolute inset-x-0 z-(--layer-dock)"
        style:top="{headTop}px"
      >
        {@render headRow()}
      </div>
    {/if}
  </div>
{/if}

{#if shape === "composer" && pill}
  <!-- The composer itself, in both its states: writing, and find grown out
       of it. Command-F grows a row out of the pill's top (unfold, the pill's
       edge on morph) with whose words and the place, the field's words
       cross to what is found, and Attach and Send turn into Previous and
       Next in their own boxes (Send's glyph swap). Escape folds it back and
       the message comes back as it was. -->
  <form
    data-find-frame
    data-finding={finding || undefined}
    class={dockShellVariants({
      class:
        "fixed z-(--layer-float) flex flex-col py-(--cin-pad) pe-(--cin-pad) ps-space-3",
    })}
    style:left="{pill.x}px"
    style:bottom="calc(100dvh - {pill.y + pill.h}px)"
    style:width="{pill.w}px"
    style:--cin-pad="var(--c-composer-inset)"
    aria-label={finding ? "Find in this conversation" : "Message the agent"}
    onsubmit={(event) => {
      event.preventDefault();
      if (finding) {
        step(1);
      }
    }}
    {@attach morph()}
  >
    {#if finding}
      <!-- Jump to latest, in find's state: the way back where you were and
           to the message set aside, a finger's Escape. -->
      <button
        class="select-none mark-line pressable absolute bottom-full start-1/2 -translate-x-1/2 mb-space-3 inline-flex items-center gap-space-2 h-c-btn-h-sm py-0 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-label font-medium text-ink-strong whitespace-nowrap hover:bg-surface-hover"
        onclick={closeFind}
        type="button"
        in:rise={"--dur-panel"}
        out:rise={"--dur-exit"}
      >
        <IconArrowDownDuotone class="size-icon-md" /><span
          >Back where you were</span
        >
      </button>
      <div
        class="flex items-center gap-space-2 pb-space-2 pe-space-1"
        transition:unfold
      >
        <div
          class="flex flex-none items-center gap-space-1"
          role="toolbar"
          aria-label="Whose words"
          in:crossIn
          out:crossOut
        >
          <button
            class="select-none grid place-items-center size-c-btn-h-sm rounded-sm border-none bg-transparent transition-opacity duration-(--dur-control) aria-pressed-false:opacity-40 hover:bg-surface-hover"
            aria-label="Your words"
            aria-pressed={who !== "agent"}
            title="Your words"
            onclick={() => {
              who = who === "me" ? "anyone" : "me";
            }}
            type="button"
            ><span
              class="grid place-items-center size-(--row-mark) rounded-row-mark bg-action-surface text-on-action"
              ><IconUser class="block size-(--row-mark-glyph)" /></span
            ></button
          >
          <button
            class="select-none grid place-items-center size-c-btn-h-sm rounded-sm border-none bg-transparent transition-opacity duration-(--dur-control) aria-pressed-false:opacity-40 hover:bg-surface-hover"
            aria-label={`${AGENT}'s words`}
            aria-pressed={who !== "me"}
            title={`${AGENT}'s words`}
            onclick={() => {
              who = who === "agent" ? "anyone" : "agent";
            }}
            type="button"
            ><span
              class="grid place-items-center size-(--row-mark-box) rounded-xs bg-brand-solid text-on-brand"
              ><IconAgent class="block size-icon-sm" /></span
            ></button
          >
        </div>
        <span
          data-slot="place"
          class="num ms-auto type-label text-ink-muted tabular-nums"
          aria-live="polite"
          in:crossIn
          out:crossOut>{placeNo} of {shownPlaces.length}</span
        >
      </div>
    {/if}
    <div class="flex items-center gap-space-2">
      <div class="grid flex-auto min-w-0">
        {#key finding}
          <input
            bind:this={findField}
            class="row-start-1 col-start-1 min-w-0 h-c-composer-field border-none p-0 bg-transparent type-body text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
            aria-label={finding ? "Find in this conversation" : "Message"}
            placeholder={finding
              ? "Find in this conversation"
              : "Message the agent… / for commands, @ to mention"}
            value={finding ? WORD : DRAFT}
            onkeydown={(event) => {
              if (event.key === "Enter" && finding) {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }
            }}
            in:crossIn
            out:crossOut
          />
        {/key}
      </div>
      <!-- Attach's own box (AttachButton's menu, where a session can draw):
           writing, its menu holds Find in this conversation, the way in for
           a pointer and a finger; finding, the same box steps back. -->
      <DropdownMenu.Root
        bind:open={
          () => attachOpen,
          (open) => {
            if (finding && open) {
              step(-1);
              return;
            }
            attachOpen = open;
          }
        }
      >
        <DropdownMenu.Trigger
          aria-label={finding ? "Previous place" : "Attach, draw or find"}
          class="flex-none grid"
          look="attach"
          title={finding ? "Previous place" : "Attach, draw or find"}
        >
          {#key finding}
            <span
              class="row-start-1 col-start-1 grid place-items-center motion-safe:animate-icon-swap motion-reduce:animate-icon-swap-still"
              out:glyphOut
            >
              {#if finding}<IconChevronUp class="size-icon-md" />{:else}<IconPlus
                  class="size-icon-md"
                />{/if}
            </span>
          {/key}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" side="top">
          <DropdownMenu.Item>
            <IconPaperclip />
            <span>Files and photos</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <IconArtifactCanvas />
            <span>Draw</span>
            <DropdownMenu.Shortcut>⌘⇧D</DropdownMenu.Shortcut>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={openFind}>
            <IconSearch />
            <span>Find</span>
            <DropdownMenu.Shortcut>⌘F</DropdownMenu.Shortcut>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <button
        class="select-none grid size-c-composer-field flex-none pressable place-items-center concentric-xs border-0 bg-(image:--action-surface) bg-action-solid text-on-action [&_svg]:size-icon-md"
        aria-label={finding ? "Next place" : "Send"}
        title={finding ? "Next place" : "Send"}
        onclick={() => finding && step(1)}
        type="button"
      >
        {#key finding}
          <span
            class="row-start-1 col-start-1 grid place-items-center motion-safe:animate-icon-swap motion-reduce:animate-icon-swap-still"
            out:glyphOut
          >
            {#if finding}<IconChevronDown />{:else}<IconSend />{/if}
          </span>
        {/key}
      </button>
    </div>
  </form>
{/if}

{#snippet placeList()}
  <div
    class="isolate flex flex-col flex-auto min-h-0 overflow-y-auto p-space-1 data-phone:justify-end"
    data-phone={phone || undefined}
    {@attach highlight({ rows: "[data-find-row]", hovered: "[data-active]" })}
    role="listbox"
    aria-label="Places in this conversation"
  >
    {#each placeRows as row, i (row.key)}
      <FindRow
        active={i === PLACE - 1}
        id={`find-place-${i}`}
        now={Date.now()}
        onpick={() => undefined}
        {phone}
        {row}
      />
    {/each}
  </div>
{/snippet}

{#snippet scope()}
  <div
    class="flex items-center flex-none flex-wrap gap-space-1 min-h-c-btn-h px-space-2 py-space-1"
  >
    <span
      class="mark-line inline-flex items-center gap-space-row h-c-pill-h ps-space-3 pe-space-row border border-transparent rounded-pill bg-brand-wash type-label text-brand-ink"
      ><span>In {inCaw ? "Caw's conversation" : "Fix the relay's reconnect"}</span
      ><button
        class="select-none grid place-items-center size-icon-lg border-none rounded-pill bg-transparent"
        aria-label="Find everywhere"
        type="button"><IconClose class="size-icon-sm" /></button
      ></span
    >
    {@render chips()}
  </div>
{/snippet}

{#if shape === "jump" && glass}
  <Popover.Root open>
    <HangCard
      align="end"
      anchor={glass}
      customAnchor={glass}
      forceMount
      frame="jump"
      glass
      onOpenAutoFocus={(event) => event.preventDefault()}
      side="bottom"
      sideOffset={0}
      strategy="fixed"
      trapFocus={false}
    >
      {#if phone}
        <!-- The phone's sheet: the same parts upside down, the field above
             the keyboard and the place nearest it (Finder, phone). -->
        <div
          data-find-frame
          class="group/finder flex flex-col w-[calc(100vw-var(--space-4))] h-[calc(100dvh-var(--c-top-bar-h)-var(--space-6))]"
          data-phone
        >
          <div
            class="flex-none h-c-find-head-h px-space-3 type-caps leading-c-find-head-h uppercase tracking-caps text-ink-muted"
          >
            {PLACES} places, newest nearest
          </div>
          {@render placeList()}
          {@render scope()}
          <FindField
            aria-label="Find"
            onclear={() => undefined}
            phone
            placeholder="Find"
            value={WORD}
          />
        </div>
      {:else}
        <div
          data-find-frame
          class="group/finder flex flex-col w-c-find-w max-h-[min(640px,calc(100dvh-var(--space-10)))]"
        >
          <FindField
            aria-label="Find"
            onclear={() => undefined}
            placeholder="Find a session, or a task, preview, decision…"
            value={WORD}
          />
          {@render scope()}
          <div
            class="flex-none h-c-find-head-h px-space-3 type-caps leading-c-find-head-h uppercase tracking-caps text-ink-muted"
          >
            {PLACES} places, oldest first
          </div>
          {@render placeList()}
          <p
            class="flex-none m-0 px-space-3 py-space-2 border-t border-t-border-hairline type-meta text-ink-subtle"
          >
            ↑↓ the conversation follows<span class="px-space-1">·</span>↵ stay
            there<span class="px-space-1">·</span>esc back where you were
          </p>
        </div>
      {/if}
    </HangCard>
  </Popover.Root>
{/if}
