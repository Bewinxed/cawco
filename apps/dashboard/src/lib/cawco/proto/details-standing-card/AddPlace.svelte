<script lang="ts">
  /**
   * Add place, opened in the Places list under its rows: every machine of
   * the fleet as a chip, the folder typed, and what is there, two ways: the
   * folder is already the project, or the project is copied there (the act
   * the TOM calls Copy to another machine), which says what it leaves.
   */
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { PlaceDraft } from "./details";
  import MachineChips from "./MachineChips.svelte";
  import { standingWords } from "./words";

  const words = standingWords.adding;

  let {
    draft,
    machines,
    ondraft,
    onadd,
    oncancel,
  }: {
    draft: PlaceDraft;
    machines: Machine[];
    ondraft: (next: PlaceDraft) => void;
    onadd: () => void;
    oncancel: () => void;
  } = $props();

  const folderId = $props.id();
</script>

<div class="flex min-w-0 flex-col gap-space-3" data-add-place in:reveal>
  <div class="flex min-w-0 flex-col gap-space-2">
    <span class="type-meta text-ink-muted">{words.machine}</span>
    <MachineChips
      label={words.machine}
      {machines}
      onpick={(machineId) => ondraft({ ...draft, machineId })}
      value={draft.machineId}
    />
  </div>
  <div class="flex min-w-0 flex-col gap-space-2">
    <label class="type-meta text-ink-muted" for={folderId}>{words.folder}</label
    >
    <Input
      autocomplete="off"
      face="mono"
      id={folderId}
      oninput={(event) =>
        ondraft({ ...draft, folder: event.currentTarget.value })}
      placeholder={words.folderHint}
      spellcheck="false"
      value={draft.folder}
    />
  </div>
  <OptionGroup
    aria-label={words.copy}
    bind:value={
      () => [draft.copy ? "copy" : "already"],
      (next) => {
        const [picked] = next;
        ondraft({ ...draft, copy: picked === "copy" });
      }
    }
    layout="tiles"
    style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
  >
    <OptionGroupItem value="already">
      <span class="type-label">{words.already}</span>
      <span class="type-meta text-pretty text-ink-muted"
        >{words.alreadyNote}</span
      >
    </OptionGroupItem>
    <OptionGroupItem value="copy">
      <span class="type-label">{words.copy}</span>
      <span class="type-meta text-pretty text-ink-muted">{words.copyNote}</span>
    </OptionGroupItem>
  </OptionGroup>
  {#if draft.copy}
    <p class="m-0 type-meta text-ink-strong text-pretty" in:reveal>
      {words.copyLeaves}
    </p>
  {/if}
  <div class="flex min-w-0 justify-end gap-space-2">
    <Button onclick={oncancel} size="sm" variant="ghost">{words.cancel}</Button>
    <Button
      disabled={!(draft.machineId && draft.folder.trim())}
      onclick={onadd}
      size="sm"
      variant="outline">{words.add}</Button
    >
  </div>
</div>
