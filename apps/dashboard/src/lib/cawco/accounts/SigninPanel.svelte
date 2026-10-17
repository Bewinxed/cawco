<script lang="ts">
  /**
   * The sign-in popover's content: the link to Claude Code's own login on the
   * machine, the field the code it shows is pasted into, and what came of it.
   * A refusal from the hub stands under the field in its own words, the field
   * marked invalid; signed in, it says as whom.
   */
  import { accountsWords } from "@cawco/core";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import Check from "./Check.svelte";
  import type { SigninFlow } from "./signin.svelte";

  let {
    flow,
    machine,
    online,
    expected,
  }: {
    flow: SigninFlow;
    machine: string;
    online: boolean;
    /** The email the account already is, for a sign-in as somebody else. */
    expected: string | null;
  } = $props();

  const words = accountsWords.signin;
  const codeId = $props.id();
</script>

<div data-slot="panel" class="flex flex-col gap-space-3">
  {#if !online}
    <p class="type-meta text-ink-muted">{words.offline(machine)}</p>
  {/if}
  <div data-slot="row" class="flex min-w-0 items-center gap-space-2">
    {#if flow.url}
      <Button
        href={flow.url}
        icon={IconArrowUpRight}
        label={words.openLink}
        rel="noopener noreferrer"
        size="sm"
        target="_blank"
        variant="outline"
      />
    {:else}
      <Button
        disabled={!online}
        icon={IconArrowUpRight}
        label={words.openLink}
        onclick={() => flow.open()}
        pending={flow.phase === "opening"}
        pendingLabel={words.opening}
        size="sm"
        variant="outline"
      />
    {/if}
    <span class="type-meta text-ink-muted">{words.thenPaste}</span>
  </div>
  <form
    data-slot="row"
    class="flex min-w-0 items-center gap-space-2"
    onsubmit={(event) => {
      event.preventDefault();
      flow.done();
    }}
  >
    <Input
      aria-describedby={flow.problem ? `${codeId}-problem` : undefined}
      aria-invalid={flow.problem ? "true" : undefined}
      aria-label={words.codeLabel}
      autocomplete="off"
      class="h-c-btn-h-sm flex-1"
      disabled={flow.url === null || flow.phase === "signed-in"}
      placeholder={words.codePlaceholder}
      spellcheck="false"
      bind:value={flow.code}
    />
    <Button
      disabled={flow.url === null || flow.code.trim() === ""}
      failed={flow.problem !== null}
      label={words.done}
      pending={flow.phase === "checking"}
      pendingLabel={words.checking}
      size="sm"
      type="submit"
    />
  </form>
  {#if flow.problem}
    <p
      data-slot="error"
      class="type-meta flex items-start gap-space-2 text-status-fail-ink"
      id="{codeId}-problem" role="alert" in:appear>
      {flow.problem}
    </p>
  {:else if flow.phase === "signed-in"}
    <p
      data-slot="got"
      class="type-meta flex items-start gap-space-2 text-ink-muted"
      role="status"
    >
      <Check />
      <span
        >{words.signedInAs}
        <b class="font-medium text-ink-strong">{flow.email ?? expected ?? words.theAccount}</b></span
      >
    </p>
  {:else if flow.phase === "mismatch"}
    <p
      data-slot="warn"
      class="mark-line type-meta flex items-start gap-space-2 text-status-attn-ink"
      role="alert"
      in:appear
    >
      <!-- literal: 14px -->
      <span class="mark-cell" style:--warn-icon="14px"
        ><IconWarningTriangle class="size-(--warn-icon) flex-none" /></span
      >
      <span>{words.mismatch(machine, flow.email, expected)}</span>
    </p>
  {/if}
</div>
