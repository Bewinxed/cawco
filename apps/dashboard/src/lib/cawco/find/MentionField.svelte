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
   * A skill the session has, named whole (`/name`, skill-chips.ts), is its
   * chip (SkillChip) anywhere in the message: put in from outside (a command
   * picked from the / menu, a draft restored) or typed, once a space follows
   * it. It is sent as exactly `/name`, so the string is byte for byte what
   * was written, and a command at its start still runs as one. Every chip
   * sits in its line as a word does (ui/chip `inline`).
   *
   * Copying or cutting puts the selection's serialised string on the
   * clipboard, each chip as what it stands for, while the chip shows its
   * label.
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
  import { type Component, mount, unmount, untrack } from "svelte";
  import type { ClassValue, HTMLAttributes } from "svelte/elements";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    IconPauseCircle as Idle,
    IconServerAlt as Machine,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { copyChips } from "../chip-copy";
  import { CURVE, dur, motionOk } from "../motion/curves.svelte.js";
  import SkillChip from "../SkillChip.svelte";
  import { type Skill, skillWords } from "../skill-chips";
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
    skills = new Map(),
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
    /** The session's skills by name: each named whole is its chip. */
    skills?: ReadonlyMap<string, Skill>;
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
  const CHIP = "[data-mention-chip]";
  // A copy that reaches past the field (the page selected whole) gives each
  // chip as what it stands for too (chip-copy.ts).
  copyChips();
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

  /**
   * Whether a `<br>` opens a line: one with something after it but the
   * tail. One that ends its box draws no line of its own (a box's last
   * `<br>` adds no line), and the field writes its own newlines as "\n" in
   * text, so a box's last `<br>` is the browser's: the one it keeps in a
   * line it has emptied (select all and delete). Read as "\n", it made an
   * empty field a draft of one newline, two lines tall once focused.
   */
  function breaks(br: Node): boolean {
    for (let next = br.nextSibling; next; next = next.nextSibling) {
      const tailBreak =
        next instanceof HTMLElement && next.dataset.tail !== undefined;
      const blank =
        next.nodeType === Node.TEXT_NODE && (next as Text).data === "";
      if (!(tailBreak || blank)) {
        return true;
      }
    }
    return false;
  }

  /** The message as sent: text as typed, each chip as its serialised form. */
  function serialise(node: Node): string {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child as Text).data.replaceAll(" ", " ");
      } else if (child instanceof HTMLElement) {
        out += serialiseElement(child, out);
      }
    }
    return out;
  }

  /** An element of the field as sent, after `before`: a chip, a break, or a box's text. */
  function serialiseElement(child: HTMLElement, before: string): string {
    if (child.dataset.mention) {
      return child.dataset.mention;
    }
    if (child.dataset.tail !== undefined) {
      // The line a trailing newline opens, drawn: no character of its own.
      return "";
    }
    if (child.tagName === "BR") {
      return breaks(child) ? "\n" : "";
    }
    return (child.tagName === "DIV" && before ? "\n" : "") + serialise(child);
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
      parts.push(...wordsOf(text.slice(from, start)));
      parts.push(drawnChip(whole, name, handle));
      from = start + whole.length;
    }
    parts.push(...wordsOf(text.slice(from)));
    editor.replaceChildren(...parts);
    at = null;
    dismissed = null;
    mention.close();
    written = text;
    empty = text.length === 0;
    tail();
  }

  /** Plain words as the field holds them: each skill named whole in them its chip. */
  function wordsOf(text: string): Node[] {
    const out: Node[] = [];
    const pattern = skillWords(skills.keys());
    let from = 0;
    for (const match of pattern ? text.matchAll(pattern) : []) {
      const skill = skills.get(match[1] as string);
      const start = match.index ?? 0;
      if (!skill) {
        continue;
      }
      if (start > from) {
        out.push(document.createTextNode(text.slice(from, start)));
      }
      out.push(skillChip(skill));
      from = start + match[0].length;
    }
    if (from < text.length) {
      out.push(document.createTextNode(text.slice(from)));
    }
    return out;
  }

  /**
   * A skill's chip, drawn by SkillChip and moved into the field. Its holder
   * keeps what Svelte leaves beside it (its block's anchor) out of the
   * message, and takes the chip back to be unmounted where it was mounted.
   */
  function skillChip(skill: Skill): HTMLElement {
    const holder = document.createElement("span");
    const mounted = mount(SkillChip, {
      target: holder,
      props: { skill, field: true },
    });
    const chip = holder.querySelector<HTMLElement>("[data-skill-chip]");
    if (!chip) {
      throw new Error(`SkillChip drew no chip for /${skill.name}`);
    }
    chips.set(chip, () => {
      holder.prepend(chip);
      unmount(mounted);
    });
    return chip;
  }

  /**
   * Whether the field's own words (outside its chips) name a skill whole:
   * followed by a space, or with `ends` "end" also at the text's end.
   */
  function namesSkill(ends: "end" | "space"): boolean {
    const pattern = skillWords(skills.keys(), ends);
    if (!(pattern && editor)) {
      return false;
    }
    const walk = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      pattern.lastIndex = 0;
      if (
        !node.parentElement?.closest(CHIP) &&
        pattern.test((node as Text).data)
      ) {
        return true;
      }
    }
    return false;
  }

  /** The field drawn again from its own string, the selection kept where it was. */
  function redraw() {
    const [from, to] = selection();
    const focused = document.activeElement === editor;
    draw(written ?? "");
    if (focused) {
      select(from, to);
    }
  }

  /** A skill typed whole, a space after it, becomes its chip where it stands. */
  function chipTyped() {
    if (namesSkill("space")) {
      redraw();
    }
  }

  // The session's skills arrive after its draft (its / menu is asked for
  // once it opens): a skill already in the draft becomes its chip then.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: a new list of skills is what re-runs this.
    void skills;
    untrack(() => {
      if (editor && written && namesSkill("end")) {
        redraw();
      }
    });
  });

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
      const glyph = span.querySelector("[data-mention-glyph]") as HTMLElement;
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
   * own, a chip's serialised form, a line break's one (none for a box's
   * last, `breaks`); none for the tail and anything else; null for a box
   * holding more (`serialise`).
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
    if (child.tagName === "BR") {
      return breaks(child) ? 1 : 0;
    }
    return null;
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

  /**
   * Where a point in the field stands in the string. A point inside a chip
   * (its label's words) stands at the chip's start, or its end for the end
   * of a selection (`side`): a chip is one atom.
   */
  function offsetOf(
    container: Node,
    offset: number,
    list: Atom[],
    side: "start" | "end" = "start"
  ): number {
    const within = (
      container instanceof Element ? container : container.parentElement
    )?.closest(CHIP);
    const chip = list.find((a) => a.node === within);
    if (chip) {
      return side === "end" ? chip.end : chip.start;
    }
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
      offsetOf(range.endContainer, range.endOffset, list, "end"),
    ];
  }

  /** Whether a chip of the field starts at offset `n` of the string. */
  export function chipAt(n: number): boolean {
    return atoms().some((a) => !a.text && a.start === n && a.end > n);
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
    chipTyped();
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
    span.className = chipVariants({
      variant: "inline",
      class: "cursor-default select-all",
    });
    // Its own attribute, not `data-slot`: the composer hides it under a
    // state (a flight, an ask), and Chrome keys an attribute selector there
    // to the attribute's name alone.
    span.setAttribute("data-mention-chip", "");
    span.contentEditable = "false";
    span.dataset.mention = chip.serialised;
    span.dataset.copies = chip.serialised;
    span.dataset.tip = chip.tip;
    span.dataset.handle = chip.handle;
    span.dataset.tone = chip.tone;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", `${chip.label}, ${chip.tip}`);
    const glyph = document.createElement("span");
    // The glyph in its chip's status ink (the chip's own `data-tone`), at
    // the 16px icon size; its hook is its own attribute, as the chip's is.
    glyph.className =
      "inline-grid place-items-center text-status-idle-glyph [&_svg]:size-icon-md [[data-tone=live]>&]:text-status-live-glyph [[data-tone=attn]>&]:text-status-attn-glyph [[data-tone=fail]>&]:text-status-fail-glyph";
    glyph.setAttribute("data-mention-glyph", "");
    glyph.setAttribute("aria-hidden", "true");
    glyph.setAttribute("data-box", "");
    const words = document.createElement("span");
    words.dataset.slot = "label";
    words.textContent = chip.label;
    span.append(glyph, words);
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
    chipTyped();
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

  /**
   * Copying or cutting from the field puts the selection's serialised
   * string on the clipboard: each chip as what it stands for (`/name`, a
   * mention's `@<title> <handle>`), never the label it shows. A cut takes
   * whole chips with the words.
   */
  function oncopy(event: ClipboardEvent) {
    const [from, to] = selection();
    if (from === to || !event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData("text/plain", (written ?? "").slice(from, to));
  }

  function oncut(event: ClipboardEvent) {
    oncopy(event);
    const picked = getSelection();
    if (!(event.defaultPrevented && editor && picked)) {
      return;
    }
    const [from, to] = selection();
    select(from, to);
    picked.getRangeAt(0).deleteContents();
    select(from);
    sync();
    look();
    editor.dispatchEvent(new Event("input", { bubbles: true }));
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
    of: HTMLElement;
  } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  const showTip = (chip: HTMLElement) => {
    const box = chip.getBoundingClientRect();
    tip = {
      x: box.left + box.width / 2,
      y: box.top,
      text: chip.dataset.tip ?? "",
      handle: chip.dataset.handle ?? "",
      of: chip,
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
    const chip = (event.target as Element).closest<HTMLElement>(CHIP);
    if (!chip || event.pointerType !== "mouse") {
      return;
    }
    if (tipTimer) {
      clearTimeout(tipTimer);
    }
    tipTimer = setTimeout(() => showTip(chip), tip ? 0 : 350);
  }
  function onpointerout(event: PointerEvent) {
    const chip = (event.target as Element).closest(CHIP);
    if (chip && !chip.contains(event.relatedTarget as Node)) {
      hideTip();
    }
  }
  function onpointerdown(event: PointerEvent) {
    const chip = (event.target as Element).closest<HTMLElement>(CHIP);
    if (chip) {
      event.preventDefault();
      if (tip?.of === chip) {
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

  /**
   * Stands the menu's box in `host` (the composer's pill, which places it),
   * else leaves it where it is. Only the box moves: the block that holds it
   * is still this field's, so its transitions run as it opens and shuts.
   */
  const standIn =
    (host: HTMLElement | undefined) =>
    (node: HTMLElement): void => {
      host?.append(node);
    };

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

<!-- The menu stays in this block, so it grows in as `mention.open` turns
     and folds back as it goes (MentionMenu `grow`); with a host, only its
     box is stood in the host (`standIn`). Through a mounted portal (bits-ui
     Portal: `mount` and `unmount` without its outro) it came and went with
     no motion at all. -->
{#if mention.open}
  <div class="contents" {@attach standIn(menuHost)}>
    {@render menu()}
  </div>
{/if}

<div
  data-slot="editor"
  data-mention-field-empty={empty || undefined}
  data-editor
  {...rest}
  bind:this={editor}
  data-phone={phone || undefined}
  class={cn(
    "type-body wrap-anywhere no-scrollbar relative max-h-c-textarea-max-h min-h-c-composer-field overflow-y-auto whitespace-pre-wrap py-space-2 text-ink-strong leading-ui caret-brand-solid data-mention-field-empty:before:pointer-events-none data-mention-field-empty:before:absolute data-mention-field-empty:before:text-ink-subtle data-mention-field-empty:before:content-placeholder",
    className
  )}
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
  {oncopy}
  {oncut}
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
  <div
    data-slot="tip"
    class="fixed z-(--layer-float) grid gap-space-row max-w-c-tip-max-w py-space-2 px-space-3 rounded-sm bg-ink-solid text-on-ink type-meta -translate-x-1/2 translate-y-(--tip-shift-y) pointer-events-none animate-kit-tip-fade motion-safe:animate-mention-tip-in"
    role="tooltip"
    style:left={`${tip.x}px`}
    style:top={`${tip.y}px`}
    style:--tip-shift-y="calc(-100% - var(--space-2))"
  >
    <span>{tip.text}</span>
    <span class="type-code opacity-80">{tip.handle}</span>
  </div>
{/if}
