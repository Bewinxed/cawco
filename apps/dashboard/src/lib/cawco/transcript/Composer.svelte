<script lang="ts" module>
  import type { PermissionResult } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import type { PendingPermission } from "../client.svelte";

  /**
   * What a composer stands over the transcript's foot, in px: `stack`, the
   * panel with the tray row and what stands on it, or the grown ask when it
   * reaches higher; `perch`, how far Caw perched on the pill rises over its
   * top (0 with no perch, or while an ask has it stepped aside); `parked`,
   * what stands higher than the panel and its tray row (0 with nothing);
   * `shelf`, the delegate tray's shelf open between its row and the panel
   * (0 shut), which the transcript makes room for and a pinned tail follows.
   */
  export interface ComposerFoot {
    parked: number;
    perch: number;
    shelf: number;
    stack: number;
  }

  /**
   * The ask a conversation has parked on its composer, the first of those
   * waiting: the composer grows into it until it is answered or withdrawn.
   */
  export interface ComposerAsk {
    /** Who asks, as the conversation names its agent ("Caw" in a thread). */
    asker: string;
    /** How many more asks wait behind this one. */
    more: number;
    /** Submits its answer; the id of the command it went out as (Prompt). */
    onanswer: (result: PermissionResult) => string | null;
    request: PendingPermission;
  }

  /**
   * One conversation's row above the composer: the offer standing on it and
   * its delegate tray. A composer keeps the row of every conversation it can
   * be handed (`trayRows`) and draws the one it writes to (`showing`): handed the
   * next, it shows that one's, already built and laid out, where building it
   * in the switch put its offer, its tray and their chips into the page
   * inside the click.
   */
  export interface TrayRow {
    /** The session whose delegates its tray shows; empty for none. */
    delegatesOf: string;
    /** The conversation's id: what `showing` names. */
    id: string;
    /** What stands on the tray row: an offer, never an ask. */
    prompts?: Snippet;
  }
</script>

