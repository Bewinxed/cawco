<!--
  The agent's page in the well: a "New routine" form, drawn with the kit.
  Each element a comment can stand on is an anchor (`data-anchor`) that holds
  its pins (`pin(name)`). In Comment mode the element under the pointer is
  `outlined`: 2px brand outline 2px out, its words in a name tag on the
  outline's top-left (comment-design §2), or on the first other corner with
  room where something drawn holds that one (place-tag.ts); the page's root
  is outlined dashed `--space-1` inside the well, tagged "Whole page" on the
  outline's corner, clear of the page's first line. `errorLine` draws the
  form's save error under Prompt.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import { chipVariants } from "$kit/components/ui/chip/index.js";
  import { Input } from "$kit/components/ui/input/index.js";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import { IconChevronDown } from "$kit/icons.js";
  import { placeTag } from "./place-tag";

  let {
    outlined = null,
    errorLine = true,
    pin,
  }: {
    outlined?: string | null;
    errorLine?: boolean;
    pin?: Snippet<[string]>;
  } = $props();

  const TAGS: Record<string, string> = {
    heading: "New routine",
    name: "Name",
    schedule: "Schedule",
    prompt: "Prompt",
    error: "Couldn’t save: the schedule is in the past.",
    save: "Save",
  };
</script>

{#snippet tag(name: string)}
  {#if outlined === name}
    <span
      class="absolute z-10 max-w-[32ch] truncate rounded-xs bg-ink-solid px-space-1 py-0.5 type-caps text-on-ink"
      data-tag
      {@attach placeTag}>{TAGS[name]}</span
    >
  {/if}
{/snippet}

{#snippet anchor(name: string, body: Snippet, extra = "")}
  <div
    class={[
      "relative",
      extra,
      outlined === name && "outline-2 outline-offset-2 outline-brand-solid",
    ]}
    data-anchor={name}
  >
    {@render body()}
    {@render tag(name)}
    {@render pin?.(name)}
  </div>
{/snippet}

<div class="relative flex h-full flex-col gap-space-4 p-space-6" data-anchor="page">
  {#if outlined === "page"}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-space-1 z-10 border-2 border-dashed border-brand-solid"
    ></span>
    <span
      class="absolute start-(--space-row) top-(--space-row) z-10 rounded-xs bg-ink-solid px-space-1 py-0.5 type-caps text-on-ink"
      data-tag>Whole page</span
    >
  {/if}
  {@render pin?.("page")}
  {#snippet heading()}<h1 class="type-title text-ink-strong">New routine</h1>{/snippet}
  {@render anchor("heading", heading, "self-start")}
  {#snippet nameField()}
    <label class="flex flex-col gap-space-1">
      <span class="type-label text-ink-strong">Name</span>
      <Input value="Nightly dependency check" />
    </label>
  {/snippet}
  {@render anchor("name", nameField)}
  {#snippet schedule()}
    <div class="flex flex-col gap-space-1">
      <span class="type-label text-ink-strong">Schedule</span>
      <span class={[chipVariants({ variant: "setting" }), "self-start"]}
        ><span data-slot="chip-label">Every day at 09:00</span><IconChevronDown
          data-slot="chevron"
        /></span
      >
    </div>
  {/snippet}
  {@render anchor("schedule", schedule, "self-start")}
  {#snippet prompt()}
    <label class="flex flex-col gap-space-1">
      <span class="type-label text-ink-strong">Prompt</span>
      <Textarea
        rows={2}
        value="Check every package for updates and open one pull request with the safe ones."
      />
    </label>
  {/snippet}
  {@render anchor("prompt", prompt)}
  {#snippet errorText()}<p class="type-meta text-data-bad">{TAGS.error}</p>{/snippet}
  {#if errorLine}{@render anchor("error", errorText, "self-start")}{/if}
  <div class="flex justify-end gap-space-2">
    <Button size="sm" variant="ghost">Cancel</Button>
    {#snippet save()}<Button size="sm">Save</Button>{/snippet}
    {@render anchor("save", save)}
  </div>
</div>
