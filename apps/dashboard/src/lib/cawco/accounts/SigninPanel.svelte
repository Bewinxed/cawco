<script lang="ts">
  /**
   * The sign-in popover's content: the link to Claude Code's own login on the
   * machine, the field the code it shows is pasted into, and what came of it.
   * A refusal from the hub stands under the field in its own words, the field
   * marked invalid; signed in, it says as whom.
   */
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconArrowUpRight,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { SigninFlow } from "./signin.svelte";

  let {
    flow,
    title,
    machine,
    online,
    expected,
  }: {
    flow: SigninFlow;
    /** "Sign in you@gmail.com on gauntlet". */
    title: string;
    machine: string;
    online: boolean;
    /** The email the account already is, for a sign-in as somebody else. */
    expected: string | null;
  } = $props();

  const codeId = $props.id();
</script>

<div class="panel">
  <p class="title">{title}</p>
  {#if !online}
    <p class="line">{machine} is offline. Sign in there once it's back.</p>
  {/if}
  <div class="row">
    {#if flow.url}
      <Button
        href={flow.url}
        icon={IconArrowUpRight}
        label="Open sign-in link"
        rel="noopener noreferrer"
        size="sm"
        target="_blank"
        variant="outline"
      />
    {:else}
      <Button
        disabled={!online}
        icon={IconArrowUpRight}
        label="Open sign-in link"
        onclick={() => flow.open()}
        pending={flow.phase === "opening"}
        pendingLabel="Opening…"
        size="sm"
        variant="outline"
      />
    {/if}
    <span class="line">then paste the code</span>
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
      aria-label="Code from the sign-in page"
      autocomplete="off"
      class="h-[30px] flex-1"
      disabled={flow.url === null || flow.phase === "signed-in"}
      placeholder="Code"
      spellcheck="false"
      bind:value={flow.code}
    />
    <Button
      disabled={flow.url === null || flow.code.trim() === ""}
      failed={flow.problem !== null}
      label="Done"
      pending={flow.phase === "checking"}
      pendingLabel="Checking…"
      size="sm"
      type="submit"
    />
  </form>
  {#if flow.problem}
    <p class="error" id="{codeId}-problem" role="alert" in:appear>
      {flow.problem}
    </p>
  {:else if flow.phase === "signed-in"}
    <p class="got" role="status" in:appear>
      <IconSuccess />
      <span>Signed in as <b>{flow.email ?? expected ?? "the account"}</b></span>
    </p>
  {:else if flow.phase === "mismatch"}
    <p class="warn" role="alert" in:appear>
      <IconWarningTriangle />
      <span>
        {machine}
        signed in as {flow.email ?? "another account"}, so it signed out again.
        Sign in as {expected ?? "this account"} with a new link.
      </span>
    </p>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
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
  .got :global(svg),
  .warn :global(svg) {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 1px;
  }
  .got :global(svg) {
    color: var(--status-done-glyph);
  }
</style>
