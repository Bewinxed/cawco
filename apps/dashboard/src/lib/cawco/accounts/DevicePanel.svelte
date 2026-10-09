<script lang="ts">
  /**
   * A device-code sign-in on one machine (device.svelte.ts). Before: Start
   * sign-in, which mints the one code (the button runs pending meanwhile).
   * Waiting: the code in a well, Copy code, Open sign-in link, and how long
   * is left to enter it. Expired: the well dims and Start again mints a new
   * one. Signed in: a check draws itself beside who it signed in as.
   *
   * The well arrives as a transcript row does: its place opens, then its
   * content fades up 3px into it.
   */
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import Check from "./Check.svelte";
  import type { DeviceFlow } from "./device.svelte";

  let {
    flow,
    machine,
    online,
  }: { flow: DeviceFlow; machine: string; online: boolean } = $props();

  /** The code as it is read out: in fours. */
  const groups = $derived(
    (flow.code ?? "").replace(/[^\da-z]/gi, "").match(/.{1,4}/g) ?? []
  );
  const left = $derived(Math.max(0, flow.expiresAt - flow.now));
  const clock = $derived(
    `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`
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
      <span>Signed in as <b>{flow.email ?? "the account"}</b></span>
    </p>
  {:else}
    {#if shown}
      <div class={["well", flow.phase === "expired" && "dim"]} in:openPlace>
        <span class="sr-only">Code {flow.code}</span>
        <span aria-hidden="true" class="code">
          {#each groups as group, at (at)}
            <span>{group}</span>
          {/each}
        </span>
      </div>
    {/if}
    <div class="row">
      {#if flow.phase === "waiting"}
        <CopyButton size="sm" text={flow.code ?? ""} variant="outline"
          >Copy code</CopyButton
        >
        <Button
          href={flow.url ?? undefined}
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
          label={flow.phase === "idle" || flow.phase === "starting"
            ? "Start sign-in"
            : "Start again"}
          onclick={() => flow.start()}
          pending={flow.phase === "starting"}
          pendingLabel="Starting…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
    {#if flow.phase === "waiting"}
      <p class="line">Enter it within <span class="num">{clock}</span></p>
    {:else if flow.phase === "expired"}
      <p class="line">Code expired.</p>
    {:else if flow.phase === "mismatch"}
      <p class="warn" role="alert">
        <IconWarningTriangle aria-hidden="true" />
        <span
          >{machine}
          signed in as {flow.email ?? "another account"}, so it signed out
          again.</span
        >
      </p>
    {:else if !online && flow.phase === "idle"}
      <p class="line">{machine} is offline.</p>
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
    margin-top: 2px;
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