<script lang="ts">
  import { type AvailableCommand, questionsOf } from "@cawco/core";
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
  import { autosize } from "#lib/cawco/motion/autosize.svelte.js";
  import {
    CURVE,
    dur,
    ease,
    easeDrawer,
    easeOut,
    motionOk,
    popScale,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { handOver, reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { departBox } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { whileIdle } from "#lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Command from "#lib/components/ui/command/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconChevronUp, IconSend, IconStop } from "#lib/icons.js";
  import { handBack, stages } from "../canvas/stage.svelte";
  import {
    cawco,
    readOlderPage,
    replaceQueued,
    type SendExtras,
    userTurnActions,
  } from "../client.svelte";
  import { cleanDetail } from "../command-detail";
  import { debugFault } from "../debug-fault";
  import { felt } from "../feel.svelte";
  import MentionField from "../find/MentionField.svelte";
  import { readAs } from "../find/mention.svelte";
  import { mcpSignInIntent, signInToMcp } from "../fleet";
  import CawFace from "../home/CawFace.svelte";
  import { newId } from "../id";
  import { carriesFiles } from "../internal-drag";
  import { minimizedAsks } from "../minimized-asks.svelte";
  import {
    loadSuggestSetting,
    type SuggestCandidate,
    suggestions,
  } from "../suggest.svelte";
  import type { Message } from "../types";
  import AttachButton from "./AttachButton.svelte";
  import AttachmentChips from "./AttachmentChips.svelte";
  import { CanvasRoom } from "./canvas-room.svelte";
  import type { ComposerDraft } from "./composer-draft.svelte";
  import { stand } from "./composer-presence.svelte";
  import DelegateTray from "./DelegateTray.svelte";
  import { GrownShape, layoutScale, measureShape } from "./grown";
  import {
    asBubble,
    asField,
    bubbleBox,
    bubbleWords,
    fieldBox,
    LEFT_BY,
    landing as landingWords,
    liftAsk,
    notEdited,
    readFirst,
    replacing,
    startFlight,
    watchReplace,
    writesTo,
  } from "./lift.svelte";
  import Prompt from "./Prompt.svelte";
  import RecallWheel from "./RecallWheel.svelte";
  import { sentByReader } from "./recall";
  import { opensTurn } from "./rows";
  import SuggestionChips from "./SuggestionChips.svelte";

  let {
    draft,
    agentName = "The agent",
    busy = false,
    sending = false,
    sendError = "",
    sendAgain = false,
    held = false,
    paneVisible = true,
    commands = [],
    mentionsFrom = null,
    onsubmit,
    oninterruptsend,
    onmenu,
    onstop,
    trayRows = [],
    showing = "",
    ask = null,
    perch,
    planRing,
    onfoot,
    placeholder,
    suggest,
    recallOf,
    switchDir = 0,
    landing = { done: Promise.resolve(), ms: () => 0 },
    attach = true,
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
     * A swipe is carrying the conversations under this composer. The action
     * button waits until one has landed, so nothing is sent to a chat that
     * is on its way off screen.
     */
    held?: boolean;
    paneVisible?: boolean;
    /** What this session offers behind `/`. */
    commands?: AvailableCommand[];
    /**
     * The conversation this composer writes to: `@` names what else the
     * hub finds by name (threads, conversations, machines), ranked there as
     * the Jump palette is. Null: `@` names nothing here.
     */
    mentionsFrom?: string | null;
    /**
     * `id` is the uuid the message is sent under, minted here so the text can
     * fly into the row that carries it before the send has left.
     */
    onsubmit: (text: string, extras: SendExtras, id: string) => void;
    /**
     * The queue-jump (mod+Enter): interrupt the turn in flight, then send.
     * Optional — a composer without it (the spawn form) treats mod+Enter as a
     * plain send, which on an idle surface is the same thing.
     */
    oninterruptsend?: (text: string, extras: SendExtras, id: string) => void;
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
     * What stands on the pill's top-leading corner, its box's foot on the
     * pill's top edge: a project's Caw peeking over the composer.
     */
    perch?: Snippet;
    /**
     * How far the conversation's plan has got, as the control that opens it
     * (PlanRing), at the tray row's trailing end; none while it has no plan.
     */
    planRing?: Snippet;
    /** What it stands over the transcript's foot, told to the pane it is lent to. */
    onfoot?: (foot: ComposerFoot) => void;
    /** The field's hint, for a surface whose agent takes no `/` or `@`. */
    placeholder?: string;
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
  } = $props();

  $effect(() => {
    if (suggest) {
      loadSuggestSetting();
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

  // On screen, this composer is what the desk's toasts rise above.
  const presence = {};
  $effect(() => {
    if (paneVisible) {
      return stand(presence, standing);
    }
  });
  // What stands over the transcript's foot, told to the pane it is lent to
  // (its fade and its "Jump to latest" rest on it).
  $effect(() => {
    onfoot?.({
      stack: standing,
      perch: perch && !askRaised ? perchHeight : 0,
      parked: standing - panel - lift,
      shelf: showing ? (shelves[showing] ?? 0) : 0,
    });
  });
  /** The field (MentionField's editable box), and the MentionField, whose caret is in the draft's offsets. */
  let field = $state<HTMLDivElement | null>(null);
  let mentionField = $state<ReturnType<typeof MentionField>>();
  /** A phone's @ menu: its rows wrap, and it drags down to go. */
  const phone = new MediaQuery(NARROW_QUERY);

  /** The field's hint in full, and its first part, which fits any field. */
  const HINT = $derived(
    placeholder ?? "Message the agent…  /  for commands, @ to mention"
  );
  const HINT_SHORT = $derived(placeholder ?? "Message the agent…");
  /** What the field is called, read out: its hint without the trailing ellipsis. */
  const FIELD_LABEL = $derived(HINT_SHORT.replace(/…$/, ""));
  /**
   * The hint the field shows: in full wherever the field's own width holds
   * it on one line, else its first part. The server draws the short one,
   * so no first paint shows a hint cut off, and the field's measured width
   * brings in the full one once it is on the page. It is the field that is
   * measured, not the viewport: a narrow pane on a wide screen is narrow.
   */
  let hint = $state(untrack(() => HINT_SHORT));
  /** How far the perch stands above the pill: the parked cards stand clear of it, above. */
  let perchHeight = $state(0);
  const fitHint = (node: HTMLElement) => {
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;inset-block-start:0;inset-inline-start:-9999px";
    probe.textContent = HINT;
    node.after(probe);
    const fit = () => {
      const style = getComputedStyle(node);
      probe.style.font = style.font;
      probe.style.letterSpacing = style.getPropertyValue("--hint-track");
      const room =
        node.clientWidth -
        Number.parseFloat(style.paddingInlineStart) -
        Number.parseFloat(style.paddingInlineEnd);
      // Laid out, as the room is: a panel rising out of its scale shows the
      // probe narrower than the hint will stand.
      hint =
        probe.getBoundingClientRect().width / layoutScale(node) <= room
          ? HINT
          : HINT_SHORT;
    };
    const sizes = new ResizeObserver(fit);
    sizes.observe(node);
    // The body face may land after the first measure, at a new width.
    let live = true;
    document.fonts.ready.then(() => {
      if (live) {
        fit();
      }
    });
    return () => {
      live = false;
      sizes.disconnect();
      probe.remove();
    };
  };
  /** The suggestion row, for Tab and Shift+Tab. */
  let chips = $state<ReturnType<typeof SuggestionChips>>();

  /** A `/` or `@` token stops being typed as one the moment it holds whitespace. */
  const TOKEN_WHITESPACE = /\s/;

  /**
   * The words put back from outside (Edit on a failed send, a starter) land
   * with focus and the caret after them, and fade up in the field over
   * --dur-control rather than replacing what was there in one frame. Their
   * attachments come back with them, and the row that holds those folds
   * open above the field. The caret waits for the tick: the field draws the
   * words in its own effect, and drawing them drops any selection.
   */
  $effect(() => {
    if (draft.focusWanted) {
      field?.focus();
      tick().then(() => mentionField?.select(draft.text.length));
      field?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
      draft.focusWanted = false;
    }
  });

  /**
   * The composer arriving where a read-only note stood (and back): the two
   * cross-fade over --dur-control and the composer rises 8px into place.
   * Reduced motion keeps the fade.
   */
  function rise(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t, u) =>
        still ? `opacity: ${t}` : `opacity: ${t}; translate: 0 ${u * 8}px`,
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
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; scale: ${1 - u * 0.75}; filter: blur(${u * 4}px)`,
    };
  }
  function fade(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /**
   * A minimized question's bar comes into the tray row once the card's
   * fold (--dur-grow-exit) has landed, so the two never stand in one place
   * at once: the fold speeds up as it goes and only crosses the tray row in
   * its last frames (measured at 390: 210 of its 220ms). It comes up 8px
   * out of a 4px blur over --dur-control, as the card's own parts come up
   * (Prompt `.part`). Reduced motion keeps the fade, with no wait.
   */
  function askedIn(_node: Element): TransitionConfig {
    const still = !motionOk.current;
    return {
      delay: still ? 0 : dur("--dur-grow-exit"),
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; translate: 0 ${u * 8}px; filter: blur(${u * 4}px)`,
    };
  }
  /** The bar gives way to the card growing over it: a fade over --dur-exit. */
  function askedOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }

  /**
   * The `/` and `@` menu leaves the way the kit's surfaces leave
   * (app.css `.kit-pop[data-state="closed"]`, here `data-side="top"`): back
   * down toward the field it stands on, shrinking to the pop scale as it
   * fades, over --dur-exit. It comes in by the kit's own `@starting-style`.
   */
  function menuOut(node: HTMLElement): TransitionConfig {
    const duration = dur("--dur-exit");
    if (!motionOk.current) {
      return { duration, css: (t) => `opacity: ${t}` };
    }
    const scale = popScale();
    const lift = Number.parseFloat(
      getComputedStyle(node).getPropertyValue("--pop-rise")
    );
    return {
      duration,
      easing: easeDrawer,
      css: (t) =>
        `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: 0 ${((1 - t) * lift).toFixed(2)}px`,
    };
  }

  /* ---- the `/` and `@` menu ------------------------------------------- */

  /** One row of the menu, whichever sigil opened it. */
  interface Entry {
    detail?: string;
    /** Command.Item's value, and what the highlight is tracked by. */
    id: string;
    /** What replaces the typed token, sigil included. */
    insert: string;
    /** Which `/` family it belongs to — the menu is sectioned by this. */
    kind?: AvailableCommand["type"];
    label: string;
    /** The plugin or MCP server it came from, shown as a quiet origin tag. */
    source?: string;
  }

  /** One titled section of the menu. */
  interface Section {
    entries: Entry[];
    heading: string;
    key: string;
  }

  /**
   * Which section a command belongs to. A plugin-heavy session's `/` list is
   * almost entirely namespaced (`interfaces:better-ui`, `code-foundations:build`)
   * — grouping by the four coarse families would file them all under one
   * "Commands" heading, which is the mess. So the section is the command's
   * SOURCE when it has one: its plugin, or the MCP server that lent it. Skills
   * and bare built-ins, which carry no namespace, keep their family name.
   *
   * `rank` orders the sections: skills first, then plugins (by name), then the
   * built-ins, then MCP servers (by name).
   */
  function sectionMeta(entry: Entry): {
    key: string;
    heading: string;
    rank: number;
    sub: string;
  } {
    if (entry.kind === "skill") {
      return { key: "skills", heading: "Skills", rank: 0, sub: "" };
    }
    if (entry.kind === "mcp") {
      const server = entry.source ?? "";
      return {
        key: `mcp:${server}`,
        heading: server || "MCP",
        rank: 3,
        sub: server,
      };
    }
    if (entry.source) {
      return {
        key: `src:${entry.source}`,
        heading: entry.source,
        rank: 1,
        sub: entry.source,
      };
    }
    if (entry.kind === "builtin") {
      return { key: "builtin", heading: "Built-in", rank: 2, sub: "" };
    }
    return { key: "commands", heading: "Commands", rank: 1, sub: "" };
  }

  /**
   * The name a row shows. Under a source heading the namespace is redundant, so
   * `interfaces:better-ui` reads as `/better-ui` beneath "interfaces", and an
   * MCP prompt drops its `mcp__server__` prefix. The value inserted keeps the
   * full name — only the label is shortened.
   */
  function displayLabel(name: string, source?: string): string {
    if (name.startsWith("mcp__")) {
      const rest = name.split("__").slice(2).join("__");
      return `/${rest || name}`;
    }
    if (source && name.startsWith(`${source}:`)) {
      return `/${name.slice(source.length + 1)}`;
    }
    return `/${name}`;
  }

  /**
   * The prose a row shows. Plugin descriptions often lead with their own name in
   * parens — `(code-foundations) Execute…` — which is exactly the section heading
   * above the row, so it is stripped here rather than printed twice.
   */
  /** Where the caret is, so the token under it can be found on every keystroke. */
  let caret = $state(0);
  /** Dismissed with Escape: the token is still there, the menu is not. */
  let dismissed = $state(false);
  let highlight = $state("");

  /**
   * A composer handed another conversation's draft starts that draft with
   * its menu closed: the caret this one last noted was in the other text.
   */
  $effect.pre(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs when the composer is pointed at another conversation's draft
    void draft;
    untrack(() => {
      dismissed = true;
      caret = draft.text.length;
    });
  });

  /**
   * Another conversation's words take the field's place the way its
   * transcript does: the words that stood there slide 16px away from the
   * incoming tab's side as they fade, and the new ones slide in from that
   * side and fade up, typed out so the last character lands as the field's
   * height glide ends: the field holds its height until the transcript has
   * landed ({@link holdUntil}), then glides on its own transition. Both are
   * drawn on an overlay laid over the field's text box, each laid out as its
   * full text with the part not yet typed clear, so every line already
   * stands where the field will put it and nothing moves vertically. The
   * field keeps its layout, height tween and focus underneath, its own text
   * clear. A switch mid-flight sends off what is on screen, from where it
   * is; the text changing in place (typing, a send, a chip) lands it at once.
   */
  interface Flight {
    dir: number;
    /** Where the words leaving stand as they start to go. */
    from: { transform: string; opacity: string };
    /** The words leaving, and the part of them that was never typed. */
    out: string;
    /** How far the words leaving drop from the field's foot ({@link scrollDrop}). */
    outDrop: number;
    outRest: string;
    /** The width the words leaving wrapped at in the field ({@link wrapOf}). */
    outWrap: number;
    text: string;
  }
  const FLIGHT_PX = 16;
  let flight = $state<Flight | null>(null);
  let typed = $state("");
  /** How far the words arriving drop from the field's foot ({@link scrollDrop}). */
  let inDrop = $state(0);
  /** The width the words arriving wrap at ({@link wrapOf}). */
  let inWrap = 0;
  let flightOut = $state<HTMLElement>();
  let flightIn = $state<HTMLElement>();
  let flightFrame = 0;
  /** The text the field last showed, and whose; undefined until it has shown one. */
  let shown: string | undefined;
  let shownDraft: ComposerDraft | undefined;

  /** The field's height transition, in the unit the stylesheet wrote it in. */
  function heightMs(node: HTMLElement): number {
    const style = getComputedStyle(node);
    const props = style.transitionProperty.split(",").map((p) => p.trim());
    const durations = style.transitionDuration.split(",").map((d) => d.trim());
    const at = props.findIndex((p) => p === "height" || p === "all");
    if (at < 0) {
      return 0;
    }
    const token = durations[at % durations.length];
    const value = Number.parseFloat(token);
    return token.endsWith("ms") ? value : value * 1000;
  }

  /**
   * A layer stands whole on the field's foot, which puts its last line where
   * a field scrolled to its end shows it. A field scrolled higher shows its
   * lines lower by the scroll range it has left below, so the layer drops by
   * that much. A text the field holds whole has none, and stands as it is.
   */
  const scrollDrop = (whole: number, box: number, scrolled: number) =>
    Math.max(0, whole - box - scrolled);

  /**
   * Where the arriving text will rest once the field has fitted it: the
   * field's height, the text's drop, and the characters in view, as offsets
   * into it. The field's own box and scroll at rest are worked out from the
   * layer, laid out whole at the field's width, and the field's min and max
   * height; the scroll is the field's own, as its bounds at rest will hold
   * it.
   */
  function restOf(
    node: HTMLElement,
    layer: HTMLElement,
    text: string
  ): { fitted: number; drop: number; from: number; to: number } {
    const style = getComputedStyle(node);
    const padTop = Number.parseFloat(style.paddingTop);
    const border = node.offsetHeight - node.clientHeight;
    const whole =
      layer.offsetHeight + padTop + Number.parseFloat(style.paddingBottom);
    const least = Number.parseFloat(style.minHeight) || 0;
    // A field not being written in folds a longer draft to its first line.
    const folding = folds(whole + border);
    const cap = folding
      ? least
      : Number.parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY;
    const box = Math.min(Math.max(whole + border, least), cap) - border;
    const fitted = box + border;
    if (whole <= box) {
      return { fitted, drop: 0, from: 0, to: text.length };
    }
    const scrolled = folding ? 0 : Math.min(node.scrollTop, whole - box);
    const [from, to] = inView(layer, text, scrolled - padTop, box);
    return { fitted, drop: scrollDrop(whole, box, scrolled), from, to };
  }

  /**
   * The characters of `text` on the lines a box `box` tall shows from `top`
   * down, measured on a hidden copy of `layer` holding the whole text.
   */
  function inView(
    layer: HTMLElement,
    text: string,
    top: number,
    box: number
  ): [number, number] {
    const probe = layer.cloneNode(false) as HTMLElement;
    probe.removeAttribute("data-rest");
    probe.removeAttribute("style");
    probe.style.visibility = "hidden";
    probe.textContent = text;
    layer.after(probe);
    const glyphs = probe.firstChild as Text;
    const origin = probe.getBoundingClientRect().top;
    const range = document.createRange();
    /** The foot of the line character `at` is on. */
    const footOf = (at: number) => {
      range.setStart(glyphs, 0);
      range.setEnd(glyphs, at + 1);
      return range.getBoundingClientRect().bottom - origin;
    };
    /** The head of the line character `at` is on. */
    const headOf = (at: number) => {
      range.setStart(glyphs, at);
      range.setEnd(glyphs, text.length);
      return range.getBoundingClientRect().top - origin;
    };
    /** The first character from `start` on for which `past` holds; they are in order. */
    const first = (start: number, past: (at: number) => boolean) => {
      let lo = start;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (past(mid)) {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
      return lo;
    };
    const from = first(0, (at) => footOf(at) > top + 0.5);
    const to = first(from, (at) => headOf(at) >= top + box - 0.5);
    probe.remove();
    return [from, to];
  }

  /**
   * When the field's height glide ends, off the glide's own start (the
   * frame the fit landed in); null until it has started.
   */
  function glideEndOf(node: HTMLElement, ms: number): number | null {
    const run = node
      .getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.transitionProperty === "height"
      );
    return typeof run?.startTime === "number" ? run.startTime + ms : null;
  }

  /**
   * The width the field's text wraps at: its client width less its inline
   * padding. The field draws no scrollbar (its stylesheet), so this is its
   * width in every state; it changes only with the row around it, which is
   * why the words leaving are read before a switch and the words arriving
   * after it.
   */
  function wrapOf(node: HTMLElement): number {
    const style = getComputedStyle(node);
    return (
      node.clientWidth -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd)
    );
  }

  /**
   * The field's scroll cue, standing in for the scrollbar it does not draw:
   * `cue-top` while text is scrolled out above, `cue-bottom` while there is
   * more below, and neither when the text fits. The stylesheet fades that
   * edge. Kept current as the field scrolls, resizes (a glide, a fold) and
   * is handed another draft.
   */
  let cueTop = $state(false);
  let cueBottom = $state(false);
  /**
   * The field as it was last laid out: how far its text is scrolled past its
   * drop, and the width its text wraps at. Kept by the cue, which reads the
   * field wherever it already lays out (its scroll, its resize, the frame
   * after its text moves), so a switch flies the words leaving off this
   * (`fly`): read off the field in the switch itself, the page was laid out
   * in the click with the pane just shown dirty, styling the whole page in
   * that task.
   */
  let laidOut = { drop: 0, wrap: 0 };
  function scrollCue(node: HTMLElement) {
    const cue = () => {
      const hidden = node.scrollHeight - node.clientHeight;
      cueTop = hidden > 1 && node.scrollTop > 1;
      cueBottom = hidden > 1 && node.scrollTop < hidden - 1;
      laidOut = {
        drop: scrollDrop(node.scrollHeight, node.clientHeight, node.scrollTop),
        wrap: wrapOf(node),
      };
    };
    let frame = 0;
    $effect(() => {
      // biome-ignore lint/complexity/noVoid: read-only dependency — a new draft or text re-reads the scroll
      void draft.text;
      frame = requestAnimationFrame(cue);
    });
    const sizes = new ResizeObserver(cue);
    sizes.observe(node);
    node.addEventListener("scroll", cue, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      node.removeEventListener("scroll", cue);
    };
  }

  function endFlight(): void {
    cancelAnimationFrame(flightFrame);
    flight = null;
  }

  /**
   * The field keeps its height while the transcript's switch motion runs
   * (`landing`), and glides to the new draft's once it has landed, so the
   * words being typed in finish with the field (`fly`): from a switch until
   * that motion lands, or until the text changes in place. A newer switch
   * holds on to its own landing. The field's further lines stand over the
   * transcript's foot, so neither its height nor its hold moves a row.
   */
  let holding = $state(false);
  let holdFor: Promise<void> | null = null;

  function holdUntil(done: Promise<void>): void {
    holding = true;
    holdFor = done;
    done.then(() => {
      if (holdFor === done) {
        letGo();
      }
    });
  }

  function letGo(): void {
    holdFor = null;
    holding = false;
  }

  function fly(from: string, to: string, dir: number): void {
    cancelAnimationFrame(flightFrame);
    const was = flight;
    let start = { transform: "none", opacity: "1" };
    let out = from;
    let outRest = "";
    // The field still showing the words leaving, as it was last laid out.
    let outDrop = laidOut.drop;
    let outWrap = laidOut.wrap;
    if (was && flightIn) {
      const style = getComputedStyle(flightIn);
      start = { transform: style.transform, opacity: style.opacity };
      out = typed;
      outRest = was.text.slice(typed.length);
      outDrop = inDrop;
      outWrap = inWrap;
    }
    for (const node of [flightOut, flightIn]) {
      for (const running of node?.getAnimations() ?? []) {
        running.cancel();
      }
    }
    typed = "";
    inDrop = 0;
    flight = { dir, out, outDrop, outRest, outWrap, from: start, text: to };
    flightFrame = requestAnimationFrame((began) => {
      // Both are on the page: the overlay rendered with the switch.
      const node = field as HTMLDivElement;
      const layer = flightIn as HTMLElement;
      const ms = heightMs(node);
      // The words arriving wrap where the field, now in its new row, does;
      // set before the layer is measured.
      inWrap = wrapOf(node);
      layer.style.inlineSize = `${inWrap}px`;
      const rest = restOf(node, layer, to);
      inDrop = rest.drop;
      const timing = {
        duration: ms,
        easing: CURVE.out,
        fill: "forwards",
      } as const;
      flightOut?.animate(
        [start, { transform: `translateX(${-dir * FLIGHT_PX}px)`, opacity: 0 }],
        timing
      );
      flightIn?.animate(
        [
          { transform: `translateX(${dir * FLIGHT_PX}px)`, opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        timing
      );
      // The typing runs from the slide to the end of the field's glide,
      // which starts when the transcript lands: until then its end is where
      // the landing is expected, and once landed it is that frame plus the
      // glide, or that frame alone when the height does not change.
      const glide = Math.abs(rest.fitted - node.offsetHeight) > 0.5 ? ms : 0;
      const expected = began + landing.ms() + glide;
      let glideEnd: number | null = null;
      let letGoAt: number | null = null;
      // The fit runs in the frame the hold lets go or the next; a frame on
      // with no glide running, the height had nothing to glide to.
      const endAt = (now: number): number | null => {
        if (glideEnd !== null || holding) {
          return glideEnd;
        }
        letGoAt ??= now;
        if (!glide) {
          return now;
        }
        return glideEndOf(node, ms) ?? (now > letGoAt ? now : null);
      };
      let count = rest.from;
      const type = (now: number) => {
        glideEnd = endAt(now);
        const end = glideEnd ?? Math.max(expected, now + glide + 1);
        const landed = glideEnd !== null && now >= glideEnd;
        const progress =
          end > began ? Math.min(1, (now - began) / (end - began)) : 1;
        // Typed across what the field will show; what stands above it is
        // there from the start, so the typing is never spent out of view.
        count = Math.max(
          count,
          rest.from + Math.floor((rest.to - rest.from) * easeOut(progress))
        );
        typed = landed ? to : to.slice(0, count);
        flightFrame = requestAnimationFrame(landed ? endFlight : type);
      };
      type(began);
    });
  }

  $effect.pre(() => {
    const next = draft;
    const { text } = draft;
    untrack(() => {
      if (shown !== undefined && next !== shownDraft) {
        holdUntil(landing.done);
        if (motionOk.current && (flight || text !== shown)) {
          // The words as they read, each chip its `@<label>`.
          fly(readAs(shown), readAs(text), switchDir);
        } else {
          endFlight();
        }
      } else if (text !== shown) {
        endFlight();
        letGo();
      }
      shown = text;
      shownDraft = next;
    });
  });

  $effect(() => () => cancelAnimationFrame(flightFrame));

  /**
   * The `/…` the caret sits in the middle of, or null. (`@` is the field's
   * own: MentionField opens the @ menu.)
   *
   * A sigil only opens a menu at the start of a word — mid-token it is a path
   * separator, which the reader is entitled to type without a menu landing
   * on top of it.
   */
  const token = $derived.by((): { query: string; from: number } | null => {
    const at = Math.min(caret, draft.text.length);
    const before = draft.text.slice(0, at);
    const start =
      Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
    const word = before.slice(start);
    if (!word.startsWith("/")) {
      return null;
    }
    const query = word.slice(1);
    // A token with whitespace in it is no longer being typed as one.
    if (TOKEN_WHITESPACE.test(query)) {
      return null;
    }
    return { query, from: start };
  });

  let slashMenuOpen = false;
  $effect(() => {
    const open = token !== null;
    const rising = open && !slashMenuOpen;
    slashMenuOpen = open;
    if (rising) {
      untrack(() => onmenu?.());
    }
  });

  const entries = $derived.by((): Entry[] => {
    const active = token;
    if (!active) {
      return [];
    }
    const needle = active.query.toLowerCase();
    const rows: Entry[] = commands.map((command) => ({
      id: `/${command.name}`,
      insert: `/${command.name}`,
      // The source is the section heading now, so the row shows the short
      // name, then its prose or argument shape — never the word "builtin"
      // as a stand-in description.
      label: displayLabel(command.name, command.source),
      detail: cleanDetail(
        command.description,
        command.argumentHint,
        command.source
      ),
      kind: command.type,
      source: command.source,
    }));
    return (
      rows
        .filter(
          (row) =>
            !needle ||
            row.id.toLowerCase().includes(needle) ||
            row.label.toLowerCase().includes(needle)
        )
        // Grouped and scrollable, so the cap only guards a pathological list; a
        // real session's commands all fit inside it and read under their source.
        .slice(0, 100)
    );
  });

  /**
   * The entries cut into titled sections, by source — one heading per plugin
   * and per MCP server, with skills and built-ins under their family name —
   * ordered skills, plugins (by name), built-ins, MCP servers. A section with
   * no rows is never emitted.
   */
  const sections = $derived.by((): Section[] => {
    if (entries.length === 0) {
      return [];
    }
    debugFault("composer-menu");
    const groups = new Map<
      string,
      { heading: string; rank: number; sub: string; entries: Entry[] }
    >();
    for (const entry of entries) {
      const meta = sectionMeta(entry);
      const bucket = groups.get(meta.key);
      if (bucket) {
        bucket.entries.push(entry);
      } else {
        groups.set(meta.key, {
          heading: meta.heading,
          rank: meta.rank,
          sub: meta.sub,
          entries: [entry],
        });
      }
    }
    return [...groups.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.sub.localeCompare(b.sub) ||
          a.heading.localeCompare(b.heading)
      )
      .map((group) => ({
        key: `${group.rank}:${group.heading}`,
        heading: group.heading,
        entries: group.entries,
      }));
  });

  const menuOpen = $derived(!dismissed && entries.length > 0);

  /**
   * A DOM id per visible row, so the field can point `aria-activedescendant`
   * at the highlighted one. A screen reader on a combobox reads the active
   * descendant, not the input's value — without this the menu is invisible to
   * it, however well the arrow keys work. Keyed by position in the filtered
   * list, which is unique where the entry's own id (`/foo`, `@bar`) is not a
   * safe id token.
   */
  const domIds = $derived(
    new Map(
      entries.map((entry, index) => [entry.id, `composer-entry-${index}`])
    )
  );
  const activeDescendant = $derived(
    menuOpen ? domIds.get(highlight) : undefined
  );

  // The highlight follows the list: a query that filters the selected row away
  // must not leave Enter pointing at something that is no longer on screen.
  $effect(() => {
    if (!menuOpen) {
      return;
    }
    if (!entries.some((entry) => entry.id === highlight)) {
      highlight = entries[0].id;
    }
  });

  function noteCaret(event: Event): void {
    caret = mentionField?.selection()[0] ?? 0;
    dismissed = false;
    if (event.type === "input") {
      sendBlock = "";
      room.error = "";
      draft.notice = "";
      draftNote = "";
    }
  }

  /** Puts the chosen row where the token was, with a space after it. */
  function choose(entry: Entry): void {
    const active = token;
    if (!active) {
      return;
    }
    const end = Math.min(caret, draft.text.length);
    draft.text = `${draft.text.slice(0, active.from)}${entry.insert} ${draft.text.slice(end)}`;
    const next = active.from + entry.insert.length + 1;
    dismissed = true;
    // After the field has drawn the new text, so the caret is set in it.
    tick().then(() => {
      field?.focus();
      mentionField?.select(next);
      caret = next;
    });
  }

  function step(by: number): void {
    if (entries.length === 0) {
      return;
    }
    const at = entries.findIndex((entry) => entry.id === highlight);
    const next = (at + by + entries.length) % entries.length;
    highlight = entries[next].id;
  }

  let sendBlock = $state("");
  const sendNotice = $derived(
    sendError || sendBlock || canvasNotice() || draft.notice
  );
  /**
   * A fleet server this composer opened the sign-in for (`/mcp auth`): over
   * the composer, it waits for the provider until the hub reports the
   * server signed in, then says so.
   */
  let signingIn = $state<string | null>(null);
  /** A word about `/mcp auth` that is not a failure ("already signed in"). */
  let draftNote = $state("");
  const signInNote = $derived.by(() => {
    if (signingIn === null) {
      return draftNote;
    }
    const server = (cawco.fleetMcp ?? []).find((one) => one.name === signingIn);
    return server?.auth?.state === "signed-in"
      ? `${signingIn} is signed in for the fleet.`
      : `Waiting for ${signingIn}: sign in in the tab that opened.`;
  });

  const pending = $derived(sending || canvasWorking());

  function submit(
    via: (text: string, extras: SendExtras, id: string) => void = onsubmit
  ): void {
    if (held) {
      sendBlock = "Finish switching conversations before sending.";
      return;
    }
    if (!draft.hasContent) {
      sendBlock = "Write a message before sending.";
      return;
    }
    if (draft.uploading) {
      sendBlock = "Wait for your file to finish uploading.";
      return;
    }
    if (draft.unready) {
      sendBlock = "A file couldn't upload. Tap it to try again, or remove it.";
      return;
    }
    sendBlock = "";
    draft.notice = "";
    draftNote = "";
    signingIn = null;
    // `/mcp auth <server>` for a fleet server is this browser's own sign-in,
    // not a message: the agent's machine may have no browser at all (a phone is
    // the browser here), and the hub holds the credentials either way.
    // Its words stand over the composer, where it was typed; the session
    // stays where it is while the provider opens in a tab of its own.
    const intent = mcpSignInIntent(draft.text, cawco.fleetMcp ?? []);
    if (intent.kind === "go") {
      const { name } = intent;
      signingIn = name;
      signInToMcp(name).catch((error) => {
        signingIn = null;
        sendBlock = failureWords(error);
      });
      return;
    }
    if (intent.kind === "say") {
      signingIn = null;
      if (intent.level === "error") {
        sendBlock = intent.message;
      } else {
        draftNote = intent.message;
      }
      return;
    }
    if (draft.canvas) {
      sendWithCanvas(via);
      return;
    }
    // The text leaves the field for the one row it becomes (motion/share),
    // keyed by the id the message is sent under. The field is measured
    // before it redraws empty.
    const { text, extras } = draft.take();
    const id = newId();
    departBox(`sent:${id}`, field as HTMLDivElement);
    dismissed = true;
    via(text, extras, id);
  }

  /**
   * A message carrying the canvas: its picture is drawn now and its file,
   * outline and picture join the send, through the attachments and images
   * the send already carries. The canvas's chip flies into the row the
   * message becomes when no words go with it; the words do otherwise. What
   * cannot go says why under the chips and nothing is sent.
   */
  async function sendWithCanvas(
    via: (text: string, extras: SendExtras, id: string) => void
  ): Promise<void> {
    const writing = draft;
    const { canvas } = draft;
    const extra = await room.extras();
    if (!extra || draft !== writing || draft.canvas !== canvas) {
      return;
    }
    const chip = canvas?.folded ? canvasChip : undefined;
    const id = newId();
    if (draft.text.trim() || !chip) {
      departBox(`sent:${id}`, field as HTMLDivElement);
    } else {
      departBox(`sent:${id}`, chip, false);
    }
    const { text, extras } = draft.take();
    dismissed = true;
    extras.attachments = [
      ...(extras.attachments ?? []),
      ...(extra.attachments ?? []),
    ];
    extras.images = [...(extras.images ?? []), ...(extra.images ?? [])];
    via(text, extras, id);
    if (canvas) {
      room.sent(canvas.id);
    }
  }

  /**
   * The `/` and `@` menu owns these keys while it is up — Enter picks a
   * command rather than sending the half-typed name of one. True when the key
   * was the menu's.
   */
  function menuKey(event: KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const picked = entries.find((entry) => entry.id === highlight);
      if (picked) {
        event.preventDefault();
        choose(picked);
        return true;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismissed = true;
      return true;
    }
    return false;
  }

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
    if (canvasKey(event)) {
      return;
    }
    if ((recall && wheel?.key(event)) || recallKey(event)) {
      return;
    }
    // BEFORE the menu: mod+Enter is "interrupt and send" (the shortcut sheet's
    // long-standing promise), and a half-picked menu must not swallow it — the
    // urgency is the point. The menu is dismissed by the submit itself.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit(oninterruptsend ?? onsubmit);
      return;
    }
    if (menuOpen ? menuKey(event) : chipKey(event)) {
      return;
    }
    if (event.key === "Escape" && canvasUp) {
      event.preventDefault();
      room.fold();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  /**
   * The keys recall answers, never over the `/` and `@` menu: while a
   * queued message is edited, Enter and mod+Enter put the words in its
   * place and Esc gives them back as they were; otherwise ↑ with nothing
   * before the caret lifts your queued message, or brings up what you sent.
   * True when the key was recall's.
   */
  function recallKey(event: KeyboardEvent): boolean {
    if (menuOpen) {
      return false;
    }
    if (draft.lifted) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        replaceLifted();
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        returnEdit();
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
    if (recall && event.key === "ArrowUp" && bare) {
      event.preventDefault();
      reopen = true;
      return true;
    }
    if (!(event.key === "ArrowUp" && bare && startsRecall())) {
      return false;
    }
    event.preventDefault();
    const queued = draft.hasContent ? null : liftable();
    if (queued) {
      liftQueued(queued);
    } else {
      openRecall(true);
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
    if (askOpen && !busy) {
      return;
    }
    if (held) {
      submit();
      return;
    }
    if (draft.lifted) {
      replaceLifted();
    } else if (busy) {
      onstop();
    } else {
      submit();
    }
  }

  /* ---- recall: what you sent, and your queued message ----------------- */

  /** The box the pill stands in, which the grown shape and its rows share. */
  let shell = $state<HTMLElement>();
  let pill = $state<HTMLFormElement>();

  /* ---- the canvas: the draft's drawing, standing over the field -------- */

  /** The composer's box (chips, notice, pill), whose top the canvas stands on. */
  let column = $state<HTMLElement>();
  /** The canvas's box over the field, while it stands there. */
  let canvasSlot = $state<HTMLElement>();
  /** The canvas's chip, while it is folded. */
  let canvasChip = $state<HTMLElement>();
  const room = new CanvasRoom({
    column: () => column,
    dock: () => dockEl,
    draft: () => draft,
    field: () => field ?? undefined,
    chip: () => canvasChip,
    pill: () => pill,
    session: () => recallOf,
    shell: () => shell,
    slot: () => canvasSlot,
  });
  /** What went wrong making, reading or sending the canvas, said over the field. */
  function canvasNotice(): string {
    return room.error;
  }
  /** The canvas is being made, or read for a send: Send waits, pending. */
  function canvasWorking(): boolean {
    return room.working;
  }
  /** The canvas stands over the field, or is on its way up or down: the grown shape is the composer. */
  const canvasUp = $derived(room.up);
  /** Its box over the field is laid out while the draft's canvas stands there. */
  const canvasStands = $derived(
    room.up && !!draft.canvas && !draft.canvas.folded
  );

  // The composer handed another conversation's draft: this one's canvas goes,
  // the new one's stands if it was standing.
  let canvasDraft: ComposerDraft | undefined;
  $effect(() => {
    const next = draft;
    untrack(() => {
      if (canvasDraft !== undefined && canvasDraft !== next) {
        room.rebind();
      } else if (
        canvasDraft === undefined &&
        next.canvas &&
        !next.canvas.folded
      ) {
        room.rebind();
      }
      canvasDraft = next;
    });
  });
  // The panel gives a canvas back (Undock, or Done while docked).
  $effect(() => {
    const asked = handBack.ask;
    if (!asked || asked.instanceId !== recallOf) {
      return;
    }
    untrack(() => {
      handBack.ask = null;
      room.takeBack(asked);
    });
  });
  // The panel shows the canvas standing here (picked from its list): it is the panel's.
  $effect(() => {
    const id = draft.canvas?.id;
    const stage = id ? stages.get(id) : undefined;
    if (stage?.at === "panel" && !draft.canvas?.folded) {
      untrack(() => room.yielded());
    }
  });
  $effect(() => {
    const refit = () => room.refit();
    window.addEventListener("resize", refit);
    return () => {
      window.removeEventListener("resize", refit);
      room.destroy();
    };
  });

  /** ⌘⇧D (Ctrl+Shift+D): the canvas opens, or folds when it stands. */
  const isCanvasKey = (event: KeyboardEvent) =>
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "d";

  function canvasKey(event: KeyboardEvent): boolean {
    if (!(recallOf && isCanvasKey(event)) || askOpen) {
      return false;
    }
    event.preventDefault();
    if (recall) {
      wheel?.back();
    }
    room.toggle();
    return true;
  }

  /**
   * The key reaches the composer from anywhere in its group: the field,
   * its chips, the page around it. Escape folds a standing canvas.
   */
  function windowKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || !paneVisible || !dockEl) {
      return;
    }
    const at = document.activeElement;
    const ours =
      !at ||
      at === document.body ||
      !!dockEl.closest('[data-slot="leaf"]')?.contains(at);
    if (!ours || at === field) {
      return;
    }
    if (canvasKey(event)) {
      return;
    }
    if (event.key === "Escape" && canvasUp && !recall) {
      event.preventDefault();
      room.fold();
    }
  }
  const recalled = $derived(recallOf ? cawco.session(recallOf) : null);

  /**
   * The wheel, while it is up: whether keys reach it from the field (a held
   * press leaves the keyboard down), the composer's text when it came up,
   * and where the caret stood in it.
   */
  let recall = $state<{
    keys: boolean;
    text: string;
    caret: [number, number];
    measured: ReturnType<typeof measureShape>;
  } | null>(null);
  /** The pill's buttons, which fold into a deck while the wheel is up. */
  let ctrls = $state<HTMLElement>();
  /** The field's box: the draft's row on the wheel. */
  let fieldWrap = $state<HTMLElement>();
  let wheel = $state<ReturnType<typeof RecallWheel>>();
  /** ↑ pressed while the wheel was folding: it comes up again once folded. */
  let reopen = false;
  /** The wheel's row on the field's line, for a screen reader. */
  let recallActive = $state<string>();
  /**
   * The wheel is up and not yet folding: the field has no caret, and a
   * pick fits the field on the fold's clock once it is off (`.settling`).
   * The pill's own surface steps aside for as long as the wheel is mounted
   * (`.recalling`): its shape is the composer until it has folded away.
   */
  let wheeling = $state(false);
  /**
   * The field's hint fading back in after the wheel has folded away (its
   * timer while it does): it is not drawn while the wheel is up, where it
   * would stand doubled under the row on the line.
   */
  let hintBack = $state<ReturnType<typeof setTimeout> | 0>(0);
  const recallId = `recall-${newId()}`;
  /** What the wheel rolls, read only while it is up. */
  const sentHere = $derived(
    recall && recalled ? sentByReader(recalled.messages) : []
  );

  /**
   * ↑ starts recall only from an empty field or with the caret at its very
   * start, so in a draft it still moves the caret, as a shell's does.
   */
  function startsRecall(): boolean {
    if (!(recallOf && field) || recall || draft.lifted || askOpen || canvasUp) {
      return false;
    }
    const [from, to] = mentionField?.selection() ?? [0, 0];
    return from === to && (draft.text === "" || from === 0);
  }

  /** Your newest message, when it is queued and can still be edited. */
  function liftable(): Message | null {
    const messages = recalled?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (opensTurn(messages[i])) {
        return userTurnActions(messages[i]).edit === "queued"
          ? messages[i]
          : null;
      }
    }
    return null;
  }

  /**
   * Where each of the pill's buttons stands in the deck they fold into
   * while the wheel is up, read before anything is written: Send in front,
   * where it is; each one behind it slid toward it until it peeks out by
   * `--c-deck-peek`, a step smaller (`--c-deck-scale`), whole, so its edge
   * reads behind the one in front and nothing behind it shows through. With
   * reduced motion nothing slides: the ones behind fade out, and the deck is
   * Send alone. Returns each button's place, and where the deck starts
   * (`deck`) and where its first button stands now (`start`), from the
   * shell's inline start.
   */
  function foldDeck(
    row: HTMLElement,
    from: number
  ): { deck: number; start: number; places: DeckPlace[] } {
    const style = getComputedStyle(row);
    const peek = Number.parseFloat(style.getPropertyValue("--c-deck-peek"));
    const scale = Number.parseFloat(style.getPropertyValue("--c-deck-scale"));
    const cards = [...row.children]
      .filter((card): card is HTMLElement => card instanceof HTMLElement)
      .map((card) => ({ card, box: card.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0)
      .reverse();
    const [front] = cards;
    if (!front) {
      const none = Number.POSITIVE_INFINITY;
      return { deck: none, start: none, places: [] };
    }
    const slide = motionOk.current;
    let { left } = front.box;
    // On the device's pixel grid, so each peeking edge is drawn whole, not
    // smeared across two pixels at a fraction of its contrast.
    const grid = window.devicePixelRatio || 1;
    const places = cards.map(({ card, box }, i) => {
      const s = slide ? scale ** i : 1;
      // Its leading edge one peek past the edge of the one in front.
      const edge = Math.round((front.box.left - i * peek) * grid) / grid;
      const x = slide
        ? edge + (box.width * s) / 2 - (box.left + box.width / 2)
        : 0;
      if (slide) {
        left = Math.min(left, edge);
      }
      return { card, x, s, o: slide ? 1 : Number(i === 0) };
    });
    const first = (cards.at(-1)?.box.left ?? left) - from;
    return { deck: left - from, start: slide ? first : left - from, places };
  }

  /** One of the pill's buttons, where it stands in the deck. */
  interface DeckPlace {
    card: HTMLElement;
    o: number;
    s: number;
    x: number;
  }
  /**
   * The buttons folded into the deck, and their motion, while they are, and
   * where the first of them stands unfolded (from the shell's inline start).
   */
  let decked: { places: DeckPlace[]; runs: Animation[]; start: number } | null =
    null;
  /**
   * The deck's leading edge on the move, from the shell's inline start:
   * from `from` to `to` on `run`'s clock, the drawer curve. Every button
   * slides on the same curve, so the first one's edge leads the whole way.
   */
  let deckSlide: { from: number; to: number; run: Animation | null } | null =
    null;

  /**
   * Where the deck's leading edge stands this frame (from the shell's
   * inline start), and whether it has stopped: arithmetic off its motion's
   * clock, no layout read. The wheel's row on the field's line stops short
   * of it at every frame.
   */
  function deckAt(): { at: number; still: boolean } {
    const slide = deckSlide;
    if (!slide) {
      return { at: Number.POSITIVE_INFINITY, still: true };
    }
    const { run } = slide;
    const ms = Number(run?.effect?.getTiming().duration) || 0;
    const moving = run?.playState === "running" || run?.playState === "paused";
    const t =
      run && moving && ms > 0
        ? Math.min(1, Math.max(0, Number(run.currentTime ?? 0) / ms))
        : 1;
    return {
      at: slide.from + (slide.to - slide.from) * easeDrawer(t),
      still: t >= 1,
    };
  }

  /**
   * The buttons slide together into the deck on the wheel's own growth:
   * its --dur-grow on the drawer curve. Transform and opacity only, by the
   * Web Animations API, so the buttons' own transitions stay theirs.
   */
  function deckIn(places: DeckPlace[], from: number, to: number): void {
    deckOut(0);
    const timing = {
      duration: dur("--dur-grow"),
      easing: CURVE.drawer,
      fill: "forwards",
    } as const;
    const runs = places.map(({ card, x, s, o }) =>
      card.animate(
        [
          { translate: "0 0", scale: "1", opacity: 1 },
          { translate: `${x.toFixed(2)}px 0`, scale: String(s), opacity: o },
        ],
        timing
      )
    );
    const stack = { places, runs, start: from };
    decked = stack;
    deckSlide = { from, to, run: runs.at(-1) ?? null };
    // Landed, each card stands where it is as its own style, not held by a
    // motion: a held motion's layer is drawn at full size and scaled, which
    // smears each card's 1px edge across two pixels; standing, it is drawn
    // at its size, its edge whole.
    runs[0]?.finished.then(
      () => {
        if (decked !== stack) {
          return;
        }
        // Its own end, written out (WebKit's commitStyles() has written a
        // finished motion's start).
        for (const [i, { card, x, s, o }] of places.entries()) {
          card.style.translate = `${x.toFixed(2)}px 0`;
          card.style.scale = String(s);
          card.style.opacity = String(o);
          runs[i]?.cancel();
        }
      },
      () => undefined
    );
  }

  /**
   * They fan back out to their places from wherever they are, on the
   * wheel's fold: its --dur-grow-exit on the drawer curve (`ms`: 0 puts
   * them back at once).
   */
  function deckOut(ms = dur("--dur-grow-exit")): void {
    const was = decked;
    decked = null;
    if (!was) {
      return;
    }
    const edge = deckAt().at;
    deckSlide = null;
    // Where each one is drawn now, read before the motion that held it goes.
    const from = was.places.map(({ card }) => {
      const style = getComputedStyle(card);
      return {
        translate: style.translate,
        scale: style.scale,
        opacity: Number(style.opacity),
      };
    });
    for (const run of was.runs) {
      run.cancel();
    }
    for (const { card } of was.places) {
      for (const property of ["translate", "scale", "opacity"]) {
        card.style.removeProperty(property);
      }
    }
    if (ms <= 0) {
      return;
    }
    const runs = was.places.map(({ card }, i) =>
      card.animate([from[i], { translate: "0 0", scale: "1", opacity: 1 }], {
        duration: ms,
        easing: CURVE.drawer,
      })
    );
    deckSlide = { from: edge, to: was.start, run: runs.at(-1) ?? null };
  }

  function openRecall(keys: boolean): void {
    if (
      !(recallOf && field && shell && pill && ctrls) ||
      recall ||
      draft.lifted ||
      askOpen ||
      canvasUp
    ) {
      return;
    }
    // Every size first, before anything is written: one layout per open.
    const measured = measureShape(shell, pill, field);
    const deck = foldDeck(ctrls, shell.getBoundingClientRect().left);
    deckIn(deck.places, deck.start, deck.deck);
    recall = {
      keys,
      text: draft.text,
      caret: mentionField?.selection() ?? [0, 0],
      measured,
    };
    wheeling = true;
    dismissed = true;
    // Keys reach the wheel from the field.
    if (keys) {
      field.focus();
    }
  }

  /**
   * The field's next fit, while a pick taken off the wheel waits on it
   * (autosize `measured`): it runs in the fit, so whatever moves with the
   * field's new height starts in the frame the height does.
   */
  let onFit: ((whole: number) => void) | null = null;

  /**
   * The wheel's pick, into the field. Its first line stays where the
   * wheel's row stood, the words they share in place, and the field fits
   * it on the wheel's fold (`.settling`): growing, its top carries the
   * further lines up; shrinking, the text stands as low as the line and
   * the field's top comes down to it on the same curve. The caret goes
   * after it once it has landed (`recallDone`). Resolves to the pill's
   * height, fitted.
   */
  function recallTake(text: string): Promise<number> {
    const node = field;
    const was = node?.offsetHeight ?? 0;
    const base = pill?.offsetHeight ?? 0;
    deckOut();
    wheeling = false;
    if (!node || text === draft.text) {
      draft.text = text;
      return Promise.resolve(base);
    }
    const fitted = new Promise<number>((done) => {
      onFit = (whole) => {
        onFit = null;
        const cap =
          Number.parseFloat(getComputedStyle(node).maxHeight) ||
          Number.POSITIVE_INFINITY;
        const next = folds(whole) ? floor : Math.min(whole, cap);
        const drop = was - next;
        if (drop > 0.5 && motionOk.current) {
          node.animate([{ translate: `0 ${drop}px` }, { translate: "0 0" }], {
            duration: heightMs(node),
            easing: CURVE.drawer,
          });
        }
        done(base + next - was);
      };
    });
    draft.text = text;
    return fitted;
  }

  /** Back to the draft, the caret where it was, so a key typed lands there. */
  function recallBack(): void {
    deckOut();
    wheeling = false;
    if (recall && field) {
      mentionField?.select(...recall.caret);
    }
  }

  async function recallDone(send: boolean): Promise<void> {
    const was = recall;
    const again = reopen;
    reopen = false;
    recall = null;
    // The field's hint comes back once the rows are gone, never under them.
    clearTimeout(hintBack);
    hintBack = setTimeout(() => {
      hintBack = 0;
    }, dur("--dur-fade"));
    await tick();
    const took = was?.text !== draft.text;
    // Back to the draft and asked for again: it comes straight back up. A
    // pick taken or sent stands; the ↑ was too late for it.
    if (again && !took && !send) {
      openRecall(was?.keys ?? true);
      return;
    }
    // Back to the field if you were typing in it, or to edit what you took;
    // a hold put away leaves the keyboard down.
    if (was?.keys || took) {
      field?.focus();
    }
    if (took && field) {
      // The caret after the pick, ready to edit. A pick past the field's
      // ceiling scrolls to its end, gliding rather than jumping there.
      const from = field.scrollTop;
      mentionField?.select(draft.text.length);
      const to = Math.max(0, field.scrollHeight - field.clientHeight);
      if (to !== from) {
        field.scrollTop = from;
        field.scrollTo({
          top: to,
          behavior: motionOk.current ? "smooth" : "instant",
        });
      }
    }
    if (send) {
      submit();
    }
  }

  // A composer handed another conversation's draft puts the last one's
  // wheel away at once: what it rolled was that conversation's.
  $effect.pre(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs when the composer is pointed at another conversation's draft
    void draft;
    untrack(() => {
      deckOut(0);
      recall = null;
      reopen = false;
      wheeling = false;
    });
  });

  // While the wheel is up, a press anywhere outside the composer puts it
  // away, back to the draft. The grown shape is the composer's: a press on
  // it, around the rows, rolls the wheel as a press on the rows does.
  $effect(() => {
    if (!recall) {
      return;
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!shell?.contains(target)) {
        wheel?.back();
      } else if (target.closest(".grown-halo")) {
        wheel?.grab(event);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });

  // A touch the wheel is rolling must not pan the page under it. Pointer
  // events cannot cancel a pan, and touch-action alone has not always held
  // on iOS Safari, so the touch's own moves are cancelled while it belongs
  // to the wheel: one that began on the composer, or the held press that
  // brought the wheel up mid-touch.
  $effect(() => {
    if (!recall) {
      return;
    }
    let ours = untrack(() => !!hold?.live);
    const began = (event: TouchEvent) => {
      ours = !!shell?.contains(event.target as Node);
    };
    const moved = (event: TouchEvent) => {
      if (ours && event.cancelable) {
        event.preventDefault();
      }
    };
    document.addEventListener("touchstart", began, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", moved, {
      capture: true,
      passive: false,
    });
    return () => {
      document.removeEventListener("touchstart", began, true);
      document.removeEventListener("touchmove", moved, true);
    };
  });

  /*
   * A held press or a swipe up on a touch screen. With the keyboard down the
   * composer is a control you can hold: a finger resting on it
   * --dur-press-hold brings the wheel up under it, and so does one that
   * swipes up off it; dragging while still down rolls it. A swipe's own
   * rise is the opening's: the roll starts where the finger turns back
   * down, so a swipe lifted while still rising leaves the newest message
   * on the line. Lifting leaves it up: a tap on a row takes it, a tap
   * outside puts it away. Moving any other way first is a scroll or a
   * selection; while the field is being typed in (keyboard up) every touch
   * is the field's: scrolling it, selecting, pasting. The pill takes no pan
   * while the keyboard is down (`touch-action`), so a swipe on it never
   * scrolls the page, and a swipe anywhere else is the page's.
   */
  const SLOP = 8;
  let hold = $state.raw<{
    id: number;
    x: number;
    y: number;
    from: number;
    live: boolean;
    /** A swipe that brought the wheel up and is still rising. */
    rising: boolean;
    timer: ReturnType<typeof setTimeout>;
    lastY: number;
    lastAt: number;
    flick: number;
  } | null>(null);
  let swallowClick = false;

  /**
   * A pen on the pill (The pen's swipe): a swipe up with it, by the wheel's
   * own test (past the slop, more up than across), grows the pill into the
   * canvas. A pen never holds the wheel up; that press is a finger's.
   */
  let pen: { id: number; x: number; y: number } | null = null;

  /** The pen on the pill moved: true when the move was the pen's. */
  function penMoved(event: PointerEvent): boolean {
    if (!pen || event.pointerId !== pen.id) {
      return false;
    }
    const dx = event.clientX - pen.x;
    const dy = event.clientY - pen.y;
    if (dy < -SLOP && -dy > Math.abs(dx)) {
      pen = null;
      event.preventDefault();
      room.open();
    } else if (Math.hypot(dx, dy) > SLOP) {
      pen = null;
    }
    return true;
  }

  function onholddown(event: PointerEvent): void {
    if (event.pointerType === "pen") {
      pen =
        recallOf &&
        !(recall || draft.lifted || askOpen || canvasUp) &&
        !(event.target as Element).closest("button, a, input")
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
      return;
    }
    if (
      event.pointerType !== "touch" ||
      !recallOf ||
      recall ||
      draft.lifted ||
      askOpen ||
      document.activeElement === field
    ) {
      return;
    }
    // Its own controls answer a press themselves.
    if ((event.target as Element).closest("button, a, input")) {
      return;
    }
    const press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: event.clientY,
      live: false,
      rising: false,
      lastY: event.clientY,
      lastAt: 0,
      flick: 0,
      timer: setTimeout(() => {
        if (hold?.id !== press.id) {
          return;
        }
        hold.live = true;
        hold.from = hold.lastY;
        hold.lastAt = performance.now();
        felt("hold");
        openRecall(false);
      }, dur("--dur-press-hold")),
    };
    hold = press;
  }

  $effect(() => {
    const moved = (event: PointerEvent) => {
      if (penMoved(event)) {
        return;
      }
      const press = hold;
      if (!press || event.pointerId !== press.id) {
        return;
      }
      const now = performance.now();
      if (!press.live) {
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (dy < -SLOP && -dy > Math.abs(dx)) {
          // A swipe up: the wheel comes up under the finger.
          clearTimeout(press.timer);
          press.live = true;
          press.rising = true;
          press.from = event.clientY;
          press.lastY = event.clientY;
          press.lastAt = now;
          felt("hold");
          openRecall(false);
        } else if (Math.hypot(dx, dy) > SLOP) {
          clearTimeout(press.timer);
          hold = null;
        } else {
          press.lastY = event.clientY;
        }
        return;
      }
      event.preventDefault();
      if (press.rising) {
        if (event.clientY <= press.from) {
          press.from = event.clientY;
          press.lastY = event.clientY;
          press.lastAt = now;
          return;
        }
        press.rising = false;
      }
      press.flick =
        (event.clientY - press.lastY) / Math.max(1, now - press.lastAt);
      press.lastY = event.clientY;
      press.lastAt = now;
      wheel?.follow(event.clientY - press.from);
    };
    const lifted = (event: PointerEvent) => {
      if (pen?.id === event.pointerId) {
        pen = null;
      }
      const press = hold;
      if (!press || event.pointerId !== press.id) {
        return;
      }
      clearTimeout(press.timer);
      hold = null;
      if (!press.live) {
        return;
      }
      // The press is spent: no click on what it lifted from, no focus in
      // the field.
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, dur("--dur-press-hold"));
      wheel?.release(press.flick);
    };
    document.addEventListener("pointermove", moved, { passive: false });
    document.addEventListener("pointerup", lifted);
    document.addEventListener("pointercancel", lifted);
    return () => {
      document.removeEventListener("pointermove", moved);
      document.removeEventListener("pointerup", lifted);
      document.removeEventListener("pointercancel", lifted);
    };
  });

  /** iOS still starts its own press gestures under a live hold: the callout, the focus on lift. */
  function onholdnative(event: Event): void {
    if (hold?.live || swallowClick) {
      event.preventDefault();
    }
  }
  function onholdclick(event: MouseEvent): void {
    if (swallowClick) {
      event.stopPropagation();
      event.preventDefault();
      swallowClick = false;
    }
  }

  /*
   * While a press is held on the composer, and while the wheel it brought
   * up is up, nothing on the page selects: iOS would otherwise turn the hold
   * into a text selection and drag it across the page. Only for a hold: the
   * switch restyles the whole page, which a key or a click has no need of.
   */
  $effect(() => {
    if (!(hold || (recall && !recall.keys))) {
      return;
    }
    const root = document.documentElement;
    root.classList.add("composer-holding");
    getSelection()?.removeAllRanges();
    const refuse = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", refuse);
    return () => {
      root.classList.remove("composer-holding");
      document.removeEventListener("selectstart", refuse);
    };
  });

  /*
   * Your queued message, edited in the composer. Its words lift out of their
   * bubble into the field (lift.svelte.ts) while the composer grows one row
   * out of its pill to say so; Enter puts the edit in its place,
   * Esc (or Keep it, on a touch screen) gives the words back as they were.
   * What the field held steps aside meanwhile and comes back after. The
   * edit belongs to its conversation's draft: a switch away leaves it
   * there, and coming back finds it as it was.
   */
  /** The grown row while a queued message is edited, and where it stands. */
  let edit = $state<{
    inset: number;
    base: number;
    row: number;
    shown: boolean;
  } | null>(null);
  let editShape: GrownShape | null = null;
  /** The sizes a lift read before it wrote anything, for the row it grows. */
  let liftSizes: ReturnType<typeof measureShape> | null = null;
  let editRow = $state<HTMLElement>();
  /** The field's words are flying: it draws them only once they land. */
  let wordsLanded = $state(true);
  /** The flight `wordsLanded` waits for; a newer one owns it. */
  let landingTurn = 0;
  function landAfter(done: Promise<void> | number): void {
    landingTurn += 1;
    const mine = landingTurn;
    wordsLanded = false;
    const land = () => {
      if (landingTurn === mine) {
        wordsLanded = true;
      }
    };
    if (typeof done === "number") {
      setTimeout(land, done);
    } else {
      done.then(land);
    }
  }

  async function liftQueued(message: Message): Promise<void> {
    if (!(field && recallOf) || draft.lifted || recall || askOpen || canvasUp) {
      return;
    }
    // Both ends first, then the change: one layout.
    if (shell && pill) {
      liftSizes = measureShape(shell, pill, field);
    }
    const words = bubbleWords(message.id);
    const from = words ? bubbleBox(words) : null;
    const trip = from && words ? startFlight(asBubble(words), from) : null;
    draft.lift(message.id, message.instanceId, message.content);
    felt("take");
    field.focus();
    await tick();
    mentionField?.select(draft.text.length);
    if (!trip) {
      field.scrollTop = field.scrollHeight;
      return;
    }
    // The field fits its new words in the frame after they land in it
    // (motion/autosize): the height it is growing to is read once it has.
    const flown = new Promise<void>((done) => {
      requestAnimationFrame(async () => {
        if (!field) {
          trip.cancel();
          done();
          return;
        }
        const height =
          Number.parseFloat(field.style.height) || field.offsetHeight;
        // A long message opens scrolled to its end, where the caret is.
        const to = fieldBox(field, { height, whole: natural });
        await trip.fly(asField(field, draft.text), to);
        done();
        field.scrollTop = field.scrollHeight;
      });
    });
    landAfter(flown);
  }

  /**
   * The words go back to their bubble: as they were, or as `replaced` says
   * they now are. What stepped aside comes back into the field.
   */
  async function returnEdit(replaced?: string): Promise<void> {
    const lift = draft.lifted;
    if (!(lift && field)) {
      return;
    }
    const leaving = draft.text;
    const from = fieldBox(field);
    const trip = startFlight(asField(field, leaving), from);
    // What the field holds again shows once the words leaving it are gone.
    if (motionOk.current) {
      landAfter(dur("--dur-lift") * LEFT_BY);
    }
    if (replaced !== undefined) {
      replacing.set(lift.id, replaced);
    }
    landingWords.add(lift.id);
    felt("give back");
    draft.putBack();
    field.focus();
    await tick();
    const words = bubbleWords(lift.id);
    if (!words) {
      trip.cancel();
      landingWords.delete(lift.id);
      return;
    }
    // The bubble opens from its tag; on a transcript held at its foot it
    // opens upward, so its words land that much higher than they stand now.
    const log = words.closest('[role="log"]');
    const fold = words.parentElement;
    const atFoot =
      !!log && log.scrollHeight - log.scrollTop - log.clientHeight < 2;
    const grows = atFoot && fold ? words.offsetHeight - fold.offsetHeight : 0;
    const to = bubbleBox(words, grows);
    if (to) {
      await trip.fly(asBubble(words), to);
    } else {
      trip.cancel();
    }
    landingWords.delete(lift.id);
  }

  /** Enter while editing: the field's words go in the queued message's place. */
  async function replaceLifted(): Promise<void> {
    const lift = draft.lifted;
    const message = recalled?.messages.find((m) => m.id === lift?.id);
    if (!(lift && message)) {
      return;
    }
    const words = draft.text.trim();
    if (!words) {
      sendBlock = "Write a message before sending.";
      return;
    }
    if (words === lift.words.trim()) {
      returnEdit();
      return;
    }
    try {
      const sent = await replaceQueued(message, words);
      // Read while the replace was on its way out: the edit is already
      // back in the field, and the withdraw can only say so again.
      if (draft.lifted !== lift) {
        return;
      }
      returnEdit(words);
      watchReplace(draft, {
        id: lift.id,
        instanceId: lift.instanceId,
        withdraw: sent.withdraw,
        replacement: sent.replacement,
        words,
        agent: agentName,
      });
    } catch (error) {
      // The words stay in the field, still the queued message's: Enter
      // tries again, Esc keeps it as it was.
      if (draft.lifted === lift) {
        sendBlock = notEdited(failureWords(error));
      }
    }
  }

  /**
   * The queued message was read while its words were in the field: it can
   * no longer be edited, and the edit stays, with why, to send anew.
   */
  function settleLift(): void {
    const edited = draft.putBack();
    draft.keepEdit(edited);
    draft.notice = `${readFirst(agentName)} Your edit is still in the composer.`;
  }

  $effect(() => {
    const lift = draft.lifted;
    if (!lift) {
      return;
    }
    const message = cawco
      .session(lift.instanceId)
      ?.messages.find((m) => m.id === lift.id);
    if (!(message && userTurnActions(message).edit === "queued")) {
      untrack(settleLift);
    }
  });

  $effect(() => {
    if (recallOf) {
      return writesTo(recallOf);
    }
  });

  // A row asked to lift its message (its Edit, or a tap on touch): the
  // composer writing to that conversation takes it.
  $effect(() => {
    const asked = liftAsk.message;
    if (!asked || asked.instanceId !== recallOf) {
      return;
    }
    untrack(() => {
      liftAsk.message = null;
      if (draft.lifted?.id !== asked.id) {
        if (draft.lifted) {
          returnEdit();
        }
        liftQueued(asked);
      }
    });
  });

  /** Grows the editing row out of the pill. */
  function growEdit(): void {
    if (!(shell && pill && field)) {
      return;
    }
    if (editShape) {
      editShape.morphTo(1, editShape.ext, dur("--dur-grow"));
      if (edit) {
        edit.shown = true;
      }
      return;
    }
    // Measured by the lift before it wrote; a draft lifted elsewhere (a
    // conversation switched to) is measured here.
    const { size } = liftSizes ?? measureShape(shell, pill, field);
    liftSizes = null;
    const { row } = size;
    const shape = new GrownShape(shell, size, row);
    editShape = shape;
    // Inset past the shoulders' curve, so nothing sits against the slope.
    edit = {
      inset: Math.round(shape.taper() + size.r + size.headroom),
      base: size.base,
      row,
      shown: false,
    };
    shape.morphTo(1, row, dur("--dur-grow"));
    // Partway up, once there is room for them.
    setTimeout(
      () => {
        if (edit && editShape === shape) {
          edit.shown = true;
        }
      },
      motionOk.current ? dur("--dur-control") : 0
    );
  }

  async function foldEdit(): Promise<void> {
    const shape = editShape;
    if (!shape) {
      return;
    }
    if (edit) {
      edit.shown = false;
    }
    await shape.morphTo(0, shape.ext, dur("--dur-grow-exit"));
    // Grown again while it folded: it stays.
    if (editShape === shape && !draft.lifted) {
      shape.remove();
      editShape = null;
      edit = null;
    }
  }

  $effect(() => {
    const lifting = !!draft.lifted;
    if (!(shell && pill)) {
      return;
    }
    untrack(() => (lifting ? growEdit() : foldEdit()));
  });

  // The field grows and shrinks as the words are edited: the grown shape and
  // its row stay on the pill's top edge.
  $effect(() => {
    const node = pill;
    if (!(node && edit)) {
      return;
    }
    const sizes = new ResizeObserver(([entry]) => {
      const base = entry.borderBoxSize[0].blockSize;
      if (editShape && edit && Math.abs(base - edit.base) > 0.5) {
        edit.base = base;
        editShape.base = base;
      }
    });
    sizes.observe(node, { box: "border-box" });
    return () => sizes.disconnect();
  });

  $effect(() => {
    if (editRow && editShape && edit) {
      // What it says comes up from inside the shape, never above its edge.
      editShape.clip(editRow, () => ({
        left: edit?.inset ?? 0,
        bottom: edit?.base ?? 0,
        height: edit?.row ?? 0,
      }));
    }
  });

  $effect(() => () => {
    editShape?.remove();
    editShape = null;
  });

  /*
   * A parked ask (a permission, a question) is the composer itself while it
   * waits. The composer grows up out of its pill into the ask's
   * card: the shape the recall wheel and a queued edit grow (grown.ts), its
   * sides straight and its top solid, since an ask has no rows leaning back
   * and no oldest row fading out. What stands over the pill (the delegate
   * tray, the plan's ring, the suggestion chips, an offer, a perch) steps
   * aside while it is up, so nothing covers it, and so do the pill's own
   * controls and the attachments: the only controls in the composer are the
   * ask's. The card stands on the shell's foot, over the pill, so no empty
   * band is left under it; the shape keeps the pill's measured height as its
   * foot and reaches the rest of the card's height above it. The draft stays
   * in the field, unseen and untouched. Answered, dismissed or withdrawn, the
   * ask folds back into the pill and the draft and its attachments are as they
   * were;
   * the next ask waiting takes its place in the grown shape without folding,
   * its parts staggering in again.
   *
   * A question the reader has minimized (minimized-asks.svelte.ts) is not
   * grown: the shape folds back into the pill exactly as for an answer, the
   * tray row and the pill's controls come back, and the question stands as a
   * one-line bar over the tray row (`asked`) until the bar is pressed, when
   * the composer grows into it again. Nothing is answered either way: the
   * ask stays parked on the hub, as it does on iOS, where the pill stays
   * writable under a parked card.
   */
  /** The questions the parked ask puts, if it is a question. */
  const askQuestions = $derived(
    ask
      ? questionsOf(
          ask.request.toolName,
          ask.request.input as Record<string, unknown>
        )
      : null
  );
  /** The parked ask is a question the reader minimized here. */
  const minimized = $derived(
    !!(ask && askQuestions && minimizedAsks.has(ask.request.requestId))
  );
  /** The ask the composer grows into: the parked one, unless it is minimized. */
  const grownAsk = $derived(minimized ? null : ask);
  /** The minimized question's bar. */
  let askedChip = $state<HTMLButtonElement>();

  async function minimizeAsk(): Promise<void> {
    if (!ask) {
      return;
    }
    // Keys that were in the card follow it onto its bar; a finger's swipe
    // leaves focus where it was, so no ring is drawn under a touch.
    const keys = !!askPanel?.contains(document.activeElement);
    minimizedAsks.set(ask.request.requestId, true);
    await tick();
    if (keys) {
      askedChip?.focus();
    }
  }

  function restoreAsk(): void {
    if (ask) {
      minimizedAsks.set(ask.request.requestId, false);
    }
  }

  /** The ask the shape holds: it trails `ask` while one changes into the next. */
  let drawnAsk = $state<ComposerAsk | null>(null);
  /** The composer is an ask, from its growth until its fold has landed. */
  const askOpen = $derived(!!drawnAsk);
  /** Grown, or growing, into an ask: what stands over the pill steps aside. */
  let askRaised = $state(false);
  /** Whether what stands in the shape is up. */
  let askShown = $state(false);
  /**
   * The grown shape's measures: the pill's height when it grew (the shape's
   * foot, held for the whole ask), how far over it the card reaches, and the
   * room the card has.
   */
  let askBox = $state<{
    base: number;
    ext: number;
    max: number;
  } | null>(null);
  let askPanel = $state<HTMLElement>();
  let dockEl = $state<HTMLElement>();
  let askShape: GrownShape | null = null;
  /** The asks answered here since the first of a run came up ("2 of 3"). */
  let askRun = $state(0);
  /** Whose asks the run counts: a switch to another conversation starts anew. */
  let askDraft: ComposerDraft | null = null;
  /** The newest change of ask; an older one still landing leaves it be. */
  let askTurn = 0;
  /** The field had the keys when the ask came up: it has them back after. */
  let askRefocus = false;
  const askId = $derived(grownAsk?.request.requestId ?? null);
  const askPlace = $derived(
    grownAsk && drawnAsk?.request.requestId === grownAsk.request.requestId
      ? { at: askRun + 1, of: askRun + 1 + grownAsk.more }
      : null
  );

  /** The room over the pill the ask can stand in, under the pane's top. */
  function askRoom(): number {
    if (!(dockEl && shell)) {
      return 0;
    }
    const gap = Number.parseFloat(
      getComputedStyle(shell).getPropertyValue("--space-8")
    );
    const { top } = dockEl.getBoundingClientRect();
    // In the layout's px: the panel may still be rising out of its scale.
    const over = (shell.getBoundingClientRect().top - top) / layoutScale(shell);
    return Math.max(0, over - gap);
  }

  /** The shape takes the card's height, from wherever it is drawn. */
  function fitAsk(ms: number, force = false): void {
    if (!(askShape && askPanel && askBox)) {
      return;
    }
    const ext = askPanel.offsetHeight - askBox.base;
    if (!force && Math.abs(ext - askBox.ext) < 0.5) {
      return;
    }
    askBox.ext = ext;
    askShape.morphTo(1, ext, ms);
  }

  async function growAsk(next: ComposerAsk, turn: number): Promise<void> {
    if (!(shell && pill && field)) {
      return;
    }
    // Every size first, before anything is written: one layout per growth.
    const { size } = measureShape(shell, pill, field);
    const max = askRoom();
    // What else grows out of the pill puts itself away: the ask has it.
    if (recall) {
      deckOut(0);
      recall = null;
      reopen = false;
      wheeling = false;
    }
    if (draft.lifted) {
      returnEdit();
    }
    room.stepAside();
    if (document.activeElement === field) {
      askRefocus = true;
      field.blur();
    }
    askDraft = draft;
    askRun = 0;
    askBox = { base: size.base, ext: 0, max };
    drawnAsk = next;
    askRaised = true;
    await tick();
    if (turn !== askTurn || !askPanel) {
      return;
    }
    // The card stands on the shell's foot: the pill's height is its own.
    const ext = askPanel.offsetHeight - size.base;
    askBox.ext = ext;
    const shape = new GrownShape(shell, size, ext, {
      taper: false,
      fade: false,
    });
    askShape = shape;
    // The card comes up from inside the shape, never above its edge.
    shape.clip(askPanel, () => ({
      left: 0,
      bottom: 0,
      height: (askBox?.base ?? 0) + (askBox?.ext ?? 0),
    }));
    shape.morphTo(1, ext, dur("--dur-grow"));
    // Partway up, once there is room for it.
    setTimeout(
      () => {
        if (turn === askTurn) {
          askShown = true;
        }
      },
      motionOk.current ? dur("--dur-control") : 0
    );
  }

  /** The next ask waiting takes the shape's place, grown: no fold between. */
  async function switchAsk(next: ComposerAsk, turn: number): Promise<void> {
    const same = drawnAsk?.request.requestId === next.request.requestId;
    askRaised = true;
    if (!same) {
      askRun = askDraft === draft ? askRun + 1 : 0;
      askDraft = draft;
      askShown = false;
      if (motionOk.current) {
        await new Promise((done) => setTimeout(done, dur("--dur-exit")));
      }
      if (turn !== askTurn) {
        return;
      }
      drawnAsk = next;
      await tick();
      if (turn !== askTurn) {
        return;
      }
    }
    if (askBox) {
      askBox.max = askRoom();
    }
    fitAsk(dur("--dur-fade"), true);
    askShown = true;
  }

  /** Answered, dismissed or withdrawn: back into the pill. */
  async function foldAsk(turn: number): Promise<void> {
    askShown = false;
    askRaised = false;
    const shape = askShape;
    if (shape) {
      // It folds into the pill as it stands now (a long draft folded to its
      // first line as the field let the keys go): the foot takes the pill's
      // height and the reach the rest, so the outline holds still meanwhile.
      if (pill) {
        const base = pill.offsetHeight;
        shape.ext += shape.base - base;
        shape.base = base;
      }
      await shape.morphTo(0, shape.ext, dur("--dur-grow-exit"));
    }
    if (turn !== askTurn) {
      return;
    }
    shape?.remove();
    askShape = null;
    drawnAsk = null;
    askBox = null;
    askRun = 0;
    if (askRefocus) {
      askRefocus = false;
      // Once the field's label is no longer inert: focus does not land in
      // an inert subtree, and the draft would stay folded to its first line.
      await tick();
      if (turn !== askTurn) {
        // Another ask came up meanwhile: its fold gives the keys back.
        askRefocus = true;
        return;
      }
      field?.focus();
    }
  }

  $effect(() => {
    const id = askId;
    if (!(shell && pill && field)) {
      return;
    }
    untrack(() => {
      const drawn = drawnAsk?.request.requestId ?? null;
      if (id === drawn && (id === null || askRaised)) {
        return;
      }
      askTurn += 1;
      if (!grownAsk) {
        // Minimized, the question folds away but is still parked: the
        // keys stay where the reader put them, on the bar.
        if (minimized) {
          askRefocus = false;
        }
        foldAsk(askTurn);
      } else if (drawnAsk) {
        switchAsk(grownAsk, askTurn);
      } else {
        growAsk(grownAsk, askTurn);
      }
    });
  });

  // The card grows (a disclosure opened, a refusal said under its buttons)
  // and the window resizes: the shape follows.
  $effect(() => {
    const node = askPanel;
    if (!node) {
      return;
    }
    const sizes = new ResizeObserver(() => {
      if (askRaised) {
        fitAsk(dur("--dur-fade"));
      }
    });
    sizes.observe(node);
    const remeasure = () => {
      if (askBox) {
        askBox.max = askRoom();
      }
    };
    window.addEventListener("resize", remeasure);
    return () => {
      sizes.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  });

  $effect(() => () => {
    askShape?.remove();
    askShape = null;
  });

  /** Whose queued sends this harness calls queued, for the wheel's rows. */
  const queuedWord = $derived(
    recalled?.harness === "claude" ? "Queued" : undefined
  );

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

  /**
   * The field's one-line height and line height, off its stylesheet, and
   * the height its whole text takes (autosize reports it at each fit).
   */
  let floor = $state(0);
  let lineHeight = $state(0);
  let natural = $state(0);
  $effect(() => {
    if (field) {
      const style = getComputedStyle(field);
      floor = Number.parseFloat(style.minHeight);
      lineHeight = Number.parseFloat(style.lineHeight);
    }
  });
  /** How many lines the draft runs to at the field's width. */
  const lines = $derived(
    lineHeight > 0
      ? Math.max(1, Math.round((natural - floor + lineHeight) / lineHeight))
      : 1
  );
  /**
   * A draft of more than one line folds to its first line while the field
   * is not being written in, and opens to its full height, growing upward
   * over the transcript, when the field takes focus. Folding and opening
   * run over --dur-morph (`folding`); a typed line grows over the field's
   * own --dur-control.
   */
  let focused = $state(false);
  let folding = $state(false);
  const folds = (whole: number) => !focused && whole > floor + 0.5;
  const folded = $derived(folds(natural));
  function refocus(now: boolean): void {
    focused = now;
    folding = lines > 1;
  }

  /**
   * The panel's own height, the delegate tray's standing on it, and the
   * prompt stack's standing on that (what the desk's toasts rise above).
   */
  let panel = $state(0);
  let lift = $state(0);
  /** The plan's ring's width: the delegate tray's row keeps clear of it. */
  let ringWidth = $state(0);
  /**
   * Each conversation's offer as it is laid out, by id, kept as it stands
   * whether shown or not: handed the next conversation, the stack is the
   * height its offer already has, and no offer moves in or out of the
   * column to say so.
   */
  const offerHeights: Record<string, number> = $state({});
  const stack = $derived(offerHeights[showing] ?? 0);

  /** The rows with an offer to stand on the tray row, and those with a tray. */
  const offered = $derived(trayRows.filter((row) => row.prompts));
  const trayed = $derived(trayRows.filter((row) => row.delegatesOf));
  /** Each row's tray shelf as drawn, px (0 shut): the one shown is the foot's `shelf`. */
  const shelves: Record<string, number> = $state({});
  /** The box the offers stand in: a `reflow` container. */
  let offers = $state<HTMLElement>();
  /*
   * Handed another conversation, the offer drawn changes between two built
   * already: nothing arrived or left, so nothing to animate, and nothing for
   * the offers' reflow to read inside the switch (`handOver`). Before the
   * update writes it, so the change it hears is already its own.
   */
  $effect.pre(() => {
    const box = offers;
    if (box && showing) {
      untrack(() => handOver(box));
    }
  });

  /** How high the grown ask stands over the composer's foot; 0 with none up. */
  const askRise = $derived(askRaised && askBox ? askBox.base + askBox.ext : 0);
  /** What the composer stands over the transcript's foot, all told. */
  const standing = $derived(Math.max(panel + lift + stack, askRise));
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
<svelte:window onkeydown={windowKey} />

<!-- What steps aside while an ask holds the composer (--step-aside) comes
     back at once and fades in. On a narrow screen the dock's foot clears the
     home indicator by the resting gap plus the safe area, and the composer,
     the tray row and the cards keep the composer's edges. It stays absolute
     (docked at the bottom of the transcript pane) rather than viewport-fixed,
     so it sits ABOVE the thumb bar instead of overlapping it — the thumb bar
     owns the safe-area inset. -->
<div
  data-slot="dock"
  data-asking={askRaised || undefined}
  data-drawing={canvasUp || undefined}
  data-minimized={minimized || undefined}
  data-perched={!!perch || undefined}
  class="group/dock absolute inset-x-0 top-0 bottom-(--dock-foot) max-desk:bottom-(--dock-foot-narrow) z-20 flex flex-col justify-end items-center pointer-events-none"
  data-keeps-draft
  data-safe-bottom
  bind:this={dockEl}
  style:--perch-rise={perch && perchHeight ? `${perchHeight}px` : null}
  style:--step-aside="opacity var(--dur-fade) var(--ease-out), visibility 0s"
  style:--dock-foot="calc(var(--space-4) + var(--safe-bottom))"
  style:--dock-foot-narrow="calc(var(--space-2) + var(--safe-bottom))"
>
  {#if offered.length > 0}
    <!-- The rest of the dock above the panel, cards stood on its bottom
         edge; the gap to the panel is the stack's own bottom padding, so its
         measured height carries it. A parked card keeps the composer's whole
         row (Prompt: the answer row needs its width) and stands above what
         peeks over the pill, never over it. On a narrow screen the cards keep
         the desktop's step off the panel. -->
    <div
      data-slot="prompts"
      class="grow shrink basis-0 min-h-0 w-c-composer-w flex flex-col justify-end pointer-events-none group-data-perched/dock:pb-(--perch-rise) group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-drawing/dock:opacity-0 group-data-drawing/dock:invisible max-desk:self-stretch max-desk:mx-space-3 max-desk:w-auto max-desk:mb-(--prompts-step)"
      inert={askRaised}
      bind:this={offers}
      {@attach reflow()}
      style:--prompts-step="calc(var(--space-4) - var(--space-2))"
    >
      <!-- Each conversation's offer, built, standing on the stack's foot;
           the one written to is seen, and the stack is as tall as it. What
           the column measures into the composer's height: the offer shown,
           and its step. Every offer stands on its foot out of flow, so a
           switch changes which is seen and the stack's height, never what is
           laid out. -->
      <div
        data-slot="stack"
        class="relative flex-none h-(--stack-h)"
        style:--stack-h="{stack}px"
      >
        {#each offered as row (row.id)}
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
            bind:clientHeight={offerHeights[row.id]}
          >
            {@render row.prompts?.()}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <!-- The row standing on the composer, outside its box: the delegate
       tray's fixed row, and the suggestion chips standing on it (out of
       flow). Both rows are kept clear at every transcript's foot (app.css
       `--c-tray-row`, `--c-suggest-room`). An offer stands on top of both. -->
  <!-- The delegate tray's row, on the composer's width and left edge. It is
       the positioned box the suggestion chips stand on. -->
  <div
    data-slot="lift"
    class="relative flex-none w-c-composer-w pointer-events-none group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-drawing/dock:opacity-0 group-data-drawing/dock:invisible max-desk:self-stretch max-desk:mx-space-3 max-desk:w-auto"
    inert={askRaised}
    bind:clientHeight={lift}
    style:--shelf-rise={shelves[showing] ? `${shelves[showing]}px` : null}
  >
    {#if minimized && ask && askQuestions}
      <!-- The minimized question, in the tray row's place: Caw's needs-you
           face, what it asks, and the chevron it comes back up by. The
           tray's chips and the plan's ring step aside meanwhile, as they do
           while the card is up, so the bar costs the transcript nothing the
           row did not already keep clear. The bar is the tray row's chip
           (app.css .kit-tray-chip) in its needs tone (DelegateTray: a
           session asking for something is the one loud colour), across the
           composer's width, standing in the tray row as the tray's chips do:
           a tray chip high, a tray gap off the pill. It stands under the
           grown shape (`.grown-halo`, z 1): brought back, the card grows over
           the bar as it fades. -->
      {@const [first] = askQuestions}
      <div
        class="absolute inset-0 flex items-end pb-c-tray-gap pointer-events-none"
        in:askedIn
        out:askedOut
      >
        <button
          data-slot="asked-chip"
          aria-label={`Show the question from ${ask.asker}: ${first?.question ?? ""}`}
          class="kit-tray-chip touch-hit w-full min-w-0 text-status-attn-ink pointer-events-auto"
          onclick={restoreAsk}
          type="button"
          bind:this={askedChip}
        >
          <span
            aria-hidden="true"
            class="inline-grid flex-none place-items-center"
            data-box
          >
            <CawFace size={16} status="needs-you" />
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
    {#if suggest && suggestions.enabled}
      <!-- Keyed by conversation: the ranking is of one chat's words, and the
           shared phone composer must not carry it into the next chat. -->
      {#key draft}
        <SuggestionChips
          candidates={suggest.candidates}
          oninsert={insertSuggestion}
          text={draft.text}
          bind:this={chips}
        />
      {/key}
    {/if}
    {#if planRing}
      <!-- The plan's chip, at the tray row's trailing end, standing on the
           tray's line: the step off the panel the delegate chips stand on.
           On the tray's line: risen by the tray's shelf while it is open. -->
      <div
        data-slot="progress-slot"
        class="absolute bottom-(--progress-foot) end-0 z-1 flex items-end h-c-tray-row pb-c-tray-gap pointer-events-auto group-data-minimized/dock:opacity-0 group-data-minimized/dock:invisible"
        bind:clientWidth={ringWidth}
        style:--progress-foot="var(--shelf-rise, 0px)"
      >
        {@render planRing()}
      </div>
    {/if}
    {#if trayed.length > 0}
      <!-- One conversation's tray over the next while they cross-fade, in a
           column the composer's width: an auto column grew to the chips' own
           width. The slot is the tray's one row from the composer's first
           render, chips or none (app.css `--c-tray-row`, which every
           transcript keeps clear), with the tray standing on its foot: a chip
           arriving late fills room already there, and the suggestion row
           standing on the slot never moves. The row, and the tray's shelf
           under it while it is open: the dock grows up by the shelf, and the
           transcript keeps the room. -->
      <!-- literal: the one-cell track -->
      <div
        data-slot="tray-slot"
        class="relative grid grid-cols-(--tray-cols) min-h-c-tray-row group-data-minimized/dock:opacity-0 group-data-minimized/dock:invisible"
        style:--ring-room={planRing
          ? `calc(${ringWidth}px + var(--space-2))`
          : undefined}
        style:--tray-cols="minmax(0, 1fr)"
      >
        <!-- Each conversation's tray, built, in the slot's one cell: handed
             the next, the one written to fades in over the last as it fades
             out, so neither the slot nor anything standing on it moves.
             Opacity only, so it runs with or without motion; the one leaving
             is out of reach once it has faded. -->
        {#each trayed as row (row.id)}
          <div
            data-slot="tray"
            data-composer-away={row.id !== showing || undefined}
            class="row-start-1 col-start-1 data-composer-away:opacity-0 data-composer-away:invisible"
          >
            <DelegateTray
              {held}
              onshelf={(px) => {
                shelves[row.id] = px;
              }}
              parentId={row.delegatesOf}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <!-- Everything in the composer takes the pointer; the composer itself, and
       the canvas's box, do not. -->
  <div
    data-slot="composer"
    class="relative flex-none w-c-composer-w flex flex-col gap-space-3 pointer-events-none max-desk:self-stretch max-desk:mx-space-3 max-desk:w-auto"
    bind:this={column}
    bind:clientHeight={panel}
    in:rise
    out:fade
  >
    {#if canvasStands}
      <!-- The canvas's box over the field: its stage (canvas/) stands on
           it, the grown shape round it and the field. On the composer's top,
           a pixel inside the grown shape's edge; the room writes its height,
           and its left and right when it stands wider than the pill (the
           grown shape's own physical sides). -->
      <div
        data-slot="canvas-slot"
        aria-hidden="true"
        class="absolute left-px right-px bottom-full pointer-events-none"
        bind:this={canvasSlot}
      ></div>
    {/if}
    <!-- The row of attachments is one block above the field, the canvas's
         chip leading it. -->
    <AttachmentChips
      canvasHidden={room.chipHidden}
      {draft}
      onopencanvas={() => room.open()}
      onremovecanvas={() => room.remove()}
      bind:canvasChip
    />

    <!-- A send that failed says so right over the field it left; the way
         back stands on the line that says what failed, after its words.
         While the canvas stands, it stands in the grown shape over the
         field, above its surface. -->
    {#if sendNotice}
      <div
        data-slot="send-error"
        class="pointer-events-auto flex flex-wrap items-center gap-x-space-2 px-space-3 text-status-fail-ink text-size-meta font-normal group-data-drawing/dock:relative group-data-drawing/dock:z-2"
        role="alert"
        transition:unfold
      >
        <p class="min-w-0">{sendNotice}</p>
        {#if sendAgain && sendError === sendNotice}
          <Button
            disabled={pending}
            onclick={() => submit()}
            size="sm"
            variant="ghost">Send again</Button
          >
        {/if}
      </div>
    {:else if signInNote}
      <p
        class="pointer-events-auto px-space-3 text-ink-muted text-size-meta font-normal"
        role="status"
        transition:unfold
      >
        {signInNote}
      </p>
    {/if}

    <!-- The pill, and what grows up out of it over the transcript: the
         recall wheel, or the row that says a queued message is being
         edited. Both stand on the pill's foot, absolutely, so nothing above
         them moves. -->
    <div
      data-slot="shell"
      data-rolling={!!recall || undefined}
      class="relative pointer-events-auto"
      bind:this={shell}
    >
      {#if recall && shell && fieldWrap}
        <RecallWheel
          deck={deckAt}
          draft={recall.text}
          field={fieldWrap}
          id={recallId}
          keys={recall.keys}
          measured={recall.measured}
          more={!!recalled?.cursor}
          older={() => {
            if (recallOf) {
              // biome-ignore lint/complexity/noVoid: the page lands in the session, which the wheel reads
              void readOlderPage(recallOf);
            }
          }}
          onback={recallBack}
          ondone={recallDone}
          ontake={recallTake}
          {queuedWord}
          sent={sentHere}
          {shell}
          bind:this={wheel}
          bind:active={recallActive}
        />
      {/if}
      {#if edit}
        <!-- What is happening, and the two ways out: the keys on a desk, a
             button on a touch screen, which has no Esc. The row the
             composer grows while a queued message is edited, inset past the
             shoulders' curve, and clear of the fade at the grown top. The
             label and the hints come up with the shape one after the other,
             by opacity and translate alone, and sink back as it folds. No
             filter: a blur transitioning here hung WebKit's web process for
             good as the row came up (Playwright WebKit 2359 at an iPhone's
             size, probe-kit safari-blurs), as the ask card's parts did on the
             owner's iPhone. -->
        <div
          data-composer-shown={edit.shown || undefined}
          data-slot="edit-row"
          class="group/edit absolute z-3 inset-x-(--edit-inset) bottom-(--edit-foot) h-(--edit-h) flex items-center gap-space-2 pt-space-1 text-size-meta font-medium text-ink-muted pointer-events-none"
          bind:this={editRow}
          style:--edit-inset="{edit.inset}px"
          style:--edit-foot="{edit.base}px"
          style:--edit-h="{edit.row}px"
        >
          <span
            data-slot="what"
            class="inline-flex items-center gap-space-2 me-auto text-ink-row opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-composer-shown/edit:opacity-100 group-data-composer-shown/edit:translate-none"
            >Editing your queued message</span
          >
          <!-- A touch screen has no Esc: a button keeps the message as it
               was, and the keys are not shown. -->
          <span
            data-slot="hint"
            class="inline-flex items-center gap-space-1 whitespace-nowrap coarse:hidden max-phone:hidden opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-composer-shown/edit:opacity-100 group-data-composer-shown/edit:translate-none"
          >
            <Kbd>Enter</Kbd>
            replaces it · <Kbd>Esc</Kbd> keeps it
          </span>
          <Button
            class="touch-hit"
            data-keep
            onclick={() => returnEdit()}
            size="xs"
            variant="ghost"
          >
            Keep it
          </Button>
        </div>
      {/if}
      {#if drawnAsk && askBox}
        <!-- The ask the composer has grown into, on the shell's foot over
             the pill and cut to the shape as it grows and folds, across the
             composer's width: over the pill, as the wheel's rows and the
             editing row are, so the pill's row is the card's own and no
             empty band stands under it. -->
        <div
          data-slot="ask"
          class="absolute z-3 inset-x-0 bottom-0"
          inert={!askShown}
          bind:this={askPanel}
          style:--ask-max="{askBox.max}px"
        >
          {#key drawnAsk.request.requestId}
            <Prompt
              asker={drawnAsk.asker}
              onanswer={drawnAsk.onanswer}
              onminimize={askQuestions ? minimizeAsk : undefined}
              place={askPlace}
              request={drawnAsk.request}
              shown={askShown}
            />
          {/key}
        </div>
      {/if}
      <!-- With the keyboard down a touch screen's pill is a control to hold
         (the wheel comes up under it); the field being typed in keeps its
         touches. -->
      <!-- One shape, always. --radius-lg outside, --space-2 of inset, and the
           controls inside carry (panel − inset) so the curves are concentric
           rather than two unrelated roundings stacked. The shell is the text
           field (app.css field-shell): keyboard focus in the textarea draws
           the ring over the shell's own border, an outline that moves
           nothing, and the textarea itself draws none. Its one-line box is
           the app's composer tokens (app.css `--c-composer-*`), which every
           transcript keeps clear. It is the panel material (app.css
           `--material-*`, its shell the kit's `.kit-dock-shell`), so the
           transcript shows faintly through it, and opaque where translucency
           is turned down. The pill's box is what grows out of it shares: the
           grown shape is drawn behind the pill and its rows over it. While
           it is grown, the grown shape is the composer: the pill's own
           surface steps aside, and its edge is the control border, never the
           ring. The wheel's shape stays the composer until it has folded back
           into the pill's outline, so the pill's edge never comes back
           across the rows folding with it. Keyboard down, a touch screen's
           pill is a control to hold, so the page does not pan from it; typed
           in, its touches are the field's. -->
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the press handlers read a touch held on the pill for the recall wheel; everything it leads to is also a key (↑, the field's aria-keyshortcuts) -->
      <form
        data-slot="cin"
        data-asking={askOpen || undefined}
        data-grown={!!edit || askOpen || canvasUp || undefined}
        data-hint-back={!!hintBack || undefined}
        data-recalling={!!recall || undefined}
        data-settling={(!!recall && !wheeling) || undefined}
        data-wheeling={wheeling || undefined}
        aria-keyshortcuts={recallOf
          ? "Meta+Shift+D Control+Shift+D"
          : undefined}
        aria-label={FIELD_LABEL}
        class="group/cin kit-dock-shell field-shell relative z-2 py-(--cin-pad) pr-(--cin-pad) pl-space-3 flex items-end gap-space-2 data-recalling:bg-transparent data-recalling:border-transparent data-recalling:shadow-none data-grown:bg-transparent data-grown:border-transparent data-grown:shadow-none not-focus-within:touch-none"
        onclickcapture={onholdclick}
        oncontextmenu={onholdnative}
        onpointerdown={onholddown}
        onsubmit={(e) => e.preventDefault()}
        ontouchend={onholdnative}
        bind:this={pill}
        style:--cin-pad="var(--c-composer-inset)"
        style:--cin-ctl="var(--c-composer-field)"
      >
        {#if perch}
          <!-- On the pill's top-leading corner, its foot on the pill's top
               edge: what stands there (a project's Caw) peeks over the
               composer and takes no pointer. -->
          <div
            data-slot="perch"
            aria-hidden="true"
            class="absolute bottom-full start-space-3 pointer-events-none group-data-asking/dock:opacity-0 group-data-asking/dock:invisible group-data-drawing/dock:opacity-0 group-data-drawing/dock:invisible"
            bind:clientHeight={perchHeight}
          >
            {@render perch()}
          </div>
        {/if}
        {#if menuOpen}
          <!-- Above the input, not over it: the sentence being written stays legible
           while its next word is being chosen. -->
          <!-- Focus never leaves the field: the menu swallows the mousedown that
           would blur it, so a clicked row lands on the message being written. -->
          <!-- The `/` and `@` menu, above the pill and matched to its width:
               a kit floating surface (app.css `.kit-pop`) that rises out of
               the field below it, growing from its bottom edge, the side the
               caret is on. The list inside carries its own inset. -->
          <!-- literal: 320px, and a row's 30px (44px under a finger) -->
          <!-- biome-ignore lint/a11y/noStaticElementInteractions: role="presentation" is deliberate — this wrapper is never meant to be announced; the mousedown handler only preventDefaults so focus stays on the field, it is not a user interaction target. -->
          <div
            data-slot="menu"
            class="kit-pop absolute left-0 right-0 bottom-(--menu-foot) max-h-(--menu-max-h) overflow-hidden p-0 origin-bottom"
            data-side="top"
            data-state="open"
            id="composer-menu"
            onmousedown={(event) => event.preventDefault()}
            role="presentation"
            out:menuOut
            style:--menu-foot="calc(100% + var(--space-2))"
            style:--menu-max-h="320px"
            style:--menu-row-h="30px"
            style:--menu-row-h-coarse="44px"
          >
            <Command.Root loop shouldFilter={false} bind:value={highlight}>
              <Command.List>
                {#each sections as section (section.key)}
                  <Command.Group heading={section.heading}>
                    {#each section.entries as entry (entry.id)}
                      <Command.Item
                        id={domIds.get(entry.id)}
                        onSelect={() => choose(entry)}
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

        <!-- The pill's padding above and below the 34px field focuses it,
         the caret at the end: its touch area is the field's. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press on the field's padding only hands it the focus; keys reach the field itself -->
        <!-- The field's box. Its custom properties reach the field and the
             autosize twin beside it (a copy of the field without its inline
             style): the field's size, ceiling and padding, the hint's
             tracking and ink, the scroll cue's run, the roll's reach, the
             folded line's end the "+N lines" stands on, and the mention
             chips' sizes (MentionField's own, for the twin). -->
        <!-- literal: 4.5rem, 16px, 200px, -0.01em, 1lh, -100vh, -100vw, 6px, 15px, 22px -->
        <div
          data-folded={folded || undefined}
          data-slot="composer-field"
          class="group/field touch-hit relative flex flex-auto min-w-0"
          inert={askOpen}
          bind:this={fieldWrap}
          style:--more-room="4.5rem"
          style:--field-size="16px"
          style:--field-max-h="200px"
          style:--field-pad="calc((var(--cin-ctl) - 1lh) / 2)"
          style:--hint-track="-0.01em"
          style:--hint-ink="var(--ink-muted)"
          style:--cue-run="1lh"
          style:--roll-reach-y="-100vh"
          style:--roll-reach-x="-100vw"
          style:--mention-chip-pad-end="6px"
          style:--mention-chip-size="15px"
          style:--mention-chip-leading="22px"
          onclick={(event) => {
            if (field && !field.contains(event.target as Node)) {
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
               --dur-morph. No scrollbar is drawn, so the text wraps at the
               field's full width in every state. While another draft's words
               fly in over it, or an ask's card stands over it, it draws none
               of its own text or caret; while the wheel is up, no caret. -->
          <MentionField
            aria-activedescendant={recall ? recallActive : activeDescendant}
            aria-controls={recall ? recallId : "composer-menu"}
            aria-describedby={recallOf ? `${recallId}-way` : undefined}
            aria-expanded={menuOpen || !!recall}
            aria-keyshortcuts={recallOf ? "ArrowUp" : undefined}
            class="relative z-1 flex-auto border-none border-current bg-transparent font-body font-normal leading-ui text-ink-strong overflow-y-auto h-(--cin-ctl) min-w-0 no-scrollbar opacity-(--roll-o) motion-safe:transition-[height] motion-safe:dur-control motion-safe:ease-out motion-safe:data-folding:dur-morph data-flying:text-transparent data-flying:caret-transparent group-data-asking/dock:text-transparent group-data-asking/dock:caret-transparent group-data-asking/cin:text-transparent group-data-asking/cin:caret-transparent group-data-wheeling/cin:caret-transparent group-data-folded/field:overflow-hidden"
            data-cue-bottom={(cueBottom && !folded) || undefined}
            data-cue-top={(cueTop && !folded) || undefined}
            data-flying={flight !== null || !wordsLanded || undefined}
            data-folding={folding || undefined}
            here={mentionsFrom}
            label={FIELD_LABEL}
            menuHost={pill}
            names={mentionsFrom !== null}
            onblur={() => {
              dismissed = true;
              refocus(false);
            }}
            onclick={noteCaret}
            {ondragover}
            {ondrop}
            onfocus={() => refocus(true)}
            oninput={noteCaret}
            {onkeydown}
            onkeyup={noteCaret}
            {onpaste}
            ontransitioncancel={(event) => {
              if (event.propertyName === "height") {
                folding = false;
              }
            }}
            ontransitionend={(event) => {
              if (event.propertyName === "height") {
                folding = false;
              }
            }}
            phone={phone.current}
            placeholder={hint}
            tabindex={0}
            bind:this={mentionField}
            bind:editor={field}
            bind:value={draft.text}
            {@attach autosize(() => draft.text, {
              held: () => holding,
              fold: folds,
              measured: (whole) => {
                natural = whole;
                onFit?.(whole);
              },
            })}
            {@attach fitHint}
            {@attach scrollCue}
          />
          {#if flight}
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
                 overlay's own width. -->
            <!-- literal: the one-cell track -->
            <span
              data-slot="flight"
              aria-hidden="true"
              class="absolute inset-0 z-2 grid grid-cols-(--flight-cols) py-(--field-pad) px-0 font-body text-(length:--field-size) leading-ui text-ink-strong whitespace-pre-wrap wrap-break-word pointer-events-none"
              style:--flight-cols="minmax(0, 1fr)"
            >
              <span
                data-slot="flight-text"
                class="row-start-1 col-start-1 w-(--flight-w) opacity-(--flight-o) transform-(--flight-from) translate-y-(--flight-drop)"
                data-rest="{flight.outRest}&#8203;"
                bind:this={flightOut}
                style:--flight-w="{flight.outWrap}px"
                style:--flight-o={flight.from.opacity}
                style:--flight-from={flight.from.transform}
                style:--flight-drop="{flight.outDrop}px">{flight.out}</span
              >
              <span
                data-slot="flight-text"
                class="row-start-1 col-start-1 opacity-0 translate-y-(--flight-drop)"
                data-rest="{flight.text.slice(typed.length)}&#8203;"
                bind:this={flightIn}
                style:--flight-drop="{inDrop}px">{typed}</span
              >
            </span>
          {/if}
          {#if folded}
            <!-- What the folded field keeps out of sight, over its faded line
               end: standing in the field, it takes none of the field's width,
               so the text wraps as it does unfolded. -->
            <span
              data-slot="more"
              aria-hidden="true"
              class="absolute end-0 bottom-0 z-2 flex items-center justify-end w-(--more-room) h-(--cin-ctl) text-ink-muted text-size-meta font-normal num whitespace-nowrap pointer-events-none opacity-(--roll-o) group-data-asking/dock:invisible group-data-asking/cin:invisible"
              >+{lines - 1} {lines === 2 ? "line" : "lines"}</span
            >
          {/if}
          {#if recallOf}
            <!-- The way to what you sent here, read with the field: ↑ brings
               it up (a held press, on a touch screen). -->
            <span class="sr-only" id="{recallId}-way"
              >Press Up to show what you sent</span
            >
          {/if}
        </div>

        <!-- While the wheel is up its buttons fold into a deck at the pill's
             trailing end, which is not a control: Esc, ↓ past the draft or
             a press outside put the wheel away. -->
        <!-- Attach + send, together and bottom-aligned, so they hold their
             box as the text above them runs on. On a coarse pointer the gap
             opens to 10px, so each 34px control's touch area reaches 44px
             before meeting its neighbour's. -->
        <!-- literal: 10px -->
        <div
          data-slot="ctrls"
          class="flex items-center gap-space-2 coarse:gap-(--ctrls-gap-coarse) flex-none group-data-asking/dock:opacity-0 group-data-asking/dock:invisible"
          inert={!!recall}
          bind:this={ctrls}
          style:--ctrls-gap-coarse="10px"
        >
          {#if attach}
            <AttachButton
              {draft}
              ondraw={recallOf ? () => room.open() : undefined}
            />
          {/if}
          <!-- Pending from the press until the hub takes the message: the glyph
           slot turns to the kit spinner and presses are swallowed. -->
          <!-- Send is the kit's (app.css `.kit-send`). Optical centring: the
               send plane's mass sits low-left of its box, so the glyph is
               nudged up and right to look centred rather than measure
               centred. -->
          <!-- literal: translate(0.5px, -0.5px) -->
          <button
            data-slot="stop"
            aria-busy={pending || undefined}
            aria-disabled={pending || held || undefined}
            aria-label={stops ? "Stop the agent" : "Send message"}
            class="kit-send group/stop touch-hit pressable"
            style:--send-nudge="translate(0.5px, -0.5px)"
            disabled={!(
              busy ||
              pending ||
              (draft.hasContent && !draft.uploading)
            )}
            onclick={whileIdle(() => pending, onaction)}
            type="button"
          >
            <!-- The one control that changes meaning mid-turn. `{#key}` re-creates
             the glyph on every flip, so BOTH directions of the swap animate in;
             the box it sits in is untouched, so send↔stop never moves or
             resizes under a thumb already travelling toward it. -->
            {#key pending ? "wait" : stops}
              <!-- The glyph carrier, not the button: it is content-sized and
                   centred, so scaling it in cannot change the control's box.
                   The one cell of the button's grid: an outgoing glyph and
                   its replacement overlap there while they cross-fade. -->
              <!-- literal: 4px, the swap's blur -->
              <span
                data-slot="swap"
                class="row-start-1 col-start-1 grid place-items-center"
                out:glyphOut
                style:--swap-blur="4px"
              >
                {#if pending}
                  <Spinner
                    aria-hidden="true"
                    class="group-enabled/stop:transform-(--send-nudge)"
                    role="presentation"
                  />
                {:else if stops}
                  <IconStop class="group-enabled/stop:transform-(--send-nudge)" />
                {:else}
                  <IconSend class="group-enabled/stop:transform-(--send-nudge)" />
                {/if}
              </span>
            {/key}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<style>
  /* css-scope .lift-copy: lift.svelte.ts makes the element for this composer; its look is here */

  /* residual: unmapped — needs transition token: opacity var(--dur-fade)
     var(--ease-out), visibility 0s (--step-aside: what steps aside while an
     ask holds the composer comes back at once and fades in) */
  :is(
      [data-slot="prompts"],
      [data-slot="tray-slot"],
      [data-slot="progress-slot"],
      [data-slot="lift"],
      [data-slot="perch"],
      [data-slot="ctrls"]
    ) {
    transition: var(--step-aside);
  }
  /* residual: unmapped — needs transition token: opacity var(--dur-fade)
     var(--ease-out), visibility 0s linear var(--dur-fade). While the
     composer is grown into an ask, everything in it that does not act on
     the ask steps aside: the offer column, the tray row with its chips and
     the plan's ring, a perch, the attachments, and the pill's own controls.
     They fade out and are gone, out of the tab order with them, and come
     back the same way (`--step-aside`) as the ask folds. A minimized
     question's bar takes the tray row: the tray and the plan's ring step
     aside under it and come back as it goes. */
  [data-slot="dock"][data-minimized]
    :is([data-slot="tray-slot"], [data-slot="progress-slot"]),
  [data-slot="dock"][data-asking]
    :is(
      [data-slot="prompts"],
      [data-slot="lift"],
      [data-slot="perch"],
      [data-slot="ctrls"]
    ),
  [data-slot="dock"][data-drawing]
    :is([data-slot="prompts"], [data-slot="lift"], [data-slot="perch"]) {
    transition:
      opacity var(--dur-fade) var(--ease-out),
      visibility 0s linear var(--dur-fade);
  }
  /* residual: unmapped — needs transition token: opacity var(--dur-exit)
     var(--ease-out), visibility 0s (and visibility 0s var(--dur-exit) for
     the tray leaving) */
  [data-slot="tray"] {
    transition:
      opacity var(--dur-exit) var(--ease-out),
      visibility 0s;
  }
  [data-slot="tray"][data-composer-away] {
    transition:
      opacity var(--dur-exit) var(--ease-out),
      visibility 0s var(--dur-exit);
  }
  /* residual: unmapped — align-items: end (items-end writes flex-end) */
  [data-slot="tray-slot"] {
    align-items: end;
  }

  /* residual: foreign-dom — AttachmentChips' root, which takes no class.
     Everything in the composer takes the pointer; while the canvas stands,
     the chips stand in the grown shape over the field, above its surface;
     while an ask holds the composer they step aside with the rest. */
  [data-slot="composer"] > :global([data-slot="atts"]) {
    pointer-events: auto;
  }
  [data-slot="dock"][data-drawing]
    [data-slot="composer"]
    > :global([data-slot="atts"]) {
    position: relative;
    z-index: 2;
  }
  [data-slot="dock"][data-asking] :global([data-slot="atts"]) {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--dur-fade) var(--ease-out),
      visibility 0s linear var(--dur-fade);
  }

  /* residual: pseudo — the minimized question's bar in its needs tone, on
     the tray chip's own surface (app.css .kit-tray-chip) */
  [data-slot="asked-chip"]::before {
    background-color: var(--status-attn-bg);
  }

  /* residual: unmapped — the grown or recalling pill's outline and
     backdrop. Its outline: none is the shorthand over field-shell's focus
     ring, a utility at (0,3,0) that a state utility would lose to, so it
     stays out of the layers as it was; backdrop-filter has no utility on a
     real element. */
  [data-slot="cin"] {
    &:is([data-recalling], [data-grown]) {
      outline: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    &:not(:focus-within) {
      -webkit-touch-callout: none;
    }
  }

  /* residual: unmapped — MentionField's root, whose own utilities set these
     same properties (34px, 200px, 16px, its 7px padding): the composer's
     override stays out of the layers so it wins as it did. Passed as a
     class, each would be a second utility for the property. The control
     row sets the resting height so a single line sits on the buttons'
     midline. */
  [data-slot="composer-field"] > :global([data-slot="editor"]) {
    min-height: var(--cin-ctl);
    max-height: var(--field-max-h);
    font-size: var(--field-size);
    padding: var(--field-pad) 0;
  }
  /* residual: unmapped — a pick taken off the recall wheel fits the field
     as the wheel folds away: the fold's clock and curve (RecallWheel). It
     wins over the folding duration, as it did; Tailwind would order
     data-folding: after group-data-settling: at equal specificity. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="cin"][data-settling]
      [data-slot="composer-field"]
      > :global([data-slot="editor"]) {
      transition-duration: var(--dur-grow-exit);
      transition-timing-function: var(--ease-drawer);
    }
  }
  /* residual: unmapped — the draft as the recall wheel's first row: its
     text, and what a folded one says is out of sight, roll down off the
     field's line as the wheel rolls up, leaving as every row leaves, cut at
     the line's foot. The wheel writes `--roll-y` and `--roll-o` on the
     field's box while the roll is off the draft; with neither, nothing here
     applies (translate: 0 var(--roll-y) computes to none unset, where
     translate-y-(--roll-y) would compute to 0px). */
  [data-slot="composer-field"]
    > :is(:global([data-slot="editor"]), [data-slot="more"]) {
    translate: 0 var(--roll-y);
    clip-path: inset(var(--roll-reach-y) var(--roll-reach-x) var(--roll-y));
  }

  /* residual: pseudo — the field's hint (MentionField's ::before) and what
     sets its ink and fade. One line, always: the field is sized from its
     value, so a hint that wrapped would be clipped to its first line. The
     hint shown is one the field's width holds (fitHint, which measures with
     this tracking). The title's tracking, so the short hint fits the
     narrowest phone's field: at 320px the field is 149px and the hint 150px
     at the field's own. It stands out of the text's flow, so the caret
     stands at the line's start under it. */
  [data-slot="composer-field"]
    > :global([data-slot="editor"][data-mention-field-empty]::before) {
    position: absolute;
    color: var(--hint-ink);
    letter-spacing: var(--hint-track);
    white-space: nowrap;
    transition: var(--hint-fade, none);
  }
  /* While another draft's words fly in over it, or an ask's card stands
     over it, the field's hint is clear. The hint is not drawn from the
     moment the wheel comes up until it has folded away: an empty draft's
     row on the line stands for it, and the two would read doubled. It fades
     back in once the rows are gone. */
  [data-slot="composer-field"] > :global([data-slot="editor"][data-flying]),
  [data-asking] [data-slot="composer-field"] > :global([data-slot="editor"]),
  [data-slot="cin"][data-recalling]
    [data-slot="composer-field"]
    > :global([data-slot="editor"]) {
    --hint-ink: transparent;
  }
  [data-slot="cin"][data-hint-back]
    [data-slot="composer-field"]
    > :global([data-slot="editor"]) {
    --hint-fade: color var(--dur-fade) var(--ease-out);
  }

  /* residual: foreign-dom — the mention chips, which MentionField's script
     makes: clear while another draft's words fly in, hidden while an ask's
     card stands over the field */
  [data-slot="composer-field"]
    > :global([data-slot="editor"][data-flying] [data-slot="mention-chip"]) {
    opacity: 0;
  }
  [data-asking]
    [data-slot="composer-field"]
    > :global([data-slot="editor"] [data-slot="mention-chip"]) {
    visibility: hidden;
  }

  /* residual: unmapped — mask-image on a real element. The scroll cue: the
     edge with text out of sight fades over about a line. A folded draft has
     no cue: it keeps its own fade, its first line fading out where the line
     ends and clear under the "+N lines" standing there. */
  [data-slot="composer-field"] > :global([data-slot="editor"][data-cue-top]) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      var(--mask-opaque) var(--cue-run)
    );
  }
  [data-slot="composer-field"]
    > :global([data-slot="editor"][data-cue-bottom]) {
    mask-image: linear-gradient(
      to top,
      transparent,
      var(--mask-opaque) var(--cue-run)
    );
  }
  [data-slot="composer-field"]
    > :global([data-slot="editor"][data-cue-top][data-cue-bottom]) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      var(--mask-opaque) var(--cue-run),
      var(--mask-opaque) calc(100% - var(--cue-run)),
      transparent
    );
  }
  [data-slot="composer-field"][data-folded] > :global([data-slot="editor"]),
  [data-slot="composer-field"][data-folded] [data-slot="flight"] {
    mask-image: linear-gradient(
      to right,
      var(--mask-opaque) calc(100% - var(--more-room) - var(--space-8)),
      transparent calc(100% - var(--more-room))
    );
  }
  /* The flight's alignment (`unsafe end`, which no utility writes) and its
     clip: clipped to the field's box as it glides, as the field clips its
     own text, and sideways only as far as the pill's inset on the left and
     the gap to the controls on the right, so nothing paints outside the
     pill or over its buttons. */
  [data-slot="flight"] {
    align-content: unsafe end;
    align-items: unsafe end;
    clip-path: inset(0 calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-3)));
  }
  /* justify-self-start writes flex-start */
  [data-slot="flight-text"] {
    justify-self: start;

    /* residual: pseudo — drawn clear after the layer's text, the rest of
       the text it will be, so it lays out whole */
    &::after {
      content: attr(data-rest);
      color: transparent;
    }
  }
  /* residual: unmapped — shadcn's Command parts (Root, List, Group, Item),
     whose own utilities set these same properties: passed as a class, each
     would be a second utility for the property. The Command primitive is
     shadcn's; its parts are addressed by slot so the menu wears Quiet Ledger
     tokens rather than the stock ladder. The list is the one thing that
     scrolls; the shell stays put. Under this composer's own menu: global
     all through, they reached any `.menu` on the page. Each family is a
     titled section, ruled off from the one above so "Skills" and "Commands"
     read as two kinds of thing rather than one long list. */
  [data-slot="menu"] :global([data-slot="command"]) {
    background: transparent;
  }
  [data-slot="menu"] :global([data-slot="command-list"]) {
    max-height: var(--menu-max-h);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1);
  }
  [data-slot="menu"] :global([data-slot="command-group"]) {
    padding: var(--space-1) 0;
  }
  [data-slot="menu"]
    :global([data-slot="command-group"] + [data-slot="command-group"]) {
    border-top: 1px solid var(--border-hairline);
  }
  /* residual: foreign-dom — the group's heading, which bits-ui renders */
  [data-slot="menu"]
    :global([data-slot="command-group"] [data-command-group-heading]) {
    padding: var(--space-1) var(--space-2) var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  /* residual: unmapped — one row (shadcn's Command.Item): the name, its
     prose, and where it came from — on a single line. The highlighted row
     stands on the kit's ghost (Command.List), which glides from row to row
     under the arrow keys and the pointer. */
  [data-slot="menu"] :global([data-slot="command-item"]) {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-height: var(--menu-row-h);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-strong);
  }
  @media (pointer: coarse) {
    [data-slot="menu"] :global([data-slot="command-item"]) {
      min-height: var(--menu-row-h-coarse);
    }
  }

  /* residual: unmapped — the touch areas' gap between the controls (app.css
     .touch-hit reads --hit-gap-x), switching with the pointer: a custom
     property under a media query, which neither style: nor a utility sets */
  [data-slot="ctrls"] {
    --hit-gap-x: var(--space-2);

    @media (pointer: coarse) {
      --hit-gap-x: var(--ctrls-gap-coarse);
    }
  }
  /* residual: foreign-dom — AttachButton's button, which takes no class;
     Attach takes Send's box. In the recall wheel's deck every button behind
     Send is a card: its face, its edge at the outline button's 3:1 (the
     control edge, 1.37:1, is lost at a 4px peek) and a little shadow, so
     each one's edge reads behind the one in front. */
  [data-slot="ctrls"][inert]
    :global(:is([data-slot="att-btn"], [data-att-btn])) {
    box-shadow: var(--shadow-xs);
    border-color: var(--border-button-outline);
  }
  /* residual: keyframes — the glyph swapping in; reduced motion keeps the
     fade: no scale, no blur */
  [data-slot="swap"] {
    @media (prefers-reduced-motion: no-preference) {
      animation: icon-swap var(--dur-control) var(--ease-out) both;
    }
    @media (prefers-reduced-motion: reduce) {
      animation: icon-swap-still var(--dur-control) var(--ease-out) both;
    }
  }
  @keyframes icon-swap-still {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes icon-swap {
    from {
      opacity: 0;
      transform: scale(0.25);
      filter: blur(var(--swap-blur));
    }
    to {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
  }

  /* residual: foreign-dom — the grown shape (grown.ts), made as it grows,
     behind the pill. Its drop (a copy of the outline under it, its shadow
     --shadow-drop and --shadow-drop-near drawn into it) comes in by its
     opacity once it stands still, and folds with it by its own motion
     (transform and opacity), its foot on the pill's. */
  [data-slot="shell"] :global(:is(.grown-halo, .grown-drop)) {
    position: absolute;
    z-index: 1;
    inset-inline: 0;
    bottom: 0;
    pointer-events: none;

    & :global(svg) {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      overflow: visible;
    }
  }
  /* Not standing, the drop is not drawn at all: a clear layer's shadow
     still cost a frame in six on WebKit as the shape moved under it. */
  [data-slot="shell"] :global(.grown-drop) {
    opacity: 0;
    visibility: hidden;
    transform-origin: 50% 100%;
  }
  [data-slot="shell"] :global(.grown-drop.settled) {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--dur-fade) var(--ease-out),
      visibility 0s;
  }
  /* While the wheel is up the grown shape is part of the composer: its
     margins take a press (rolling the wheel) and never pan the page. */
  [data-slot="shell"][data-rolling] :global(.grown-halo) {
    pointer-events: auto;
    touch-action: none;
  }

  /* residual: unmapped — needs transition token: opacity var(--dur-fade)
     var(--ease-out), translate var(--dur-panel) var(--ease-drawer). The
     label and the hints come up with the shape one after the other, by
     opacity and translate alone, and sink back as it folds; the hints and
     Keep it a stagger after the label. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="what"],
    [data-slot="hint"] {
      transition:
        opacity var(--dur-fade) var(--ease-out),
        translate var(--dur-panel) var(--ease-drawer);
    }
  }
  /* The edit row's Keep it, the kit's Button, whose own utilities set its
     display and transition: hidden but on a touch screen, which has no Esc
     (a button keeps the message as it was). */
  [data-slot="edit-row"] :global([data-keep]) {
    opacity: 0;
    transition: opacity var(--dur-fade) var(--ease-out);
    display: none;
    pointer-events: auto;

    @media (prefers-reduced-motion: no-preference) {
      translate: 0 var(--pop-rise);
      transition:
        opacity var(--dur-fade) var(--ease-out),
        translate var(--dur-panel) var(--ease-drawer);
    }
    @media (pointer: coarse) {
      display: inline-flex;
    }
  }
  [data-slot="edit-row"][data-composer-shown] :global([data-keep]) {
    opacity: 1;
    translate: none;
  }
  [data-slot="edit-row"][data-composer-shown] [data-slot="hint"],
  [data-slot="edit-row"][data-composer-shown] :global([data-keep]) {
    transition-delay: var(--dur-stagger);
  }

  /* residual: pseudo — a dot, not a pill: a rounded tag beside the curved
     shoulder reads as a second, clashing curve */
  [data-slot="what"]::before {
    content: "";
    inline-size: var(--status-dot-size);
    block-size: var(--status-dot-size);
    border-radius: 50%;
    background: var(--selected-icon);
  }

  /* residual: foreign-dom — the words in flight between a queued bubble and
     the field (lift.svelte.ts makes them): fixed over the page, cut to each
     end's box. */
  :global(.lift-copy) {
    position: fixed;
    z-index: 50;
    overflow: hidden;
    pointer-events: none;
    color: var(--ink-strong);
  }
  /* While a press is held on the composer and while the wheel is up,
     nothing on the page selects. */
  :global(html.composer-holding),
  :global(html.composer-holding *) {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
