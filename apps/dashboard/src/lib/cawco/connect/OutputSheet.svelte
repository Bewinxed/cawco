<script lang="ts">
  import { detach } from "@cawco/core/detach";
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
  import type { Install } from "@cawco/core/install";
  import { connectWords } from "@cawco/core/words/connect";
  import { causeLine } from "@cawco/core/words/install";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconClose, IconStopLinear } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { connect, parkedAt, phone } from "./installs.svelte";
  import { currentRow } from "./steps";
  import { stopQuestion, titleOf } from "./words";

  let { install }: { install: Install } = $props();

  let lines = $state<string[]>([]);
  let failed = $state("");
  let scroller = $state<HTMLElement | null>(null);
  /** The floating stack's height over the output, px (the bar, the step, a question asked from it): the output's top padding. */
  let headHeight = $state(0);
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
    detach(read(), "read");
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
  style:--output-head="{headHeight}px"
  class={[
    "fixed z-(--layer-float) flex flex-col bg-surface-raised shadow-drawer timeline-scope-transcript-head transition-[translate,opacity] duration-(--dur-panel) ease-drawer",
    phone.current
      ? "inset-0 data-[state=closed]:translate-y-full"
      : "inset-y-0 end-0 w-c-connect-w border-s border-s-border-hairline data-[state=closed]:translate-x-full",
    "motion-reduce:translate-none motion-reduce:data-[state=closed]:opacity-0",
  ]}
>
  <!-- The bar, the step it stands at and a question asked from the bar
     float over the output as one stack: the output runs to the sheet's top
     beneath it, clearing it at rest by its top padding (`--output-head`,
     the stack's height) and blurring and fading under it as it scrolls
     (HeadFade; DESIGN.md, The Title Bars Follow Liquid Glass Rule). -->
  <HeadFade band="var(--output-head)" tint="bg-code-bg" />
  <div
    class="absolute inset-x-0 top-0 z-2 flex flex-col"
    data-slot="output-head"
    {@attach frameSize(
      (node: HTMLElement) => node.offsetHeight,
      (value) => {
        headHeight = value;
      }
    )}
  >
    <!-- One row with no ground (DESIGN.md, The Title Bars Follow Liquid Glass
       Rule): the install's name, then Stop install and Close, each a bare
       symbol in a glass group of its own. Where it stands is the output's
       first line, in its content. -->
    <header
      data-slot="bar"
      class="flex h-c-top-bar-h flex-none items-center gap-space-2 ps-space-5 pe-space-2"
    >
      <h2
        class="m-0 min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
      >
        {titleOf(install)}
      </h2>
      {#if install.state === "running"}
        <BarGlass form="group">
          <BarItem
            icon={IconStopLinear}
            label={connectWords.stopInstall}
            onclick={askStop}
          />
        </BarGlass>
      {/if}
      <BarGlass form="group">
        <BarItem
          icon={IconClose}
          label={connectWords.closeOutput}
          onclick={() => connect.closeOutput()}
        />
      </BarGlass>
    </header>
    <p
      data-slot="step"
      class="m-0 flex-none overflow-clip text-ellipsis whitespace-nowrap px-space-5 pb-space-2 type-meta text-ink-muted"
      aria-live="polite"
    >
      {step}
    </p>
    <AskHere
      asker={asks}
      at="stop-output"
      class="flex-none py-space-3"
      end="var(--space-5)"
      indent="var(--space-5)"
    />
  </div>
  <div
    bind:this={scroller}
    class="kit-edge-fade-block min-h-0 flex-1 overflow-y-auto bg-code-bg px-space-5 pt-(--output-head) pb-space-3 scroll-timeline-transcript-head"
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
