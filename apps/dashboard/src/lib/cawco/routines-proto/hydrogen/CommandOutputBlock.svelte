<script lang="ts">
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { IconTerminal } from "#lib/icons.js";

  interface Props {
    ariaLabel: string;
    caption?: string;
    code: string;
    heading?: string;
    preformatted?: boolean;
  }

  let {
    ariaLabel,
    caption,
    code,
    heading,
    preformatted = false,
  }: Props = $props();
</script>

<div class="flex flex-col gap-space-1">
  {#if heading}
    <div class="flex items-center justify-between gap-space-2">
      <span
        class="mark-line inline-flex items-center gap-space-2 type-label text-ink-strong"
      >
        <IconTerminal class="size-icon-sm flex-none text-ink-muted" />
        <span>{heading}</span>
      </span>
      <CopyButton aria-label={ariaLabel} size="xs" text={code} variant="ghost">
        Copy
      </CopyButton>
    </div>
  {/if}

  {#if preformatted}
    <pre
      class="m-0 overflow-x-auto rounded-well border border-border-well bg-code-bg p-space-3 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere">{code}</pre>
  {:else}
    <div
      class="flex items-start gap-space-2 rounded-sm border border-border-hairline bg-code-bg py-space-2 ps-space-3 pe-space-2"
    >
      <code
        class="min-w-0 flex-1 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere"
      >
        {code}
      </code>
      {#if !heading}
        <CopyButton
          aria-label={ariaLabel}
          class="flex-none"
          size="icon-xs"
          text={code}
          variant="ghost"
        />
      {/if}
    </div>
  {/if}

  {#if caption}
    <span
      class="mark-line inline-flex items-center gap-space-1 type-meta text-ink-muted"
    >
      <IconTerminal class="size-icon-sm flex-none" />
      <span>{caption}</span>
    </span>
  {/if}
</div>
