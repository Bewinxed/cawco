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
  import { accountsWords } from "@cawco/core";
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

  const words = accountsWords.device;

  /** The code as it is read out: in fours. */
  const groups = $derived(
    (flow.code ?? "").replace(/[^\da-z]/gi, "").match(/.{1,4}/g) ?? []
  );
  const left = $derived(Math.max(0, flow.expiresAt - flow.now));
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

<div class="flex min-w-0 flex-col gap-space-2">
  {#if flow.phase === "signed-in"}
    <p
      class="type-meta flex items-center gap-space-2 text-ink-row"
      role="status"
    >
      <Check />
      <span
        >{accountsWords.signin.signedInAs}
        <b class="font-medium text-ink-strong"
          >{flow.email ?? accountsWords.signin.theAccount}</b
        ></span
      >
    </p>
  {:else}
    {#if shown}
      <div
        data-slot="well"
        data-dim={flow.phase === "expired" || undefined}
        class="flex items-center rounded-sm bg-code-bg px-space-4 py-space-3 transition-[opacity] dur-fade ease-out data-dim:opacity-50"
        in:openPlace
      >
        <span class="sr-only">{words.said(flow.code ?? "")}</span>
        <!-- literal: 0.08em -->
        <span
          data-slot="code"
          aria-hidden="true"
          class="type-code liga-none flex select-all gap-space-3 tracking-(--code-track) text-ink-strong"
          style:--code-track="0.08em"
        >
          {#each groups as group, at (at)}
            <span>{group}</span>
          {/each}
        </span>
      </div>
    {/if}
    <div data-slot="row" class="flex flex-wrap items-center gap-space-2">
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
    {#if flow.phase === "waiting"}
      <p class="type-meta text-ink-muted">
        {words.enterWithin}
        <span data-slot="num" class="num">{clock}</span>
      </p>
    {:else if flow.phase === "expired"}
      <p class="type-meta text-ink-muted">{words.expired}</p>
    {:else if flow.phase === "mismatch"}
      <p
        class="mark-line type-meta flex items-start gap-space-1 text-status-attn-ink"
        role="alert"
      >
        <span class="mark-cell"
          ><IconWarningTriangle
            aria-hidden="true"
            class="size-icon-sm flex-none"
          /></span
        >
        <span>{words.mismatch(machine, flow.email)}</span>
      </p>
    {/if}
    {#if flow.problem}
      <p class="type-meta text-status-fail-ink" role="alert">{flow.problem}</p>
    {/if}
  {/if}
</div>
