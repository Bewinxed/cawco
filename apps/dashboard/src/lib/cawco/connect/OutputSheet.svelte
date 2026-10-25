<script lang="ts">
  /**
   * An install's whole output: the one surface of Add machine that scrolls.
   * On the desk the house sheet from the right, 480 wide; on a phone a
   * full-height drawer. Its head is the install's title, the step it is on
   * now (or how it ended), Stop install while it runs, and Close. Add
   * machine's window parks into its row as the sheet opens. It follows the
   * output as it grows while it runs, unless the reader has scrolled up.
   *
   * Stop asks first, as the window's does: the question stands under the
   * head with what stopping now leaves on the machine. Focus moves into the
   * sheet as it opens. Closed (Close, Esc), it is back-navigation: the
   * window it was opened from comes back where it was, focus on its Open
   * output (installs.svelte.ts `closeOutput`); with no window to come back
   * to, focus goes to where the install is parked (`parkedAt`).
   */
  import { causeLine, connectWords, type Install } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { failureWords } from "../hub-read";
  import { connect, parkedAt, phone } from "./installs.svelte";
  import { currentRow } from "./steps";
  import { stopQuestion, titleOf } from "./words";

  let { install }: { install: Install } = $props();

  let lines = $state<string[]>([]);
  let failed = $state("");
  let scroller = $state<HTMLElement | null>(null);
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

  const asks = new Asker<AskHereRequest>();
  function askStop() {
    asks.ask({
      at: "stop-output",
      ...stopQuestion(install),
      cancelLabel: "Cancel",
      confirmLabel: connectWords.stopInstall,
      pendingLabel: "Stopping…",
      destructive: true,
      run: () => connect.stop(install.id),
    });
  }

  /** In hand as it opens; given back where the window parked as it goes. */
  function focusing(node: HTMLElement) {
    node.focus({ preventScroll: true });
    return () => {
      // The window coming back takes focus itself (its Open output); else
      // only when focus was still the sheet's: a press elsewhere keeps its own.
      const active = document.activeElement;
      if (
        !connect.open &&
        (!active || active === document.body || node.contains(active))
      ) {
        parkedAt(install.id)?.focus({ preventScroll: true });
      }
    };
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      connect.closeOutput();
    }
  }}
/>

<div
  role="dialog"
  aria-modal="false"
  data-connect-output
  tabindex="-1"
  {@attach focusing}
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
        label={connectWords.stopInstall}
        onclick={askStop}
        size="sm"
        variant="destructive"
      />
    {/if}
    <button
      data-box
      type="button"
      aria-label={connectWords.closeOutput}
      title={connectWords.closeOutput}
      class="pressable touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
      onclick={() => connect.closeOutput()}
    >
      <IconClose aria-hidden="true" class="size-icon-md" />
    </button>
  </header>
  <AskHere
    asker={asks}
    at="stop-output"
    class="flex-none border-b border-b-border-hairline py-space-3"
    end="var(--space-5)"
    indent="var(--space-5)"
  />
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
