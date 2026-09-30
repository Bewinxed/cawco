<script lang="ts">
  import type {
    HarnessKind,
    PermissionResult,
    SendRecord,
    SessionMessage,
  } from "@whiffle/core";
  /**
   * One conversation, whole: the identity header, the transcript (Chat) or its
   * graph (Flow), and the floating composer with any parked permission or
   * question stacked above it. Held per open tab by the session layout, so its
   * scroll offset and half-typed message survive a switch — nothing here
   * unmounts on navigation.
   *
   * The composer is not drawn here: the group draws one for all of its
   * conversations, so a tab switch or a swipe changes the transcript and
   * never the box being typed in. This pane lends that composer its session
   * (`composer-dock.svelte.ts`). Only the server's first paint, which has no
   * group composer yet, draws one here. The half-typed message is this
   * pane's either way — `draft` below.
   */
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { browser } from "$app/environment";
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group.
  import * as Resizable from "$lib/components/ui/resizable";
  import { IconAlert, IconChat, IconLaptop } from "$lib/icons";
  import {
    crossIn,
    crossOut,
    dur,
    easeOut,
    motionOk,
  } from "$lib/whiffle/motion/curves.svelte";
  import { waiting as departing, land } from "$lib/whiffle/motion/share.svelte";
  import AutopilotToggle from "./AutopilotToggle.svelte";
  import {
    blankSession,
    clearReadFault,
    clearRestore,
    type HistorySource,
    interrupt,
    latestCommandFor,
    loadMcpServers,
    openSession,
    type PendingPermission,
    pendingRestore,
    type ReadFault,
    refreshCommands,
    type SendExtras,
    type SessionState,
    selectionCommands,
    sendFailureNotice,
    streamHistory,
    submitCommand,
    whiffle,
  } from "./client.svelte";
  import { cleanDetail } from "./command-detail";
  import { mapTranscript, parkedAsks } from "./frames";
  import { delegateHandle } from "./links";
  import PreviewPane from "./preview/PreviewPane.svelte";
  import PreviewSheet from "./preview/PreviewSheet.svelte";
  import { clip, type SuggestCandidate, suggestions } from "./suggest.svelte";
  import Composer, { type Mention } from "./transcript/Composer.svelte";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import {
    type DraftContent,
    loadDraft,
    saveDraft,
  } from "./transcript/draft-store";
  import Prompt from "./transcript/Prompt.svelte";
  import { placeSends } from "./transcript/sends";
  import { settleInto } from "./transcript/settle";
  import Transcript from "./transcript/Transcript.svelte";
  import TranscriptSkeleton from "./transcript/TranscriptSkeleton.svelte";
  import {
    type ComposerBinding,
    composerBindings,
  } from "./workspace/composer-dock.svelte";
  import { rebuildScheduler } from "./workspace/scheduler.svelte";

  let {
    viewId,
    browsing,
    browsingCwd,
    browsingHarness,
    visible,
    focused,
    serverTail = null,
    serverHistory = null,
  }: {
    viewId: string;
    browsing: string | null;
    browsingCwd: string;
    browsingHarness: string;
    /** Whether this pane is on screen at all — governs row building. */
    visible: boolean;
    /**
     * Whether this pane is the one being worked in. Defaults to `visible`,
     * so a single-pane layout behaves exactly as it always has.
     */
    focused?: boolean;
    /**
     * The newest turns the SERVER read back, handed down by value.
     *
     * This used to be claimed from `page.data` under a `page.params.id ===
     * viewId` guard — which only worked while the URL was the thing that
     * decided which conversation was on screen. It no longer is. The layout
     * captures the page's data once per real navigation and gives it to the
     * one pane it was loaded for; every other pane reads its transcript over
     * the socket, exactly as a background tab always did.
     */
    serverTail?: unknown;
    /** Where the server said this conversation's transcript can be read from. */
    serverHistory?: Promise<HistorySource | null> | null;
  } = $props();

  const previewVisible = $derived(whiffle.previewVisible[viewId] === true);
  /** A named state stands in the middle of the transcript area. */
  const STATEFUL = "m-auto max-w-[46ch] px-[var(--space-6)]";
  let paneWidth = $state(0);
  let content = $state<HTMLDivElement>();
  let previewPane = $state<ReturnType<typeof Resizable.Pane>>();
  let savedWidth = 45;
  /**
   * The side preview's share of this pane's width, in percent, as the layout
   * has it this moment: 0 while it is closed or a sheet. What is left is the
   * transcript's, and the group's composer sits over exactly that much.
   */
  let previewShare = $state(0);
  let resizing = $state(false);
  const phone = $derived(paneWidth > 0 && paneWidth < 900);
  const previewOpen = $derived(whiffle.previews[viewId]?.state === "open");
  /**
   * The side preview beside the transcript, on screen or not. A pane going
   * off screen keeps its split: collapsing it there and opening it again on
   * the way back narrowed the transcript, the preview and the group's
   * composer over 300ms on every visit — the switch into or out of the tab
   * moved all three.
   */
  const desktopPreview = $derived(previewOpen && previewVisible && !phone);
  /**
   * The split is sliding: the reader is watching the preview open or close
   * beside the transcript, and the split's size change is the information.
   * Only then does `flex-grow` animate. A split sized any other way — off
   * screen, where no style is computed and a transition would start from a
   * stale size the frame the pane is shown, or out of its tool row, where
   * the surface clips open instead — takes its size at once.
   */
  let sliding = $state(false);
  let previewMounted = $state(false);
  /**
   * The side preview is opening out of its tool row
   * (motion/share.svelte.ts, `preview:<session>`): the split takes its width
   * in one frame and the surface clips open from the row's box over
   * --dur-panel on --ease-drawer, standing still while it does, so the two
   * never move at once. Opened any other way it slides in with the split.
   */
  let fromRow = $state(false);
  let sheetMounted = $state(false);
  $effect(() => {
    if (phone && previewOpen && visible) {
      sheetMounted = true;
      return;
    }
    const timer = setTimeout(
      () => {
        sheetMounted = false;
      },
      motionOk.current ? 300 : 1
    );
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const id = viewId;
    const stored = Number(localStorage.getItem(`whiffle.preview.width.${id}`));
    savedWidth = stored > 0 ? Math.min(70, stored) : 45;
  });
  $effect(() => {
    const open = desktopPreview;
    const pane = previewPane;
    if (!pane) {
      return;
    }
    if (open) {
      fromRow =
        untrack(() => !previewMounted) && departing(`preview:${viewId}`);
      previewMounted = true;
    }
    const seen = untrack(() => visible && !fromRow) && motionOk.current;
    sliding = seen;
    let settle = 0;
    // The size is this conversation's own (`savedWidth`); the split's
    // `minSize` holds the preview to its 320px floor, and re-applies it
    // whenever the pane's width changes.
    const frame = requestAnimationFrame(() => {
      if (open) {
        pane.resize(savedWidth);
      } else {
        pane.collapse();
      }
      settle = requestAnimationFrame(() => {
        fromRow = false;
      });
    });
    const slid = seen
      ? setTimeout(() => {
          sliding = false;
        }, 300)
      : undefined;
    const timer = open
      ? undefined
      : setTimeout(
          () => {
            previewMounted = false;
          },
          motionOk.current ? 300 : 1
        );
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settle);
      clearTimeout(slid);
      clearTimeout(timer);
    };
  });

  /** The newest turns the server read back, and the identity that names them. */
  interface ServerTail {
    cwd: string;
    harness: string;
    machineId: string;
    messages: SessionMessage[];
    /** The send records the read carried, by uuid: what places the reader's sends. */
    records: Record<string, SendRecord>;
    sessionId: string;
    viewId: string;
  }

  /** Why this pane has nothing to show, when it has nothing to show. */
  let failure = $state<ReadFault | null>(null);
  /** The hub answered 404: no row, no stored file, no machine that knows the id. */
  let missing = $state(false);
  /** The read finished, cleanly, with nothing in it — a transcript with no turns yet. */
  let empty = $state(false);
  /** Bumped by Retry: the one thing that re-runs the read after it has failed. */
  let attempt = $state(0);

  /**
   * Whether the hub holds this id as a running session. This, not the tab's
   * remembered context, is what decides the tense of the read: a live session
   * is subscribed to and its frames reconciled behind the history; a stored one
   * is only read. The old `browsing === null` test stood in for it and was
   * wrong for every live session opened from the sidebar, which arrived with a
   * context and so was never opened at all.
   */
  const isLive = $derived(whiffle.instances.some((row) => row.id === viewId));

  /**
   * Where the server said this conversation's transcript can be read from —
   * streamed with the page, so it is in hand before the socket is. The layout
   * hands it to the pane this navigation actually loaded; the others are open
   * tabs, not this navigation, and read over the socket instead.
   */
  const history = $derived<Promise<HistorySource | null> | null>(serverHistory);

  /**
   * Reads a conversation's history: one read, addressed by the id alone.
   *
   * The hub resolves the id — a live row to its SDK key, anything else to
   * whichever machine holds the file — so there is no stored read to try
   * first and no live read to fall back to. What used to be two reads and a
   * fleet-wide locate was also two chances to end with nothing in flight and
   * nothing on screen; now every way this ends is a named state.
   *
   * `source` is the server's descriptor when this pane is the one the URL
   * loaded, and carries the identity resolved from the hub's instance row.
   */
  async function readHistory(
    id: string,
    source: Promise<HistorySource | null> | null,
    hint: { machineId: string; cwd: string; harness: string } | null,
    running: boolean
  ): Promise<void> {
    const named = await source;
    const outcome = await streamHistory(
      named && named.viewId === id
        ? { ...named, live: named.live || running }
        : {
            viewId: id,
            machineId: hint?.machineId ?? "",
            // The rail row's real SDK key when it has one — never the view id
            // itself, and nothing at all when the row has not named one yet.
            // The store adopts this sessionId, and any later
            // revive/relaunch/rewind re-sends it as the resume key; an
            // instance id there becomes a bogus handle the hub then cements
            // into the row permanently. The read's own header names the key
            // when this is blank; the id tail stays for the read, which the
            // hub resolves on its own.
            sessionId:
              whiffle.instanceIndex.byId.get(id)?.sessionId ?? undefined,
            cwd: hint?.cwd ?? "",
            harness: hint?.harness as never,
            live: running,
          }
    );
    if (!outcome.ok) {
      // 404 is an answer, not a fault: nothing the hub or any machine holds
      // goes by this id. Retrying would ask the same question.
      if (outcome.status === 404) {
        missing = true;
      } else {
        const { ok: _ok, status: _status, ...fault } = outcome;
        failure = fault;
      }
      return;
    }
    // Skipped means another read already holds this view; its outcome is the
    // one that counts, and this one has nothing to say about emptiness.
    if (outcome.skipped) {
      return;
    }
    // A clean read of nothing. For a running session that is a conversation
    // that has not started, and the stream will say so when it does; for a
    // stored one it is the whole answer, and the skeleton would otherwise
    // wait for turns that are never coming.
    if (!running && (whiffle.session(id)?.messages.length ?? 0) === 0) {
      empty = true;
    }
  }

  // Bring the conversation into being: a stored session reads its transcript
  // back, a live one is opened (subscribed) and read back to what it said
  // before this tab joined.
  //
  // Deliberately untracked around the store. Both calls read AND write the
  // session's own `messages` / `loading`, so a plainly-tracked effect re-runs
  // itself on the transcript it just published; the URL this pane was opened
  // with, whether the hub holds it live, plus an explicit retry, are the only
  // things that should start a read.
  $effect(() => {
    const id = viewId;
    const cwd = browsingCwd;
    const harness = browsingHarness;
    const hint = browsing ? { machineId: browsing, cwd, harness } : null;
    const running = isLive;
    // biome-ignore lint/complexity/noVoid: read-only dependency — Retry bumps `attempt` purely to re-run this effect
    void attempt;
    if (!id) {
      return;
    }
    // Retry the read once the hub can actually answer. On a reload the effect
    // first runs while the socket is still reconnecting — a live session's
    // machineId isn't known yet and a stored read can't reach the socket.
    // Tracking the connection and the live session's machineId (neither
    // written by the read below) re-runs this the moment it becomes
    // answerable, so the transcript reads back instead of staying empty.
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs this effect once the hub or the session's machineId become known, per the comment above
    void whiffle.status;
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs this effect once the hub or the session's machineId become known, per the comment above
    void whiffle.session(id)?.machineId;
    untrack(() => {
      failure = null;
      missing = false;
      empty = false;
      // A running session is opened — hydrated from its row and subscribed to
      // — on every pass, and ahead of the guard below: the guard skips a pane
      // whose read landed before the hub's rows arrived, and that pane would
      // otherwise never subscribe. Opening is idempotent; reading is not.
      if (running || !hint) {
        openSession(id);
      }
    });
    // A pane the reader RETURNS to needs no re-read: the store kept ingesting
    // while the tab was hidden (only the transcript's row-building froze), so
    // re-reading replaced a full transcript with the tail chunk — content
    // collapsed, scrollTop clamped, the view lurched, and the follow rode the
    // rebuild. That was the tab-switch scroll hijack. The stream heals any gap
    // on its own.
    const held = whiffle.session(id);
    if (held?.initialized && held.messages.length > 0) {
      return;
    }
    // The server's answer for whichever conversation the URL names; a pane the
    // reader left open in another tab was never part of this navigation and
    // is read by its id like any other.
    const named = history;
    untrack(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — readHistory reports its outcome through the store fields this effect reads
      void readHistory(id, named, hint, running);
    });
  });

  /**
   * The newest turns, read at render time and shipped with the page. This is
   * what the SERVER paints: without it the first response carried an empty pane
   * and the conversation only appeared once the bundle had hydrated and the
   * stream had answered. Claimed by the pane the URL names, exactly as the
   * history descriptor above is.
   */
  const tail = $derived((serverTail as ServerTail | null) ?? null);

  /**
   * The conversation as a session, built from the page's own data.
   *
   * The whiffle store is a module singleton, so on the server it is shared by
   * every request — filling it in during a render would hand one reader's
   * transcript to the next. Nothing here touches it: this is request-local, it
   * renders the server's HTML and the client's first (hydrating) render, and it
   * is dropped the moment the real store session carries the conversation.
   */
  const seeded = $derived.by<SessionState | null>(() => {
    // Nothing read back means nothing to stand in for: the store's own empty
    // and loading states are better than a blank pane pretending to be one.
    // tail may be a deferred placeholder during SSR streaming (no .messages yet).
    if (!tail || tail.viewId !== viewId || tail.messages.length === 0) {
      return null;
    }
    const blank = blankSession(viewId);
    const mapped = mapTranscript(viewId, tail.messages);
    blank.machineId = tail.machineId;
    blank.cwd = tail.cwd;
    blank.sessionId = tail.sessionId ?? null;
    blank.harness = tail.harness as HarnessKind;
    // The harness's rows with the reader's sends placed among them by their
    // records: the one derive the store runs on the same read, so the rows
    // the server paints are the rows the store takes over.
    blank.harnessRows = mapped.messages;
    blank.records = tail.records;
    blank.messages = placeSends(mapped.messages, tail.records, []);
    blank.subagents = mapped.subagents;
    blank.initialized = blank.messages.length > 0;
    return blank;
  });

  /**
   * Whether the live store has taken this conversation over. A one-way latch:
   * the store session exists from the first effect (empty), and swapping to it
   * then would blank the transcript the server just painted. It earns the pane
   * once it has something to show — history read back, a turn in flight, or a
   * permission waiting.
   */
  let live = $state(false);
  $effect(() => {
    const held = whiffle.session(viewId);
    if (!held) {
      return;
    }
    if (held.messages.length > 0 || held.busy || held.pending.length > 0) {
      live = true;
    }
  });

  const session = $derived(live || !seeded ? whiffle.session(viewId) : seeded);
  const machineId = $derived(whiffle.session(viewId)?.machineId ?? "");

  /**
   * Whether the virtualized transcript may be shown.
   *
   * `live` above is the moment the STORE has the conversation, which is several
   * frames before the transcript can draw it: virtua mounts, measures its rows
   * (the scroll height doubles as it goes), and only then scrolls home. Swapping
   * on `live` alone therefore replaced the server's painted tail with a column
   * that was still being measured — a blank content area for those frames.
   *
   * So the two are handed over instead of swapped. The static tail stays on
   * screen, the transcript mounts *behind* it under `visibility: hidden` (which
   * still lays out and measures, unlike `display: none`), and this flips the
   * instant `Transcript` says it has landed. Both boxes are the same rect by the
   * `.tr` padding contract, so the flip moves nothing — and because it is one
   * assignment, the two are never both painted.
   */
  // No standin, no veil, no handover. The transcript renders directly from
  // the seeded session (server tail) on SSR via virtua's `ssrCount`, then
  // switches to live data when the WS delivers. Virtua owns the DOM from
  // the first frame — its SSR support renders the tail items as real DOM
  // nodes that hydrate in place.

  /**
   * A session the hub could not find anywhere: not in its rows, not in its
   * store, not on any machine it asked. There is nothing to subscribe to and
   * nothing to read back, so the pane says so instead of sitting empty. This
   * used to be inferred from a blank `machineId` once the rows had arrived,
   * which mistook every stored session still being located for a lost one;
   * now it is the hub's own 404.
   */
  const unaddressable = $derived(missing);

  /**
   * A stored transcript with no machine behind it: readable, not writable.
   *
   * A pane that had its history but no `machineId` used to render a live
   * composer — one that took keystrokes, refused them at the `!machineId`
   * guard, and said nothing. A transcript with words in it should still be
   * read; it just cannot be written to.
   */
  const readOnly = $derived(
    !isLive && !!session && !session.machineId && session.messages.length > 0
  );

  /**
   * What stopped the transcript arriving, from whichever side saw it. The
   * pane's own read reports through `failure`; a read the store started for
   * itself — a socket backfill, a peek — reports through the session's
   * `readFault`. Either one is a card with a button, never a skeleton.
   */
  const fault = $derived(failure ?? session?.readFault ?? null);

  /** The read finished and there is nothing in it: a named state, not a list. */
  const blank = $derived(empty && session?.messages.length === 0);
  /** Nothing to draw yet: the history is still on its way. */
  const waiting = $derived(
    !!session && !session.initialized && session.messages.length === 0
  );
  /**
   * The placeholder stays over a transcript that has mounted and not yet
   * drawn its rows. Transcript keeps its list unpainted until every row in
   * view is measured (its `.listing` gains `shown`), so dropping the
   * placeholder when the transcript mounts left the pane blank for those
   * frames. It stands from the pane's first frame until the first reveal,
   * and again whenever the read starts over.
   */
  let holding = $state(true);
  $effect.pre(() => {
    if (waiting) {
      holding = true;
    }
  });
  const veiled = $derived(
    !(fault || unaddressable || blank) && (waiting || holding)
  );

  /**
   * Whether the transcript may be built. On screen, at once. Off screen, a
   * history read landing used to build the whole transcript in the task
   * that delivered it — rows, virtualiser, every row's body, one flush of
   * up to 500ms at whatever moment the read came back. A pane nobody can
   * see builds it when its turn at the scheduler's slow tier comes round
   * instead, or the moment it is shown, whichever is first; built once, it
   * stays built.
   */
  let turned = $state(untrack(() => visible));
  const buildable = $derived(visible || turned);
  $effect(() => {
    if (visible) {
      turned = true;
    }
  });
  $effect(() => {
    if (turned || waiting) {
      return;
    }
    return rebuildScheduler.once(`land:${viewId}`, () => {
      turned = true;
    });
  });

  /**
   * Hears the transcript's list being drawn, and lets the placeholder go:
   * it fades over --dur-control on top of rows already in place, which is
   * the cross-fade, and nothing under it moves.
   */
  function reveals(node: HTMLElement) {
    const listing = node.querySelector(".listing");
    if (!listing) {
      return;
    }
    const check = () => {
      if (listing.classList.contains("shown")) {
        holding = false;
        watch.disconnect();
      }
    };
    const watch = new MutationObserver(check);
    watch.observe(listing, { attributes: true, attributeFilter: ["class"] });
    check();
    return () => watch.disconnect();
  }

  /**
   * A named state leaving under the one arriving: out of the flow where it
   * stands (crossOut) and held at its own height, so a state centred in the
   * area stays centred while it fades.
   */
  function leave(node: HTMLElement) {
    node.style.height = `${node.offsetHeight}px`;
    return crossOut(node);
  }

  /** What a read failure says: what went wrong, then what to do about it. */
  const faultLine = $derived(
    fault?.reason === "offline"
      ? `${fault.message} Try again once it is back online.`
      : `Reading it failed: ${fault?.message.replace(/\.$/, "")}. Try again; if it fails the same way, the hub's log has the cause.`
  );

  /** Try again: forget what was said about the last read, then read. */
  function retry(): void {
    clearReadFault(viewId);
    attempt += 1;
  }

  /**
   * The machine a read was refused for, as the fleet list says it is now.
   * Its return is the moment the read can be answered: the hub lists a
   * machine online once it has registered, and nothing else on this pane
   * moves when that happens — a hub restart left the pane saying "offline"
   * long after the machine was back.
   */
  const awayMachine = $derived(
    fault?.reason === "offline" ? fault.machineId : null
  );
  const awayOnline = $derived(
    awayMachine !== null &&
      whiffle.machines.some(
        (machine) =>
          machine.machineId === awayMachine && machine.status === "online"
      )
  );
  /** Whether that machine was online when last looked at: a return is a change to true. */
  let wasOnline: boolean | null = null;
  $effect(() => {
    const online = awayOnline;
    const machine = awayMachine;
    untrack(() => {
      if (machine === null) {
        wasOnline = null;
        return;
      }
      if (online && wasOnline === false) {
        retry();
      }
      wasOnline = online;
    });
  });

  // The header's MCP count wants a reading, and the composer's `/` menu wants
  // the descriptions; only a live session answers either.
  //
  // Untracked around the store, for the same reason the read effect above is:
  // both loaders read their own `commandsPending` / mcp guard AND write it, so a
  // plainly-tracked effect takes those flags as dependencies and re-runs itself
  // the instant the call it just fired flips them — on a session that can't
  // answer, the rejection clears the guard and the effect re-fires in a tight
  // loop (thousands of `supportedCommands … failed` a second). Only a change in
  // whether this pane addresses a live session, or the hub becoming reachable,
  // should start a load: a first run before the socket opens is refused, and
  // the MCP ask keeps that refusal as `[]`. `isLive` is the board's notion —
  // a sleeping row is on the board too — and a sleeping session has no process
  // to ask, so the gate is the running list.
  $effect(() => {
    const liveForCommands =
      !!session &&
      whiffle.runningInstances.some((row) => row.id === viewId) &&
      !!machineId &&
      whiffle.status === "connected";
    if (!liveForCommands) {
      return;
    }
    const id = viewId;
    const mid = machineId;
    untrack(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — each loader tracks its own pending guard
      void loadMcpServers(id, mid);
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — each loader tracks its own pending guard
      void refreshCommands(id, mid);
    });
  });

  const HARNESS_LABEL: Record<string, string> = {
    claude: "Claude Code",
    opencode: "opencode",
    code: "opencode",
    pi: "pi",
  };
  const agentName = $derived(
    HARNESS_LABEL[session?.harness ?? ""] ?? session?.harness ?? "Agent"
  );

  const instanceRow = $derived(whiffle.instanceIndex.byId.get(viewId));

  /** What `@` can name: the other conversations in the strip, and the machines. */
  const mentions = $derived<Mention[]>([
    ...whiffle.instances
      .filter((row) => row.id !== viewId)
      .slice(0, 40)
      .map((row) => ({
        handle: delegateHandle(row),
        label: delegateHandle(row),
        detail: row.title?.trim() || row.cwd,
      })),
    ...whiffle.machines.map((machine) => ({
      handle: machine.hostname || machine.machineId,
      label: machine.hostname || machine.machineId,
      detail: machine.status,
    })),
  ]);

  const commands = $derived(whiffle.commandsOf(viewId));

  /**
   * What the composer may suggest: the session's skills, its connected MCP
   * servers described by their tool names, and its tools. Whiffle's own
   * server is not one. The hub ranks and caps them by usage.
   *
   * Built when the suggestion chips first read it — to ask the hub about a
   * draft, or to draw its answer — not when the composer is handed this
   * conversation: every tab switch built the whole list, every skill, server
   * and tool, for chips that mostly had nothing to show.
   */
  const candidates = $derived.by((): SuggestCandidate[] => {
    const tooling = whiffle.toolingOf(viewId);
    const skills: SuggestCandidate[] = commands
      .filter((command) => command.type === "skill")
      .map((command) => ({
        id: `skill:${command.name}`,
        kind: "skill",
        name: command.name,
        description: clip(
          cleanDetail(command.description, undefined, command.source) ?? ""
        ),
      }));
    const servers: SuggestCandidate[] = tooling.servers
      .filter(
        (server) => server.status === "connected" && server.name !== "whiffle"
      )
      .map((server) => {
        // Tool names carry the server name with anything outside [A-Za-z0-9_-] as `_`.
        const prefix = `mcp__${server.name.replace(/[^A-Za-z0-9_-]/g, "_")}__`;
        return {
          id: `mcp:${server.name}`,
          kind: "mcp",
          name: server.name,
          description: clip(
            tooling.tools
              .filter((tool) => tool.startsWith(prefix))
              .map((tool) => tool.slice(prefix.length))
              .join(", ")
          ),
        };
      });
    // Every non-MCP tool by name alone; an MCP server's tools ride on its chip.
    // The hub drops the ones never worth pointing at.
    const tools: SuggestCandidate[] = tooling.tools
      .filter((tool) => !tool.startsWith("mcp__"))
      .map((tool) => ({
        id: `tool:${tool}`,
        kind: "tool",
        name: tool,
        description: "",
      }));
    return [...skills, ...servers, ...tools];
  });
  const suggest = {
    get candidates() {
      return candidates;
    },
  };

  /**
   * Every operator action on this conversation goes out as ONE tracked command
   * and reports back the id its stages are readable under. Nothing here wraps a
   * promise to invent a state: what the header, the cards and the composer draw
   * is the tracker's own account of the action, on both the stream path and the
   * legacy one (where the same calls run and their promises are the stages).
   */

  /**
   * A parked request's answer, as a command. The id goes back to the card that
   * asked, which is the only thing that reads it: several cards can be parked
   * at once and they all answer in the same kind.
   */
  function onanswer(
    request: PendingPermission,
    result: PermissionResult
  ): string | null {
    if (!machineId) {
      return null;
    }
    return submitCommand(request.instanceId, machineId, "permission.answer", {
      requestId: request.requestId,
      result,
    });
  }

  // A delegate's ask belongs to its parent, never the reader's queue.
  const parked = $derived<PendingPermission[]>(
    parkedAsks(session?.pending ?? [])
  );

  /** What this conversation has half-written, whichever composer draws it. */
  const draft = new ComposerDraft();

  /* ---- the draft across a reload ---------------------------------------
     Read back once when the pane opens, then written as it changes, at most
     every 250ms, and at once when the page goes away or the pane closes. A
     pane is mounted once per conversation (PaneHost keys it by id), so the
     id is fixed for its life. Nothing is written until the read has landed:
     the empty draft the pane starts with must not replace the stored one. */
  let draftLoaded = $state(false);
  $effect(() => {
    const id = viewId;
    untrack(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the read lands in the draft, and a refused read leaves the draft unstored rather than overwritten
      void loadDraft(id).then(
        (stored) => {
          // Words typed while the read was in flight are the newer ones.
          if (stored && !draft.hasContent) {
            draft.fill(stored);
          }
          draftLoaded = true;
        },
        () => {
          // No database: drafts do not start, so nothing is ever written.
        }
      );
    });
  });

  /** The draft as it should be stored, waiting for the next write. */
  let unwritten: DraftContent | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  function writeDraft(): void {
    clearTimeout(draftTimer);
    draftTimer = undefined;
    if (!unwritten) {
      return;
    }
    const next = unwritten;
    unwritten = null;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the next change writes again
    void saveDraft(viewId, next);
  }

  $effect(() => {
    if (!draftLoaded) {
      return;
    }
    // `keep` reads every stored piece, notes and attachments deeply, so any
    // change to them lands here and schedules a write.
    unwritten = draft.keep;
    draftTimer ??= setTimeout(writeDraft, 250);
  });

  $effect(() => {
    window.addEventListener("pagehide", writeDraft);
    return () => {
      window.removeEventListener("pagehide", writeDraft);
      writeDraft();
    };
  });

  // The hub took the send: the message it carried needs no keeping.
  $effect(() => {
    const stage = latestCommandFor(viewId, "send")?.stage;
    if (stage === "accepted" || stage === "applied") {
      untrack(() => draft.settle());
    }
  });

  $effect(() => {
    for (const { selectionIds, stage } of selectionCommands(viewId)) {
      if (stage === "accepted" || stage === "applied") {
        untrack(() => draft.acceptSelections(selectionIds));
      }
    }
  });

  /** Why this session's last send failed, said over its composer's field. */
  const sendFailure = $derived(sendFailureNotice(viewId));

  /**
   * "Edit" on a message that never sent: the store parks the whole payload in
   * this session's restore slot and the pane spends it here, back into the
   * draft. The row offering Edit is two components away from `draft`, so the
   * store is the channel; this is the far end of it.
   */
  $effect(() => {
    const slot = pendingRestore(viewId);
    if (!slot) {
      return;
    }
    const id = viewId;
    untrack(() => {
      draft.restore(slot.text, slot.extras);
      clearRestore(id);
    });
  });

  /** Whether this session's last message is out of this tab but not yet taken. */
  const sending = $derived(
    latestCommandFor(viewId, "send")?.stage === "submitted"
  );

  async function onsubmit(
    text: string,
    extras: SendExtras,
    id: string
  ): Promise<string | undefined> {
    if (!machineId) {
      // A tripwire, not a guard anybody should hit: a pane with no machine
      // renders no composer at all. A render race can still land one keystroke
      // here, so it stays — but loud in development, because the whole point of
      // this change is that a typed sentence never disappears without a word.
      if (import.meta.env.DEV) {
        console.warn("composer rendered without a machine", viewId);
      }
      return;
    }
    if (sending) {
      return;
    }
    // A message to a sleeping session wakes it on the hub, in the one path every
    // send takes, so this tab sends and nothing else. The hub's own refusal
    // ("machine X is not connected") becomes the command's failed stage — the
    // ledger is the report, which is why there is nothing to catch here.
    return await submitCommand(viewId, machineId, "send", { text, extras }, id);
  }

  /**
   * The queue-jump the shortcut sheet has promised all along (mod+Enter,
   * "Interrupt and send"): stop the turn in flight, then send — "do this
   * INSTEAD", where plain Enter's queue is "do this next". Two tracked
   * commands, deliberately: the interrupt's local half drops the working pill
   * at once, the send's echo renders at once, and any gap between the turn
   * dying and the message being taken is narrated by the queued row rather
   * than guessed at. On an idle session it is exactly a send.
   */
  function oninterruptsend(text: string, extras: SendExtras, id: string): void {
    if (!machineId || sending) {
      return;
    }
    if (session?.busy) {
      submitCommand(viewId, machineId, "interrupt", {});
    }
    onsubmit(text, extras, id);
  }

  function onstop(): void {
    // Through the tracker, not the bare legacy call: the record it leaves is
    // how the transcript recognises the coming `result.error` as the receipt
    // of THIS stop and renders "Interrupted" instead of a failure card.
    if (machineId) {
      submitCommand(viewId, machineId, "interrupt", {});
    }
  }

  /** The `/` menu opened: ask the session again what it offers. */
  function refreshMenu(): void {
    if (machineId) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget command menu refresh
      void refreshCommands(viewId, machineId);
    }
  }

  /** Whether this conversation takes messages from here at all. */
  const writable = $derived(
    !!session && !fault && !(unaddressable || readOnly)
  );

  /**
   * The room this pane's transcript keeps clear at its foot for the
   * composer standing over it: the composer's one-line box, the delegate
   * tray's row on it (kept whether or not a chip is in it), and the
   * suggestion row on that where the surface suggests (app.css
   * `--c-composer-panel`, `--c-tray-row`, `--c-suggest-room`). Everything
   * else the composer holds — a longer draft, attachments, a failed send's
   * line, the parked cards — stands over the transcript's foot and moves no
   * row. A conversation that cannot be written to has no composer.
   *
   * CSS, from this conversation's own state, not a measurement: it holds
   * while the pane is off screen and is the same when it comes on screen.
   * Measured off the group's one composer and copied down, the room was the
   * showing conversation's in every pane, and changed under the arriving
   * one after it had started to draw (the rows under a pinned tail moved
   * 35px as a switch's glide ended, when two tabs' trays differed).
   */
  const composerRoom = $derived(
    writable
      ? `var(--c-composer-panel) + var(--c-tray-row)${suggestions.enabled ? " + var(--c-suggest-room)" : ""}`
      : "0px"
  );

  /**
   * This conversation, as its group's composer sees it. Read through getters,
   * so the composer follows the session live while it is in front.
   */
  const binding: ComposerBinding = {
    draft,
    get busy() {
      return session?.busy ?? false;
    },
    get sending() {
      return sending;
    },
    get sendError() {
      return sendFailure;
    },
    get commands() {
      return commands;
    },
    get mentions() {
      return mentions;
    },
    get suggest() {
      return suggest;
    },
    get paneVisible() {
      return visible;
    },
    get previewPhone() {
      return phone;
    },
    get transcriptShare() {
      return (100 - previewShare) / 100;
    },
    get delegatesOf() {
      return viewId;
    },
    onsubmit,
    oninterruptsend,
    onmenu: refreshMenu,
    onstop,
    prompts: parkedPrompts,
    leading: autopilot,
  };

  $effect(() => {
    if (!(browser && writable)) {
      return;
    }
    const id = viewId;
    composerBindings.set(id, binding);
    return () => {
      if (composerBindings.get(id) === binding) {
        composerBindings.delete(id);
      }
    };
  });

  /**
   * The side preview mounting already open slides 25px in from the edge it
   * opens against and fades up (--dur-panel, --ease-out), the same move its
   * class transition makes when it opens later. Mounted closed, it waits for
   * that class. Reduced motion keeps the fade.
   */
  function surfaceIn(_node: Element): TransitionConfig {
    if (!desktopPreview || fromRow) {
      return { duration: 0 };
    }
    const still = !motionOk.current;
    return {
      duration: 280,
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; transform: translateX(${u * 25}px);`,
    };
  }
</script>

<!-- The composer's two slots, drawn by whichever composer is writing to this
     conversation: the one below on a desk, the deck's on a phone. -->
{#snippet autopilot()}
  <AutopilotToggle instance={instanceRow} instanceId={viewId} />
{/snippet}

<!-- A parked ask is drawn here only: the transcript leaves out the row of the
     call it gates until it is answered, and the card then settles into that
     row (transcript/settle.ts). -->
{#snippet parkedPrompts()}
  {#each parked as request (request.requestId)}
    <div class="parked" data-flip out:settleInto={request.toolUseId}>
      <Prompt onanswer={(result) => onanswer(request, result)} {request} />
    </div>
  {/each}
{/snippet}

<div class="pane" bind:clientWidth={paneWidth}>
  {#if session}
    <div
      class="session-content"
      bind:this={content}
      class:preview-shown={desktopPreview}
      class:resizing={resizing}
      class:sliding={sliding}
    >
      <Resizable.PaneGroup class="preview-group" direction="horizontal">
        <Resizable.Pane class="transcript-pane" defaultSize={100} minSize={30}>
          <div
            class="body"
            style="--composer-clearance: calc({composerRoom} + {phone && previewOpen ? 106 : 0}px + var(--space-4) + var(--space-4))"
          >
            <!-- The transcript area. Movement between conversations is owned by the
           pane above this one, so nothing here animates on a switch — this is
           the surface a swipe carries, not the thing that carries it. -->
            <div class="transcript-slide">
              <!-- A named state, not an empty pane: what happened, in one line,
                   and the one thing that can be done about it. -->
              {#if fault}
                <div class="state" in:crossIn out:leave>
                  <EmptyState
                    class={STATEFUL}
                    icon={fault.reason === 'offline' ? IconLaptop : IconAlert}
                    line={faultLine}
                    title={fault.reason === 'offline'
                ? 'This machine is offline'
                : "This transcript couldn't be read"}
                  >
                    {#snippet action()}
                      <Button onclick={retry} variant="outline"
                        >Try again</Button
                      >
                    {/snippet}
                  </EmptyState>
                </div>
              {:else if unaddressable}
                <div class="state" in:crossIn out:leave>
                  <EmptyState
                    class={STATEFUL}
                    icon={IconAlert}
                    title="This session isn't reachable from here"
                  >
                    {#snippet line()}
                      The hub has no record of <code>{viewId}</code>, and no
                      machine it can reach has a transcript filed under it. It
                      may live on a machine that is offline, or it may have been
                      deleted.
                    {/snippet}
                    {#snippet action()}
                      <Button href="/session" variant="outline"
                        >Back to the fleet</Button
                      >
                    {/snippet}
                  </EmptyState>
                </div>
              {:else if blank}
                <div class="state" in:crossIn out:leave>
                  <EmptyState
                    class={STATEFUL}
                    icon={IconChat}
                    line="The transcript was found and has no turns yet. Write the first message below."
                    title="Nothing has been said here yet"
                  />
                </div>
              {:else if !waiting && buildable}
                <div class="state" {@attach reveals}>
                  <Transcript {agentName} {focused} {session} {visible} />
                </div>
              {/if}
              {#if veiled}
                <div class="veil" in:crossIn out:crossOut>
                  <TranscriptSkeleton />
                </div>
              {/if}
            </div>

            <!-- The group draws the composer; only the server's first paint,
                 before any group composer exists, draws one here. -->
            {#if !fault && (unaddressable || readOnly)}
              <p class="readonly" in:crossIn out:crossOut>
                This transcript is stored; the session isn't reachable from
                here.
              </p>
            {:else if writable && !browser}
              <Composer
                busy={session.busy}
                {commands}
                delegatesOf={viewId}
                {draft}
                leading={autopilot}
                {mentions}
                {oninterruptsend}
                onmenu={refreshMenu}
                {onstop}
                {onsubmit}
                paneVisible={visible}
                previewPhone={phone}
                prompts={parkedPrompts}
                sendError={sendFailure}
                {sending}
                {suggest}
              />
            {/if}
          </div>
        </Resizable.Pane>
        <Resizable.Handle
          class={desktopPreview ? 'preview-divider' : 'preview-divider hidden'}
          onDraggingChange={(dragging) => { resizing = dragging; }}
        />
        <Resizable.Pane
          class="artifact-pane"
          collapsedSize={0}
          collapsible
          defaultSize={0}
          maxSize={70}
          minSize={paneWidth ? Math.min(70, 320 / paneWidth * 100) : 30}
          onResize={(size) => { previewShare = size; if (size > 0 && desktopPreview) { savedWidth = size; localStorage.setItem(`whiffle.preview.width.${viewId}`, String(size)); } }}
          bind:this={previewPane}
        >
          {#if previewMounted && !phone}
            <div
              class="artifact-surface"
              class:shown={desktopPreview}
              in:surfaceIn
              {@attach land(() => `preview:${viewId}`, { mode: 'clip', ms: dur('--dur-panel') })}
            >
              <PreviewPane
                instanceId={viewId}
                onescape={() => draft.closeSelectionEditor()}
                onselect={(selection) => draft.attach(selection)}
              />
            </div>
          {/if}
        </Resizable.Pane>
      </Resizable.PaneGroup>
      {#if sheetMounted && phone && visible}
        <PreviewSheet
          {content}
          instanceId={viewId}
          onescape={() => draft.closeSelectionEditor()}
          onselect={(selection) => draft.attach(selection)}
          open={previewOpen}
        />
      {/if}
    </div>
  {:else}
    <!-- No session in the store yet: the same placeholder the transcript
         area shows, so the two loading moments look like one. -->
    <TranscriptSkeleton />
  {/if}
</div>

<style>
  .session-content {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .session-content :global(.transcript-pane),
  .session-content :global(.artifact-pane) {
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  /* Opening or closing the preview in front of the reader grows one side
     into the other: the split's size change is the information. Opening
     decelerates into place; closing is a morph on --ease-in-out. Any other
     size — a drag following the pointer, a pane sized off screen — is taken
     at once (`sliding`). */
  @media (prefers-reduced-motion: no-preference) {
    .sliding :global(.transcript-pane),
    .sliding :global(.artifact-pane) {
      transition: flex-grow 300ms var(--ease-in-out);
    }
    .sliding.preview-shown :global(.transcript-pane),
    .sliding.preview-shown :global(.artifact-pane) {
      transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }
  }
  .artifact-surface {
    width: 100%;
    min-width: 320px;
    padding: var(--space-3);
    opacity: 0;
    transform: translateX(var(--space-7));
    transition: opacity var(--dur-panel) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-panel) var(--ease-out),
        transform var(--dur-panel) var(--ease-out);
    }
  }
  .artifact-surface.shown {
    opacity: 1;
    transform: translateX(0);
    transition-timing-function: var(--ease-out);
  }
  .session-content :global(.preview-divider) {
    z-index: 2;
    background: var(--border-hairline);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .session-content :global(.preview-divider.hidden) {
    display: none;
  }
  .resizing :global(iframe) {
    pointer-events: none;
  }
  .session-content :global(.preview-divider[data-active]) {
    background: var(--ink-muted);
  }
  @media (hover: hover) {
    .session-content :global(.preview-divider:hover) {
      background: var(--border-control);
    }
  }
  .body {
    min-width: 0;
  }

  /* The composer's slot, when there is no composer. Sits where the input would,
     in the muted voice of something stating a fact rather than refusing one. */
  .readonly {
    margin: 0 auto var(--space-4);
    padding: var(--space-2) var(--space-3);
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    text-align: center;
  }

  .pane {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    background: var(--surface-recess);
  }
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  /* ── Transcript slide ─────────────────────────────────────────────
     Only the transcript area slides on tab switch. Header and composer
     stay put. The entering transcript slides in from the tab direction,
     the exiting one slides out the opposite way. */
  .transcript-slide {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  /* One named state, or the transcript, filling the area. */
  .state {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  /* The placeholder, laid over the transcript until its rows are drawn:
     opaque, so fading it is the cross-fade, and above the transcript's own
     sticky notes, below the composer. */
  .veil {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    background: var(--surface-recess);
  }

  /**
   * The handover. The transcript is IN FLOW the whole time — it is the thing
   * that stays — so revealing it moves nothing; it is merely unpainted while it
   * measures. The server's tail is the one lifted out of flow and laid over it,
   * because both want to be `.body`'s whole box and two in-flow flex children
   * would take half each.
   */
  /* No standin — virtua renders the tail directly via ssrCount. */
</style>
