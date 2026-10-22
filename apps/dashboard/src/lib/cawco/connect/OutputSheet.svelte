<script lang="ts">
  /**
   * An install's whole output: the one surface of Add machine that scrolls.
   * On the desk the house sheet from the right, 480 wide; on a phone a
   * full-height drawer. Its head is the install's title, the step it is on
   * now (or how it ended), Stop install while it runs, and Close. Add
   * machine's window parks into its row as the sheet opens. It follows the
   * output as it grows while it runs, unless the reader has scrolled up.
   */
  import type { Install } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose } from "#lib/icons.js";
  import { failureWords } from "../hub-read";
  import { connect, phone } from "./installs.svelte";
  import { currentRow } from "./steps";
  import { causeLine, titleOf } from "./words";

  let { install }: { install: Install } = $props();

  let lines = $state<string[]>([]);
  let failed = $state("");
  let scroller = $state<HTMLElement | null>(null);
  let stopping = $state(false);
  let open = $state(false);

  const step = $derived(
    install.state === "running"
      ? (currentRow(install)?.words ?? "Starting")
      : causeLine(install)
  );

  async function read() {
    try {
      const atFoot = scroller
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8
        : true;
      lines = await connect.outputOf(install.id);
      failed = "";
      if (atFoot && scroller) {
        requestAnimationFrame(() => {
          scroller?.scrollTo({ top: scroller.scrollHeight });
        });
      }
    } catch (error) {
      failed = failureWords(error);
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the sheet draws the lines when they land
    void read();
    requestAnimationFrame(() => {
      open = true;
    });
    if (install.state !== "running") {
      return;
    }
    const again = setInterval(() => {
      read().catch(() => undefined);
    }, 1000);
    return () => clearInterval(again);
  });

  async function stop() {
    stopping = true;
    try {
      await connect.stop(install.id);
    } catch (error) {
      failed = failureWords(error);
    } finally {
      stopping = false;
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      connect.output = false;
    }
  }}
/>

<div
  role="dialog"
  aria-modal="false"
  data-connect-output
  tabindex="-1"
  data-state={open ? "open" : "closed"}
  aria-label="Output of {titleOf(install)}"
  class={[
    "fixed z-(--layer-float) flex flex-col bg-surface-raised shadow-drawer transition-[translate,opacity] duration-(--dur-panel) ease-drawer",
    phone.current
      ? "inset-0 data-[state=closed]:translate-y-full"
      : "inset-y-0 end-0 w-c-connect-w border-s border-s-border-hairline data-[state=closed]:translate-x-full",
    "motion-reduce:translate-none motion-reduce:data-[state=closed]:opacity-0",
  ]}
>
  <header
    class="mark-line flex flex-none items-center gap-space-2 border-b border-b-border-hairline ps-space-5 pe-space-3 py-space-3"
  >
    <div class="flex min-w-0 flex-1 flex-col" data-box>
      <h2
        class="m-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
      >
        {titleOf(install)}
      </h2>
      <p
        class="m-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
        aria-live="polite"
      >
        {step}
      </p>
    </div>
    {#if install.state === "running"}
      <Button
        data-box
        label="Stop install"
        onclick={stop}
        pending={stopping}
        pendingLabel="Stopping…"
        size="sm"
        variant="destructive"
      />
    {/if}
    <button
      type="button"
      aria-label="Close output"
      title="Close output"
      class="pressable touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
      onclick={() => {
        connect.output = false;
      }}
    >
      <IconClose aria-hidden="true" class="size-icon-md" />
    </button>
  </header>
  <div
    bind:this={scroller}
    class="kit-edge-fade-block min-h-0 flex-1 overflow-y-auto bg-code-bg px-space-5 py-space-3"
  >
    {#if failed}
      <p class="m-0 type-meta text-status-fail-ink">
        The output couldn't be read. {failed}
      </p>
    {/if}
    <pre
      class="m-0 font-mono type-code whitespace-pre-wrap break-word text-ink-strong">{lines.join(
        "\n"
      )}</pre>
  </div>
</div>
