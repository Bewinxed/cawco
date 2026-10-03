<script lang="ts">
  import type { HookEvent, HookMatcherKind } from "@cawco/core";
  import { hookEventInfo, hookMatcherKind, hookMatches } from "@cawco/core";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Input } from "#lib/components/ui/input/index.js";

  /**
   * The part of the editor that tells the truth about a matcher.
   *
   * Claude Code reads a matcher through a three-way branch — empty/`*` matches
   * everything, a plain word or `a|b` list matches exactly, anything else is an
   * unanchored regular expression — and the branch is entirely about which
   * characters appear, never about intent. `Edit.*` really does match
   * `NotebookEdit`, and a reader who typed a dot meaning a literal dot has
   * written a regex without knowing it. This box names which of the three
   * readings the matcher got, then proves it against a sample the reader
   * types, with the same {@link hookMatches} the fleet fires on.
   */
  let {
    event,
    matcher = $bindable(""),
    sample = $bindable(""),
  }: { event: HookEvent; matcher?: string; sample?: string } = $props();

  const info = $derived(hookEventInfo(event));
  const kind = $derived(hookMatcherKind(matcher, event));

  const KIND_LABEL: Record<HookMatcherKind, string> = {
    all: "Matches everything",
    exact: "Exact match",
    regex: "Regular expression",
  };
  const KIND_TONE: Record<HookMatcherKind, string> = {
    all: "border-border text-muted-foreground",
    exact: "border-success text-success",
    regex: "border-warning text-warning",
  };
  const KIND_HOW: Record<HookMatcherKind, string> = {
    all: "An empty matcher or a bare * runs on every value this event carries.",
    exact:
      "Only letters, digits, dashes, underscores and separators appear, so this is read literally — it matches one of the values on either side of a | or ,.",
    regex:
      "A character outside the plain set turns the whole matcher into an unanchored regular expression — it can match part of a value, and a dot matches any character, not just a literal dot.",
  };

  const hit = $derived(
    sample.trim() ? hookMatches(matcher, sample, event) : null
  );
</script>

<div
  class="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-recess)] p-3"
>
  <div class="flex flex-wrap items-center gap-2">
    <Badge class="shrink-0 {KIND_TONE[kind]}" variant="outline"
      >{KIND_LABEL[kind]}</Badge
    >
    <span class="text-meta text-muted-foreground">{KIND_HOW[kind]}</span>
  </div>

  {#if info?.suggests && info.suggests.length > 0}
    <div class="flex flex-wrap items-center gap-1.5" in:unfold out:unfold>
      <span class="text-label text-muted-foreground">Real values:</span>
      {#each info.suggests as suggestion (suggestion)}
        <button
          class="pointer-hit pressable rounded-[var(--radius-sm)] border border-border px-2 py-0.5 font-mono text-label text-foreground transition-colors hover:bg-accent"
          onclick={() => {
            matcher = suggestion;
          }}
          type="button"
        >
          {suggestion}
        </button>
      {/each}
    </div>
  {/if}

  <!-- biome-ignore lint/a11y/noLabelWithoutControl: the `Input` component (shadcn-svelte) renders a native <input> as its only child -->
  <label class="flex flex-col gap-1.5 text-meta text-muted-foreground">
    Try it — {info?.filters ?? 'the value this event carries'}
    <Input
      autocomplete="off"
      class="font-mono text-label md:text-label"
      placeholder={info?.suggests?.[0] ?? 'a sample value'}
      spellcheck="false"
      bind:value={sample}
    />
  </label>

  <!-- The verdict appears with the first sample and its two readings
       cross-fade over --dur-control in one line box. -->
  {#if sample.trim()}
    <p
      aria-live="polite"
      class="verdict text-label"
      role="status"
      in:unfold
      out:unfold
    >
      {#key hit}
        <span
          class={hit ? 'text-success' : 'text-muted-foreground'}
          in:crossIn
          out:crossOut
          >{hit ? 'Matches — this hook would fire.' : 'No match — this hook would stay quiet for this value.'}</span
        >
      {/key}
    </p>
  {/if}
</div>

<style>
  .verdict {
    position: relative;
    display: flex;
    flex-direction: column;
  }
</style>
