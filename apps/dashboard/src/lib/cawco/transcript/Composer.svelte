<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import type { AvailableCommand } from "@cawco/core/fleet";
  import { commonWords } from "@cawco/core/words/common";
  import { transcriptWords } from "@cawco/core/words/transcript";
  /**
   * The floating composer — a lifted shell holding the text input, the attach
   * and send controls. A parked permission or question is the composer
   * itself while it waits: it grows up into the ask. Home, this input and Stop are the surface's fixed anchors; the
   * action button is a single box that sends when idle and interrupts while a
   * turn is in flight. Ported from the mock's `.composer` / `.cin`.
   *
   * The shell does not change shape when it is focused. It used to grow and
   * re-round on click, which moved one of the three fixed anchors every time
   * the reader touched it; now there is one radius and one padding, and the
   * only thing that grows is the field itself (motion/autosize.svelte.ts).
   * Attach and send stay bottom-aligned, so they hold their position as the
   * text runs to a second and a third line.
   *
   * `/` and `@` are real: typing either opens a menu above the input, driven
   * from the field's own keyboard so focus never leaves the message being
   * written. The field is a MentionField (find/): an `@` pick is a chip in
   * it, on the finder's engine, and the draft stays one plain string with
   * each chip in its serialised form (`@<title> <handle>`), so a send, a
   * queued edit, recall and the drafts store carry it as text.
   */
  import { type Snippet, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { Button, sendVariants } from "#lib/components/ui/button/index.js";
  import { whileIdle } from "#lib/components/ui/button/pending-content.svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconChevronUp,
    IconRefresh,
    IconSend,
    IconStop,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { autosize } from "#lib/platform/motion/autosize.svelte.js";
  import {
    dur,
    easeOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { popOut } from "#lib/platform/motion/pop.svelte.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import type { ConversationFind } from "../find/conversation-find.svelte";
  import FindLayer from "../find/FindLayer.svelte";
  import FindLine from "../find/FindLine.svelte";
  import MentionField from "../find/MentionField.svelte";
  import { carriesFiles } from "../internal-drag";
  import type { SendExtras } from "../send-store";
  import { skillsOf } from "../skill-chips";
  import {
    loadSuggestSetting,
    type SuggestCandidate,
    suggestions,
  } from "../suggest.svelte";
  import AttachButton from "./AttachButton.svelte";
  import AttachmentChips from "./AttachmentChips.svelte";
  import { CanvasLink } from "./canvas-link.svelte";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import type { ComposerFleet } from "./composer-fleet";
  import { ComposerRecall } from "./composer-recall.svelte";
  import { ComposerSend } from "./composer-send.svelte";
  import { type ComposerFoot, DockFoot } from "./dock-foot.svelte";
  import { FieldFlight } from "./field-flight.svelte";
  import { landFocusRequests } from "./field-focus.svelte";
  import { FieldFold } from "./field-fold.svelte";
  import { FieldHint } from "./field-hint.svelte";
  import { FindDock } from "./find-dock.svelte";
  import { type ComposerAsk, GrownAsk } from "./grown-ask.svelte";
  import { HarnessStart } from "./harness-start.svelte";
  import { OfferStack, type TrayRow } from "./offer-stack.svelte";
  import { PressHold } from "./press-hold.svelte";
  import { QueuedEdit } from "./queued-edit.svelte";
  import { SlashMenu } from "./slash-menu.svelte";

  let {
    draft,
    agentName = "The agent",
    busy = false,
    sending = false,
    sendError = "",
    sendAgain = false,
    faultAgain,
    held = false,
    heldWhy = "Finish switching conversations before sending.",
    paneVisible = true,
    commands = [],
    mentionsFrom = null,
    onsubmit,
    onmenu,
    onstop,
    trayRows = [],
    showing = "",
    ask = null,
    planRing,
    onfoot,
    placeholder,
    note = "",
    label,
    suggest,
    recallOf,
    switchDir = 0,
    landing = { done: Promise.resolve(), ms: () => 0 },
    attach = true,
    lead,
    also,
    action,
    flush = false,
    fleet,
    find,
  }: {
    /**
     * The conversation's half-written message. The composer draws it and
     * writes into it; the conversation owns it, so a composer pointed at
     * another draft shows that conversation's words.
     */
    draft: ComposerDraft;
    /** The agent answering here, by name, for what the composer says about it. */
    agentName?: string;
    busy?: boolean;
    /**
     * Whether the last message this composer sent is still unacknowledged — out
     * of this tab, but not yet taken by the hub. `busy` is the AGENT's state and
     * arrives with the first frame of the turn; this is the gap in front of it,
     * and it is the only thing between one Enter and the next that can tell a
     * second send from a duplicate of the first.
     */
    sending?: boolean;
    /**
     * Why the last message this composer sent did not go through, said above
     * the field until the next one is sent; empty when nothing failed.
     */
    sendError?: string;
    /**
     * The failed send never reached the hub, and its words are back in the
     * field: the error line offers Send again, which sends them as Enter does.
     */
    sendAgain?: boolean;
    /**
     * What `sendError` says is a command of the session that failed (a
     * stop, a model change, an answer): the error line offers Try again,
     * which asks for it again.
     */
    faultAgain?: () => unknown;
    /**
     * A swipe is carrying the conversations under this composer. The action
     * button waits until one has landed, so nothing is sent to a chat that
     * is on its way off screen.
     */
    held?: boolean;
    /** What a send says while `held`, when its holder is not a swipe (New project with no machine online). */
    heldWhy?: string;
    paneVisible?: boolean;
    /** What this session offers behind `/`. */
    commands?: AvailableCommand[];
    /**
     * The conversation this composer writes to: `@` names what else the
     * hub finds by name (conversations, machines), ranked there as
     * the Jump palette is. Null: `@` names nothing here.
     */
    mentionsFrom?: string | null;
    /**
     * `id` is the uuid the message is sent under, minted here so the text can
     * fly into the row that carries it before the send has left.
     */
    onsubmit: (text: string, extras: SendExtras, id: string) => void;
    /** Fired when the `/` menu opens, so the session can be re-asked what it has. */
    onmenu?: () => void;
    onstop: () => void;
    /**
     * The row above the composer of each conversation it can be handed
     * (`TrayRow`); none on surfaces with no session behind them.
     */
    trayRows?: TrayRow[];
    /** Which of `trayRows` is drawn: the conversation being written to. */
    showing?: string;
    /** The ask parked on this conversation, which the composer grows into; none with none. */
    ask?: ComposerAsk | null;
    /**
     * How far the conversation's plan has got, as the control that opens it
     * (PlanRing), at the tray row's trailing end; none while it has no plan.
     */
    planRing?: Snippet;
    /** What it stands over the transcript's foot, told to the pane it is lent to. */
    onfoot?: (foot: ComposerFoot) => void;
    /**
     * The field's hint, for a surface whose agent takes no `/` or `@`: one
     * string where it fits every field, or its `full` words and the `short`
     * first part that fits any field, the field showing whichever its own
     * width holds on one line.
     */
    placeholder?: string | { full: string; short: string };
    /** A line over the field: what a message does in this conversation, before one is sent. */
    note?: string;
    /**
     * What the field is called, read out, where its placeholder is not its
     * name (New project's placeholder types examples): by default the hint
     * without its trailing ellipsis.
     */
    label?: string;
    /**
     * The session's skills and MCP servers, and its last reply, for the
     * suggestion chips. Absent on surfaces with no session behind them.
     */
    suggest?: { candidates: SuggestCandidate[] };
    /**
     * The conversation whose sent messages the composer recalls (↑, or a
     * held press on a touch screen), and whose queued
     * message it lifts out of the transcript to edit. Absent on surfaces
     * with no session behind them.
     */
    recallOf?: string;
    /**
     * Which way the tab strip moved when this composer was last handed
     * another conversation's draft: 1 to a tab on the right, -1 to one on
     * the left, 0 where there is no strip or no known side.
     */
    switchDir?: number;
    /**
     * The transcript's motion for that switch: the field keeps its height
     * until `done`, then glides to the new draft's; `ms` is how long the
     * motion has left.
     */
    landing?: { done: Promise<void>; ms: () => number };
    /**
     * Files and images can ride with the words: the attach control, and a
     * file pasted or dropped on the field. Off where what the words go to
     * takes words alone (a view asked of Caw, a new project's first words).
     */
    attach?: boolean;
    /**
     * A row inside the pill, above the field, across its width: what the
     * words are about (the comment composer's target chip). The field and
     * the controls stand under it as they always do. None on a session's
     * composer.
     */
    lead?: Snippet;
    /**
     * A second way to send, before the send glyph (the comment composer's
     * Hold): its own button, in the controls' row.
     */
    also?: Snippet;
    /**
     * The conversation's find (find/conversation-find): while it stands
     * open, its field grows on the pill's top over the message, which stays
     * where it is; closed, the caret goes back to the message. None where
     * the composer writes to no conversation.
     */
    find?: ConversationFind;
    /**
     * What the send glyph does here, as its label and its tooltip
     * ("Comment", "Reply"): where what is written does not go to the agent
     * at once, and so never turns into Stop. None on a session's composer.
     */
    action?: string;
    /**
     * It stands in a card or over a page's element, not over a transcript's
     * foot: its dock stands in its host's flow, as tall as it lays out, with
     * no dock foot under it, so its host is never sized from a measure.
     */
    flush?: boolean;
    /**
     * What it reads of the fleet, and the parts a conversation's composer
     * shows (composer-fleet.ts): handed in by every composer in the app,
     * which `trayRows`, `ask`, `recallOf`, `suggest`, `commands` and
     * `/mcp auth` need. None on a comment's reply, which loads none of it.
     */
    fleet?: ComposerFleet;
  } = $props();

  /** The hub this composer reads: the live client's, or a states file's stand-in. */
  const hub = untrack(() => fleet)?.hubSeam();
  $effect(() => {
    if (suggest && hub) {
      loadSuggestSetting(hub);
    }
  });

  /** A chip's sentence goes on the end of the draft, caret after it. */
  async function insertSuggestion(line: string) {
    const typed = draft.text.trimEnd();
    draft.text = typed ? `${typed} ${line}` : line;
    await tick();
    field?.focus();
    mentionField?.select(draft.text.length);
  }

  /** What the composer stands over the transcript's foot, told to the pane it is lent to. */
  const dockFoot = new DockFoot({
    askRise: () => grown.askRise,
    finding: () => findDock.finding,
    findHeight: () => findDock.findLineH + findDock.findLayerH,
    onfoot: () => onfoot,
    paneVisible: () => paneVisible,
    stack: () => offerStack.stack,
  });

  /** The field (MentionField's editable box), and the MentionField, whose caret is in the draft's offsets. */
  let field = $state<HTMLDivElement | null>(null);
  let mentionField = $state<ReturnType<typeof MentionField>>();
  /** The session's skills, which its field draws as chips (the fleet's SkillChip). */
  const skills = $derived(
    fleet ? { chip: fleet.SkillChip, named: skillsOf(commands) } : null
  );
  /** A phone's @ menu: its rows wrap, and it drags down to go. */
  const phone = new MediaQuery(NARROW_QUERY);

  /** The field's hint: the full words where its own width holds them, else their first part. */
  const fieldHint = new FieldHint({
    label: () => label,
    placeholder: () => placeholder,
  });
  /** The suggestion row, for Tab and Shift+Tab. */
  let chips = $state<ReturnType<ComposerFleet["SuggestionChips"]>>();

  landFocusRequests({
    draft: () => draft,
    field: () => field,
    focused: (value) => {
      fieldFold.focused = value;
    },
    mentionField: () => mentionField,
  });

  /**
   * The composer arriving where a read-only note stood (and back): the two
   * cross-fade over --duration-control and the composer rises --pop-rise into place.
   * Reduced motion keeps the fade.
   */
  function rise(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      duration: dur("--duration-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; translate: 0 calc(var(--pop-rise) * ${u})`,
    };
  }
  /**
   * The send/stop glyph that is being replaced goes out as the new one comes
   * in (`icon-swap`), the two sharing the button's one grid cell: it shrinks
   * to 0.25 into a 4px blur as it fades. Reduced motion keeps the fade, with
   * no scale and no blur (DESIGN.md's Reduced Motion Rule).
   */
  function glyphOut(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      duration: dur("--duration-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; scale: ${1 - u * 0.75}; filter: blur(calc(var(--spacing-space-1) * ${u}))`,
    };
  }
  function fade(_node: Element): TransitionConfig {
    return {
      duration: dur("--duration-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /**
   * A minimized question's bar comes into the tray row once the card's
   * fold (--duration-grow-exit) has landed, so the two never stand in one place
   * at once: the fold speeds up as it goes and only crosses the tray row in
   * its last frames (measured at 390: 210 of its 220ms). It comes up --pop-rise
   * out of a --part-blur blur over --duration-control, as the card's own parts come up
   * (Prompt `.part`). Reduced motion keeps the fade, with no wait.
   */
  function askedIn(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      delay: still ? 0 : dur("--duration-grow-exit"),
      duration: dur("--duration-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; translate: 0 calc(var(--pop-rise) * ${u}); filter: blur(calc(var(--part-blur) * ${u}))`,
    };
  }
  /** The bar gives way to the card growing over it: a fade over --duration-exit. */
  function askedOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--duration-exit"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }

  /* ---- the `/` and `@` menu ------------------------------------------- */

  const menu = new SlashMenu({
    commands: () => commands,
    draft: () => draft,
    field: () => field,
    mentionField: () => mentionField,
    onmenu: () => onmenu?.(),
  });

  /** Another conversation's words take the field's place: flown over it, the field's height held and then glided. */
  const swap = new FieldFlight({
    draft: () => draft,
    field: () => field,
    folds: (whole) => fieldFold.folds(whole),
    landing: () => landing,
    switchDir: () => switchDir,
  });

  function noteCaret(event: Event): void {
    menu.noteCaret();
    if (event.type === "input") {
      sender.sendBlock = "";
      if (canvas.room) {
        canvas.room.error = "";
      }
      draft.notice = "";
      sender.draftNote = "";
    }
  }

  /** A session whose start failed, said over the composer with its way on. */
  const start = new HarnessStart({
    fleet: () => fleet,
    recallOf: () => recallOf,
  });

  /** The words sent, and what is said over the field about it. */
  const sender = new ComposerSend({
    busy: () => busy,
    canvasChip: () => canvas.canvasChip,
    dismissMenu: () => {
      menu.dismissed = true;
    },
    draft: () => draft,
    field: () => field,
    fleet: () => fleet,
    held: () => held,
    heldWhy: () => heldWhy,
    onstop,
    onsubmit,
    room: () => canvas.room,
    sendError: () => sendError,
    sending: () => sending,
  });

  /**
   * Tab adds the most likely suggestion chip, Shift+Tab all of them — only
   * while chips are shown and nothing is selected, so Tab keeps moving focus
   * everywhere else. True when a chip was added.
   */
  function chipKey(event: KeyboardEvent): boolean {
    const [from, to] = mentionField?.selection() ?? [0, 0];
    if (
      event.key === "Tab" &&
      from === to &&
      chips?.take(event.shiftKey ? "all" : "first")
    ) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  function onkeydown(event: KeyboardEvent): void {
    // While the wheel is up its keys are its own; what it leaves (a key
    // typed into a draft of your own, any key once it is folding away)
    // reaches the field as usual.
    if (canvas.key(event)) {
      return;
    }
    if ((recalling.recall && recalling.wheel?.key(event)) || recallKey(event)) {
      return;
    }
    // BEFORE the menu: mod+Enter sends what is written as it stands, a
    // half-picked menu included; the submit itself dismisses the menu. It is
    // "interrupt and send": on a busy session it stops the turn (the Stop
    // control's `onstop`) and then sends; on an idle one it is Enter's send.
    // Enter never stops a turn.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sender.submit(true);
      return;
    }
    if (menu.open ? menu.key(event) : chipKey(event)) {
      return;
    }
    if (event.key === "Escape" && canvas.up) {
      event.preventDefault();
      canvas.room?.fold();
      return;
    }
    // Escape in the message closes find too, the caret staying where it is.
    if (event.key === "Escape" && find?.open) {
      event.preventDefault();
      find.close();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sender.submit();
    }
  }

  /**
   * The keys recall answers, never over the `/` and `@` menu: while a
   * queued message is edited, Enter and mod+Enter put the words in its
   * place (mod+Enter then stops a busy session's turn, so they are taken
   * now) and Esc gives them back as they were; otherwise ↑ with nothing
   * before the caret lifts your queued message, or brings up what you sent.
   * True when the key was recall's.
   */
  function recallKey(event: KeyboardEvent): boolean {
    if (menu.open) {
      return false;
    }
    if (draft.lifted) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        queued.replaceLifted(event.ctrlKey || event.metaKey);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        queued.returnEdit();
        return true;
      }
      return false;
    }
    const bare = !(
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    );
    // The wheel still folding away (it takes no keys then): ↑ brings it
    // straight back up once it has landed, a close caught mid-way turning back.
    if (recalling.recall && event.key === "ArrowUp" && bare) {
      event.preventDefault();
      recalling.reopen = true;
      return true;
    }
    if (!(event.key === "ArrowUp" && bare && recalling.startsRecall())) {
      return false;
    }
    event.preventDefault();
    const lifting = draft.hasContent ? null : queued.liftable();
    if (lifting) {
      queued.liftQueued(lifting);
    } else {
      recalling.openRecall(true);
    }
    return true;
  }

  /**
   * The action button stops a turn in flight, except while a queued message
   * is being edited: then it sends the edit in its place, as Enter does.
   */
  const stops = $derived(busy && !draft.lifted);

  function onaction(): void {
    // An ask folding back into the pill: nothing is sent until it has landed.
    if (grown.askOpen && !busy) {
      return;
    }
    if (held) {
      sender.submit();
      return;
    }
    if (draft.lifted) {
      queued.replaceLifted();
    } else if (busy) {
      onstop();
    } else {
      sender.submit();
    }
  }

  /* ---- the pill ------------------------------------------------------- */

  /** The box the pill stands in, which the grown shape and its rows share. */
  let shell = $state<HTMLElement>();
  let pill = $state<HTMLFormElement>();

  /* ---- the canvas: the draft's drawing, standing over the field -------- */

  const canvas = new CanvasLink({
    askOpen: () => grown.askOpen,
    dock: () => dockEl,
    draft: () => draft,
    field: () => field,
    fleet: () => fleet,
    paneVisible: () => paneVisible,
    pill: () => pill,
    recalling: () => !!recalling.recall,
    recallOf: () => recallOf,
    shell: () => shell,
    wheelBack: () => recalling.wheel?.back(),
  });
  const recalled = $derived(
    fleet && recallOf ? fleet.sessionsStore.session(recallOf) : null
  );

  /* ---- recall: what you sent, and your queued message ----------------- */

  /** The wheel of what you sent, over the pill. */
  const recalling = new ComposerRecall({
    askOpen: () => grown.askOpen,
    canvasUp: () => canvas.up,
    dismissMenu: () => {
      menu.dismissed = true;
    },
    draft: () => draft,
    field: () => field,
    floor: () => fieldFold.floor,
    folds: (whole) => fieldFold.folds(whole),
    holding: () => !!press.hold?.live,
    mentionField: () => mentionField,
    pill: () => pill,
    recalled: () => recalled,
    recallOf: () => recallOf,
    shell: () => shell,
    submit: (cuts) => sender.submit(cuts),
  });
  /** A held press or a swipe up on a touch screen brings the wheel up. */
  const press = new PressHold({
    askOpen: () => grown.askOpen,
    canvasUp: () => canvas.up,
    draft: () => draft,
    field: () => field,
    openCanvas: () => canvas.room?.open(),
    openRecall: (keys) => recalling.openRecall(keys),
    recall: () => recalling.recall,
    recallOf: () => recallOf,
    wheel: () => recalling.wheel,
  });

  /** Your queued message, edited in the composer. */
  const queued = new QueuedEdit({
    agentName: () => agentName,
    askOpen: () => grown.askOpen,
    busy: () => busy,
    canvasUp: () => canvas.up,
    draft: () => draft,
    field: () => field,
    fleet: () => fleet,
    mentionField: () => mentionField,
    natural: () => fieldFold.natural,
    onstop,
    pill: () => pill,
    recalled: () => recalled,
    recalling: () => !!recalling.recall,
    recallOf: () => recallOf,
    say: (words) => {
      sender.sendBlock = words;
    },
    shell: () => shell,
  });

  /** The dock: the column the composer, its tray row and its offers stand in. */
  let dockEl = $state<HTMLElement>();

  /** Find on the pill's top: its heights, and the caret back in the message when it closes. */
  const findDock = new FindDock({ field: () => field, find: () => find });

  /** A parked ask is the composer itself while it waits: it grows up out of its pill into the ask's card. */
  const grown = new GrownAsk({
    ask: () => ask,
    dock: () => dockEl,
    draft: () => draft,
    field: () => field,
    pill: () => pill,
    putAway: () => {
      if (recalling.recall) {
        recalling.putAway();
      }
      if (draft.lifted) {
        queued.returnEdit();
      }
      canvas.room?.stepAside();
    },
    shell: () => shell,
  });

  /**
   * Files and a long paste join the draft as attachments; other text lands
   * in the field. Where nothing rides with the words (`attach` off), all of
   * a paste is the field's own.
   */
  function onpaste(event: ClipboardEvent): void {
    if (attach && draft.paste(event.clipboardData)) {
      event.preventDefault();
    }
  }

  /** A file over the field is one it takes; text keeps the field's own drop. */
  function ondragover(event: DragEvent): void {
    if (attach && event.dataTransfer && carriesFiles(event.dataTransfer)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  /** A file dropped on the field joins the draft as a pasted one does. */
  function ondrop(event: DragEvent): void {
    if (attach && event.dataTransfer && carriesFiles(event.dataTransfer)) {
      event.preventDefault();
      draft.paste(event.dataTransfer);
    }
  }

  /** The field's fold: its one-line height, the height its whole text takes, and whether it has the focus. */
  const fieldFold = new FieldFold({ field: () => field });

  /**
   * The ground under an open layer (the dock's `layer-ground`): the
   * transcript's recess, solid up to the layer's foot, then dissolving over
   * the rest of its height (`space-8`) under the layer.
   */
  /** It reaches down to the pane's foot, under the dock's own. */
  const GROUND_BOTTOM = "calc(-1 * var(--dock-foot, 0px))";
  /** As tall as the foot, the composer and the step to the layer, and its dissolve. */
  const GROUND_H =
    "calc(var(--dock-foot, 0px) + var(--layer-foot) + var(--spacing-space-8))";
  const LAYER_GROUND =
    "linear-gradient(to top, var(--color-surface-recess) calc(var(--dock-foot, 0px) + var(--layer-foot)), var(--color-surface-recess-clear))";
  /** The offers standing on the tray row: each conversation's, built, the one written to seen. */
  const offerStack = new OfferStack({
    showing: () => showing,
    trayRows: () => trayRows,
  });
</script>

<!-- The dock is one column from the top of the pane down to the composer's
     resting place: what stands on the tray row (an offer) fills it and the
     panel stands at its foot, so a card arriving or leaving never moves the
     composer itself. The column stands its cards on its bottom edge: it
     stays where it is while cards come and go, so the list moves the way
     every list does (motion/rows.svelte.ts) — a card arriving is uncovered
     as the cards above it slide up to make its room, a card leaving closes
     as they slide back down. A parked ask is not one of them: the composer
     grows into it, and the column and the tray row step aside meanwhile.
     The column's foot is the panel's top by layout, not by a measured
     height: placed from `panel`, the column resized inside the very
     ResizeObserver pass that measured the panel, a box the pass could no
     longer deliver ("ResizeObserver loop completed with undelivered
     notifications", every frame the field grew), and it stood a frame
     behind the panel. -->
<svelte:window onkeydown={canvas.windowKey} />

<!-- What steps aside while an ask holds the composer comes back at once and
     fades in (transition-fade-show). While the composer is grown into an
     ask, everything in it that does not act on the ask steps aside: the
     offer column, the tray row with its chips and the plan's ring, the
     attachments, and the pill's own controls. They fade out and are
     gone, out of the tab order with them (transition-fade-hide), and come
     back the same way as the ask folds. A minimized question's bar takes
     the tray row: the tray steps aside under it and comes back as it goes,
     and the row's trailing end (what waits on the person, the plan's ring)
     stands beside the bar, which ends short of it. At every width the dock's foot stands 14px above the
     bottom plus the safe area (the composer's surface brief, Composer column: "docked 14px
     above the bottom plus the safe area"), the room the transcript's foot
     clears for it; on a narrow screen the composer, the tray row and the
     cards keep the composer's 11px edges. It stays absolute
     (docked at the bottom of the transcript pane) rather than viewport-fixed,
     so it sits ABOVE the thumb bar instead of overlapping it — the thumb bar
     owns the safe-area inset. -->
<div
  data-slot="dock"
  data-find-view={find?.viewId}
  data-asking={grown.askRaised || undefined}
  data-drawing={canvas.up || undefined}
  data-minimized={grown.minimized || undefined}
  data-flush={flush || undefined}
  class="group/dock not-data-flush:absolute not-data-flush:inset-x-0 not-data-flush:top-0 not-data-flush:bottom-(--dock-foot) data-flush:relative z-(--layer-dock) flex flex-col justify-end items-center pointer-events-none"
  data-keeps-draft
  data-safe-bottom
  bind:this={dockEl}
  style:--dock-foot={flush
    ? undefined
    : "calc(var(--spacing-space-4) + var(--safe-bottom))"}
  style:--spacing-c-composer-w={flush ? "100%" : undefined}
  style:--layer-foot="calc({dockFoot.panel}px + var(--spacing-c-tray-row) +
  var(--spacing-space-2))"
>
  <!-- The ground under an open layer (the plan, the tray's shelf, the list
       of what waits on the person). Each
       floats a `space-2` step over the tray row, and the row has no surface
       of its own, so the transcript scrolling behind showed between the two
       as a sliver of a line, cut by the layer's foot mid-glyph. While one is
       open, the transcript's foot stands solid up to that foot across the
       pane's width, the transcript's own recess as its foot fade (FootFade)
       draws it, then dissolves over `space-8` under the layer: rows pass
       behind the layer and the tray row as they pass behind the pill, whole
       or not at all. It fades with the layer and moves nothing. Under
       everything else in the dock. -->
  <div
    data-slot="layer-ground"
    aria-hidden="true"
    class="absolute inset-x-0 bottom-(--ground-bottom) -z-1 h-(--ground-h) pointer-events-none bg-(image:--layer-ground-image) opacity-0 invisible transition-fade-hide group-has-slot-plan/dock:opacity-100 group-has-slot-plan/dock:visible group-has-slot-plan/dock:transition-fade-show group-has-slot-shelf/dock:opacity-100 group-has-slot-shelf/dock:visible group-has-slot-shelf/dock:transition-fade-show group-has-slot-waiting/dock:opacity-100 group-has-slot-waiting/dock:visible group-has-slot-waiting/dock:transition-fade-show"
    style:--layer-ground-image={LAYER_GROUND}
    style:--ground-bottom={GROUND_BOTTOM}
    style:--ground-h={GROUND_H}
  ></div>
  {#if offerStack.offered.length > 0}
    <!-- The rest of the dock above the panel, cards stood on its bottom
         edge; the gap to the panel is the stack's own bottom padding, so its
         measured height carries it. A parked card keeps the composer's whole
         row (Prompt: the answer row needs its width) and stands above what
         peeks over the pill, never over it. On a narrow screen the cards keep
         the desktop's step off the panel. -->
    <div
      data-slot="prompts"
      class="grow shrink basis-0 min-h-0 w-c-composer-w not-group-data-flush/dock:desk:ms-c-composer-nudge flex flex-col justify-end pointer-events-none transition-fade-show group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide group-data-drawing/dock:opacity-0 group-data-drawing/dock:invisible group-data-drawing/dock:transition-fade-hide not-group-data-flush/dock:max-desk:self-stretch not-group-data-flush/dock:max-desk:mx-space-3 not-group-data-flush/dock:max-desk:w-auto max-desk:mb-(--prompts-step)"
      inert={grown.askRaised}
      bind:this={offerStack.offers}
      {@attach reflow({ on: ["data-open", "data-railed"] })}
      style:--prompts-step={"calc(var(--spacing-space-4) - var(--spacing-space-2))"}
    >
      <!-- Each conversation's offer, built, standing on the stack's foot;
           the one written to is seen, and the stack is as tall as it. What
           the column measures into the composer's height: the offer shown,
           and its step. Every offer stands on its foot out of flow, so a
           switch changes which is seen and the stack's height, never what is
           laid out. -->
      <div
        data-slot="stack"
        class="relative flex-none"
        style:block-size="{offerStack.stack}px"
      >
        {#each offerStack.offered as row (row.id)}
          <!-- The step under a card parked, on the card's own row; nothing
               under a row with no card. Asked of the row, not of the stack
               past the away offers: a class in a `:has()` before a universal
               makes each of its changes restyle the whole row. The offer of
               a conversation not being written to: built and laid out where
               it would stand, unseen and out of reach (`visibility` takes it
               out of the tab order and the accessibility tree). -->
          <div
            data-composer-away={row.id !== showing || undefined}
            class="absolute inset-x-0 bottom-0 pointer-events-auto has-[>*]:pb-space-3 data-composer-away:invisible"
            {@attach offerStack.measureOffer(row.id)}
          >
            {@render row.prompts?.()}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <!-- The row standing on the composer, outside its box: the delegate
       tray's fixed row (app.css `--spacing-c-tray-row`), which a transcript keeps
       clear at its foot while something stands in it (SessionPane
       `trayStands`), and the suggestion chips standing on it (out of flow),
       over the transcript's foot. An offer stands on top of both. -->
  <!-- The delegate tray's row, on the composer's width and left edge. It is
       the positioned box the suggestion chips stand on. -->
  <div
    data-slot="lift"
    class="relative flex-none w-c-composer-w not-group-data-flush/dock:desk:ms-c-composer-nudge pointer-events-none transition-fade-show group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide group-data-drawing/dock:opacity-0 group-data-drawing/dock:invisible group-data-drawing/dock:transition-fade-hide not-group-data-flush/dock:max-desk:self-stretch not-group-data-flush/dock:max-desk:mx-space-3 not-group-data-flush/dock:max-desk:w-auto"
    inert={grown.askRaised}
    {@attach dockFoot.measureLift}
  >
    {#if fleet && grown.minimized && ask && grown.askParks}
      <!-- The minimized question, in the tray row's place: Caw's needs-you
           face, what it asks, and the chevron it comes back up by. The
           tray's chips step aside meanwhile, as they do while the card is
           up, so the bar costs the transcript nothing the row did not
           already keep clear; the row's trailing end stays (what waits on
           the person, whose list holds this question too, and the plan's
           ring), and the bar ends short of it (`--ring-room`). While that
           list stands open (`[data-slot="waiting"]`, waiting/WaitingCard)
           the bar gives way under it: the list's first row
           is this same question, one press from growing it, so the bar
           would say it twice a step apart. The bar is
           the tray row's chip (ui/chip, `variant: "tray"`) in its needs tone
           (DelegateTray: a session asking for something is the one loud
           colour), across the composer's width, standing in the tray row as the tray's chips do:
           a tray chip high, a tray gap off the pill. It stands under the
           grown shape (grown.ts's halo, z 1): brought back, the card grows over
           the bar as it fades. -->
      {@const [first] = grown.askQuestions ?? []}
      <div
        class="absolute inset-0 flex items-box-end pb-c-tray-gap pe-(--ring-room,0px) pointer-events-none transition-fade-show group-has-slot-waiting/dock:opacity-0 group-has-slot-waiting/dock:invisible group-has-slot-waiting/dock:transition-fade-hide"
        style:--ring-room={planRing
          ? `calc(${dockFoot.ringWidth}px + var(--spacing-space-2))`
          : undefined}
        in:askedIn
        out:askedOut
      >
        <button
          data-slot="asked-chip"
          aria-label={`Show the question from ${ask.asker}: ${first?.question ?? ""}`}
          class={chipVariants({
            variant: "tray",
            class:
              "touch-hit w-full min-w-0 text-status-attn-ink before:bg-status-attn-bg",
          })}
          data-tray-chip
          onclick={() => grown.restoreAsk()}
          type="button"
          bind:this={grown.askedChip}
        >
          <span
            aria-hidden="true"
            class="inline-grid flex-none place-items-center"
            data-box
          >
            <fleet.CawFace size={16} status="needs-you" />
          </span>
          <span
            class="flex-auto min-w-0 overflow-clip text-start text-ellipsis whitespace-nowrap"
            >{first?.question ?? first?.header}</span
          >
          {#if ask.more > 0}
            <span data-slot="num" class="num flex-none font-normal"
              >+{ask.more}</span
            >
          {/if}
          <IconChevronUp aria-hidden="true" />
        </button>
      </div>
    {/if}
    {#if fleet && suggest && suggestions.enabled}
      <!-- Keyed by conversation: the ranking is of one chat's words, and the
           shared phone composer must not carry it into the next chat. -->
      {#key draft}
        <fleet.SuggestionChips
          candidates={suggest.candidates}
          oninsert={insertSuggestion}
          text={draft.text}
          bind:this={chips}
        />
      {/key}
    {/if}
    {#if planRing}
      <!-- The plan's chip (and before it, while anything waits on the
           person, the chip of what waits: waiting/WaitingChip), at the tray
           row's trailing end, standing on the tray's line: the step off the
           panel the delegate chips stand on. The slot spans the row, so the
           plan the chip opens (PlanPane) and the list of what waits stand
           over the row across the composer's width; only the chips take the
           pointer, and only the chips are measured. The slot is the `tray`
           container its chips fold their words by. -->
      <div
        data-slot="progress-slot"
        class="@container/tray absolute bottom-0 inset-x-0 z-1 flex justify-end items-end h-c-tray-row pb-c-tray-gap pointer-events-none"
      >
        <div
          class="flex items-end gap-space-2 pointer-events-auto"
          {@attach dockFoot.measureRing}
        >
          {@render planRing()}
        </div>
      </div>
    {/if}
    {#if fleet && offerStack.trayed.length > 0}
      <!-- One conversation's tray over the next while they cross-fade, in a
           column the composer's width: an auto column grew to the chips' own
           width. The slot is the tray's one row from the composer's first
           render, chips or none (app.css `--spacing-c-tray-row`; a transcript keeps
           it clear while a chip stands, SessionPane `trayStands`), with the
           tray standing on its foot: a chip arriving late fills room already
           laid out, and the suggestion row standing on the slot never moves. The tray's shelf and panel
           float over it, in none of its flow. -->
      <div
        data-slot="tray-slot"
        class="relative grid grid-cols-1 items-box-end min-h-c-tray-row transition-fade-show group-data-minimized/dock:opacity-0 group-data-minimized/dock:invisible group-data-minimized/dock:transition-fade-hide"
        style:--ring-room={planRing
          ? `calc(${dockFoot.ringWidth}px + var(--spacing-space-2))`
          : undefined}
      >
        <!-- Each conversation's tray, built, in the slot's one cell: handed
             the next, the one written to fades in over the last as it fades
             out, so neither the slot nor anything standing on it moves.
             Opacity only, so it runs with or without motion; the one leaving
             is out of reach once it has faded. -->
        {#each offerStack.trayed as row (row.id)}
          <div
            data-slot="tray"
            data-composer-away={row.id !== showing || undefined}
            class="row-start-1 col-start-1 transition-exit-show data-composer-away:opacity-0 data-composer-away:invisible data-composer-away:transition-exit-hide"
          >
            <fleet.DelegateTray {held} parentId={row.delegatesOf} />
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <!-- Everything in the composer takes the pointer; the composer itself, and
       the canvas's box, do not. -->
  <div
    data-slot="composer"
    class="relative flex-none w-c-composer-w not-group-data-flush/dock:desk:ms-c-composer-nudge flex flex-col gap-space-3 pointer-events-none not-group-data-flush/dock:max-desk:self-stretch not-group-data-flush/dock:max-desk:mx-space-3 not-group-data-flush/dock:max-desk:w-auto"
    bind:this={canvas.column}
    {@attach dockFoot.measurePanel}
    in:rise
    out:fade
  >
    {#if canvas.stands}
      <!-- The canvas's box over the field: its stage (canvas/) stands on
           it, the grown shape round it and the field. On the composer's top,
           a pixel inside the grown shape's edge; the room writes its height,
           and its left and right when it stands wider than the pill (the
           grown shape's own physical sides). -->
      <div
        data-slot="canvas-slot"
        aria-hidden="true"
        class="absolute left-px right-px bottom-full pointer-events-none"
        bind:this={canvas.canvasSlot}
      ></div>
    {/if}
    <!-- The row of attachments is one block above the field, the canvas's
         chip leading it. -->
    <AttachmentChips
      canvasHidden={canvas.room?.chipHidden}
      {draft}
      onopencanvas={() => canvas.room?.open()}
      onremovecanvas={() => canvas.room?.remove()}
      bind:canvasChip={canvas.canvasChip}
    />

    <!-- A send that failed says so right over the field it left; the way
         back stands on the line that says what failed, after its words.
         While the canvas stands, it stands in the grown shape over the
         field, above its surface. -->
    {#if fleet && start.harnessStart && recallOf}
      <div
        data-slot="start-block"
        class="pointer-events-auto px-space-3 group-data-drawing/dock:relative group-data-drawing/dock:z-2"
        transition:unfold
      >
        <fleet.HarnessBlock
          block={start.harnessStart.block}
          machineId={start.harnessStart.machine.machineId}
          online={start.harnessStart.machine.status === "online"}
          relaunch={recallOf}
        />
      </div>
    {:else if start.relaunchRefused}
      <!-- Its harness was brought up, and its start again was refused: the
           machine's words, and the way on. -->
      <div
        data-slot="relaunch-error"
        class="pointer-events-auto flex flex-wrap items-center gap-x-space-2 px-space-3 text-status-fail-ink text-size-meta font-normal wrap-anywhere group-data-drawing/dock:relative group-data-drawing/dock:z-2"
        role="alert"
        transition:unfold
      >
        <p class="min-w-0">{start.relaunchRefused}</p>
        <Button
          label="Retry"
          onclick={() => start.retryStart()}
          pending={start.retrying}
          pendingLabel="Starting…"
          size="sm"
          variant="ghost"
        />
      </div>
    {:else if sender.sendNotice}
      <div
        data-slot="send-error"
        class="pointer-events-auto flex flex-wrap items-center gap-x-space-2 px-space-3 text-status-fail-ink text-size-meta font-normal group-data-drawing/dock:relative group-data-drawing/dock:z-2"
        role="alert"
        transition:unfold
      >
        <p class="min-w-0">{sender.sendNotice}</p>
        {#if sendAgain && sendError === sender.sendNotice}
          <Button
            disabled={sender.pending}
            onclick={() => sender.submit()}
            size="sm"
            variant="ghost">{commonWords.sendAgain}</Button
          >
        {:else if faultAgain && sendError === sender.sendNotice}
          <Button
            data-fault-again
            icon={IconRefresh}
            label={commonWords.tryAgain}
            onclick={faultAgain}
            size="sm"
            variant="ghost"
          />
        {/if}
      </div>
    {:else if sender.signInNote}
      <p
        class="pointer-events-auto px-space-3 text-ink-muted text-size-meta font-normal"
        role="status"
        transition:unfold
      >
        {sender.signInNote}
      </p>
    {:else if note}
      <!-- What a message does here that it does nowhere else, said before
           it is sent (a stored transcript's: it resumes it), on the line a
           sign-in's note takes. -->
      <p
        data-slot="composer-note"
        class="pointer-events-auto px-space-3 text-ink-muted text-size-meta font-normal"
        transition:unfold
      >
        {note}
      </p>
    {/if}

    <!-- The pill, and what grows up out of it over the transcript: the
         recall wheel, or the row that says a queued message is being
         edited. Both stand on the pill's foot, absolutely, so nothing above
         them moves. -->
    <div
      data-slot="shell"
      data-rolling={!!recalling.recall || undefined}
      class="relative pointer-events-auto"
      bind:this={shell}
    >
      {#if find && findDock.finding && find.listOpen}
        <!-- Find's places grow out of the pill's top, at every width, over
             the transcript's foot. -->
        <FindLayer
          {find}
          onheight={(px) => {
            findDock.findLayerH = px;
          }}
        />
      {/if}
      {#if fleet && recalling.recall && shell && recalling.fieldWrap}
        <fleet.RecallWheel
          deck={recalling.deckAt}
          draft={recalling.recall.text}
          field={recalling.fieldWrap}
          id={recalling.recallId}
          keys={recalling.recall.keys}
          measured={recalling.recall.measured}
          more={!!recalled?.cursor}
          older={() => {
            if (recallOf) {
              detach(fleet?.readOlderPage(recallOf), "readOlderPage");
            }
          }}
          onback={recalling.recallBack}
          ondone={recalling.recallDone}
          ontake={recalling.recallTake}
          queuedWord={recalling.queuedWord}
          sent={recalling.sentHere}
          {shell}
          bind:this={recalling.wheel}
          bind:active={recalling.recallActive}
        />
      {/if}
      {#if queued.edit}
        <!-- What is happening, and the two ways out: the keys on a desk, a
           button on a touch screen, which has no Esc. The row the
           composer grows while a queued message is edited, inset past the
           shoulders' curve, and clear of the fade at the grown top. The
           label and the hints come up with the shape one after the other,
           out of a `--part-blur` blur as they fade and rise, and sink back
           as it folds; they start on the shape's own clock of drawn frames
           (`growRow`), so frames iOS Safari holds while its keyboard rises
           take none of it. The hints and Keep it come up a stagger after
           the label. Keep it is the kit's Button, addressed from the row
           (its own utilities set its display and transition): hidden but
           on a touch screen, which has no Esc. -->
        <div
          data-composer-shown={queued.edit.shown || undefined}
          data-slot="edit-row"
          class="group/edit absolute z-3 inset-x-(--edit-inset) flex items-center gap-space-2 pt-space-1 text-size-meta font-medium text-ink-muted pointer-events-none [&_[data-keep]]:opacity-0 [&_[data-keep]]:blur-(--part-blur) [&_[data-keep]]:transition-fade-blur [&_[data-keep]]:hidden [&_[data-keep]]:pointer-events-auto motion-safe:[&_[data-keep]]:translate-y-(--pop-rise) motion-safe:[&_[data-keep]]:transition-fade-slide-blur coarse:[&_[data-keep]]:inline-flex data-composer-shown:[&_[data-keep]]:opacity-100 data-composer-shown:[&_[data-keep]]:translate-none data-composer-shown:[&_[data-keep]]:filter-none data-composer-shown:[&_[data-keep]]:delay-(--duration-stagger)"
          bind:this={queued.editRow}
          style:--edit-inset="{queued.edit.inset}px"
          style:bottom="{queued.edit.base}px"
          style:height="{queued.edit.row}px"
        >
          <span
            data-slot="what"
            class="inline-flex items-center gap-space-2 me-auto text-ink-row opacity-0 blur-(--part-blur) transition-fade-blur before:size-(--status-dot-size) before:rounded-pill before:bg-selected-icon motion-safe:translate-y-(--pop-rise) motion-safe:transition-fade-slide-blur group-data-composer-shown/edit:opacity-100 group-data-composer-shown/edit:translate-none group-data-composer-shown/edit:filter-none"
            >Editing your queued message</span
          >
          <!-- A touch screen has no Esc: a button keeps the message as it
             was, and the keys are not shown. -->
          <span
            data-slot="hint"
            class="inline-flex items-center gap-space-1 whitespace-nowrap coarse:hidden max-phone:hidden opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) motion-safe:transition-fade-slide-blur group-data-composer-shown/edit:opacity-100 group-data-composer-shown/edit:translate-none group-data-composer-shown/edit:filter-none group-data-composer-shown/edit:delay-(--duration-stagger)"
          >
            <Kbd>Enter</Kbd>
            replaces it · <Kbd>Esc</Kbd> keeps it
          </span>
          <Button
            class="touch-hit"
            data-keep
            onclick={() => queued.returnEdit()}
            size="xs"
            variant="ghost"
          >
            Keep it
          </Button>
        </div>
      {/if}
      {#if fleet && grown.drawnAsk && grown.askBox}
        <!-- The ask the composer has grown into, on the shell's foot over
             the pill and cut to the shape as it grows and folds, across the
             composer's width: over the pill, as the wheel's rows and the
             editing row are, so the pill's row is the card's own and no
             empty band stands under it. -->
        <div
          data-slot="ask"
          class="absolute z-3 inset-x-0 bottom-0"
          inert={!grown.askShown}
          bind:this={grown.askPanel}
          style:--ask-max="{grown.askBox.max}px"
        >
          {#key grown.drawnAsk.request.requestId}
            <fleet.Prompt
              asker={grown.drawnAsk.asker}
              onanswer={grown.drawnAsk.onanswer}
              onminimize={grown.askParks
                ? () => grown.minimizeAsk()
                : undefined}
              ontaken={grown.drawnAsk.ontaken}
              place={grown.askPlace}
              request={grown.drawnAsk.request}
              shown={grown.askShown}
            />
          {/key}
        </div>
      {/if}
      <!-- With the keyboard down a touch screen's pill is a control to hold
         (the wheel comes up under it); the field being typed in keeps its
         touches. -->
      <!-- One shape, always. --radius-lg outside, --spacing-space-2 of inset, and the
           controls inside carry (panel − inset − edge) so the curves are concentric
           rather than two unrelated roundings stacked. The pill is the
           whole surface of its text field: its caret is its focus, and
           nothing is drawn round it (DESIGN.md, The Caret Rule); its chips
           and buttons keep the keyboard's ring. Its one-line box is
           the app's composer tokens (app.css `--c-composer-*`), which every
           transcript keeps clear. It is the panel material (app.css
           `--material-*`, its shell the kit's ui/dock-shell), so the
           transcript shows faintly through it, and opaque where translucency
           is turned down. The pill's box is what grows out of it shares: the
           grown shape is drawn behind the pill and its rows over it. While
           it is grown, the grown shape is the composer: the pill's own
           surface steps aside. The wheel's shape stays the composer until it has folded back
           into the pill's outline, so the pill's edge never comes back
           across the rows folding with it. Keyboard down, a touch screen's
           pill is a control to hold, so the page does not pan from it; typed
           in, its touches are the field's. -->
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the press handlers read a touch held on the pill for the recall wheel; everything it leads to is also a key (↑, the field's aria-keyshortcuts) -->
      <form
        data-slot="cin"
        data-asking={grown.askOpen || undefined}
        data-grown={!!queued.edit || grown.askOpen || canvas.up || undefined}
        data-hint-back={!!recalling.hintBack || undefined}
        data-lead={!!lead || !!also || findDock.finding || undefined}
        data-places={(findDock.finding && find?.listOpen) || undefined}
        data-recalling={!!recalling.recall || undefined}
        data-settling={(!!recalling.recall && !recalling.wheeling) || undefined}
        data-wheeling={recalling.wheeling || undefined}
        aria-keyshortcuts={recallOf
          ? "Meta+Shift+D Control+Shift+D"
          : undefined}
        aria-label={fieldHint.label}
        class={dockShellVariants({
          class:
            "group/cin relative z-2 data-places:rounded-t-none py-(--cin-pad) pr-(--cin-pad) pl-space-3 flex items-end gap-space-2 data-lead:flex-wrap data-recalling:bg-transparent data-recalling:border-transparent data-recalling:shadow-none data-recalling:backdrop-filter-none data-grown:bg-transparent data-grown:border-transparent data-grown:shadow-none data-grown:backdrop-filter-none not-focus-within:touch-none not-focus-within:touch-callout-none",
        })}
        onclickcapture={press.onholdclick}
        oncontextmenu={press.onholdnative}
        onpointerdown={press.onholddown}
        onsubmit={(e) => e.preventDefault()}
        ontouchend={press.onholdnative}
        bind:this={pill}
        style:--cin-pad="var(--spacing-c-composer-inset)"
        style:--cin-ctl="var(--spacing-c-composer-field)"
      >
        {#if menu.open}
          <!-- Above the input, not over it: the sentence being written stays legible
           while its next word is being chosen. -->
          <!-- Focus never leaves the field: the menu swallows the mousedown that
           would blur it, so a clicked row lands on the message being written. -->
          <!-- The `/` and `@` menu, above the pill and matched to its width:
               a kit floating surface (`floatingSurface`) that rises out of
               the field below it, growing from its bottom edge, the side the
               caret is on. The list inside carries its own inset. shadcn's
               Command parts are addressed by slot from here, so the menu
               wears CawCo's tokens rather than the stock ladder: the
               list is the one thing that scrolls, the shell stays put; each
               family is a titled section, ruled off from the one above so
               "Skills" and "Commands" read as two kinds of thing; one row is
               the name, its prose, and where it came from, on a single line,
               the highlighted row standing on the kit's ghost. -->
          <!-- biome-ignore lint/a11y/noStaticElementInteractions: role="presentation" is deliberate — this wrapper is never meant to be announced; the mousedown handler only preventDefaults so focus stays on the field, it is not a user interaction target. -->
          <div
            data-slot="menu"
            class={floatingSurface({
              class:
                "absolute inset-x-0 bottom-(--menu-foot) max-h-80 overflow-hidden p-0 origin-bottom [&_[data-slot=command]]:bg-transparent [&_[data-slot=command-list]]:max-h-80 [&_[data-slot=command-list]]:overflow-y-auto [&_[data-slot=command-list]]:overscroll-contain [&_[data-slot=command-list]]:p-space-1 [&_[data-slot=command-group]]:py-space-1 [&_[data-slot=command-group]]:px-0 [&_[data-slot=command-group]+[data-slot=command-group]]:border-t [&_[data-slot=command-group]+[data-slot=command-group]]:border-t-border-hairline [&_[data-slot=command-item]]:flex [&_[data-slot=command-item]]:items-baseline [&_[data-slot=command-item]]:gap-space-2 [&_[data-slot=command-item]]:min-h-c-btn-h-sm [&_[data-slot=command-item]]:py-space-1 [&_[data-slot=command-item]]:px-space-2 [&_[data-slot=command-item]]:rounded-sm [&_[data-slot=command-item]]:text-ink-strong coarse:[&_[data-slot=command-item]]:min-h-c-row-h",
            })}
            data-side="top"
            data-state="open"
            id="composer-menu"
            onmousedown={(event) => event.preventDefault()}
            role="presentation"
            out:popOut={{ side: "top" }}
            style:--menu-foot="calc(100% + var(--spacing-space-2))"
          >
            <Command.Root loop shouldFilter={false} bind:value={menu.highlight}>
              <Command.List>
                {#each menu.sections as section (section.key)}
                  <Command.Group heading={section.heading}>
                    {#each section.entries as entry (entry.id)}
                      <Command.Item
                        id={menu.domIds.get(entry.id)}
                        onSelect={() => menu.choose(entry)}
                        value={entry.id}
                      >
                        <!-- A command, in the code face. -->
                        <span
                          data-slot="e-label"
                          class="font-(family-name:--font-mono) font-medium text-ink-strong whitespace-nowrap flex-none"
                          >{entry.label}</span
                        >
                        {#if entry.detail}
                          <span
                            data-slot="e-detail"
                            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-size-meta font-normal text-ink-muted flex-auto"
                            >{entry.detail}</span
                          >
                        {/if}
                      </Command.Item>
                    {/each}
                  </Command.Group>
                {/each}
              </Command.List>
            </Command.Root>
          </div>
        {/if}

        {#if find && findDock.finding}
          <!-- The find field, grown on the pill's top: its own line, a
               hairline under it, the message's line where it was. It
               unfolds as the composer's other rows grow (`unfold`): a press
               plays it, a key lands it (motion/keyed). -->
          <div
            data-slot="find"
            class="basis-full min-w-0 group-data-asking/dock:invisible"
            inert={grown.askOpen}
            transition:unfold
            {@attach frameSize(
              (node: HTMLElement) => node.offsetHeight,
              (value) => {
                findDock.findLineH = value;
              }
            )}
          >
            <FindLine {find} />
          </div>
        {/if}
        {#if lead}
          <!-- What the words are about, its own row across the pill above
               the field, at the field's inset: the pill's top padding over
               it, the pill's gap under it. It steps aside with the rest
               while an ask holds the composer. -->
          <div
            data-slot="lead"
            class="flex basis-full min-w-0 transition-fade-show group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide"
            inert={grown.askOpen}
          >
            {@render lead()}
          </div>
        {/if}
        <!-- The pill's padding above and below the 34px field focuses it,
         the caret at the end: its touch area is the field's. -->
        <!-- The field's box. Its custom properties reach the field and the
             autosize twin beside it (a copy of the field, its classes
             included, without its inline style): the field's padding, the
             scroll cue's run, the roll's reach and the folded line's end the
             "+N lines" stands on. The field's own height floor, size and
             padding give way to the composer's (MentionField merges the
             classes it is given over its own), so a single line sits on the
             buttons' midline; a
             pick taken off the recall wheel fits the field on the wheel's
             fold clock and curve, over the folding duration. The scroll
             cue: the edge with text out of sight fades over about a line.
             A folded draft has no cue: it keeps its own fade, its first
             line fading out where the line ends and clear under the "+N
             lines" standing there, and its own cut at the first line's
             foot (`--fold-clip`): the field's bottom padding is in its
             clip box, and the second line's top showed in it as a sliver
             under "+N lines". Rolling, the cut moves down with the roll. The draft as the recall wheel's first
             row: its text, and what a folded one says is out of sight, roll
             down off the field's line as the wheel rolls up, cut at the
             line's foot. The wheel writes `--roll-y` and `--roll-o` on this
             box while the roll is off the draft; with neither, the roll's
             translate and clip are invalid and so none. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <div
          data-folded={fieldFold.folded || undefined}
          data-slot="composer-field"
          class={[
            "group/field touch-hit relative flex flex-auto min-w-0",
            // A second way to send takes the controls' row under the field,
            // so the words keep the pill's width.
            also ? "basis-full" : "group-data-lead/cin:basis-0",
          ]}
          inert={grown.askOpen}
          bind:this={recalling.fieldWrap}
          style:--roll-move="0 var(--roll-y)"
          style:--roll-clip={"inset(calc(var(--roll-reach) * -1) calc(var(--roll-reach) * -1) var(--roll-y))"}
          style:--fold-clip={"inset(calc(var(--roll-reach) * -1) calc(var(--roll-reach) * -1) calc(var(--field-pad) + var(--roll-y, 0px)))"}
          style:--cue-top-fade={"linear-gradient(to bottom, transparent, var(--color-mask-opaque) var(--cue-run))"}
          style:--cue-bottom-fade={"linear-gradient(to top, transparent, var(--color-mask-opaque) var(--cue-run))"}
          style:--cue-both-fade={"linear-gradient(to bottom, transparent, var(--color-mask-opaque) var(--cue-run), var(--color-mask-opaque) calc(100% - var(--cue-run)), transparent)"}
          style:--fold-fade={"linear-gradient(to right, var(--color-mask-opaque) calc(100% - calc(var(--spacing) * 18) - var(--spacing-space-8)), transparent calc(100% - calc(var(--spacing) * 18)))"}
          style:--field-pad="calc((var(--cin-ctl) - 1lh) / 2)"
          style:--cue-run="1lh"
          onclick={(event) => {
            if (
              field &&
              !(event.target instanceof Node && field.contains(event.target))
            ) {
              field.focus();
              mentionField?.select(draft.text.length);
            }
          }}
        >
          <!-- The field (MentionField's editable box), above the .touch-hit
               area, which covers it: a press on the text lands on the field
               itself, so iOS's hold-to-select and its Paste callout reach it;
               the area still takes the pill's padding. It grows with what is
               in it (motion/autosize.svelte.ts), a line at a time over 120ms,
               from one line's worth of the control height to a ceiling, and
               scrolls past that; folding and opening a long draft run over
               --duration-morph. No scrollbar is drawn, so the text wraps at the
               field's full width in every state. While another draft's words
               fly in over it, or an ask's card stands over it, it draws none
               of its own text or caret; while the wheel is up, no caret. -->
          <MentionField
            aria-activedescendant={recalling.recall
              ? recalling.recallActive
              : menu.activeDescendant}
            aria-controls={recalling.recall
              ? recalling.recallId
              : "composer-menu"}
            aria-describedby={recallOf
              ? `${recalling.recallId}-way`
              : undefined}
            aria-expanded={menu.open || !!recalling.recall}
            aria-keyshortcuts={recallOf ? "ArrowUp" : undefined}
            class="relative z-1 flex-auto border-none border-current bg-transparent font-sans font-normal leading-ui text-ink-strong overflow-y-auto h-(--cin-ctl) min-h-(--cin-ctl) text-(length:--text-field-floor) py-(--field-pad) px-0 min-w-0 no-scrollbar opacity-(--roll-o) translate-raw-(--roll-move) clip-path-(--roll-clip) group-data-folded/field:clip-path-(--fold-clip) group-not-data-folded/field:data-cue-top:mask-(--cue-top-fade) group-not-data-folded/field:data-cue-bottom:mask-(--cue-bottom-fade) group-not-data-folded/field:data-cue-top:data-cue-bottom:mask-(--cue-both-fade) group-data-folded/field:mask-(--fold-fade) motion-safe:transition-[height] motion-safe:duration-(--duration-control) motion-safe:ease-out motion-safe:data-folding:duration-(--duration-morph) motion-safe:group-data-settling/cin:duration-(--duration-grow-exit) motion-safe:group-data-settling/cin:data-folding:duration-(--duration-grow-exit) motion-safe:group-data-settling/cin:ease-drawer data-flying:text-transparent data-flying:caret-transparent group-data-asking/dock:text-transparent group-data-asking/dock:caret-transparent group-data-asking/cin:text-transparent group-data-asking/cin:caret-transparent group-data-wheeling/cin:caret-transparent group-data-folded/field:overflow-hidden data-mention-field-empty:before:absolute data-mention-field-empty:before:text-ink-muted data-mention-field-empty:before:tracking-title data-mention-field-empty:before:whitespace-nowrap data-flying:data-mention-field-empty:before:text-transparent group-data-asking/dock:data-mention-field-empty:before:text-transparent group-data-asking/cin:data-mention-field-empty:before:text-transparent group-data-recalling/cin:data-mention-field-empty:before:text-transparent group-data-hint-back/cin:data-mention-field-empty:before:transition-[color] group-data-hint-back/cin:data-mention-field-empty:before:duration-(--duration-fade) group-data-hint-back/cin:data-mention-field-empty:before:ease-out"
            data-cue-bottom={(swap.cueBottom && !fieldFold.folded) || undefined}
            data-cue-top={(swap.cueTop && !fieldFold.folded) || undefined}
            data-flying={swap.flight !== null ||
              !queued.wordsLanded ||
              undefined}
            here={mentionsFrom}
            label={fieldHint.label}
            menuHost={pill}
            names={mentionsFrom !== null}
            onblur={() => {
              menu.dismissed = true;
              fieldFold.focused = false;
            }}
            onclick={noteCaret}
            {ondragover}
            {ondrop}
            onfocus={() => {
              fieldFold.focused = true;
            }}
            oninput={noteCaret}
            {onkeydown}
            onkeyup={noteCaret}
            {onpaste}
            phone={phone.current}
            placeholder={fieldHint.hint}
            {skills}
            tabindex={0}
            bind:this={mentionField}
            bind:editor={field}
            bind:value={draft.text}
            {@attach autosize(() => draft.text, {
              held: () => swap.holding,
              fold: fieldFold.folds,
              measured: (whole) => {
                fieldFold.natural = whole;
                recalling.onFit?.(whole);
              },
            })}
            {@attach fieldHint.fit}
            {@attach swap.scrollCue}
          />
          {#if swap.flight}
            <!-- Each layer is its text and, drawn clear after it, the rest of
               the text it will be (`data-rest`), so it lays out whole. The
               trailing zero-width space holds a final empty line open, as
               the field does. -->
            <!-- One draft handing the field to the next, laid exactly over
                 the field's text box: its padding, face, size, leading and
                 wrapping. Both texts stand on the box's foot, where the
                 field's fitted text ends, each dropped (`translate`) by the
                 scroll its field has left below, so a long one shows the
                 lines the field shows. Each layer is as wide as the field's
                 text runs (`inline-size`, set from the field), never the
                 overlay's own width. Clipped to the field's box as it
                 glides, as the field clips its own text, and sideways only
                 as far as the pill's inset on the left and the gap to the
                 controls on the right, so nothing paints outside the pill or
                 over its buttons. -->
            <span
              data-slot="flight"
              aria-hidden="true"
              class="absolute inset-0 z-2 grid grid-cols-1 content-unsafe-end items-unsafe-end py-(--field-pad) px-0 font-sans text-(length:--text-field-floor) leading-ui text-ink-strong whitespace-pre-wrap wrap-break-word pointer-events-none clip-path-(--flight-clip) group-data-folded/field:mask-(--fold-fade)"
              style:--flight-clip={"inset(0 calc(-1 * var(--spacing-space-2)) 0 calc(-1 * var(--spacing-space-3)))"}
            >
              <span
                data-slot="flight-text"
                class="row-start-1 col-start-1 justify-self-box-start after:content-rest after:text-transparent"
                data-rest="{swap.flight.outRest}&#8203;"
                bind:this={swap.flightOut}
                style:inline-size="{swap.flight.outWrap}px"
                style:opacity={swap.flight.from.opacity}
                style:transform={swap.flight.from.transform}
                style:translate="0 {swap.flight.outDrop}px"
                >{swap.flight.out}</span
              >
              <span
                data-slot="flight-text"
                class="row-start-1 col-start-1 justify-self-box-start opacity-0 after:content-rest after:text-transparent"
                data-rest="{swap.flight.text.slice(swap.typed.length)}&#8203;"
                bind:this={swap.flightIn}
                style:translate="0 {swap.inDrop}px">{swap.typed}</span
              >
            </span>
          {/if}
          {#if fieldFold.folded}
            <!-- What the folded field keeps out of sight, over its faded line
               end: standing in the field, it takes none of the field's width,
               so the text wraps as it does unfolded. -->
            <span
              data-slot="more"
              aria-hidden="true"
              class="absolute end-0 bottom-0 z-2 flex items-center justify-end w-18 h-(--cin-ctl) text-ink-muted text-size-meta font-normal num whitespace-nowrap pointer-events-none opacity-(--roll-o) translate-raw-(--roll-move) clip-path-(--roll-clip) group-data-asking/dock:invisible group-data-asking/cin:invisible"
              >+{fieldFold.lines - 1}
              {fieldFold.lines === 2 ? "line" : "lines"}</span
            >
          {/if}
          {#if recallOf}
            <!-- The way to what you sent here, read with the field: ↑ brings
               it up (a held press, on a touch screen). -->
            <span class="sr-only" id="{recalling.recallId}-way"
              >Press Up to show what you sent</span
            >
          {/if}
        </div>

        <!-- While the wheel is up its buttons fold into a deck at the pill's
             trailing end, which is not a control: Esc, ↓ past the draft or
             a press outside put the wheel away. -->
        <!-- Attach + send, together and bottom-aligned, so they hold their
             box as the text above them runs on. On a coarse pointer the gap
             opens to a step more (space-3), so each 34px control's touch area
             reaches 44px before meeting its neighbour's: the touch areas' gap
             (`--hit-gap-x`, which .touch-hit reads) switches with it. -->
        <!-- svelte-ignore a11y_no_static_element_interactions: a press on the controls only keeps the field's focus; the controls are buttons -->
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: a press on the controls only keeps the field's focus; the controls are buttons -->
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press on the controls only keeps the field's focus; the controls are buttons -->
        <div
          data-slot="ctrls"
          class={[
            "group/ctrls flex items-center gap-space-2 coarse:gap-space-3 hit-gap-x-space-2 coarse:hit-gap-x-space-3 flex-none transition-fade-show group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-asking/dock:transition-fade-hide",
            also && "ms-auto",
          ]}
          inert={!!recalling.recall}
          onmousedown={(event) => {
            // The field keeps the focus through a press here (`focused`):
            // the draft stays as tall as it is, so the press stays on its button.
            if (field && document.activeElement === field) {
              event.preventDefault();
            }
          }}
          bind:this={recalling.ctrls}
        >
          {#if attach}
            <AttachButton
              {draft}
              ghost={!!action}
              ondraw={canvas.room && recallOf
                ? () => canvas.room?.open()
                : undefined}
              onfind={find ? () => find.show() : undefined}
            />
          {/if}
          {@render also?.()}
          <!-- Pending from the press until the hub takes the message: the glyph
           slot turns to the kit spinner and presses are swallowed. It sends
           only what the hub has whole (`draft.unready`, submit's own rule): off
           while a file is still uploading or has failed, until it is retried
           or removed; Enter on it says which, in the send-error line. -->
          <!-- Send is the kit's (ui/button `sendVariants`). Optical centring: the
               send plane's mass sits low-left of its box, so the glyph is
               nudged up and right to look centred rather than measure
               centred. -->
          <button
            data-slot="stop"
            aria-busy={sender.pending || undefined}
            aria-disabled={sender.pending || held || undefined}
            aria-label={action ??
              (stops ? "Stop the agent" : transcriptWords.sendMessage)}
            class={sendVariants({ class: "group/stop select-none touch-hit" })}
            title={action}
            disabled={!(
              busy ||
              sender.pending ||
              (draft.hasContent && !draft.unready)
            )}
            onclick={whileIdle(() => sender.pending, onaction)}
            type="button"
          >
            <!-- The one control that changes meaning mid-turn. `{#key}` re-creates
             the glyph on every flip, so BOTH directions of the swap animate in;
             the box it sits in is untouched, so send↔stop never moves or
             resizes under a thumb already travelling toward it. -->
            {#key sender.pending ? "wait" : stops}
              <!-- The glyph carrier, not the button: it is content-sized and
                   centred, so scaling it in cannot change the control's box.
                   The one cell of the button's grid: an outgoing glyph and
                   its replacement overlap there while they cross-fade. -->
              <!-- The glyph swapping in; reduced motion keeps the fade: no
                   scale, no blur. The optical nudge is on the carrier's
                   `translate`, which the swap's `transform` does not touch. -->
              <span
                data-slot="swap"
                class="row-start-1 col-start-1 grid place-items-center motion-safe:animate-icon-swap motion-reduce:animate-icon-swap-still group-enabled/stop:translate-x-(--optical-nudge) group-enabled/stop:-translate-y-(--optical-nudge)"
                out:glyphOut
              >
                {#if sender.pending}
                  <Spinner aria-hidden="true" role="presentation" />
                {:else if stops}
                  <IconStop />
                {:else}
                  <IconSend />
                {/if}
              </span>
            {/key}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
