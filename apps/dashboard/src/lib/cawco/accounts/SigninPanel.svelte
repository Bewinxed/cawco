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
   *
   * A refusal that quotes the CLI's screen sets its sentence, then the
   * screen's lines in the code face, muted (`quotedScreen`). Focus follows
   * the act that is next, once the surface has placed its own: the code
   * field while a link waits for it (on the press's return from the new
   * tab, or reopened with Paste code), the link after a refusal spent it,
   * and the outcome once signed in, never the page's body.
   */
  import { accountsWords } from "@cawco/core/words/accounts";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { quotedScreen } from "../signin-screen";
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

  let panel = $state<HTMLElement | null>(null);
  let link = $state<HTMLElement | null>(null);
  let field = $state<HTMLInputElement | null>(null);
  let outcome = $state<HTMLElement | null>(null);
  /** The control of the act that is next, where it is not the surface's first. */
  const next = $derived.by(() => {
    if (flow.phase === "signed-in") {
      return outcome;
    }
    if (flow.url !== null && flow.phase === "ready") {
      return field;
    }
    return flow.phase === "idle" && flow.problem !== null ? link : null;
  });
  $effect(() => {
    const target = next;
    if (!target) {
      return;
    }
    // Two frames: after the surface's own first focus (bits-ui's, a frame
    // after it opens). Focus elsewhere on the page is the person's; it stays.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const at = document.activeElement;
        if (!at || at === document.body || panel?.contains(at)) {
          target.focus({ preventScroll: true });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<!-- The daemon's sentence, then the CLI's screen lines, each its own line,
     muted in the code face as the Unknown popover sets them. -->
{#snippet problem(text: string)}
  {@const { sentence, lines } = quotedScreen(text)}
  <div
    data-slot="error"
    class="flex flex-col gap-space-1"
    data-signin-problem
    id="{codeId}-problem"
    role="alert"
    in:appear
  >
    <p class="type-meta text-pretty wrap-anywhere text-status-fail-ink">
      {sentence}
    </p>
    {#if lines}
      <pre
        class="type-code whitespace-pre-wrap wrap-anywhere text-ink-muted">{lines}</pre>
    {/if}
  </div>
{/snippet}

<div data-slot="panel" class="flex flex-col gap-space-3" bind:this={panel}>
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
        failed={flow.problem !== null}
        icon={IconArrowUpRight}
        label={words.openLink}
        onclick={() => flow.open()}
        pending={flow.phase === "opening"}
        bind:ref={link}
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
      class="flex-1"
      disabled={flow.url === null || flow.phase === "signed-in"}
      placeholder={words.codePlaceholder}
      spellcheck="false"
      bind:ref={field}
      bind:value={flow.code}
    />
    <Button
      disabled={flow.url === null || flow.code.trim() === ""}
      failed={flow.problem !== null}
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
      class="type-meta flex items-start gap-space-2 self-start rounded-xs text-ink-muted focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
      role="status"
      tabindex="-1"
      bind:this={outcome}
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
