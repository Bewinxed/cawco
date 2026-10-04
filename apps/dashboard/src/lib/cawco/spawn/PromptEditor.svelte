<script lang="ts">
  /**
   * The first-prompt editor (§1.4, §2.3): a contenteditable that grows from
   * 44px to 120px, detects `@` / `/` at the caret and inserts chips. The prompt
   * that is sent is the editor's text with chips serialised as `@name`/`/name`.
   * A `lead` chip opens the editor and serialises to nothing; deleting it calls
   * `onleadremove`.
   */
  import { type Component, mount, unmount } from "svelte";
  import HarnessLogo from "../HarnessLogo.svelte";
  import type { LeadChip, MenuItem } from "./ns-types";
  import TriggerMenu from "./TriggerMenu.svelte";

  let {
    value = $bindable(""),
    element = $bindable(),
    menuItems,
    lead,
    onleadremove,
    onsubmit,
  }: {
    value?: string;
    element?: HTMLDivElement;
    menuItems: (type: "@" | "/", query: string) => MenuItem[];
    lead?: LeadChip;
    onleadremove?: () => void;
    onsubmit: () => void;
  } = $props();
  interface Menu {
    end: number;
    node: Text;
    query: string;
    rect: DOMRect;
    start: number;
    type: "@" | "/";
  }
  const TRIGGER = /(^|[\s ])([@/])([\w./-]*)$/;
  const LEADING_SPACE = /^[\s\u00a0]+/;
  const NAV = ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"];
  let promptFocus = $state(false);
  let menu = $state.raw<Menu | null>(null);
  let menuIdx = $state(0);
  const items = $derived(menu ? menuItems(menu.type, menu.query) : []);
  const promptEmpty = $derived(!(value || lead));
  const promptH = $derived(promptFocus || value || menu ? 120 : 44);
  const anchor = $derived(
    menu ? { getBoundingClientRect: () => (menu as Menu).rect } : null
  );
  const chips = new Map<HTMLElement, Record<string, unknown>>();

  function serialize(node: Node): string {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child instanceof HTMLElement) {
        if (child.dataset.serial !== undefined) {
          out += child.dataset.serial;
        } else if (child.tagName === "BR") {
          out += "\n";
        } else {
          if (child.tagName === "DIV" && out && !out.endsWith("\n")) {
            out += "\n";
          }
          out += serialize(child);
        }
      }
    }
    return out;
  }
  const text = () =>
    serialize(element as Node)
      .replace(/ /g, " ")
      .trim();

  function closeMenu() {
    if (menu) {
      menu = null;
    }
  }
  function detectTrigger() {
    const selection = window.getSelection();
    if (
      !(
        element &&
        selection?.rangeCount &&
        element.contains(selection.anchorNode)
      )
    ) {
      closeMenu();
      return;
    }
    const node = selection.anchorNode;
    const offset = selection.anchorOffset;
    if (!(node instanceof Text)) {
      closeMenu();
      return;
    }
    const before = (node.textContent ?? "").slice(0, offset);
    const match = TRIGGER.exec(before);
    if (!match) {
      closeMenu();
      return;
    }
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const [, , trigger, query] = match;
    const type = trigger as "@" | "/";
    const next = menuItems(type, query);
    menuIdx = Math.min(menu ? menuIdx : 0, Math.max(0, next.length - 1));
    menu = {
      type,
      query,
      node,
      start: offset - match[2].length - match[3].length,
      end: offset,
      rect,
    };
  }
  function makeChip<Props extends Record<string, unknown>>(
    item: Pick<MenuItem, "key" | "label" | "serial"> & {
      hue?: string;
      icon: Component<Props>;
      props: Props;
    }
  ) {
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset.chip = item.key;
    chip.dataset.serial = item.serial;
    chip.className = "ns-chip";
    const mark = document.createElement("span");
    mark.className = "ns-chip-icon";
    mark.style.color = item.hue ?? "";
    chip.append(mark);
    chips.set(chip, mount(item.icon, { target: mark, props: item.props }));
    const label = document.createElement("span");
    label.textContent = item.label;
    chip.append(label);
    return chip;
  }
  const leadChip = () =>
    element?.querySelector<HTMLElement>(":scope > [data-lead]") ?? null;
  function syncLead() {
    const current = leadChip();
    if (!element || Boolean(lead) === Boolean(current)) {
      return;
    }
    if (current) {
      dropLead(current);
      return;
    }
    const { harness, key, label, title } = lead as LeadChip;
    const chip = makeChip({
      icon: HarnessLogo,
      key,
      label,
      props: { harness },
      serial: "",
    });
    chip.dataset.lead = "";
    chip.title = title;
    element.prepend(chip, document.createTextNode(" "));
  }
  function dropLead(chip: HTMLElement) {
    const next = chip.nextSibling;
    if (next instanceof Text) {
      next.textContent = (next.textContent ?? "").replace(LEADING_SPACE, "");
    }
    unmount(chips.get(chip) as Record<string, unknown>);
    chips.delete(chip);
    chip.remove();
  }
  /** Backspace right after the lead chip, or Delete right before it, removes it. */
  function deleteLead(event: KeyboardEvent) {
    const chip = leadChip();
    const selection = window.getSelection();
    if (!(chip && element && selection?.isCollapsed && selection.anchorNode)) {
      return false;
    }
    const range = document.createRange();
    range.setStart(element, 0);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    const before = range.toString().trim();
    const hit =
      event.key === "Backspace"
        ? before === (chip.textContent ?? "").trim()
        : before === "";
    if (!hit) {
      return false;
    }
    event.preventDefault();
    dropLead(chip);
    value = text();
    onleadremove?.();
    return true;
  }
  function input() {
    value = text();
    detectTrigger();
    if (lead && !leadChip()) {
      onleadremove?.();
    }
  }
  function insertChip(item: MenuItem) {
    if (!(menu && element)) {
      return;
    }
    const chip = makeChip({ ...item, props: {} });
    const range = document.createRange();
    range.setStart(menu.node, menu.start);
    range.setEnd(menu.node, menu.end);
    range.deleteContents();
    const space = document.createTextNode(" ");
    range.insertNode(space);
    range.insertNode(chip);
    const selection = window.getSelection();
    const after = document.createRange();
    after.setStart(space, 1);
    after.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(after);
    item.apply();
    menu = null;
    value = text();
  }
  function onkeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onsubmit();
      return;
    }
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      deleteLead(event)
    ) {
      return;
    }
    if (!menu) {
      return;
    }
    const count = Math.max(1, items.length);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      menuIdx = (menuIdx + 1) % count;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      menuIdx = (menuIdx - 1 + count) % count;
    } else if ((event.key === "Enter" || event.key === "Tab") && items.length) {
      event.preventDefault();
      insertChip(items[menuIdx] ?? items[0]);
    } else if (event.key === "Escape") {
      // Without this the dialog's own Escape handler closes the whole modal.
      event.preventDefault();
      event.stopPropagation();
      menu = null;
    }
  }
  function caret(event: KeyboardEvent | MouseEvent) {
    if (!("key" in event && NAV.includes(event.key))) {
      detectTrigger();
    }
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault();
    // Native text insertion preserves the editing undo history and inline chips.
    document.execCommand(
      "insertText",
      false,
      event.clipboardData?.getData("text/plain") ?? ""
    );
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!(element && selection?.rangeCount)) {
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const visible = element.getBoundingClientRect();
      if (rect.bottom > visible.bottom) {
        element.scrollTop += Math.ceil(rect.bottom - visible.bottom);
      } else if (rect.top < visible.top) {
        element.scrollTop += Math.floor(rect.top - visible.top);
      }
    });
  }
  $effect(() => {
    if (value === "" && element && text() !== "") {
      element.replaceChildren();
      for (const instance of chips.values()) {
        unmount(instance);
      }
      chips.clear();
    }
    syncLead();
    // A prompt the form set itself (a failed continuation's, restored) is
    // shown as the text it serialises to.
    if (element && value && value !== text()) {
      element.append(document.createTextNode(value));
    }
  });
