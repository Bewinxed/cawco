<script lang="ts">
  /**
   * The first-prompt editor (§1.4, §2.3): a contenteditable that grows from
   * `c-row-h` to `c-prompt-grown-h`, detects `@` / `/` at the caret and inserts chips. The prompt
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
    onpaste,
    onsubmit,
  }: {
    value?: string;
    element?: HTMLDivElement;
    menuItems: (type: "@" | "/", query: string) => MenuItem[];
    lead?: LeadChip;
    onleadremove?: () => void;
    /**
     * A paste, before it lands as text: true when it was taken elsewhere
     * (files, or a long paste, attached), and the editor inserts nothing.
     */
    onpaste?: (data: DataTransfer | null) => boolean;
    onsubmit: () => void;
  } = $props();
  interface Menu {
    end: number;
    node: Text;
    query: string;
    start: number;
    type: "@" | "/";
  }
  const TRIGGER = /(^|[\s ])([@/])([\w./-]*)$/;
  const LEADING_SPACE = /^[\s\u00a0]+/;
  const NAV = ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"];
  let menu = $state.raw<Menu | null>(null);
  let menuIdx = $state(0);
  const items = $derived(menu ? menuItems(menu.type, menu.query) : []);
  const promptEmpty = $derived(!(value || lead));

  /**
   * The New Session surface the editor stands in, its desk popover or its
   * phone sheet, and the popovers its chips open (portaled out of it).
   */
  const FORM = "[data-ns-popover], [data-ns-dialog], [data-ns-pop]";
  /**
   * The person is writing the prompt: from the editor taking the focus until
   * the focus goes to something outside the form. Its room is held while
   * they work the rest of the form. Let go on the editor's own blur, it was
   * let go at a chip's pointerdown (a press focuses at its pointerdown), so
   * everything under the editor moved up while the press was down: the
   * release landed on what moved in under the pointer and the click went to
   * their common ancestor. A chip of an empty prompt's form never opened,
   * nor a harness under it (new session at the desk, reduced motion:
   * "pointerdown span … at 573,283.87", "pointerup p.type-meta.m-0"), and
   * with motion the row slid away under a person's press. Focus that goes
   * nowhere (a press on the form's own words) takes nothing from it.
   */
  let engaged = $state(false);
  $effect(() => {
    const moved = (event: FocusEvent) => {
      const to = event.target;
      if (to === element) {
        engaged = true;
      } else if (!(to instanceof Element && to.closest(FORM))) {
        engaged = false;
      }
    };
    addEventListener("focusin", moved, true);
    return () => removeEventListener("focusin", moved, true);
  });
  const grown = $derived(Boolean(engaged || value || menu));

  /**
   * The menu stands on the caret where the caret is now, measured each time
   * the popover places itself. Measured once, as the trigger was typed, a
   * `/` typed while the editor was still growing to its grown height (the dialog
   * re-centring 38px up as it did) left the menu 38px under the caret for
   * good. The editor is the anchor's `contextElement`: floating-ui's
   * autoUpdate observes it for size and movement, and its scrolling
   * ancestors, so the menu follows whatever moves the caret.
   */
  const anchor = $derived.by(() => {
    const at = menu;
    const editor = element;
    if (!(at && editor)) {
      return null;
    }
    return {
      contextElement: editor,
      getBoundingClientRect: () => {
        const range = document.createRange();
        range.setStart(at.node, at.end);
        range.collapse(true);
        return range.getBoundingClientRect();
      },
    };
  });
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
    if (!(
      element &&
      selection?.rangeCount &&
      element.contains(selection.anchorNode)
    )) {
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
    // A reference on the prompt's line: one line box tall less its 1px
    // margin each side, so a line holding chips keeps the prompt's leading.
    chip.className =
      "m-px inline-flex h-[calc(var(--prompt-lh)-2px)] items-center gap-space-1 rounded-sm border border-border-control bg-surface-fill ps-space-1 pe-space-2 align-top font-body text-label leading-none font-medium whitespace-nowrap text-ink-strong select-all";
    const mark = document.createElement("span");
    mark.className = "inline-flex *:[svg]:size-icon-sm";
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
    if (onpaste?.(event.clipboardData)) {
      return;
    }
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

<div
  data-slot="editor-wrap"
  class="relative prompt-fs-(--text-body) max-phone:prompt-fs-(--text-field-floor) coarse:prompt-fs-(--text-field-floor)"
  data-keeps-draft
  style:--prompt-lh="calc(var(--prompt-fs) * var(--leading-prose))"
>
  <!-- biome-ignore lint/a11y/useSemanticElements: a contenteditable is the only element that can hold inline chips; textarea cannot -->
  <div
    data-slot="editor"
    aria-label="First prompt"
    aria-multiline="true"
    class="fai-scroll h-c-row-h data-grown:h-c-prompt-grown-h max-phone:h-c-prompt-grown-h w-full overflow-auto rounded-t-lg bg-transparent px-space-4 pt-space-3 pb-space-2 font-body text-(length:--prompt-fs) leading-(--prompt-lh) font-normal whitespace-pre-wrap break-word text-ink-strong max-phone:overscroll-contain motion-safe:phone:transition-[height] motion-safe:phone:duration-(--dur-pop) motion-safe:phone:ease-in-out"
    contenteditable="true"
    id="session-prompt"
    onblur={closeMenu}
    onclick={caret}
    oninput={input}
    {onkeydown}
    onkeyup={caret}
    onpaste={paste}
    role="textbox"
    data-grown={grown || undefined}
    tabindex="0"
    bind:this={element}
  ></div>
  {#if promptEmpty}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-space-4 top-space-3 truncate font-body text-(length:--prompt-fs) leading-(--prompt-lh) font-normal text-ink-subtle"
      >What should the agent do first?
      <span class="text-ink-subtle max-phone:hidden"
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
