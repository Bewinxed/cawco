<script lang="ts" module>
  /** The page's one choice: which variation to build. */
  export const CHOICE = "plan-variation";

  /** What CawCo's preview overlay offers the page (window.cawco). */
  interface Bridge {
    note: (id: string, text: string) => Promise<unknown>;
    on: (
      event: "picks",
      listen: (picks: Record<string, { note?: string }>) => void
    ) => void;
  }
  const bridge = (): Bridge | undefined =>
    (globalThis as { cawco?: Bridge }).cawco;

  /** Each variation's notes, sent as one note on the choice, a line each. */
  const notes = $state<Record<string, string>>({});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
</script>

<script lang="ts">
  /**
   * A variation's Pick: the option the overlay stores when it is pressed
   * (`data-option` inside the page's `data-cawco-choice`), its one-line
   * case, and a notes field. The three variations' notes travel as one note
   * on the choice, each under its variation's name.
   */
  import { onMount } from "svelte";

  let {
    option,
    name,
    line,
    recommended = false,
    names,
  }: {
    option: string;
    name: string;
    line: string;
    recommended?: boolean;
    /** Every variation's name, by option, for the note's headings. */
    names: Record<string, string>;
  } = $props();

  function send(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = Object.entries(notes)
        .filter(([, words]) => words.trim())
        .map(([key, words]) => `${names[key] ?? key}: ${words.trim()}`)
        .join("\n");
      bridge()
        ?.note(CHOICE, text)
        .catch(() => undefined);
    }, 700);
  }

  onMount(() => {
    const live = bridge();
    if (!live || listening) {
      return;
    }
    listening = true;
    live.on("picks", (picks) => {
      const kept = picks[CHOICE]?.note ?? "";
      for (const [key, label] of Object.entries(names)) {
        const found = kept
          .split("\n")
          .find((row) => row.startsWith(`${label}: `));
        if (found && document.activeElement?.id !== `note-${key}`) {
          notes[key] = found.slice(label.length + 2);
        }
      }
    });
  });
</script>

<div class="pick" data-slot="pick">
  <button
    aria-pressed="false"
    class="option pressable"
    data-option={option}
    type="button"
  >
    <b>{name}</b>
    <span class="line">{line}</span>
    {#if recommended}<span class="dp-tag">Recommended</span>{/if}
  </button>
  <label class="notes" for="note-{option}">
    <span class="notes-label">Notes on {name}</span>
    <textarea
      class="note"
      bind:value={
        () => notes[option] ?? "",
        (value) => {
          notes[option] = value;
          send();
        }
      }
      id="note-{option}"
      placeholder="What to keep, what to change"
      rows="2"></textarea>
  </label>
</div>

<style>
  .pick {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
    max-inline-size: 780px;
  }
  @media (width < 700px) {
    .pick {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .option {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    min-block-size: 44px;
    padding: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;
    transition:
      border-color var(--dur-control) var(--ease-out),
      background-color var(--dur-control) var(--ease-out);

    & b {
      font-weight: var(--weight-strong);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  /* Picked: the overlay marks the option the hub kept. */
  .pick :global(.option[aria-pressed="true"]),
  .pick :global(.option[data-cawco-picked]) {
    border-color: var(--ink-strong);
    background: var(--surface-fill);
  }
  @media (hover: hover) and (pointer: fine) {
    .option:hover {
      border-color: var(--ink-subtle);
    }
  }
  .line {
    flex: 1 1 100%;
    color: var(--ink-muted);
    font: var(--type-meta);
    text-wrap: pretty;
  }
  .dp-tag {
    order: -1;
    margin-inline-start: auto;
    padding: 0 6px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-meta);
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .notes-label {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .note {
    min-block-size: 44px;
    padding: var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-body);
    resize: vertical;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
</style>
