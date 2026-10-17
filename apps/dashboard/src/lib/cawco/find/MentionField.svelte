<script lang="ts">
  /**
   * A message field that names things: type "@" and words (spaces and all),
   * pick from the @ menu, and the words become a chip that reads as the
   * title (with what tells it apart when another candidate shares it) and is
   * sent as `@<title> <handle>`. Hover or press a chip for its row's facts
   * with the handle under them. Backspace takes a chip whole.
   *
   * The message is one plain string (`value`), chips in their serialised
   * form: what the field's host sends, queues, keeps and recalls. A string
   * put in from outside (a draft restored, a recall, a command picked) is
   * drawn again with each serialised mention in it a chip (mention.svelte.ts
   * `SERIALISED`): one this tab made as it was made, any other once the
   * hub's names say what it is.
   *
   * The host reads and puts the caret in the string's own offsets
   * (`selection`, `select`), and has first claim on the field's keys, paste
   * and drop: what it handles (`defaultPrevented`) the field leaves. Any
   * other attribute and attachment given lands on the field itself.
   *
   * The menu is placed against `menuHost` when given (the host's composer,
   * `position: relative`), else against the nearest positioned box around
   * this field, so it matches the composer's width (DESIGN.md, the slash
   * and @ menu).
   *
   * Keys while the menu is open: ↑↓ move, ↵ or Tab inserts, Escape leaves
   * the text plain; a whole word that matches nothing closes it.
   */
  import { Portal } from "bits-ui";
  import { type Component, mount, unmount, untrack } from "svelte";
  import type { ClassValue, HTMLAttributes } from "svelte/elements";
  import Idle from "~icons/solar/pause-circle-bold-duotone";
  import Machine from "~icons/solar/server-bold-duotone";
  import { CURVE, dur, motionOk } from "../motion/curves.svelte.js";
  import type { FindResult } from "./find-client";
  import { rowOf } from "./find-rows";
  import MentionMenu from "./MentionMenu.svelte";
  import {
    type Chip,
    lookUp,
    MentionState,
    madeChip,
    remember,
    SERIALISED,
  } from "./mention.svelte";

  type Handlers = Pick<
    HTMLAttributes<HTMLDivElement>,
    "onkeydown" | "onkeyup" | "oninput" | "onpaste" | "ondrop" | "onblur"
  >;

  let {
    value = $bindable(""),
    here = null,
    names = true,
    phone = false,
    placeholder = "Message the agent…",
    label = "Message the agent",
    onsubmit,
    editor = $bindable(null),
    menuHost,
    class: className,
    onkeydown: hostKeydown,
    onkeyup: hostKeyup,
    oninput: hostInput,
    onpaste: hostPaste,
    ondrop: hostDrop,
    onblur: hostBlur,
    ...rest
  }: {
    /** The message as it will be sent: chips in their serialised form. */
    value?: string;
    /** The session written in: never offered. */
    here?: string | null;
    /** Whether "@" names anything here; off, an "@" is only text. */
    names?: boolean;
    phone?: boolean;
    placeholder?: string;
    label?: string;
    onsubmit?: (text: string) => void;
    editor?: HTMLDivElement | null;
    /** The box the menu stands against, when not the field's own. */
    menuHost?: HTMLElement;
    class?: ClassValue;
  } & Handlers &
    Omit<
      HTMLAttributes<HTMLDivElement>,
      "class" | "onsubmit" | keyof Handlers
    > = $props();

  const SPACE = /\s/;
  const uid = $props.id();
  const menuId = `${uid}-menu`;
  const mention = new MentionState(() => here);

  /** Where the "@" being typed stands: its text node and offset. */
  let at: { node: Text; offset: number } | null = null;
  /** An "@" put away with Escape or a miss stays text until another is typed. */
  let dismissed: { node: Text; offset: number } | null = null;
  let empty = $state(true);
  /** The string the field last wrote or drew: one put in from outside differs from it. */
  let written: string | null = null;

  const chips = new Map<HTMLElement, () => void>();

  /** The message as sent: text as typed, each chip as its serialised form. */
  function serialise(node: Node): string {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child as Text).data.replaceAll(" ", " ");
      } else if (child instanceof HTMLElement) {
        if (child.dataset.mention) {
          out += child.dataset.mention;
        } else if (child.dataset.tail !== undefined) {
          // The line a trailing newline opens, drawn: no character of its own.
        } else if (child.tagName === "BR") {
          out += "\n";
        } else {
          out +=
            (child.tagName === "DIV" && out ? "\n" : "") + serialise(child);
        }
      }
    }
    return out;
  }

  /**
   * A field's text that ends in a newline shows the empty line it opens only
   * with something after it: a tail `<br>` that is no character of the
   * message (`serialise`, `atoms` skip it).
   */
  function tail() {
    if (!editor) {
      return;
    }
    const last = editor.lastChild;
    const has = last instanceof HTMLElement && last.dataset.tail !== undefined;
    const needs = (written ?? "").endsWith("\n");
    if (needs && !has) {
      const br = document.createElement("br");
      br.dataset.tail = "";
      editor.append(br);
    } else if (!needs && has) {
      last.remove();
    }
  }

  function sync() {
    if (!editor) {
      return;
    }
    written = serialise(editor);
    value = written;
    empty = written.length === 0;
    tail();
    for (const [chip, drop] of chips) {
      if (!editor.contains(chip)) {
        drop();
        chips.delete(chip);
      }
    }
  }

  // ---- The string put in from outside, drawn with its chips ----

  /** The kind's glyph while the hub is asked what a mention names. */
  const provisional = (handle: string): Component =>
    handle.includes("#") ? Idle : Machine;

  function draw(text: string) {
    if (!editor) {
      return;
    }
    for (const drop of chips.values()) {
      drop();
    }
    chips.clear();
    const parts: Node[] = [];
    let from = 0;
    for (const match of text.matchAll(SERIALISED)) {
      const [whole, name, handle] = match as unknown as [
        string,
        string,
        string,
      ];
      const start = match.index ?? 0;
      if (start > from) {
        parts.push(document.createTextNode(text.slice(from, start)));
      }
      parts.push(drawnChip(whole, name, handle));
      from = start + whole.length;
    }
    if (from < text.length) {
      parts.push(document.createTextNode(text.slice(from)));
    }
    editor.replaceChildren(...parts);
    at = null;
    dismissed = null;
    mention.close();
    written = text;
    empty = text.length === 0;
    tail();
  }

  /** A chip put back: as this tab made it, or drawn now and told its facts once the hub says. */
  function drawnChip(serialised: string, name: string, handle: string) {
    const made = madeChip(serialised);
    if (made) {
      return chipNode(made);
    }
    const span = chipShape({
      serialised,
      label: name,
      handle,
      tip: handle,
      tone: "quiet",
      glyph: provisional(handle),
    });
    lookUp(name, handle).then((chip) => {
      if (!(chip && editor?.contains(span))) {
        return;
      }
      chips.get(span)?.();
      const row = rowOf(chip.result, Date.now());
      span.dataset.tip = chip.tip;
      span.dataset.tone = row.state.tone;
      span.setAttribute("aria-label", `${chip.label}, ${chip.tip}`);
      const glyph = span.querySelector(".mention-glyph") as HTMLElement;
      glyph.replaceChildren();
      const mounted = mount(row.glyph, { target: glyph });
      chips.set(span, () => unmount(mounted));
    });
    return span;
  }

  $effect(() => {
    const next = value;
    if (editor && next !== written) {
      untrack(() => draw(next));
    }
  });

  // ---- The caret, in the string's own offsets ----

  /** Each piece of the message in the field, where it starts and ends in the string. */
  interface Atom {
    end: number;
    node: Node;
    start: number;
    text: boolean;
  }

  /**
   * How many characters of the message a piece of the field is: a text's
   * own, a chip's serialised form, a line break's one; none for the tail
   * and anything else; null for a box holding more (`serialise`).
   */
  function lengthOf(child: Node): number | null {
    if (child.nodeType === Node.TEXT_NODE) {
      return (child as Text).data.length;
    }
    if (!(child instanceof HTMLElement) || child.dataset.tail !== undefined) {
      return 0;
    }
    if (child.dataset.mention) {
      return child.dataset.mention.length;
    }
    return child.tagName === "BR" ? 1 : null;
  }

  function atoms(): Atom[] {
    const out: Atom[] = [];
    let n = 0;
    const walk = (parent: Node) => {
      const from = n;
      for (const child of parent.childNodes) {
        const len = lengthOf(child);
        if (len === null) {
          // A block's line starts with a newline, after what stands before it.
          if ((child as HTMLElement).tagName === "DIV" && n > from) {
            n += 1;
          }
          walk(child);
          continue;
        }
        const text = child.nodeType === Node.TEXT_NODE;
        out.push({ node: child, start: n, end: n + len, text });
        n += len;
      }
    };
    if (editor) {
      walk(editor);
    }
    return out;
  }

  /** Where a point in the field stands in the string. */
  function offsetOf(container: Node, offset: number, list: Atom[]): number {
    if (container.nodeType === Node.TEXT_NODE) {
      const atom = list.find((a) => a.node === container);
      return atom ? atom.start + Math.min(offset, atom.end - atom.start) : 0;
    }
    const range = document.createRange();
    range.setStart(container, offset);
    // The pieces before the point, whole: a point between nodes splits none.
    let n = 0;
    for (const atom of list) {
      if (range.comparePoint(atom.node, 0) < 0) {
        n = atom.end;
      } else {
        break;
      }
    }
    return n;
  }

  /** The point in the field at offset `n` of the string: never past the tail. */
  function pointAt(n: number, list: Atom[]): [Node, number] {
    for (const atom of list) {
      if (atom.text && n <= atom.end) {
        return [atom.node, Math.max(0, n - atom.start)];
      }
      if (!atom.text && n <= atom.start) {
        const parent = atom.node.parentNode as Node;
        return [parent, [...parent.childNodes].indexOf(atom.node as ChildNode)];
      }
    }
    const root = editor as HTMLDivElement;
    return [root, root.childNodes.length];
  }

  /** The selection in the string's offsets, start then end; the end of the text when the field has none. */
  export function selection(): [number, number] {
    const picked = getSelection();
    const list = atoms();
    if (!(
      editor &&
      picked?.rangeCount &&
      editor.contains(picked.getRangeAt(0).startContainer)
    )) {
      const end = list.at(-1)?.end ?? 0;
      return [end, end];
    }
    const range = picked.getRangeAt(0);
    return [
      offsetOf(range.startContainer, range.startOffset, list),
      offsetOf(range.endContainer, range.endOffset, list),
    ];
  }

  /** Puts the selection at offsets `from` to `to` of the string (a caret, with one). */
  export function select(from: number, to = from) {
    if (!editor) {
      return;
    }
    const list = atoms();
    const range = document.createRange();
    range.setStart(...pointAt(from, list));
    range.setEnd(...pointAt(to, list));
    const picked = getSelection();
    picked?.removeAllRanges();
    picked?.addRange(range);
  }

  // ---- The @ being typed ----

  /** The "@" the caret is typing after, if any. */
  function trigger(): { node: Text; offset: number; query: string } | null {
    const picked = getSelection();
    if (!(names && picked?.isCollapsed && editor)) {
      return null;
    }
    const node = picked.anchorNode;
    if (!(node instanceof Text && editor.contains(node))) {
      return null;
    }
    const before = node.data.slice(0, picked.anchorOffset);
    for (let i = before.length - 1; i >= 0; i -= 1) {
      const c = before[i];
      if (c === "\n") {
        return null;
      }
      if (c === "@" && (i === 0 || SPACE.test(before[i - 1] as string))) {
        const query = before.slice(i + 1).replaceAll(" ", " ");
        if (query.length > 80 || query.startsWith(" ")) {
          return null;
        }
        return { node, offset: i, query };
      }
    }
    return null;
  }

  function look() {
    const found = trigger();
    if (
      !found ||
      (dismissed &&
        dismissed.node === found.node &&
        dismissed.offset === found.offset)
    ) {
      at = null;
      mention.close();
      return;
    }
    at = { node: found.node, offset: found.offset };
    if (!mention.type(found.query)) {
      dismissed = at;
      at = null;
    }
  }

  function oninput(event: Event & { currentTarget: HTMLDivElement }) {
    sync();
    look();
    hostInput?.(event as Parameters<NonNullable<Handlers["oninput"]>>[0]);
  }

  function insert(chip: Chip) {
    const picked = getSelection();
    if (!(at && picked && editor)) {
      return;
    }
    remember(chip);
    const range = document.createRange();
    range.setStart(at.node, at.offset);
    range.setEnd(picked.anchorNode as Node, picked.anchorOffset);
    range.deleteContents();
    const span = chipNode(chip);
    range.insertNode(span);
    const after = document.createTextNode(" ");
    span.after(after);
    const caret = document.createRange();
    caret.setStart(after, 1);
    caret.collapse(true);
    picked.removeAllRanges();
    picked.addRange(caret);
    at = null;
    mention.close();
    sync();
    arrive(span);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** A chip: its kind's glyph and its label, one atom in the text. */
  function chipShape(chip: {
    serialised: string;
    label: string;
    handle: string;
    tip: string;
    tone: string;
    glyph: Component;
  }): HTMLElement {
    const span = document.createElement("span");
    span.className = "mention-chip";
    span.setAttribute("data-slot", "mention-chip");
    span.contentEditable = "false";
    span.dataset.mention = chip.serialised;
    span.dataset.tip = chip.tip;
    span.dataset.handle = chip.handle;
    span.dataset.tone = chip.tone;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", `${chip.label}, ${chip.tip}`);
    const glyph = document.createElement("span");
    glyph.className = "mention-glyph";
    glyph.setAttribute("aria-hidden", "true");
    span.append(glyph, document.createTextNode(chip.label));
    const mounted = mount(chip.glyph, { target: glyph });
    chips.set(span, () => unmount(mounted));
    return span;
  }

  function chipNode(chip: Chip): HTMLElement {
    const row = rowOf(chip.result, mention.now);
    return chipShape({ ...chip, tone: row.state.tone, glyph: row.glyph });
  }

  /**
   * The words he typed become the chip where they stood: it grows from a
   * little short of its size as it fades up, on the pop's clock. With less
   * motion it only fades.
   */
  function arrive(span: HTMLElement) {
    span.animate(
      motionOk.current
        ? [
            { opacity: 0, transform: "scale(0.92)" },
            { opacity: 1, transform: "none" },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: dur("--dur-pop"), easing: CURVE.out }
    );
  }

  function pick(result: FindResult) {
    const chip = mention.chip(result);
    if (chip) {
      insert(chip);
    }
    editor?.focus();
  }

  /** A key the open menu takes: true when it took it. ⌘↵ and Ctrl+↵ are never its own. */
  function menuKey(event: KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      mention.move((event.key === "ArrowDown" ? 1 : -1) * (phone ? -1 : 1));
      return true;
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      !(event.metaKey || event.ctrlKey) &&
      mention.active
    ) {
      pick(mention.active);
      return true;
    }
    if (event.key === "Escape") {
      dismissed = at;
      at = null;
      mention.close();
      return true;
    }
    return false;
  }

  /**
   * Plain text where the selection is, as one text node: a line break as a
   * "\n" in the text, never a block the browser makes of it.
   */
  function insertPlain(text: string) {
    const picked = getSelection();
    if (!(editor && picked?.rangeCount && text)) {
      return;
    }
    const range = picked.getRangeAt(0);
    if (!editor.contains(range.startContainer)) {
      return;
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    picked.removeAllRanges();
    picked.addRange(range);
    sync();
    look();
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function onkeydown(event: KeyboardEvent & { currentTarget: HTMLDivElement }) {
    if (event.isComposing) {
      return;
    }
    if (mention.open && menuKey(event)) {
      event.preventDefault();
      return;
    }
    hostKeydown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onsubmit?.(value);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      insertPlain("\n");
    }
  }

  function onpaste(event: ClipboardEvent & { currentTarget: HTMLDivElement }) {
    hostPaste?.(event);
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    insertPlain(event.clipboardData?.getData("text/plain") ?? "");
  }

  /** Text dropped on the field lands where it was let go, as plain text. */
  function ondrop(event: DragEvent & { currentTarget: HTMLDivElement }) {
    hostDrop?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const text = event.dataTransfer?.getData("text/plain") ?? "";
    if (!text) {
      return;
    }
    event.preventDefault();
    const place = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (place) {
      const picked = getSelection();
      picked?.removeAllRanges();
      picked?.addRange(place);
    }
    insertPlain(text);
  }

  /** Empties the field (after a send). */
  export function reset() {
    value = "";
    draw("");
  }

  // ---- The chip's tooltip: its row's facts, the handle under them ----
  let tip = $state<{
    x: number;
    y: number;
    text: string;
    handle: string;
  } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  const showTip = (chip: HTMLElement) => {
    const box = chip.getBoundingClientRect();
    tip = {
      x: box.left + box.width / 2,
      y: box.top,
      text: chip.dataset.tip ?? "",
      handle: chip.dataset.handle ?? "",
    };
  };
  const hideTip = () => {
    if (tipTimer) {
      clearTimeout(tipTimer);
      tipTimer = null;
    }
    tip = null;
  };
  function onpointerover(event: PointerEvent) {
    const chip = (event.target as Element).closest<HTMLElement>(
      ".mention-chip"
    );
    if (!chip || event.pointerType !== "mouse") {
      return;
    }
    if (tipTimer) {
      clearTimeout(tipTimer);
    }
    tipTimer = setTimeout(() => showTip(chip), tip ? 0 : 350);
  }
  function onpointerout(event: PointerEvent) {
    const chip = (event.target as Element).closest(".mention-chip");
    if (chip && !chip.contains(event.relatedTarget as Node)) {
      hideTip();
    }
  }
  function onpointerdown(event: PointerEvent) {
    const chip = (event.target as Element).closest<HTMLElement>(
      ".mention-chip"
    );
    if (chip) {
      event.preventDefault();
      if (tip && tip.handle === chip.dataset.handle) {
        hideTip();
      } else {
        showTip(chip);
      }
    } else {
      hideTip();
    }
  }

  $effect(() => () => {
    for (const drop of chips.values()) {
      drop();
    }
    chips.clear();
  });

  const dismissMenu = () => {
    dismissed = at;
    at = null;
    mention.close();
  };
</script>

{#snippet menu()}
  <MentionMenu
    id={menuId}
    {mention}
    ondismiss={dismissMenu}
    onpick={pick}
    {phone}
  />
{/snippet}

{#if mention.open}
  {#if menuHost}
    <Portal to={menuHost}>{@render menu()}</Portal>
  {:else}
    {@render menu()}
  {/if}
{/if}

<!-- literal: 34px, 200px, 16px; the chips' 6px, 15px and 22px (the
     composer's field gives the chips the same to its autosize twin, a copy
     of this box without its inline style) -->
<div
  data-slot="editor"
  data-mention-field-empty={empty || undefined}
  data-editor
  {...rest}
  bind:this={editor}
  data-phone={phone || undefined}
  class={[
    "relative min-h-(--editor-min-h) max-h-(--editor-max-h) overflow-y-auto py-space-2 type-body text-(length:--editor-fs) leading-ui text-ink-strong caret-brand-solid whitespace-pre-wrap wrap-anywhere no-scrollbar outline-off",
    className,
  ]}
  style:--editor-min-h="34px"
  style:--editor-max-h="200px"
  style:--editor-fs="16px"
  style:--mention-chip-pad-end="6px"
  style:--mention-chip-size="15px"
  style:--mention-chip-leading="22px"
  aria-activedescendant={mention.open && mention.active
    ? `${menuId}-${mention.active.kind}:${mention.active.id}`
    : rest["aria-activedescendant"]}
  aria-autocomplete="list"
  aria-controls={mention.open ? menuId : rest["aria-controls"]}
  aria-expanded={mention.open || (rest["aria-expanded"] ?? false)}
  aria-label={label}
  contenteditable="true"
  data-placeholder={placeholder}
  {oninput}
  onblur={(event) => {
    hideTip();
    hostBlur?.(event);
  }}
  {onkeydown}
  onkeyup={(event) => {
    if (event.key.startsWith("Arrow") && !mention.open) {
      look();
    }
    hostKeyup?.(event);
  }}
  {ondrop}
  {onpaste}
  {onpointerdown}
  {onpointerout}
  {onpointerover}
  role="combobox"
  spellcheck="true"
  tabindex="0"
></div>

{#if tip}
  <!-- DESIGN.md, Tooltip: solid ink, never coral; fades and settles from
       0.96. The handle is the code role's face, size, weight and leading,
       its ligatures as the role's shorthand left them. -->
  <!-- literal: 320px, 6px, 10px, -50%, calc(-100% - 8px) -->
  <div
    data-slot="tip"
    class="fixed z-60 grid gap-space-row max-w-(--tip-max-w) py-(--tip-pad-y) px-(--tip-pad-x) rounded-sm bg-ink-solid text-on-ink type-meta left-(--tip-x) top-(--tip-y) translate-x-(--tip-shift-x) translate-y-(--tip-shift-y) pointer-events-none"
    role="tooltip"
    style:--tip-x={`${tip.x}px`}
    style:--tip-y={`${tip.y}px`}
    style:--tip-max-w="320px"
    style:--tip-pad-y="6px"
    style:--tip-pad-x="10px"
    style:--tip-shift-x="-50%"
    style:--tip-shift-y="calc(-100% - 8px)"
  >
    <span>{tip.text}</span>
    <span class="type-code opacity-80">{tip.handle}</span>
  </div>
{/if}

<style>
  [data-slot="editor"] {
    /* residual: pseudo */
    /* The hint stands out of the text's flow, so the caret stands at the
       line's start under it. */
    &[data-mention-field-empty]::before {
      content: attr(data-placeholder);
      position: absolute;
      color: var(--ink-subtle);
      pointer-events: none;
    }
  }

  /* residual: foreign-dom — the chips and their glyphs are made by the
     script (chipShape), never by the markup; their literals are the
     editor's custom properties */
  /* The chip: a recessed badge holding the kind's glyph and the title. */
  [data-slot="editor"] :global([data-slot="mention-chip"]) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    margin-inline: 1px;
    padding: 0 var(--mention-chip-pad-end) 0 var(--space-1);
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    font: var(--type-label);
    font-size: var(--mention-chip-size);
    line-height: var(--mention-chip-leading);
    color: var(--ink-strong);
    vertical-align: baseline;
    white-space: nowrap;
    cursor: default;
    user-select: all;
  }
  [data-slot="editor"] :global(.mention-glyph) {
    display: inline-grid;
    place-items: center;
    color: var(--status-idle-glyph);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  [data-slot="editor"]
    :global([data-slot="mention-chip"][data-tone="live"] .mention-glyph) {
    color: var(--status-live-glyph);
  }
  [data-slot="editor"]
    :global([data-slot="mention-chip"][data-tone="attn"] .mention-glyph) {
    color: var(--status-attn-glyph);
  }
  [data-slot="editor"]
    :global([data-slot="mention-chip"][data-tone="fail"] .mention-glyph) {
    color: var(--status-fail-glyph);
  }

  /* residual: keyframes */
  [data-slot="tip"] {
    animation: kit-tip-fade 140ms var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="tip"] {
      animation: mention-tip-in 140ms var(--ease-out);
    }
  }
  @keyframes mention-tip-in {
    from {
      opacity: 0;
      scale: 0.96;
    }
  }
</style>
