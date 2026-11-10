/**
 * The composer's `/` menu: typing `/` at the start of a word opens a menu
 * above the input of what the session offers, driven from the field's own
 * keyboard so focus never leaves the message being written. (`@` is the
 * field's own: MentionField opens the @ menu.)
 */

import type { AvailableCommand } from "@cawco/core/fleet";
import { flushSync, untrack } from "svelte";
import { track } from "#lib/platform/track.js";
import { cleanDetail } from "../command-detail";
import type MentionField from "../find/MentionField.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";

/** A `/` or `@` token stops being typed as one the moment it holds whitespace. */
const TOKEN_WHITESPACE = /\s/u;

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

export interface SlashMenuParts {
  /** What this session offers behind `/`. */
  commands: () => AvailableCommand[];
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  mentionField: () => ReturnType<typeof MentionField> | undefined;
  /** Fired when the `/` menu opens, so the session can be re-asked what it has. */
  onmenu: () => void;
}

export class SlashMenu {
  /**
   * The prose a row shows. Plugin descriptions often lead with their own name in
   * parens — `(code-foundations) Execute…` — which is exactly the section heading
   * above the row, so it is stripped here rather than printed twice.
   */
  /** Where the caret is, so the token under it can be found on every keystroke. */
  caret = $state(0);
  /** Dismissed with Escape: the token is still there, the menu is not. */
  dismissed = $state(false);
  highlight = $state("");
  readonly #parts: SlashMenuParts;
  /**
   * The `/…` the caret sits in the middle of, or null. (`@` is the field's
   * own: MentionField opens the @ menu.)
   *
   * A sigil only opens a menu at the start of a word — mid-token it is a path
   * separator, which the reader is entitled to type without a menu landing
   * on top of it.
   */
  readonly token = $derived.by((): { query: string; from: number } | null => {
    const { text } = this.#parts.draft();
    const at = Math.min(this.caret, text.length);
    const before = text.slice(0, at);
    const start =
      Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
    const word = before.slice(start);
    // A skill already drawn as its chip is no longer being typed.
    if (!word.startsWith("/") || this.#parts.mentionField()?.chipAt(start)) {
      return null;
    }
    const query = word.slice(1);
    // A token with whitespace in it is no longer being typed as one.
    if (TOKEN_WHITESPACE.test(query)) {
      return null;
    }
    return { query, from: start };
  });
  readonly entries = $derived.by((): Entry[] => {
    const active = this.token;
    if (!active) {
      return [];
    }
    const needle = active.query.toLowerCase();
    const rows: Entry[] = this.#parts.commands().map((command) => ({
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
  readonly sections = $derived.by((): Section[] => {
    if (this.entries.length === 0) {
      return [];
    }
    const groups = new Map<
      string,
      { heading: string; rank: number; sub: string; entries: Entry[] }
    >();
    for (const entry of this.entries) {
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
  readonly open = $derived(!this.dismissed && this.entries.length > 0);
  /**
   * A DOM id per visible row, so the field can point `aria-activedescendant`
   * at the highlighted one. A screen reader on a combobox reads the active
   * descendant, not the input's value — without this the menu is invisible to
   * it, however well the arrow keys work. Keyed by position in the filtered
   * list, which is unique where the entry's own id (`/foo`, `@bar`) is not a
   * safe id token.
   */
  readonly domIds = $derived(
    new Map(
      this.entries.map((entry, index) => [entry.id, `composer-entry-${index}`])
    )
  );
  readonly activeDescendant = $derived(
    this.open ? this.domIds.get(this.highlight) : undefined
  );
  #opened = false;

  constructor(parts: SlashMenuParts) {
    this.#parts = parts;

    /**
     * A composer handed another conversation's draft starts that draft with
     * its menu closed: the caret this one last noted was in the other text.
     */
    $effect.pre(() => {
      track(parts.draft());
      untrack(() => {
        this.dismissed = true;
        this.caret = parts.draft().text.length;
      });
    });

    $effect(() => {
      const open = this.token !== null;
      const rising = open && !this.#opened;
      this.#opened = open;
      if (rising) {
        untrack(() => parts.onmenu());
      }
    });

    // The highlight follows the list: a query that filters the selected row away
    // must not leave Enter pointing at something that is no longer on screen.
    $effect(() => {
      if (!this.open) {
        return;
      }
      if (!this.entries.some((entry) => entry.id === this.highlight)) {
        this.highlight = this.entries[0].id;
      }
    });
  }

  /** The caret moved (a click, a key, an input): where it is now, and the menu asked for again. */
  noteCaret(): void {
    this.caret = this.#parts.mentionField()?.selection()[0] ?? 0;
    this.dismissed = false;
  }

  /** Puts the chosen row where the token was, with a space after it. */
  choose(entry: Entry): void {
    const active = this.token;
    if (!active) {
      return;
    }
    const draft = this.#parts.draft();
    const end = Math.min(this.caret, draft.text.length);
    draft.text = `${draft.text.slice(0, active.from)}${entry.insert} ${draft.text.slice(end)}`;
    const next = active.from + entry.insert.length + 1;
    this.dismissed = true;
    // The field draws the new text now, and the caret is set in it before
    // the next key: set a tick later, a key typed straight after the pick
    // landed at the field's start.
    flushSync();
    this.#parts.field()?.focus();
    this.#parts.mentionField()?.select(next);
    this.caret = next;
  }

  step(by: number): void {
    if (this.entries.length === 0) {
      return;
    }
    const at = this.entries.findIndex((entry) => entry.id === this.highlight);
    const next = (at + by + this.entries.length) % this.entries.length;
    this.highlight = this.entries[next].id;
  }

  /**
   * The `/` and `@` menu owns these keys while it is up — Enter picks a
   * command rather than sending the half-typed name of one. True when the key
   * was the menu's.
   */
  key(event: KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.step(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const picked = this.entries.find((entry) => entry.id === this.highlight);
      if (picked) {
        event.preventDefault();
        this.choose(picked);
        return true;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.dismissed = true;
      return true;
    }
    return false;
  }
}
