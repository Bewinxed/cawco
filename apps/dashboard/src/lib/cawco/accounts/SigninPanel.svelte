<script lang="ts">
  /**
   * The sign-in popover's content: the link to Claude Code's own login on the
   * machine, the field the code it shows is pasted into, and what came of it.
   * A refusal from the hub stands under the field in its own words, the field
   * marked invalid; a refusal that spent the link (no link to paste from)
   * stands under the link instead, the field left as it was. The act
   * that is next is the coral one: the link before there is one, Done
   * after. Signed in, it says as whom, or `got` in its place
   * where the sign-in names nobody (a tool's own: ToolMatrix).
   */
  import { accountsWords } from "@cawco/core/words/accounts";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import Check from "./Check.svelte";
  import type { PasteSignin } from "./signin.svelte";

  let {
    flow,
    machine,
    online,
    expected = null,
    got,
  }: {
    flow: PasteSignin;
    machine: string;
    online: boolean;
    /** The email the account already is, for a sign-in as somebody else. */
    expected?: string | null;
    /** What the signed-in line says, for a sign-in that is no one's account. */
    got?: string;
  } = $props();

  const words = accountsWords.signin;
  const codeId = $props.id();
</script>

<!-- The daemon's sentence, then the CLI's screen lines, each its own line. -->
{#snippet problem(text: string)}
  <p
    data-slot="error"
    class="type-meta flex items-start gap-space-2 text-status-fail-ink whitespace-pre-line wrap-anywhere"
    data-signin-problem
    id="{codeId}-problem"
    role="alert"
    in:appear
  >
    {text}
  </p>
{/snippet}

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
        variant={flow.phase === "idle" || flow.phase === "opening"
          ? undefined
          : "outline"}
      />
    {/if}
    <span class="type-meta text-ink-muted">{words.thenPaste}</span>
  </div>
  {#if flow.problem && flow.url === null}
    <!-- No link to paste a code from: the refusal stands under the way on,
         a new link, and the field stays as it was. -->
    {@render problem(flow.problem)}
  {/if}
  <form
    data-slot="row"
    class="flex min-w-0 items-center gap-space-2"
    onsubmit={(event) => {
      event.preventDefault();
      flow.done();
    }}
  >
    <Input
      aria-describedby={flow.problem && flow.url
        ? `${codeId}-problem`
        : undefined}
      aria-invalid={flow.problem && flow.url ? "true" : undefined}
      aria-label={words.codeLabel}
      autocomplete="off"
      autofocus={flow.url !== null && flow.phase === "ready"}
      class="flex-1"
      disabled={flow.url === null || flow.phase === "signed-in"}
      placeholder={words.codePlaceholder}
      spellcheck="false"
      bind:value={flow.code}
    />
    <Button
      disabled={flow.url === null || flow.code.trim() === ""}
      failed={flow.problem !== null && flow.url !== null}
      label={words.done}
      pending={flow.phase === "checking"}
      pendingLabel={words.checking}
      type="submit"
      variant={flow.url === null ? "outline" : undefined}
    />
  </form>
  {#if flow.problem && flow.url !== null}
    {@render problem(flow.problem)}
  {:else if flow.phase === "signed-in"}
    <p
      data-slot="got"
      class="type-meta flex items-start gap-space-2 text-ink-muted"
      role="status"
    >
      <Check />
      {#if got}
        <span>{got}</span>
      {:else}
        <span
          >{words.signedInAs}
          <b class="font-medium text-ink-strong"
            >{flow.email ?? expected ?? words.theAccount}</b
          ></span
        >
      {/if}
    </p>
  {:else if flow.phase === "mismatch"}
    <p
      data-slot="warn"
      class="mark-line type-meta flex items-start gap-space-2 text-status-attn-ink"
      role="alert"
      in:appear
    >
      <span class="mark-cell"
        ><IconWarningTriangle class="size-icon-md flex-none" /></span
      >
      <span>{words.mismatch(machine, flow.email ?? null, expected)}</span>
    </p>
  {/if}
</div>
