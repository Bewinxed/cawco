<script lang="ts">
  /**
   * A device-code sign-in on one machine (device.svelte.ts). Before: Start
   * sign-in, which mints the one code (the button runs pending meanwhile).
   * Waiting: the code in a well, Copy code, Open sign-in link, and how long
   * is left to enter it. Expired: the well dims and Start again mints a new
   * one. Signed in: a check draws itself beside who it signed in as.
   *
   * A row whose sign-in is not made yet has no flow and stands idle: its
   * Start makes it (`start`).
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
    start,
  }: {
    /** The machine's sign-in, once one is made. */
    flow: DeviceFlow | undefined;
    machine: string;
    online: boolean;
    /** Start sign-in (and Start again): mints a code, making the flow first where none is. */
    start: () => void;
  } = $props();

  const words = accountsWords.device;

  /** The code as it is read out: in fours. */
  const phase = $derived(flow?.phase ?? "idle");
  const groups = $derived(
    (flow?.code ?? "").replace(/[^\da-z]/gi, "").match(/.{1,4}/g) ?? []
  );
  const left = $derived(flow ? Math.max(0, flow.expiresAt - flow.now) : 0);
  const clock = $derived(
    words.countdown(
      Math.floor(left / 60_000),
      Math.floor((left % 60_000) / 1000)
    )
  );
  const shown = $derived(phase === "waiting" || phase === "expired");

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
  {#if flow?.phase === "signed-in"}
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
        data-dim={phase === "expired" || undefined}
        class="flex items-center rounded-sm bg-code-bg px-space-4 py-space-3 transition-[opacity] duration-(--dur-fade) ease-out data-dim:opacity-50"
        in:openPlace
      >
        <span class="sr-only">{words.said(flow?.code ?? "")}</span>
        <span
          data-slot="code"
          aria-hidden="true"
          class="type-code liga-none flex select-all gap-space-3 tracking-caps text-ink-strong"
        >
          {#each groups as group, at (at)}
            <span>{group}</span>
          {/each}
        </span>
      </div>
    {/if}
    <div data-slot="row" class="flex flex-wrap items-center gap-space-2">
      {#if flow?.phase === "waiting"}
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
          label={phase === "idle" || phase === "starting"
            ? words.start
            : words.again}
          onclick={start}
          pending={phase === "starting"}
          pendingLabel={words.starting}
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
    {#if phase === "waiting"}
      <p class="type-meta text-ink-muted">
        {words.enterWithin}
        <span data-slot="num" class="num">{clock}</span>
      </p>
    {:else if phase === "expired"}
      <p class="type-meta text-ink-muted">{words.expired}</p>
    {:else if flow?.phase === "mismatch"}
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
    {#if flow?.problem}
      <p class="type-meta text-status-fail-ink" role="alert">{flow.problem}</p>
    {/if}
  {/if}
</div>
