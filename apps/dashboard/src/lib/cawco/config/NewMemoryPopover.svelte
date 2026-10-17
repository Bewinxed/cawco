<script lang="ts">
  /**
   * A new memory document, from the section's primary button: its path under
   * ~/.claude/memories/, then the editor. A write to a path the hub has never
   * seen is how a document comes into being.
   */
  import { memoryDocProblem, userLayerLabel } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { goto } from "$app/navigation";
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
      failed = failureWords(error);
    } finally {
      busy = false;
    }
  }
</script>

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      path = "";
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
        <span>New document</span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="w-(--pop-w) max-w-(--pop-max) gap-3 p-3"
    style="--pop-w: 360px; --pop-max: calc(100vw - 2rem)"
  >
    <!-- literal: 12px -->
    <form
      class="flex flex-col gap-(--form-gap)"
      onsubmit={create}
      style:--form-gap="12px"
    >
      <Field
        id="memory-path"
        label="Path under {userLayerLabel('memories')}/"
        {problem}
      >
        {#snippet hint()}
          A <span class="font-mono">models/&lt;model&gt;.md</span> is put in front
          of the session running that model.
        {/snippet}
        <Input
          aria-invalid={problem ? "true" : undefined}
          autocomplete="off"
          class="font-mono"
          id="memory-path"
          placeholder="models/deepseek-v4.md"
          spellcheck="false"
          bind:value={path}
        />
      </Field>
      {#if failed}
        <p class="type-meta text-status-fail-ink" role="alert" transition:unfold>{failed}</p>
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

