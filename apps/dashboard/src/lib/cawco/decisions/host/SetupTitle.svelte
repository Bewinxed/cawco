<!--
  A setup page's title: the project's name, renamed where it stands, as a
  document's title is (the project head's name, `ProjectHead.svelte`). Text
  at rest in the title role, with no box and no label; a pointer over it
  tints it, focus puts the caret on that tint (DESIGN.md, The Caret Rule),
  Enter or a press away keeps it, Escape puts back what it said. Its field
  is named "Project name" for a screen reader.
-->
<script lang="ts">
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import { picks } from "./page.svelte.js";
  import { renameTo, setupName } from "./setup-name.svelte.js";

  let { drafted }: { drafted: string } = $props();

  // What the hub kept wins over the draft, so a reload draws the rename.
  let editing = false;
  $effect(() => {
    const kept = picks.now.name?.value;
    if (!editing) {
      setupName.now = typeof kept === "string" && kept ? kept : drafted;
    }
  });
  let before = "";
</script>

<input
  aria-label={words.name}
  class="-mx-space-2 min-w-0 flex-auto rounded-sm border-none bg-transparent px-space-2 type-title text-ink-strong caret-brand-solid outline-hidden transition-[background-color] duration-(--duration-control) ease-out hover:bg-surface-hover focus:bg-surface-hover"
  data-slot="setup-name"
  onblur={() => {
    editing = false;
  }}
  onfocus={() => {
    editing = true;
    before = setupName.now;
  }}
  oninput={(event) => renameTo(event.currentTarget.value)}
  onkeydown={(event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      renameTo(before);
      event.currentTarget.value = before;
      event.currentTarget.blur();
    }
  }}
  value={setupName.now}
/>
