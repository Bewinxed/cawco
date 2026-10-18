<script lang="ts">
  /**
   * A provider sign-in on one machine (device.svelte.ts). Before: Start
   * sign-in (the button runs pending meanwhile). Asking: the provider's own
   * question, its options as buttons or a field and Continue. Waiting: the
   * code in a well, Copy code, Open sign-in link, and how long is left to
   * enter it (when the provider said). Linked: Open sign-in link, a field
   * for what the page ends on, and Done. Expired: the well dims and Start
   * again starts a new one. Signed in: a check draws itself beside who it
   * signed in as.
   *
   * The well arrives as a transcript row does: its place opens, then its
   * content fades up 3px into it.
   */
  import { accountsWords } from "@cawco/core";
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import Check from "./Check.svelte";
  import type { DeviceFlow } from "./device.svelte";

  let {
    flow,
    machine,
    online,
  }: { flow: DeviceFlow; machine: string; online: boolean } = $props();

  const words = accountsWords.device;

  /** What the person typed for a question, or pasted from a link's page. */
  let typed = $state("");
  const asking = $derived(
    flow.phase === "asking" || flow.phase === "answering"
  );
  const linked = $derived(flow.phase === "linked" || flow.phase === "checking");

  /** Sends what was typed; the field starts empty for the next step. */
  function answer(): void {
    const value = typed.trim();
    typed = "";
    flow.answer(value);
  }
  function paste(): void {
    const value = typed;
    typed = "";
    flow.paste(value);
  }

  /** The code as it is read out: in fours. */
  const groups = $derived(
    (flow.code ?? "").replace(/[^\da-z]/gi, "").match(/.{1,4}/g) ?? []
  );
  const left = $derived(Math.max(0, (flow.expiresAt ?? 0) - flow.now));
  const clock = $derived(
    words.countdown(
      Math.floor(left / 60_000),
      Math.floor((left % 60_000) / 1000)
    )
  );
  const shown = $derived(flow.phase === "waiting" || flow.phase === "expired");

  /** Its place opens (--dur-morph), then what it holds fades up 3px (--dur-menu). */
  function openPlace(node: HTMLElement): TransitionConfig {
    if (!motionOk.current) {
      return {
        duration: dur("--dur-menu"),
        easing: easeOut,
        css: (t) => `opacity: ${t}`,
      };
    }
    const height = node.offsetHeight;
    const open = dur("--dur-morph");
    const rise = dur("--dur-menu");
    const total = open + rise;
    const split = open / total;
    return {
      duration: total,
      css: (t) => {
        if (t < split) {
          const p = easeOut(t / split);
          return `height: ${p * height}px; overflow: hidden; opacity: 0`;
        }
        const p = easeOut((t - split) / (1 - split));
        return `opacity: ${p}; transform: translateY(${(1 - p) * 3}px)`;
      },
    };
  }
</script>

<div class="device">
  {#if flow.phase === "signed-in"}
    <p class="got" role="status">
      <Check />
      <span
        >{accountsWords.signin.signedInAs}
        <b>{flow.email ?? accountsWords.signin.theAccount}</b></span
      >
    </p>
  {:else if asking && flow.prompt}
    <p class="line">{flow.prompt.message}</p>
    <div data-slot="row" class="row">
      {#if flow.prompt.kind === "select"}
        {#each flow.prompt.options as option (option.id)}
          <Button
            disabled={flow.phase === "answering"}
            label={option.label}
            onclick={() => flow.answer(option.id)}
            size="sm"
            title={option.description}
            variant="outline"
          />
        {/each}
      {:else}
        <Input
          aria-label={flow.prompt.message}
          autocomplete="off"
          class="h-[30px]"
          disabled={flow.phase === "answering"}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              answer();
            }
          }}
          placeholder={flow.prompt.placeholder}
          spellcheck="false"
          type={flow.prompt.secret ? "password" : "text"}
          bind:value={typed}
        />
        <Button
          label={words.answer}
          onclick={answer}
          pending={flow.phase === "answering"}
          pendingLabel={words.answering}
          size="sm"
        />
      {/if}
    </div>
  {:else if linked}
    <div data-slot="row" class="row">
      <Button
        href={flow.url ?? undefined}
        icon={IconArrowUpRight}
        label={accountsWords.signin.openLink}
        rel="noopener noreferrer"
        size="sm"
        target="_blank"
        variant="outline"
      />
      <Input
        aria-label={accountsWords.signin.codeLabel}
        autocomplete="off"
        class="h-[30px]"
        disabled={flow.phase === "checking"}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            paste();
          }
        }}
        placeholder={accountsWords.signin.codePlaceholder}
        spellcheck="false"
        bind:value={typed}
      />
      <Button
        disabled={typed.trim() === "" && flow.phase !== "checking"}
        label={accountsWords.signin.done}
        onclick={paste}
        pending={flow.phase === "checking"}
        pendingLabel={accountsWords.signin.checking}
        size="sm"
      />
    </div>
    <p class="line">{words.linked}</p>
  {:else}
    {#if shown}
      <div
        data-slot="well"
        class={["well", flow.phase === "expired" && "dim"]}
        in:openPlace
      >
        <span class="sr-only">{words.said(flow.code ?? "")}</span>
        <span data-slot="code" aria-hidden="true" class="code">
          {#each groups as group, at (at)}
            <span>{group}</span>
          {/each}
        </span>
      </div>
    {/if}
    <div data-slot="row" class="row">
      {#if flow.phase === "waiting"}
        <CopyButton size="sm" text={flow.code ?? ""} variant="outline"
          >{words.copy}</CopyButton
        >
        <Button
          href={flow.url ?? undefined}
          icon={IconArrowUpRight}
          label={accountsWords.signin.openLink}
          rel="noopener noreferrer"
          size="sm"
          target="_blank"
          variant="outline"
        />
      {:else if online}
        <Button
          label={flow.phase === "idle" || flow.phase === "starting"
            ? words.start
            : words.again}
          onclick={() => flow.start()}
          pending={flow.phase === "starting"}
          pendingLabel={words.starting}
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
    {#if flow.phase === "waiting" && flow.expiresAt !== null}
      <p class="line">
        {words.enterWithin}
        <span data-slot="num" class="num">{clock}</span>
      </p>
    {:else if flow.phase === "expired"}
      <p class="line">{words.expired}</p>
    {:else if flow.phase === "mismatch"}
      <p class="warn mark-line" role="alert">
        <span class="mark-cell"><IconWarningTriangle aria-hidden="true" /></span
        >
        <span>{words.mismatch(machine, flow.email)}</span>
      </p>
    {/if}
    {#if flow.problem}
      <p class="error" role="alert">{flow.problem}</p>
    {/if}
  {/if}
</div>

<style>
  .device {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .well {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--code-bg);
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .well.dim {
    opacity: 0.5;
  }
  .code {
    display: flex;
    gap: var(--space-3);
    font: var(--type-code);
    font-variant-ligatures: none;
    letter-spacing: 0.08em;
    color: var(--ink-strong);
    user-select: all;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .line,
  .error,
  .warn,
  .got {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .error {
    color: var(--status-fail-ink);
  }
  .warn {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    color: var(--status-attn-ink);
  }
  .warn :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
  }
  .got {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-row);
  }
  .got b {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
</style>
