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

<div class="panel">
  {#if !online}
    <p class="line">{words.offline(machine)}</p>
  {/if}
  <div class="row">
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
    <span class="line">{words.thenPaste}</span>
  </div>
  <form
    class="row"
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
      class="h-[30px] flex-1"
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
    <p class="error" id="{codeId}-problem" role="alert" in:appear>
      {flow.problem}
    </p>
  {:else if flow.phase === "signed-in"}
    <p class="got" role="status">
      <Check />
      <span
        >{words.signedInAs}
        <b>{flow.email ?? expected ?? words.theAccount}</b></span
      >
    </p>
  {:else if flow.phase === "mismatch"}
    <p class="warn mark-line" role="alert" in:appear>
      <span class="mark-cell"><IconWarningTriangle /></span>
      <span>{words.mismatch(machine, flow.email, expected)}</span>
    </p>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .error,
  .got,
  .warn {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .error {
    color: var(--status-fail-ink);
  }
  .warn {
    color: var(--status-attn-ink);
  }
  .got b {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .warn :global(svg) {
    flex: none;
    width: 14px;
    height: 14px;
  }
</style>
