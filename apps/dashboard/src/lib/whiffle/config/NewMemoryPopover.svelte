<script lang="ts">
  /**
   * A new memory document, from the section's primary button: its path under
   * ~/.claude/memories/, then the editor. A write to a path the hub has never
   * seen is how a document comes into being.
   */
  import { memoryDocProblem } from "@whiffle/core";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import { IconPlus } from "$lib/icons";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import { type FleetMemoryDocRow, saveMemoryDoc } from "../fleet";
  import Field from "./Field.svelte";
  import { fileHref } from "./memory";

  let {
    taken,
    down,
    onsaved,
  }: {
    taken: string[];
    /** Why the hub cannot take a write, or null: the trigger and the submit
        are disabled on it and say it as their title. */
    down: string | null;
    onsaved: (row: FleetMemoryDocRow) => void;
  } = $props();

  let expanded = $state(false);
  let path = $state("");
  let asked = $state(false);
  let busy = $state(false);
  let failed = $state<string | undefined>(undefined);

  const trimmed = $derived(path.trim());
  const problem = $derived.by(() => {
    if (trimmed === "") {
      return asked
        ? "A document needs a path — models/deepseek-v4.md, say."
        : undefined;
    }
    if (taken.includes(trimmed)) {
      return `“${trimmed}” is already a linked document.`;
    }
    const said = memoryDocProblem(trimmed);
    return said === undefined
      ? undefined
      : `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    asked = true;
    if (trimmed === "" || problem !== undefined || busy) {
      return;
    }
    busy = true;
    failed = undefined;
    try {
      const result = await saveMemoryDoc(trimmed, "");
      if (!result.ok) {
        onsaved(result.latest);
        failed = `${trimmed} was written elsewhere a moment ago. Nothing was overwritten.`;
        return;
      }
      onsaved(result.doc);
      expanded = false;
      await goto(fileHref(result.doc.path));
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      path = '';
      asked = false;
      failed = undefined;
    }
  }}
  bind:open={expanded}
>
  <Popover.Trigger disabled={down !== null}>
    {#snippet child({ props })}
      <Button {...props} disabled={down !== null} title={down ?? undefined}>
        <IconPlus />
        New document
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="w-[360px] max-w-[calc(100vw-2rem)] gap-3 p-3"
  >
    <form class="form" onsubmit={create}>
      <Field id="memory-path" label="Path under ~/.claude/memories/" {problem}>
        {#snippet hint()}
          A <span class="font-mono">models/&lt;model&gt;.md</span> is put in
          front of the session running that model.
        {/snippet}
        <Input
          aria-invalid={problem ? 'true' : undefined}
          autocomplete="off"
          class="font-mono"
          id="memory-path"
          placeholder="models/deepseek-v4.md"
          spellcheck="false"
          bind:value={path}
        />
      </Field>
      {#if failed}
        <p class="problem" role="alert" transition:unfold>{failed}</p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null}
        failed={failed !== undefined}
        label="Create and open"
        pending={busy}
        pendingLabel="Creating…"
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
