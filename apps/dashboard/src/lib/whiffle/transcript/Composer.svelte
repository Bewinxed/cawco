<script lang="ts" module>
  /** Something `@` can name: another session, or a machine. */
  export interface Mention {
    detail?: string;
    /** What gets inserted, without the `@`. */
    handle: string;
    label: string;
  }
</script>

<script lang="ts">
  import type { AvailableCommand } from "@whiffle/core";
  /**
   * The floating composer — a lifted shell holding the text input, the attach
   * and send controls, with any inline permission / question prompts stacked
   * above it in a box of their own. Home, this input and Stop are the surface's fixed anchors; the
   * action button is a single box that sends when idle and interrupts while a
   * turn is in flight. Ported from the mock's `.composer` / `.cin`.
   *
   * The shell does not change shape when it is focused. It used to grow and
   * re-round on click, which moved one of the three fixed anchors every time
   * the reader touched it; now there is one radius and one padding, and the
   * only thing that grows is the textarea itself (motion/autosize.svelte.ts).
   * Attach and send stay bottom-aligned, so they hold their position as the
   * text runs to a second and a third line.
   *
   * `/` and `@` are real: typing either opens a filtered menu above the input,
   * driven from the textarea's own keyboard so focus never leaves the message
   * being written.
   */
  import { type Snippet, tick, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { whileIdle } from "$lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Command from "$lib/components/ui/command";
  import { Spinner } from "$lib/components/ui/spinner";
  import { IconClose, IconPlus, IconSend, IconStop } from "$lib/icons";
  import { autosize } from "$lib/whiffle/motion/autosize.svelte";
  import {
    CURVE,
    dur,
    ease,
    easeDrawer,
    easeOut,
    motionOk,
    popScale,
  } from "$lib/whiffle/motion/curves.svelte";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import { reflow } from "$lib/whiffle/motion/rows.svelte";
  import { departBox } from "$lib/whiffle/motion/share.svelte";
  import type { SendExtras } from "../client.svelte";
  import { cleanDetail } from "../command-detail";
  import { newId } from "../id";
  import SelectionChip from "../preview/SelectionChip.svelte";
  import SelectionPopover from "../preview/SelectionPopover.svelte";
  import {
    loadSuggestSetting,
    type SuggestCandidate,
    suggestions,
  } from "../suggest.svelte";
  import type { ComposerDraft, PendingImage } from "./composer-draft.svelte";
  import { stand } from "./composer-presence.svelte";
  import DelegateTray from "./DelegateTray.svelte";
  import DocThumb from "./DocThumb.svelte";
  import SuggestionChips from "./SuggestionChips.svelte";

  let {
    draft,
    busy = false,
    sending = false,
    sendError = "",
    held = false,
    paneVisible = true,
    previewPhone = false,
    commands = [],
    mentions = [],
    onsubmit,
    oninterruptsend,
    onmenu,
    onstop,
    prompts,
    leading,
    suggest,
    delegatesOf,
    switchDir = 0,
    landing = { done: Promise.resolve(), ms: () => 0 },
  }: {
    /**
     * The conversation's half-written message. The composer draws it and
     * writes into it; the conversation owns it, so a composer pointed at
     * another draft shows that conversation's words.
     */
    draft: ComposerDraft;
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
     * A swipe is carrying the conversations under this composer. The action
     * button waits until one has landed, so nothing is sent to a chat that
     * is on its way off screen.
     */
    held?: boolean;
    paneVisible?: boolean;
    previewPhone?: boolean;
    /** What this session offers behind `/`. */
    commands?: AvailableCommand[];
    /** What `@` can name — the sessions and machines in reach. */
    mentions?: Mention[];
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
    prompts?: Snippet;
    /** Controls rendered before the attach button in the composer row. */
    leading?: Snippet;
    /**
     * The session's skills and MCP servers, and its last reply, for the
     * suggestion chips. Absent on surfaces with no session behind them.
     */
    suggest?: { candidates: SuggestCandidate[] };
    /**
     * The session whose delegates the tray above the composer shows; absent
     * on surfaces with no session behind them.
     */
    delegatesOf?: string;
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
    field?.setSelectionRange(draft.text.length, draft.text.length);
  }

  $effect(() => {
    if (!paneVisible) {
      draft.editorOpen = false;
    }
  });

  // On screen, this composer is what the desk's toasts rise above.
  const presence = {};
  $effect(() => {
    if (paneVisible) {
      return stand(presence, panel + lift + stack);
    }
  });
  let fileInput = $state<HTMLInputElement>();
  let field = $state<HTMLTextAreaElement>();

  /** The field's hint in full, and its first part, which fits any field. */
  const HINT = "Message the agent…  /  for commands, @ to mention";
  const HINT_SHORT = "Message the agent…";
  /**
   * The hint the field shows: in full wherever the field's own width holds
   * it on one line, else its first part. The server draws the short one,
   * so no first paint shows a hint cut off, and the field's measured width
   * brings in the full one once it is on the page. It is the field that is
   * measured, not the viewport: a narrow pane on a wide screen is narrow.
   */
  let hint = $state(HINT_SHORT);
  const fitHint = (node: HTMLTextAreaElement) => {
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
      hint = probe.getBoundingClientRect().width <= room ? HINT : HINT_SHORT;
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

  /** A paste longer than this rides as a named attachment, not inline text. */
  const LARGE_PASTE = 1200;

  /** A `/` or `@` token stops being typed as one the moment it holds whitespace. */
  const TOKEN_WHITESPACE = /\s/;

  /**
   * The words put back from outside (Edit on a failed send) land with focus,
   * and fade up in the field over --dur-control rather than replacing what
   * was there in one frame. Their attachments come back with them, and the
   * row that holds those folds open above the field.
   */
  $effect(() => {
    if (draft.focusWanted) {
      field?.focus();
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
   * to 0.25 into a 4px blur as it fades. Reduced motion lets it go at once.
   */
  function glyphOut(_node: Element): TransitionConfig {
    if (!motionOk.current) {
      return { duration: 0 };
    }
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t, u) =>
        `opacity: ${t}; scale: ${1 - u * 0.75}; filter: blur(${u * 4}px)`,
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
    node: HTMLTextAreaElement,
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
  function wrapOf(node: HTMLTextAreaElement): number {
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
  function scrollCue(node: HTMLTextAreaElement) {
    const cue = () => {
      const hidden = node.scrollHeight - node.clientHeight;
      cueTop = hidden > 1 && node.scrollTop > 1;
      cueBottom = hidden > 1 && node.scrollTop < hidden - 1;
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
    // Read before the swap, off the field still showing the words leaving.
    let outDrop = field
      ? scrollDrop(field.scrollHeight, field.clientHeight, field.scrollTop)
      : 0;
    let outWrap = field ? wrapOf(field) : 0;
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
      const node = field as HTMLTextAreaElement;
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
          fly(shown, text, switchDir);
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
   * The `/…` or `@…` the caret sits in the middle of, or null.
   *
   * A sigil only opens a menu at the start of a word — mid-token it is a path
   * separator or an email, both of which the reader is entitled to type without
   * a menu landing on top of them.
   */
  const token = $derived.by(
    (): { sigil: "/" | "@"; query: string; from: number } | null => {
      const at = Math.min(caret, draft.text.length);
      const before = draft.text.slice(0, at);
      const start =
        Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
      const word = before.slice(start);
      if (word.length === 0) {
        return null;
      }
      const [sigil] = word;
      if (sigil !== "/" && sigil !== "@") {
        return null;
      }
      const query = word.slice(1);
      // A token with whitespace in it is no longer being typed as one.
      if (TOKEN_WHITESPACE.test(query)) {
        return null;
      }
      return { sigil, query, from: start };
    }
  );

  let slashMenuOpen = false;
  $effect(() => {
    const open = token?.sigil === "/";
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
    const rows: Entry[] =
      active.sigil === "/"
        ? commands.map((command) => ({
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
          }))
        : mentions.map((mention) => ({
            id: `@${mention.handle}`,
            insert: `@${mention.handle}`,
            label: mention.label,
            detail: mention.detail,
          }));
    return (
      rows
        .filter((row) => !needle || row.id.toLowerCase().includes(needle))
        // Grouped and scrollable, so the cap only guards a pathological list; a
        // real session's commands all fit inside it and read under their source.
        .slice(0, 100)
    );
  });

  /**
   * The entries cut into titled sections. `/` groups by source — one heading per
   * plugin and per MCP server, with skills and built-ins under their family name
   * — ordered skills, plugins (by name), built-ins, MCP servers. `@` is one
   * "Mentions" section. A section with no rows is never emitted.
   */
  const sections = $derived.by((): Section[] => {
    if (entries.length === 0) {
      return [];
    }
    if (token?.sigil !== "/") {
      return [{ key: "mentions", heading: "Mentions", entries }];
    }
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
   * A DOM id per visible row, so the textarea can point `aria-activedescendant`
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
    caret = (event.currentTarget as HTMLTextAreaElement).selectionStart ?? 0;
    dismissed = false;
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
    // After the value lands, so the caret is set on the text that is there now.
    queueMicrotask(() => {
      field?.focus();
      field?.setSelectionRange(next, next);
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

  function submit(
    via: (text: string, extras: SendExtras, id: string) => void = onsubmit
  ): void {
    // Nothing to send, the last one is still unanswered, or a swipe is
    // still carrying the conversation. The draft is left exactly as it is —
    // a refused send must never eat what was typed.
    if (!draft.hasContent || sending || held) {
      return;
    }
    // The text leaves the field for the one row it becomes (motion/share),
    // keyed by the id the message is sent under. The field is measured
    // before it redraws empty.
    const { text, extras } = draft.take();
    const id = newId();
    departBox(`sent:${id}`, field as HTMLTextAreaElement);
    dismissed = true;
    via(text, extras, id);
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
    if (
      event.key === "Tab" &&
      field?.selectionStart === field?.selectionEnd &&
      chips?.take(event.shiftKey ? "all" : "first")
    ) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  function onkeydown(event: KeyboardEvent): void {
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onaction(): void {
    if (held) {
      return;
    }
    if (busy) {
      onstop();
    } else {
      submit();
    }
  }

  /** base64 without the `data:` prefix — the wire shape images travel in. */
  function readImage(file: File): Promise<PendingImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        resolve({
          mediaType: file.type,
          data: result.slice(result.indexOf(",") + 1),
          name: file.name,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: Iterable<File>): Promise<void> {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential by intent — each attachment must append in the order it was picked, not the order its read happens to settle.
        draft.images = [...draft.images, await readImage(file)];
      } else {
        draft.texts = [
          ...draft.texts,
          { kind: "text", name: file.name, content: await file.text() },
        ];
      }
    }
  }

  function onpick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      // Copied first: `input.files` is live, and clearing the input below
      // empties it while the reads are still walking it — a pick of several
      // files kept only the first.
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the file input clears synchronously below, independent of the read.
      void addFiles([...input.files]);
    }
    input.value = "";
  }

  function onpaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data) {
      return;
    }
    const files = [...data.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (files.length) {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the paste handler returns synchronously, independent of the read.
      void addFiles(files);
      return;
    }
    const text = data.getData("text/plain");
    if (text.length > LARGE_PASTE) {
      event.preventDefault();
      draft.texts = [
        ...draft.texts,
        {
          kind: "text",
          name: `Pasted text · ${text.length.toLocaleString()} chars`,
          content: text,
        },
      ];
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
  let stack = $state(0);

  /**
   * One conversation's tray handing its place to the next: a crossfade, the
   * two in the one cell of the slot's fixed row, so neither the slot nor
   * anything standing on it moves.
   */
  function trayFade(node: HTMLElement): TransitionConfig {
    node.style.gridArea = "1 / 1";
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }

  const removeImage = (i: number) => {
    draft.images = draft.images.filter((_, n) => n !== i);
  };
  const removeText = (i: number) => {
    draft.texts = draft.texts.filter((_, n) => n !== i);
  };
</script>

<div class="fade" transition:fade></div>
<!-- The dock is one column from the top of the pane down to the composer's
     resting place: the parked prompts fill it and the panel stands at its
     foot. Parked prompts stand in their own column on top of the composer,
     so a card arriving or leaving never moves the composer itself. The
     column stands its cards on its bottom edge: it stays where it is while
     cards come and go, so the list moves the way every list does
     (motion/rows.svelte.ts) — a card arriving is uncovered as the cards
     above it slide up to make its room, a card leaving closes as they slide
     back down.
     The column's foot is the panel's top by layout, not by a measured
     height: placed from `panel`, the column resized inside the very
     ResizeObserver pass that measured the panel, a box the pass could no
     longer deliver ("ResizeObserver loop completed with undelivered
     notifications", every frame the field grew), and it stood a frame
     behind the panel. -->
<div class="dock">
  {#if prompts}
    <div class="prompts" {@attach reflow()}>
      <div class="stack" bind:clientHeight={stack}>{@render prompts()}</div>
    </div>
  {/if}
  <!-- The row standing on the composer, outside its box: the delegate
       tray's fixed row, and the suggestion chips standing on it (out of
       flow). Both rows are kept clear at every transcript's foot (app.css
       `--c-tray-row`, `--c-suggest-room`). Prompts stand on top of both. -->
  <div class="lift" bind:clientHeight={lift}>
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
    {#if delegatesOf}
      <div class="tray-slot">
        {#key delegatesOf}
          <div in:trayFade out:trayFade>
            <DelegateTray {held} parentId={delegatesOf} />
          </div>
        {/key}
      </div>
    {/if}
  </div>
  <div class="composer" bind:clientHeight={panel} in:rise out:fade>
    <!-- The row of attachments is one block above the field: it folds open
       with its first chip and shut with its last. The chips in it are a
       list (motion/rows.svelte.ts): one added pops in, one removed shrinks
       to the pop scale as it fades, and the rest slide together. -->
    {#if draft.images.length || draft.texts.length || draft.selections.length}
      <div class="atts" transition:unfold {@attach reflow()}>
        {#each draft.selections as selection (`${selection.element.url}:${selection.element.selector}`)}
          <SelectionChip
            onedit={() => { draft.editing = selection; draft.editorOpen = true; }}
            onremove={() => draft.removeSelection(selection)}
            {selection}
            bind:anchor={draft.anchors[`${selection.element.url}:${selection.element.selector}`]}
          />
        {/each}
        {#each draft.images as img, i (img.name + i)}
          <span class="att" data-flip="pop">
            <img alt="" src="data:{img.mediaType};base64,{img.data}">
            <span class="att-name">{img.name}</span>
            <button
              aria-label="Remove"
              class="touch-hit"
              onclick={() => removeImage(i)}
              type="button"
            >
              <IconClose />
            </button>
          </span>
        {/each}
        <!-- A file looks here as it will in the sent turn: its DocThumb, which
           previews it the same way, with its remove on the corner. -->
        {#each draft.texts as t, i (t.name + i)}
          <span class="doc-att" data-flip="pop">
            <DocThumb content={t.content} name={t.name} />
            <button
              aria-label={`Remove ${t.name}`}
              class="doc-remove touch-hit"
              onclick={() => removeText(i)}
              type="button"
            >
              <IconClose />
            </button>
          </span>
        {/each}
      </div>
    {/if}

    {#if draft.editing}
      <SelectionPopover
        anchor={draft.anchors[`${draft.editing.element.url}:${draft.editing.element.selector}`]}
        onremove={() => { if (draft.editing) { draft.removeSelection(draft.editing); } }}
        phone={previewPhone}
        selection={draft.editing}
        bind:open={draft.editorOpen}
      />
    {/if}

    <!-- A send that failed says so right over the field it left. -->
    {#if sendError}
      <p class="send-error" role="alert" transition:unfold>{sendError}</p>
    {/if}

    <form
      aria-label="Message the agent"
      class="cin field-shell"
      onsubmit={(e) => e.preventDefault()}
    >
      <input
        accept="image/*,text/*,.md,.json,.csv,.log"
        class="hidden-file"
        multiple
        onchange={onpick}
        type="file"
        bind:this={fileInput}
      >

      {#if menuOpen}
        <!-- Above the input, not over it: the sentence being written stays legible
           while its next word is being chosen. -->
        <!-- Focus never leaves the textarea: the menu swallows the mousedown that
           would blur it, so a clicked row lands on the message being written. -->
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: role="presentation" is deliberate — this wrapper is never meant to be announced; the mousedown handler only preventDefaults so focus stays on the textarea, it is not a user interaction target. -->
        <div
          class="menu kit-pop"
          data-side="top"
          data-state="open"
          id="composer-menu"
          onmousedown={(event) => event.preventDefault()}
          role="presentation"
          out:menuOut
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
                      <span class="e-label">{entry.label}</span>
                      {#if entry.detail}
                        <span class="e-detail">{entry.detail}</span>
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/each}
            </Command.List>
          </Command.Root>
        </div>
      {/if}

      <!-- A label, so the pill's padding above and below the 34px field
         focuses it: its touch area is the field's. -->
      <label class="field touch-hit" class:folded>
        <textarea
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-controls="composer-menu"
          aria-expanded={menuOpen}
          aria-label="Message the agent"
          onblur={() => {
            dismissed = true;
            refocus(false);
          }}
          onclick={noteCaret}
          onfocus={() => refocus(true)}
          oninput={noteCaret}
          {onkeydown}
          onkeyup={noteCaret}
          {onpaste}
          onselect={noteCaret}
          ontransitioncancel={(event) => {
            if (event.propertyName === 'height') {
              folding = false;
            }
          }}
          ontransitionend={(event) => {
            if (event.propertyName === 'height') {
              folding = false;
            }
          }}
          placeholder={hint}
          role="combobox"
          bind:this={field}
          class:cue-bottom={cueBottom && !folded}
          class:cue-top={cueTop && !folded}
          class:flying={flight !== null}
          class:folding
          bind:value={draft.text}
          {@attach autosize(() => draft.text, {
            held: () => holding,
            fold: folds,
            measured: (whole) => {
              natural = whole;
            },
          })}
          {@attach fitHint}
          {@attach scrollCue}
        ></textarea>
        {#if flight}
          <!-- Each layer is its text and, drawn clear after it, the rest of
               the text it will be (`data-rest`), so it lays out whole. The
               trailing zero-width space holds a final empty line open, as
               the field does. -->
          <span aria-hidden="true" class="flight">
            <span
              class="flight-text"
              data-rest="{flight.outRest}&#8203;"
              bind:this={flightOut}
              style:inline-size="{flight.outWrap}px"
              style:opacity={flight.from.opacity}
              style:transform={flight.from.transform}
              style:translate="0 {flight.outDrop}px"
              >{flight.out}</span
            >
            <span
              class="flight-text"
              data-rest="{flight.text.slice(typed.length)}&#8203;"
              bind:this={flightIn}
              style:opacity="0"
              style:translate="0 {inDrop}px"
              >{typed}</span
            >
          </span>
        {/if}
        {#if folded}
          <!-- What the folded field keeps out of sight, over its faded line
               end: standing in the field, it takes none of the field's width,
               so the text wraps as it does unfolded. -->
          <span aria-hidden="true" class="more"
            >+{lines - 1} {lines === 2 ? 'line' : 'lines'}</span
          >
        {/if}
      </label>

      <div class="ctrls">
        {@render leading?.()}
        <button
          aria-label="Attach a file or image"
          class="att-btn touch-hit"
          onclick={() => fileInput?.click()}
          type="button"
        >
          <IconPlus />
        </button>
        <!-- Pending from the press until the hub takes the message: the glyph
           slot turns to the kit spinner and presses are swallowed. -->
        <button
          aria-busy={sending || undefined}
          aria-disabled={sending || held || undefined}
          aria-label={busy ? 'Stop the agent' : 'Send message'}
          class="stop touch-hit pressable"
          disabled={!(busy || sending || draft.hasContent)}
          onclick={whileIdle(() => sending, onaction)}
          type="button"
        >
          <!-- The one control that changes meaning mid-turn. `{#key}` re-creates
             the glyph on every flip, so BOTH directions of the swap animate in;
             the box it sits in is untouched, so send↔stop never moves or
             resizes under a thumb already travelling toward it. -->
          {#key sending ? 'wait' : busy}
            <span class="swap" out:glyphOut>
              {#if sending}
                <Spinner aria-hidden="true" role="presentation" />
              {:else if busy}
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

<style>
  .fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 96px;
    pointer-events: none;
    z-index: 19;
    background: linear-gradient(
      to top,
      var(--surface-recess) 22%,
      oklch(from var(--surface-recess) l c h / 0)
    );
  }
  .dock {
    position: absolute;
    inset: 0 0 calc(var(--space-4) + env(safe-area-inset-bottom));
    z-index: 20;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    pointer-events: none;
  }
  .composer {
    flex: none;
    width: min(720px, calc(100% - 50px));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    pointer-events: none;
  }
  .composer > :global(*) {
    pointer-events: auto;
  }
  /* The rest of the dock above the panel, cards stood on its bottom edge;
     the gap to the panel is the stack's own bottom padding, so its
     measured height carries it. */
  .prompts {
    flex: 1 1 0;
    min-height: 0;
    width: min(720px, calc(100% - 50px));
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    pointer-events: none;
  }
  /* The delegate tray's row, on the composer's width and left edge. It is
     the positioned box the suggestion chips stand on. */
  .lift {
    position: relative;
    flex: none;
    width: min(720px, calc(100% - 50px));
    pointer-events: none;
  }
  /* One conversation's tray over the next while they cross-fade, in a column
     the composer's width: an auto column grew to the chips' own width. The
     slot is the tray's one row from the composer's first render, chips or
     none (app.css `--c-tray-row`, which every transcript keeps clear), with
     the tray standing on its foot: a chip arriving late fills room already
     there, and the suggestion row standing on the slot never moves. */
  .tray-slot {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: end;
    block-size: var(--c-tray-row);
  }
  /* What the column measures into the composer's height: the cards and
     the step under them, and nothing at all with no card parked. */
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);

    &:has(> :global(*)) {
      padding-bottom: var(--space-3);
    }
    & > :global(*) {
      pointer-events: auto;
    }
  }

  /* One shape, always. --radius-lg outside, --space-2 of inset, and the
     controls inside carry (panel − inset) so the curves are concentric rather
     than two unrelated roundings stacked. The shell is the text field
     (app.css field-shell): keyboard focus in the textarea draws the ring over
     the shell's own border, an outline that moves nothing, and the textarea
     itself draws none. Its one-line box is the app's composer tokens
     (app.css `--c-composer-*`), which every transcript keeps clear. It is
     the panel material (app.css `--material-*`), so the transcript shows
     faintly through it, and opaque where translucency is turned down. */
  .cin {
    --cin-pad: var(--c-composer-inset);
    --cin-ctl: var(--c-composer-field);
    position: relative;
    border: 1px solid var(--border-control);
    background: var(--material-panel);
    -webkit-backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));
    backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));

    @media (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    border-radius: var(--radius-lg);
    padding: var(--cin-pad) var(--cin-pad) var(--cin-pad) var(--space-3);
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    box-shadow: var(--shadow-tile);
  }
  .field {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }
  /* One draft handing the field to the next, laid exactly over the field's
     text box: its padding, face, size, leading and wrapping. Both texts
     stand on the box's foot, where the field's fitted text ends, each
     dropped (`translate`) by the scroll its field has left below, so a long
     one shows the lines the field shows. The field under it keeps its box
     with its text, hint and caret clear. */
  .flight {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: unsafe end;
    align-items: unsafe end;
    padding: calc((var(--cin-ctl) - 1lh) / 2) 0;
    font-family: var(--font-body);
    font-size: 16px;
    line-height: var(--leading-ui);
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    /* Clipped to the field's box as it glides, as the field clips its own
       text, and sideways only as far as the pill's inset on the left and
       the gap to the controls on the right, so nothing paints outside the
       pill or over its buttons. */
    clip-path: inset(0 calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-3)));
    pointer-events: none;
  }
  /* Each layer as wide as the field's text runs (`inline-size`, set from
     the field), never the overlay's own width. */
  .flight-text {
    grid-area: 1 / 1;
    justify-self: start;

    &::after {
      content: attr(data-rest);
      color: transparent;
    }
  }
  /* Above the label's .touch-hit area, which covers the field: a press on
     the text lands on the textarea itself, so iOS's hold-to-select and its
     Paste callout reach it; the area still takes the pill's padding. */
  textarea {
    position: relative;
    z-index: 1;
    flex: 1 1 auto;
    border: 0;
    background: transparent;
    resize: none;
    font-family: var(--font-body);
    font-size: 16px;
    line-height: var(--leading-ui);
    color: var(--ink-strong);
    /* Grows with what is in it (motion/autosize.svelte.ts), a line at a time
       over 120ms, from one line's worth of the control height to a ceiling,
       and scrolls past that. The control row sets the resting height so a
       single line sits on the buttons' midline. */
    height: var(--cin-ctl);
    min-height: var(--cin-ctl);
    /* No scrollbar is drawn, so the text wraps at the field's full width
       in every state: a draft crossing the ceiling never re-wraps, and the
       switch overlay and the autosize twin (a copy of the field) wrap where
       it does. Wheel, touch, keys and the caret still scroll it; the fades
       at its edges (`scrollCue`) say there is more. */
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
    max-height: 200px;
    padding: calc((var(--cin-ctl) - 1lh) / 2) 0;
    min-width: 0;
    @media (prefers-reduced-motion: no-preference) {
      transition: height var(--dur-control) var(--ease-out);

      /* Folding and opening a long draft. */
      &.folding {
        transition-duration: var(--dur-morph);
      }
    }
  }
  /* One line, always: the field is sized from its value, so a hint that
     wrapped would be clipped to its first line. The hint shown is one the
     field's width holds (fitHint, which measures with this tracking). The
     title's tracking, so the short hint fits the narrowest phone's field:
     at 320px the field is 149px and the hint 150px at the field's own. */
  textarea {
    --hint-track: -0.01em;
  }
  textarea::placeholder {
    color: var(--ink-muted);
    letter-spacing: var(--hint-track);
    white-space: nowrap;
  }
  /* The scroll cue: the edge with text out of sight fades over about a
     line. A folded draft has no cue: it keeps its own fade (below). */
  textarea.cue-top {
    mask-image: linear-gradient(to bottom, transparent, #000 1lh);
  }
  textarea.cue-bottom {
    mask-image: linear-gradient(to top, transparent, #000 1lh);
  }
  textarea.cue-top.cue-bottom {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 1lh,
      #000 calc(100% - 1lh),
      transparent
    );
  }
  textarea.flying {
    color: transparent;
    caret-color: transparent;

    &::placeholder {
      color: transparent;
    }
  }
  /* A folded draft shows its first line, fading out where the line ends
     and clear under the "+N lines" standing there, and never a scrollbar. */
  .folded textarea,
  .folded .flight {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - var(--more-room) - var(--space-8)),
      transparent calc(100% - var(--more-room))
    );
  }
  .folded textarea {
    overflow: hidden;
  }
  .field {
    /* The folded line's end the "+N lines" stands on. */
    --more-room: 4.5rem;
  }
  /* How much of a folded draft is out of sight, on the folded line's end. */
  .more {
    position: absolute;
    inset-inline-end: 0;
    inset-block-end: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    inline-size: var(--more-room);
    block-size: var(--cin-ctl);
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }
  .hidden-file {
    display: none;
  }

  /* The `/` and `@` menu, above the pill and matched to its width. */
  /* A kit floating surface (app.css `.kit-pop`): it rises out of the field
     below it, growing from its bottom edge, the side the caret is on. The
     list inside carries its own inset. */
  .menu {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + var(--space-2));
    max-height: 320px;
    overflow: hidden;
    padding: 0;
    transform-origin: bottom;
  }

  /* The Command primitive is shadcn's; its parts are addressed by slot so the
     menu wears Quiet Ledger tokens rather than the stock ladder. The list is the
     one thing that scrolls; the shell stays put. */
  :global(.menu [data-slot="command"]) {
    background: transparent;
  }
  :global(.menu [data-slot="command-list"]) {
    max-height: 320px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1);
  }

  /* Each family is a titled section, ruled off from the one above so "Skills"
     and "Commands" read as two kinds of thing rather than one long list. */
  :global(.menu [data-slot="command-group"]) {
    padding: var(--space-1) 0;
  }
  :global(.menu [data-slot="command-group"] + [data-slot="command-group"]) {
    border-top: 1px solid var(--border-hairline);
  }
  :global(.menu [data-slot="command-group"] [data-command-group-heading]) {
    padding: var(--space-1) var(--space-2) var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  /* One row: the name, its prose, and where it came from — on a single
     line. The highlighted row stands on the kit's ghost (Command.List),
     which glides from row to row under the arrow keys and the pointer. */
  :global(.menu [data-slot="command-item"]) {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-height: 30px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-strong);
  }
  @media (pointer: coarse) {
    :global(.menu [data-slot="command-item"]) {
      min-height: 44px;
    }
  }

  .e-label {
    font-family: var(--font-mono);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .e-detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    flex: 1 1 auto;
  }

  /* Attach + send, together and bottom-aligned, so they hold their box as the
     text above them runs on. On a coarse pointer the gap opens to 10px, so
     each 34px control's touch area reaches 44px before meeting its
     neighbour's. */
  .ctrls {
    --hit-gap-x: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;

    @media (pointer: coarse) {
      --hit-gap-x: 10px;
      gap: 10px;
    }
  }
  .att-btn,
  .stop {
    width: var(--cin-ctl);
    height: var(--cin-ctl);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    cursor: pointer;
    /* Concentric with the shell: outer radius less the inset that seats it. */
    border-radius: calc(var(--radius-lg) - var(--cin-pad));
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        color var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
  }
  .att-btn {
    border: 1px solid var(--border-control);
    background: var(--surface-raised);
    color: var(--ink-muted);
  }
  .att-btn :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .att-btn:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
    /* Every primary action's hover (DESIGN.md, Primary button). */
    .stop:not(:disabled):hover {
      background-color: var(--ink-hover);
      background-image: var(--action-surface-hover);
    }
  }
  /* The flat brand stays under the gradient: `.stop:disabled` drops the image. */
  .stop {
    position: relative;
    border: 0;
    background-color: var(--brand-solid);
    background-image: var(--action-surface);
    color: var(--on-brand);
  }
  .stop :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* The glyph carrier, not the button: it is content-sized and centred, so
     scaling it in cannot change the control's box. */
  .stop .swap {
    /* The one cell of the button's grid: an outgoing glyph and its
       replacement overlap there while they cross-fade. */
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    @media (prefers-reduced-motion: no-preference) {
      animation: icon-swap var(--dur-control) var(--ease-out) both;
    }
  }
  @keyframes icon-swap {
    from {
      opacity: 0;
      transform: scale(0.25);
      filter: blur(4px);
    }
    to {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
  }
  /* Optical centring: the send plane's mass sits low-left of its box, so the
     glyph is nudged up and right to look centred rather than measure centred.
     The stop square is symmetric and needs none of it. */
  .stop:not(:disabled) :global(svg) {
    transform: translate(0.5px, -0.5px);
  }
  @media (prefers-reduced-motion: no-preference) {
    .att-btn:active,
    .stop:active:not(:disabled) {
      transform: scale(var(--press-scale));
    }
  }
  .stop:disabled {
    opacity: 0.55;
    cursor: default;
    box-shadow: none;
    background-image: none;
  }
  .send-error {
    padding-inline: var(--space-3);
    color: var(--status-fail-ink);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }

  /* Pending attachment chips, above the input pill. The row scrolls, so on
     a coarse pointer it takes 8px more padding into an equal negative margin:
     the remove buttons' touch areas fit inside its clip, nothing moves. */
  .atts {
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    max-height: 180px;
    overflow-y: auto;
    padding: var(--space-1);

    @media (pointer: coarse) {
      padding: calc(var(--space-1) + 8px);
      margin: -8px;
    }
  }
  .att {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* The name carries the ellipsis, so the chip itself does not clip its
     remove button's touch area. */
  .att-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .att img {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-xs);
    object-fit: cover;
    flex: 0 0 auto;
  }
  .att button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    flex: 0 0 auto;

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
    }
  }
  .att button:hover {
    background: var(--surface-recess);
    color: var(--ink-strong);
  }
  /* A file's DocThumb with its remove sat on the corner, clear of the name. */
  .doc-att {
    position: relative;
    display: inline-flex;
    max-width: 100%;
  }
  .doc-remove {
    position: absolute;
    /* The row pads by --space-1, so the corner sits inside its clip. */
    inset-block-start: calc(var(--space-1) * -1);
    inset-inline-end: calc(var(--space-1) * -1);
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    color: var(--ink-muted);
    cursor: pointer;

    & :global(svg) {
      inline-size: 14px;
      block-size: 14px;
    }
    &:hover {
      color: var(--ink-strong);
    }
  }

  /* Mobile: the composer goes full-width, edge to edge. It stays absolute
     (docked at the bottom of the transcript pane) rather than viewport-fixed,
     so it sits ABOVE the thumb bar instead of overlapping it — the thumb bar
     owns the safe-area inset. */
  @media (max-width: 900px) {
    /* Clear the home indicator / gesture bar — the resting gap plus the safe
       area inset, so the composer never sits under the rounded-screen chrome. */
    .dock {
      bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
    }
    /* The tray and the parked cards keep the composer's edges. */
    .composer,
    .lift,
    .prompts {
      align-self: stretch;
      margin-inline: var(--space-3);
      width: auto;
    }
    /* The cards keep the desktop's step off the panel. */
    .prompts {
      margin-bottom: calc(var(--space-4) - var(--space-2));
    }
  }
</style>
