<script lang="ts">
  /**
   * A session card's account and model pickers when a pick would meet a
   * limit CawCo knows of, in a frame of their own (LimitPicker.stories.ts),
   * with no store read. The card stands in for SessionDetails' body: its
   * settings chips (the real chip recipe), its held feedback line and its
   * provider limit (the real ProviderLimit). The open list is drawn on the
   * popover's own surface (glidePopoverVariants, NsPopover's) under its
   * chip, inside the frame: NsPopover portals its surface to the page, out
   * of the story's root, where the stage neither frames nor compares it.
   * It is placed as NsPopover places it (floating-ui's shift): under its
   * chip, moved in to keep the screen's margin, as wide as the margins
   * leave it on a phone (`place`).
   * The account list is AccountPickRow's, the proposed row; the model list
   * stands in for ModelSection's runtime list with its rows' own markup,
   * judged against the account the session is moving to. The card is the
   * desk's 416px, margin to margin on a phone.
   */
  import type { NameableAccount } from "@cawco/core/accounts";
  import type { AccountHue } from "@cawco/core/accounts/kinds";
  import { limitPickWords as words } from "@cawco/core/words/limit-picks";
  import { owedMoveWords } from "@cawco/core/words/owed-moves";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { glidePopoverVariants } from "#lib/components/ui/glide-popover/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconChevronDown as Down } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import ProviderLimit from "../usage/ProviderLimit.svelte";
  import AccountPickRow from "./AccountPickRow.svelte";
  import LimitForce from "./LimitForce.svelte";
  import LimitLine from "./LimitLine.svelte";
  import { hueVar } from "./model.svelte";

  type Scene =
    | "fresh"
    | "stale"
    | "checking"
    | "still"
    | "cleared"
    | "unasked"
    | "riding"
    | "models"
    | "modelChecking"
    | "modelStill";

  let { scene, height }: { scene: Scene; height: number } = $props();

  type MockAccount = NameableAccount & { hue: AccountHue };
  const mock = (
    id: string,
    email: string,
    hue: AccountHue,
    label: string | null = null
  ): MockAccount => ({
    id,
    email,
    hue,
    label,
    identity: null,
    provider: "anthropic",
  });
  const JUDE = mock("jude", "jude@petralab.ai", "amber");
  const BEWINXED = mock("bewinxed", "bewinxed@gmail.com", "blue");
  const RESEARCH = mock(
    "research",
    "research-operations@petralab-industries.com",
    "green",
    "Research ops"
  );
  const MARKETING = mock("marketing", "marketing@petralab.ai", "violet");
  const ACCOUNTS = [JUDE, BEWINXED, RESEARCH, MARKETING];
  const PROVIDER = "Anthropic";
  const NOW = Date.parse("2026-11-16T13:22:00Z");

  /** A limited row: its limit line, whether the provider is being asked, and what opens under it. */
  interface Limited {
    checking?: boolean;
    force?: string;
    limit: string;
  }

  /** Which list stands open under its chip. */
  const open = $derived.by((): "account" | "model" | null => {
    switch (scene) {
      case "fresh":
      case "stale":
      case "checking":
      case "still":
      case "unasked":
        return "account";
      case "models":
      case "modelChecking":
      case "modelStill":
        return "model";
      case "cleared":
      case "riding":
        return null;
    }
  });
  /** The session owes a move to bewinxed: its chip shows the account it moves to. */
  const moving = $derived(open !== "account");
  const shown = $derived(moving ? BEWINXED : JUDE);
  /** The model the chip shows: the one picked to ride the move, else the one it runs. */
  const model = $derived(
    scene === "riding"
      ? { id: "claude-sonnet-5-5", name: "Sonnet 5.5" }
      : { id: "claude-opus-5-5", name: "Opus 5.5" }
  );

  /** bewinxed's row in this scene. */
  const target = $derived.by((): Limited => {
    switch (scene) {
      case "fresh":
        return { limit: words.atLimit("15:40", "6m") };
      case "checking":
        return { limit: words.checking(PROVIDER), checking: true };
      case "still":
        return {
          limit: words.still("15:40"),
          force: words.mayRefuse(PROVIDER),
        };
      case "unasked":
        return {
          limit: words.atLimit("15:40", "3h 10m"),
          force: words.machineAway("tower"),
        };
      case "stale":
      case "cleared":
      case "riding":
      case "models":
      case "modelChecking":
      case "modelStill":
        return { limit: words.atLimit("15:40", "3h 10m") };
    }
  });
  /** Each account's row in this scene: jude, the one it runs on, at its limit too. */
  const rowOf = (account: MockAccount): Limited | undefined => {
    if (account === BEWINXED) {
      return target;
    }
    return account === JUDE
      ? { limit: words.atLimit("14:05", "2m") }
      : undefined;
  };

  interface MockModel {
    id: string;
    name: string;
    unavailable?: string;
  }
  const MODELS: MockModel[] = [
    { id: "claude-opus-5-5", name: "Opus 5.5" },
    { id: "claude-opus-5-5[1m]", name: "Opus 5.5 (1M context)" },
    { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    { id: "claude-haiku-5-5", name: "Haiku 5.5" },
    {
      id: "claude-fable-5-2",
      name: "Fable 5.2",
      unavailable: words.notOffered(BEWINXED.email ?? ""),
    },
  ];
  /** The model bewinxed is at its limit for. */
  const LIMITED_MODEL = "claude-opus-5-5[1m]";
  const limitedModel = $derived.by((): Limited => {
    switch (scene) {
      case "modelChecking":
        return { limit: words.checking(PROVIDER), checking: true };
      case "modelStill":
        return {
          limit: words.still("Thu 09:00"),
          force: words.mayRefuse(PROVIDER),
        };
      case "fresh":
      case "stale":
      case "checking":
      case "still":
      case "unasked":
      case "cleared":
      case "riding":
      case "models":
        return { limit: words.atLimit("Thu 09:00", "12m") };
    }
  });

  /** The card's held line: what the session's move or stop says, in its rows' words. */
  const line = $derived.by((): { kind: "fail" | "pending"; words: string } => {
    if (!moving) {
      return {
        kind: "fail",
        words:
          "jude@petralab.ai is at its limit until 14:05. Pick another account to move it now.",
      };
    }
    return {
      kind: "pending",
      words: owedMoveWords.moving(
        BEWINXED.email ?? "",
        scene === "riding" ? "Sonnet 5.5" : undefined,
        scene === "cleared" ? { kind: "now" } : { kind: "turn" }
      ),
    };
  });

  const chip = chipVariants({ variant: "setting", size: "compact" });
  /** The popover's surface, open under its chip in the frame. */
  const surface = glidePopoverVariants({ pad: "roomy", class: "absolute" });
  /** NsPopover's width, gap under its chip, and inset from the screen's edge on a phone (`screenInset`). */
  const POP_WIDTH = 360;
  const POP_GAP = 6;
  const MARGIN = 12;
  let frame = $state<HTMLElement | null>(null);
  /** The frame's width, read a frame after it changes (frameSize): the surface is placed again on it. */
  let frameWidth = $state(0);
  let modelChip = $state<HTMLElement | null>(null);
  let accountChip = $state<HTMLElement | null>(null);
  /**
   * The surface under `anchor`, kept inside the frame less its margin, its
   * width the popover's or what the margins leave: what floating-ui's shift
   * does for NsPopover on the page. Placed again as the frame resizes.
   */
  const place =
    (anchor: HTMLElement | null) =>
    (panel: HTMLElement): void => {
      if (!(frame && anchor && frameWidth > 0)) {
        return;
      }
      const box = frame.getBoundingClientRect();
      const at = anchor.getBoundingClientRect();
      const width = Math.min(POP_WIDTH, frameWidth - 2 * MARGIN);
      const left = Math.min(
        Math.max(at.left - box.left, MARGIN),
        frameWidth - MARGIN - width
      );
      panel.style.width = `${width}px`;
      panel.style.insetInlineStart = `${left}px`;
      panel.style.insetBlockStart = `${at.bottom - box.top + POP_GAP}px`;
    };
  const still = () => undefined;
</script>

{#snippet accountFace()}
  <span
    data-slot="dot"
    aria-hidden="true"
    class="size-space-2 flex-none rounded-pill bg-(--c)"
    style:--c={hueVar(shown.hue)}
  ></span>
  <span data-slot="chip-label" data-account-chip>{shown.email}</span>
  <Down data-slot="chevron" />
{/snippet}

{#snippet modelFace()}
  <ProviderLogo model={model.id} size="control" />
  <span data-slot="chip-label">{model.name}</span>
  <Down data-slot="chevron" />
{/snippet}

{#snippet modelRow(entry: MockModel)}
  {@const picked = entry.id === model.id}
  {@const limited = entry.id === LIMITED_MODEL ? limitedModel : undefined}
  <div
    data-slot="model-pick"
    class="grid"
    style:--lead="var(--spacing-space-2)"
  >
    <button
      data-slot="row"
      aria-busy={limited?.checking || undefined}
      aria-disabled={entry.unavailable ? true : undefined}
      aria-selected={picked}
      class="group relative flex min-h-c-row-h w-full items-center gap-space-3 rounded-xs border border-transparent bg-transparent px-space-2 py-space-2 text-start text-ink-strong select-none press-tint transition-control aria-disabled:cursor-not-allowed aria-selected:bg-selected-bg aria-selected:text-selected-ink"
      data-limited={limited ? true : undefined}
      disabled={Boolean(entry.unavailable)}
      role="option"
      type="button"
    >
      <span data-slot="text" class="grid min-w-0 flex-1">
        <span
          data-slot="name"
          class="type-label block truncate group-disabled:opacity-50 group-data-limited:text-ink-muted"
          >{entry.name}</span
        >
        {#if entry.unavailable}
          <span
            data-slot="reason"
            class="type-meta block truncate text-ink-muted"
            >{entry.unavailable}</span
          >
        {:else if limited}
          <LimitLine checking={limited.checking} words={limited.limit} />
        {:else}
          <span
            data-slot="meta"
            class="type-meta block truncate text-ink-subtle in-aria-selected:text-selected-ink"
            ><span class="font-(family-name:--font-mono)">{entry.id}</span>
            · Anthropic</span
          >
        {/if}
      </span>
    </button>
    {#if limited?.force}
      <LimitForce
        action={words.pickAnyway}
        onforce={still}
        words={limited.force}
      />
    {/if}
  </div>
{/snippet}

<div
  bind:this={frame}
  {@attach frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().width,
    (width) => {
      frameWidth = width;
    }
  )}
  class="relative min-h-(--frame-h) bg-surface-recess p-space-3 desk:p-space-8"
  style:--frame-h={`${height}px`}
>
  <article
    data-slot="session-card"
    class="ns-theme mx-auto w-full max-w-104 rounded-lg border border-border-control bg-surface-raised text-size-body text-ink-strong shadow-md desk:mx-0"
  >
    <header
      class="flex items-baseline justify-between gap-space-3 px-space-5 pt-space-4 pb-space-3"
    >
      <h3 class="m-0 min-w-0 truncate type-label">
        Fix tray chip overflow on narrow screens
      </h3>
      <span class="flex-none type-meta text-ink-muted">tower</span>
    </header>
    <div class="border-t border-t-border-hairline px-space-5 pt-space-4">
      <div
        data-slot="settings"
        class="flex min-w-0 flex-wrap items-center gap-space-1"
      >
        <span class="inline-flex min-w-0">
          <button
            bind:this={modelChip}
            class={chip}
            aria-expanded={open === "model"}
            aria-haspopup="listbox"
            data-model-chip
            type="button">{@render modelFace()}</button
          >
          {#if open === "model"}
            <div class={surface} data-ns-pop {@attach place(modelChip)}>
              <div class="grid gap-space-2">
                <p
                  class="m-0 mark-line flex items-center gap-space-2 px-space-1 type-meta text-ink-muted"
                >
                  <span
                    aria-hidden="true"
                    class="size-space-2 flex-none rounded-pill bg-(--c)"
                    data-box
                    style:--c={hueVar(BEWINXED.hue)}
                  ></span>
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{words.judgedOn(BEWINXED.email ?? "")}</span
                  >
                </p>
                <div
                  data-slot="picker"
                  class="field-edge grid rounded-md border bg-surface-raised shadow-xs"
                >
                  <div
                    data-slot="search"
                    class="flex h-c-row-h items-center border-b border-b-border-hairline px-space-3 type-body text-ink-muted"
                  >
                    Search models
                  </div>
                  <div
                    data-slot="list"
                    aria-label="Claude Code models"
                    class="grid gap-space-row p-space-1"
                    role="listbox"
                  >
                    {#each MODELS as entry (entry.id)}
                      {@render modelRow(entry)}
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </span>
        <span class={chip} data-variant="static">high</span>
        <span class={chip} data-variant="static">Accept edits</span>
        <span class="inline-flex min-w-0">
          <button
            bind:this={accountChip}
            class={chip}
            aria-expanded={open === "account"}
            aria-haspopup="listbox"
            aria-label={`Account: ${shown.email}`}
            data-account-chip
            data-tool
            type="button">{@render accountFace()}</button
          >
          {#if open === "account"}
            <div class={surface} data-ns-pop {@attach place(accountChip)}>
              <div
                data-slot="list"
                aria-label="Account"
                class="flex flex-col"
                role="listbox"
              >
                {#each ACCOUNTS as account (account.id)}
                  {@const row = rowOf(account)}
                  <AccountPickRow
                    {account}
                    checking={row?.checking}
                    force={row?.force}
                    limit={row?.limit}
                    onforce={still}
                    onpick={still}
                    picked={account === shown}
                    provider={PROVIDER}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </span>
      </div>
      <div
        class="grid min-h-(--feedback-min) leading-body"
        style:--feedback-min="calc(var(--spacing-space-2) + 1lh)"
      >
        {#if line.kind === "fail"}
          <p
            data-slot="failure"
            class="m-0 mt-space-2 type-body wrap-anywhere text-status-fail-ink"
            role="alert"
          >
            {line.words}
          </p>
        {:else}
          <p
            data-slot="feedback"
            class="m-0 mark-line mt-space-2 flex items-start gap-space-2 type-body wrap-anywhere text-ink-muted"
            role="status"
          >
            <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
              >{line.words}</span
            >
          </p>
        {/if}
      </div>
    </div>
    <div
      data-slot="stats"
      class="mt-space-4 flex flex-wrap items-center gap-space-4 gap-y-space-2 border-t border-t-border-hairline px-space-5 pt-space-3 text-size-meta leading-body num"
    >
      <span class="flex-auto text-ink-muted">Context 38% · 76k/200k</span>
      <ProviderLimit
        label="5-hour"
        meter={{
          early: false,
          elapsed: 0.72,
          lasts: false,
          margin: null,
          runsOutIn: null,
          state: "reached",
          used: 100,
          window: {
            group: "session",
            isActive: true,
            kind: "session",
            percent: 100,
            resetsAt: "2026-11-16T14:05:00Z",
            scopeLabel: null,
            severity: "critical",
          },
        }}
        now={NOW}
        seenAt={NOW - 120_000}
      />
    </div>
    <div class="flex justify-end px-space-5 py-space-4">
      <Button size="sm">Continue in new session…</Button>
    </div>
  </article>
</div>