</script>

<div class="editor-wrap" data-keeps-draft>
  <!-- biome-ignore lint/a11y/useSemanticElements: a contenteditable is the only element that can hold inline chips; textarea cannot -->
  <div
    aria-label="First prompt"
    aria-multiline="true"
    class="editor fai-scroll"
    contenteditable="true"
    id="session-prompt"
    onblur={() => {
      promptFocus = false;
      closeMenu();
    }}
    onclick={caret}
    onfocus={() => {
      promptFocus = true;
    }}
    oninput={input}
    {onkeydown}
    onkeyup={caret}
    onpaste={paste}
    role="textbox"
    style={`--prompt-height:${promptH}px`}
    tabindex="0"
    bind:this={element}
  ></div>
  {#if promptEmpty}
    <span aria-hidden="true" class="placeholder"
      >What should the agent do first?
      <span class="hint"
        >@ machine or project · / skills and plugins</span
      ></span
    >
  {/if}
  <TriggerMenu
    {anchor}
    id="trigger-menu"
    index={menuIdx}
    {items}
    onchange={(open) => {
      if (!open) {
        closeMenu();
      }
    }}
    onpick={insertChip}
    open={menu !== null}
  />
</div>

<style>
  .editor-wrap {
    position: relative;
    /* The prompt's type, defined once: the text, the placeholder and the chips
       (which size themselves to the line) all read the same two values. */
    --prompt-fs: var(--text-body);
    --prompt-lh: calc(var(--prompt-fs) * 1.55);
  }
  .editor {
    width: 100%;
    height: var(--prompt-height);
    padding: 12px 16px 6px;
    overflow: auto;
    outline: none;
    background: transparent;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    font:
      var(--weight-body) var(--prompt-fs) / var(--prompt-lh) var(--font-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
    word-break: break-word;
    @media (prefers-reduced-motion: no-preference) {
      transition: height var(--ns-prompt-ms) var(--ease-in-out);
    }
  }
  .placeholder {
    position: absolute;
    left: 16px;
    top: 12px;
    right: 16px;
    font:
      var(--weight-body) var(--prompt-fs) / var(--prompt-lh) var(--font-body);
    color: var(--ink-subtle);
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    color: var(--ink-subtle);
  }
  /* A chip is centred on its line by construction, not tuned to a baseline.
     It is the line minus 1px of margin above and below, pinned to the line's
     top: the margin box is exactly one line tall, so the chip never grows the
     line box and its centre is the line's centre, which is also the centre of
     the text's content area (half-leading is symmetric). Nothing depends on the
     chip's own font, the icon's size or the prompt's size, so it holds at the
     desktop 14px, the mobile 16px and any font the token stack resolves to.
     (Flex alignment inside the chip centres the icon and the label together;
     a flex chip's own baseline is never consulted because it is top-aligned.) */
  .editor :global(.ns-chip) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    vertical-align: top;
    block-size: calc(var(--prompt-lh) - 2px);
    margin: 1px;
    padding-inline: 5px 7px;
    border-radius: var(--radius-sm);
    background: var(--surface-fill);
    border: 1px solid var(--border-control);
    font: var(--weight-strong) var(--text-label) / 1 var(--font-body);
    color: var(--ink-strong);
    white-space: nowrap;
    user-select: all;
  }
  .editor :global(.ns-chip-icon) {
    display: inline-flex;
  }
  /* The harness logo sizes itself (16px); every other icon is a bare svg. */
  .editor :global(.ns-chip-icon > svg) {
    inline-size: 12px;
    block-size: 12px;
  }
  /* iOS Safari zooms into a field whose text is under 16px and stays zoomed
     after the keyboard goes; app.css holds every input, textarea and select
     to that floor under this same condition, and the prompt is the one
     field that is none of those. */
  @media (max-width: 640px), (pointer: coarse) {
    .editor-wrap {
      --prompt-fs: 1rem;
    }
  }
  @media (max-width: 640px) {
    .editor {
      height: 120px;
      overscroll-behavior: contain;
      transition: none;
    }
    /* The hint would only ellipsise at this width; the question survives whole. */
    .hint {
      display: none;
    }
  }
</style>
