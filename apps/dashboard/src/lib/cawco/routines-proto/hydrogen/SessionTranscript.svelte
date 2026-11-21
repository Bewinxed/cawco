<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconExternalLinear, IconTerminal } from "#lib/icons.js";
  import type { RunTranscript, TranscriptStep } from "./routines-data";

  const STEP_STYLE: Record<
    TranscriptStep["kind"],
    { body: string; frame: string; label: string }
  > = {
    prompt: {
      body: "type-body text-ink-strong",
      frame: "border border-border-hairline bg-surface-recess",
      label: "font-medium text-ink-muted",
    },
    reply: {
      body: "type-body text-ink-strong",
      frame: "border border-border-hairline bg-surface-raised",
      label: "font-medium text-ink-muted",
    },
    tool: {
      body: "font-mono type-code text-ink-muted",
      frame: "border border-border-well bg-code-bg",
      label: "font-mono text-ink-strong",
    },
  };

  let {
    session,
  }: {
    session: RunTranscript;
  } = $props();

  const details = $derived(
    `${session.harness} · ${session.model} · ${session.id} · ${session.place}`
  );
</script>

<div class="flex flex-col gap-space-3" data-slot="run-session">
  <div class="flex flex-wrap items-center justify-between gap-space-2">
    <span class="type-label text-ink-strong">{session.title}</span>
    <div class="flex flex-none items-center gap-space-1">
      <CopyButton
        aria-label="Copy session details"
        size="xs"
        text={details}
        variant="ghost"
      >
        Copy id
      </CopyButton>
      <Tip label={details}>
        {#snippet children(tip)}
          <Button
            {...tip}
            href="#session-{session.id}"
            icon={IconExternalLinear}
            label="Open session"
            onclick={(event: MouseEvent) => {
              event.preventDefault();
            }}
            size="xs"
            variant="outline"
          />
        {/snippet}
      </Tip>
    </div>
  </div>

  <ol class="m-0 flex list-none flex-col gap-space-3 p-0">
    {#each session.entries as entry (entry.id)}
      {@const tone = STEP_STYLE[entry.kind]}
      <li
        class={["flex flex-col gap-space-1 rounded-well p-space-3", tone.frame]}
      >
        <header class="flex items-center justify-between gap-space-2">
          <span
            class={[
              "mark-line inline-flex min-w-0 items-center gap-space-2 type-meta",
              tone.label,
            ]}
          >
            {#if entry.kind === "tool"}
              <IconTerminal class="size-icon-sm flex-none text-ink-muted" />
            {/if}
            <span class="min-w-0 wrap-anywhere">{entry.label}</span>
          </span>
          <time
            class="flex-none font-mono type-meta text-ink-subtle tabular-nums"
          >
            +{entry.timeOffset}
          </time>
        </header>
        <p class={["m-0 whitespace-pre-wrap wrap-anywhere", tone.body]}>
          {entry.text}
        </p>
      </li>
    {/each}
  </ol>
</div>
