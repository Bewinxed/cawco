<script lang="ts">
  /**
   * A message field that names things: type "@" and words (spaces and all),
   * pick from the @ menu, and the words become a chip that reads as the
   * title (with what tells it apart when another candidate shares it) and is
   * sent as `@<title> <handle>`. Hover or press a chip for its row's facts
   * with the handle under them. Backspace takes a chip whole.
   *
   * The menu is placed against the nearest positioned box around this field,
   * which the host makes its composer, so the menu matches the composer's
   * width (DESIGN.md, the slash and @ menu).
   *
   * Keys while the menu is open: ↑↓ move, ↵ or Tab inserts, Escape leaves
   * the text plain; a whole word that matches nothing closes it.
   */
  import { mount, unmount } from "svelte";
  import { CURVE, dur, motionOk } from "../motion/curves.svelte.js";
  import type { FindResult } from "./find-client";
  import { rowOf } from "./find-rows";
  import MentionMenu from "./MentionMenu.svelte";
  import { type Chip, MentionState } from "./mention.svelte";

  let {
    value = $bindable(""),
    here = null,
    phone = false,
    placeholder = "Message the agent…",
    label = "Message the agent",
    onsubmit,
    editor = $bindable(null),
  }: {
    /** The message as it will be sent: chips in their serialised form. */
    value?: string;
    /** The session written in: never offered. */
    here?: string | null;
    phone?: boolean;
    placeholder?: string;
    label?: string;
    onsubmit?: (text: string) => void;
    editor?: HTMLDivElement | null;
  } = $props();

  const SPACE = /\s/;
  const uid = $props.id();
  const menuId = `${uid}-menu`;
  const mention = new MentionState(() => here);

  /** Where the "@" being typed stands: its text node and offset. */
  let at: { node: Text; offset: number } | null = null;
  /** An "@" put away with Escape or a miss stays text until another is typed. */
  let dismissed: { node: Text; offset: number } | null = null;
  let empty = $state(true);

  const chips = new Map<HTMLElement, () => void>();

  /** The message as sent: text as typed, each chip as its serialised form. */
  function serialise(node: Node): string {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child as Text).data.replaceAll(" ", " ");
      } else if (child instanceof HTMLElement) {
        if (child.dataset.mention) {
          out += child.dataset.mention;
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

  function sync() {
    if (!editor) {
      return;
    }
    value = serialise(editor);
    empty = value.length === 0;
    for (const [chip, drop] of chips) {
      if (!editor.contains(chip)) {
        drop();
        chips.delete(chip);
      }
    }
  }

  /** The "@" the caret is typing after, if any. */
  function trigger(): { node: Text; offset: number; query: string } | null {
    const selection = getSelection();
    if (!(selection?.isCollapsed && editor)) {
      return null;
    }
    const node = selection.anchorNode;
    if (!(node instanceof Text && editor.contains(node))) {
      return null;
    }
    const before = node.data.slice(0, selection.anchorOffset);
    for (let i = before.length - 1; i >= 0; i -= 1) {
      const c = before[i];
      if (c === "\n") {
        return null;
      }
      if (c === "@" && (i === 0 || SPACE.test(before[i - 1] as string))) {
        const query = before.slice(i + 1).replaceAll(" ", " ");
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

  function oninput() {
    sync();
    look();
  }

  function insert(chip: Chip) {
    const selection = getSelection();
    if (!(at && selection && editor)) {
      return;
    }
    const range = document.createRange();
    range.setStart(at.node, at.offset);
    range.setEnd(selection.anchorNode as Node, selection.anchorOffset);
    range.deleteContents();
    const span = chipNode(chip);
    range.insertNode(span);
    const after = document.createTextNode(" ");
    span.after(after);
    const caret = document.createRange();
    caret.setStart(after, 1);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    at = null;
    mention.close();
    sync();
    arrive(span);
  }

  /** A chip: its kind's glyph and its label, one atom in the text. */
  function chipNode(chip: Chip): HTMLElement {
    const row = rowOf(chip.result, mention.now);
    const span = document.createElement("span");
    span.className = "mention-chip";
    span.contentEditable = "false";
    span.dataset.mention = chip.serialised;
    span.dataset.tip = chip.tip;
    span.dataset.handle = chip.handle;
    span.dataset.tone = row.state.tone;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", `${chip.label}, ${chip.tip}`);
    const glyph = document.createElement("span");
    glyph.className = "mention-glyph";
    glyph.setAttribute("aria-hidden", "true");
    span.append(glyph, document.createTextNode(chip.label));
    const mounted = mount(row.glyph, { target: glyph });
    chips.set(span, () => unmount(mounted));
    return span;
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

  /** A key the open menu takes: true when it took it. */
  function menuKey(event: KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      mention.move((event.key === "ArrowDown" ? 1 : -1) * (phone ? -1 : 1));
      return true;
    }
    if ((event.key === "Enter" || event.key === "Tab") && mention.active) {
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

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    if (mention.open && menuKey(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onsubmit?.(value);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      document.execCommand("insertText", false, "\n");
    }
  }

  function onpaste(event: ClipboardEvent) {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  }

  /** Empties the field (after a send). */
  export function reset() {
    if (editor) {
      editor.replaceChildren();
    }
    mention.close();
    sync();
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
</script>

{#if mention.open}
  <MentionMenu
    id={menuId}
    {mention}
    ondismiss={() => {
      dismissed = at;
      at = null;
      mention.close();
    }}
    onpick={pick}
    {phone}
  />
{/if}

<div
  bind:this={editor}
  class={["editor", { phone, empty }]}
  aria-activedescendant={mention.open && mention.active
    ? `${menuId}-${mention.active.kind}:${mention.active.id}`
    : undefined}
  aria-autocomplete="list"
  aria-controls={mention.open ? menuId : undefined}
  aria-expanded={mention.open}
  aria-label={label}
  contenteditable="true"
  data-placeholder={placeholder}
  {oninput}
  onblur={() => {
    hideTip();
  }}
  {onkeydown}
  onkeyup={(event) => {
    if (event.key.startsWith("Arrow") && !mention.open) {
      look();
    }
  }}
  {onpaste}
  {onpointerdown}
  {onpointerout}
  {onpointerover}
  role="combobox"
  spellcheck="true"
  tabindex="0"
></div>

{#if tip}
  <div
    class="tip"
    style:left={`${tip.x}px`}
    style:top={`${tip.y}px`}
    role="tooltip"
  >
    <span class="tip-facts">{tip.text}</span>
    <span class="tip-handle">{tip.handle}</span>
  </div>
{/if}

<style>
  .editor {
    min-block-size: 34px;
    max-block-size: 200px;
    overflow-y: auto;
    padding-block: 7px;
    font: var(--type-body);
    font-size: 16px;
    line-height: 1.25;
    color: var(--ink-strong);
    caret-color: var(--brand-solid);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    outline: none;
    scrollbar-width: none;
  }
  .editor.empty::before {
    content: attr(data-placeholder);
    color: var(--ink-subtle);
    pointer-events: none;
  }

  /* The chip: a recessed badge holding the kind's glyph and the title. */
  .editor :global(.mention-chip) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-inline-size: 100%;
    margin-inline: 1px;
    padding: 0 6px 0 4px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    font: var(--type-label);
    font-size: 15px;
    line-height: 22px;
    color: var(--ink-strong);
    vertical-align: baseline;
    white-space: nowrap;
    cursor: default;
    user-select: all;
  }
  .editor :global(.mention-glyph) {
    display: inline-grid;
    place-items: center;
    color: var(--status-idle-glyph);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .editor :global(.mention-chip[data-tone="live"] .mention-glyph) {
    color: var(--status-live-glyph);
  }
  .editor :global(.mention-chip[data-tone="attn"] .mention-glyph) {
    color: var(--status-attn-glyph);
  }
  .editor :global(.mention-chip[data-tone="fail"] .mention-glyph) {
    color: var(--status-fail-glyph);
  }

  /* DESIGN.md, Tooltip: solid ink, never coral; fades and settles from 0.96. */
  .tip {
    position: fixed;
    z-index: 60;
    display: grid;
    gap: 2px;
    max-inline-size: 320px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--ink-solid);
    color: var(--on-ink);
    font: var(--type-meta);
    translate: -50% calc(-100% - 8px);
    pointer-events: none;
    animation: kit-tip-fade 140ms var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .tip {
      animation: mention-tip-in 140ms var(--ease-out);
    }
  }
  @keyframes mention-tip-in {
    from {
      opacity: 0;
      scale: 0.96;
    }
  }
  .tip-handle {
    font: var(--type-code);
    opacity: 0.8;
  }
</style>
