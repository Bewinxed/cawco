<script lang="ts">
  /**
   * A session card's account and model pickers to use (LimitPicker.stories
   * `Live`), on mock data and a mocked provider, with no store read. The
   * card stands in for SessionDetails' body: its settings chips (the real
   * chip recipe), its held feedback line and its provider limit (the real
   * ProviderLimit). Both lists open in the real NsPopover, its hover ghost
   * and morph its own, every row a PickRow in a PickList, their tooltip
   * gliding row to row. The popovers' and tooltips' portal draws into a
   * layer inside the frame (bits-ui `BitsConfig` `defaultPortalTo`), where
   * the stage frames it, as the decision host's dials do (DialsRoot).
   *
   * Picking an account or a model at its limit checks it again: the row's
   * live dot, then the mocked provider's answer after a second (`check`):
   * cleared, the pick goes through; still at its limit, Move anyway (Pick
   * anyway) stands on the row; its machine offline, Move anyway stands
   * there at once, with no check. A move shows on the card's chips and its
   * held line until it lands; a model picked meanwhile rides it.
   *
   * Every value follows its prop while mounted (house/follows-props): what
   * the person changes by picking overrides a writable `$derived`, and
   * pressing Start over (`again`) derives each one from its prop again.
   */
  import type { AccountHue } from "@cawco/core/accounts/kinds";
  import { limitPickWords as words } from "@cawco/core/words/limit-picks";
  import { type MoveWait, owedMoveWords } from "@cawco/core/words/owed-moves";
  import { BitsConfig } from "bits-ui";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconChevronDown as Down } from "#lib/icons.js";
  import NsPopover from "../spawn/NsPopover.svelte";
  import ProviderLimit from "../usage/ProviderLimit.svelte";
  import { hueVar } from "./model.svelte";
  import PickList from "./PickList.svelte";
  import PickRow from "./PickRow.svelte";

  type List = "account" | "model";
  /** A row whose pick is held: its limit stood, or it couldn't be checked. */
  interface Held {
    id: string;
    why: "still" | "offline";
  }

  let {
    reading,
    check,
    pending,
    again = 0,
    open = null,
    checking = null,
    held = null,
  }: {
    /** How old the stored limit readings are: fresh says no age, stale says it. */
    reading: "fresh" | "stale";
    /** What the mocked provider answers a check: the limit has gone, it holds, or the machine is offline. */
    check: "cleared" | "still" | "offline";
    /** A move to Research ops is already waiting for the turn to end. */
    pending: boolean;
    /** Start over: each press derives every value from its prop again. */
    again?: number;
    /** The list standing open. */
    open?: List | null;
    /** The row whose limit is being checked. */
    checking?: string | null;
    /** The row whose pick is held, and why. */
    held?: Held | null;
  } = $props();

  /** A value derived from its prop, derived again on each Start over. */
  const fresh = <T,>(_again: number, value: T): T => value;

  interface MockAccount {
    email: string;
    hue: AccountHue;
    id: string;
    /** Its nickname; null: it goes by its email. */
    label: string | null;
    /** The room left in the window that runs out first; null: at its limit. */
    left: number | null;
  }
  const ACCOUNTS: MockAccount[] = [
    {
      id: "jude",
      email: "jude@petralab.ai",
      hue: "amber",
      label: null,
      left: 38,
    },
    {
      id: "bewinxed",
      email: "bewinxed@gmail.com",
      hue: "blue",
      label: null,
      left: null,
    },
    {
      id: "research",
      email: "research-operations@petralab-industries.com",
      hue: "green",
      label: "Research ops",
      left: 71,
    },
    {
      id: "design",
      email: "design-studio-shared-workspace@petralab-industries.com",
      hue: "cyan",
      label: "Design studio and brand experiments",
      left: 55,
    },
    {
      id: "billing",
      email: "ops-billing+claude-max-shared@petralab-industries.com",
      hue: "violet",
      label: null,
      left: 94,
    },
  ];
  const RUNS_ON = "jude";
  const PENDING_TO = "research";
  const accountOf = (id: string): MockAccount =>
    ACCOUNTS.find((one) => one.id === id) ?? ACCOUNTS[0];
  const nameOf = (account: MockAccount): string =>
    account.label ?? account.email;

  const MODELS = [
    { id: "claude-opus-5-5", name: "Opus 5.5" },
    { id: "claude-opus-5-5[1m]", name: "Opus 5.5 (1M context)" },
    { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    { id: "claude-haiku-5-5", name: "Haiku 5.5" },
    { id: "claude-fable-5-2", name: "Fable 5.2" },
  ];
  const RUNS_MODEL = "claude-opus-5-5";
  /** jude is at its weekly limit for Fable; bewinxed, a Pro plan, doesn't offer it. */
  const LIMITED_MODEL = { account: "jude", id: "claude-fable-5-2" };
  const UNOFFERED_MODEL = { account: "bewinxed", id: "claude-fable-5-2" };
  /** The reset each limit waits for. */
  const UNTIL: Record<string, string> = {
    bewinxed: "15:40",
    "claude-fable-5-2": "Thu 09:00",
  };
  const MACHINE = "tower";
  const AGE = "3h 10m";
  /** How long the mocked provider takes to answer a check. */
  const CHECK_MS = 1000;
  const NOW = Date.parse("2026-11-16T13:22:00Z");

  let openList = $derived(fresh(again, open));
  let checkingId = $derived(fresh(again, checking));
  let heldRow = $derived(fresh(again, held));
  /** Rows whose limit a check found gone: no row says it any more. */
  let cleared = $derived(fresh(again, [] as string[]));
  /** The account the session is moving to, and what the move waits for. */
  let movedTo = $derived(fresh(again, pending ? PENDING_TO : null));
  let moveWait = $derived(fresh(again, { kind: "turn" } as MoveWait));
  /** The model it runs, or the one picked to ride the move. */
  let model = $derived(fresh(again, RUNS_MODEL));
  /** A check's answer still to come: Start over drops it. */
  let answer: ReturnType<typeof setTimeout> | undefined;

  const shown = $derived(accountOf(movedTo ?? RUNS_ON));
  const modelName = $derived(
    MODELS.find((one) => one.id === model)?.name ?? model
  );

  /** Whether `id` (an account, or a model on the shown account) is at its limit now. */
  const limitedNow = (id: string): boolean => {
    if (cleared.includes(id)) {
      return false;
    }
    if (id === LIMITED_MODEL.id) {
      return shown.id === LIMITED_MODEL.account;
    }
    return accountOf(id).left === null && ACCOUNTS.some((a) => a.id === id);
  };
  /** A limited row's second line: the reset, the reading's age while it is old, or its machine away. */
  const limitWords = (id: string): string => {
    const until = UNTIL[id] ?? "";
    if (heldRow?.id === id) {
      return heldRow.why === "offline"
        ? words.machineAway(until, MACHINE)
        : words.atLimit(until);
    }
    return words.atLimit(until, reading === "stale" ? AGE : undefined);
  };

  /** A model row's second line: why it can't be picked, its limit, or its id. */
  const modelDetail = (
    id: string,
    unoffered: boolean,
    limited: boolean
  ): string => {
    if (unoffered) {
      return words.notOffered;
    }
    return limited ? limitWords(id) : id;
  };

  function move(to: string, wait: MoveWait): void {
    movedTo = to === RUNS_ON ? null : to;
    moveWait = wait;
    openList = null;
  }
  function choose(list: List, id: string, wait: MoveWait): void {
    heldRow = null;
    if (list === "account") {
      move(id, wait);
      return;
    }
    model = id;
    openList = null;
  }
  /** A pick: one at its limit is checked first, or held at once while its machine is away. */
  function pick(list: List, id: string): void {
    if (checkingId) {
      return;
    }
    if (!limitedNow(id)) {
      choose(list, id, { kind: "turn" });
      return;
    }
    if (check === "offline") {
      heldRow = { id, why: "offline" };
      return;
    }
    heldRow = null;
    checkingId = id;
    answer = setTimeout(() => {
      checkingId = null;
      if (check === "cleared") {
        cleared = [...cleared, id];
        choose(list, id, { kind: "turn" });
      } else {
        heldRow = { id, why: "still" };
      }
    }, CHECK_MS);
  }
  /** Move anyway, Pick anyway: the pick goes through as it stands. */
  function force(list: List, id: string): void {
    const wait: MoveWait =
      heldRow?.why === "offline"
        ? { kind: "machine", host: MACHINE }
        : { kind: "turn" };
    choose(list, id, wait);
  }
  $effect(() => {
    // Start over (any count of it) drops a check still under way.
    if (again >= 0) {
      return () => clearTimeout(answer);
    }
  });

  const line = $derived(movedTo ? owedMoveWords.waiting(moveWait) : null);
  const chip = chipVariants({ variant: "setting", size: "compact" });
  /** The portal's target: the popovers and tooltips draw inside the frame. */
  let layer = $state<HTMLElement>();
</script>

{#snippet dot(hue: AccountHue)}
  <span
    class="size-space-2 rounded-pill bg-(--c)"
    data-box
    style:--c={hueVar(hue)}
  ></span>
{/snippet}

{#snippet accountList()}
  <PickList label="Account">
    {#each ACCOUNTS as account (account.id)}
      {@const limited = limitedNow(account.id)}
      {@const detail = limited
        ? limitWords(account.id)
        : words.left(account.left ?? 100)}
      <PickRow
        checking={checkingId === account.id}
        {detail}
        force={heldRow?.id === account.id
          ? {
              action: words.moveAnyway,
              onforce: () => force("account", account.id),
            }
          : undefined}
        full={account.label ? `${account.email}\n${detail}` : detail}
        {limited}
        name={nameOf(account)}
        onpick={() => pick("account", account.id)}
        picked={account.id === shown.id}
      >
        {#snippet lead()}
          {@render dot(account.hue)}
        {/snippet}
      </PickRow>
    {/each}
  </PickList>
{/snippet}

{#snippet modelList()}
  <div class="grid gap-space-2">
    <p
      class="m-0 mark-line flex items-center gap-space-3 px-space-4 type-meta text-ink-muted"
    >
      <span
        aria-hidden="true"
        class="grid size-icon-md flex-none place-items-center"
        data-box>{@render dot(shown.hue)}</span
      >
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{nameOf(shown)}</span
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
      <div class="p-space-1">
        <PickList label="Claude Code models">
          {#each MODELS as entry (entry.id)}
            {@const unoffered =
              shown.id === UNOFFERED_MODEL.account &&
              entry.id === UNOFFERED_MODEL.id}
            {@const limited = !unoffered && limitedNow(entry.id)}
            {@const detail = modelDetail(entry.id, unoffered, limited)}
            <PickRow
              checking={checkingId === entry.id}
              {detail}
              disabled={unoffered}
              force={heldRow?.id === entry.id
                ? {
                    action: words.pickAnyway,
                    onforce: () => force("model", entry.id),
                  }
                : undefined}
              full={limited || unoffered ? `${entry.id}\n${detail}` : entry.id}
              {limited}
              mono={!(limited || unoffered)}
              name={entry.name}
              onpick={() => pick("model", entry.id)}
              picked={entry.id === model}
            >
              {#snippet lead()}
                <ProviderLogo model={entry.id} size="control" />
              {/snippet}
            </PickRow>
          {/each}
        </PickList>
      </div>
    </div>
  </div>
{/snippet}

<div class="relative min-h-160 bg-surface-recess p-space-3 desk:p-space-8">
  <BitsConfig defaultPortalTo={layer}>
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
        <span class="flex-none type-meta text-ink-muted">{MACHINE}</span>
      </header>
      <div class="border-t border-t-border-hairline px-space-5 pt-space-4">
        <div
          data-slot="settings"
          class="flex min-w-0 flex-wrap items-center gap-space-1"
        >
          <NsPopover
            aria-label="Models"
            haspopup="listbox"
            id="limit-live-model"
            onchange={(value) => {
              openList = value ? "model" : null;
            }}
            open={openList === "model"}
            rows="[data-pick-row]"
            triggerClass={chip}
            triggerData={{ "data-model-chip": true }}
            width={360}
          >
            {#snippet trigger()}
              <ProviderLogo {model} size="control" />
              <span data-slot="chip-label">{modelName}</span>
              <Down data-slot="chevron" />
            {/snippet}
            {@render modelList()}
          </NsPopover>
          <span class={chip} data-variant="static">high</span>
          <span class={chip} data-variant="static">Accept edits</span>
          <NsPopover
            haspopup="listbox"
            id="limit-live-account"
            label={`Account: ${nameOf(shown)}`}
            onchange={(value) => {
              openList = value ? "account" : null;
            }}
            open={openList === "account"}
            rows="[data-pick-row]"
            triggerClass={chip}
            triggerData={{ "data-tool": true, "data-account-chip": true }}
            width={360}
          >
            {#snippet trigger()}
              <span
                data-slot="dot"
                aria-hidden="true"
                class="size-space-2 flex-none rounded-pill bg-(--c)"
                style:--c={hueVar(shown.hue)}
              ></span>
              <span data-slot="chip-label" data-account-chip
                >{nameOf(shown)}</span
              >
              <Down data-slot="chevron" />
            {/snippet}
            {@render accountList()}
          </NsPopover>
        </div>
        <div
          class="grid min-h-(--feedback-min) leading-body"
          style:--feedback-min="calc(var(--spacing-space-2) + 1lh)"
        >
          {#if line}
            <p
              data-slot="feedback"
              class="m-0 mark-line mt-space-2 flex items-start gap-space-2 type-body wrap-anywhere text-ink-muted"
              role="status"
            >
              <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
                >{line}</span
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
            elapsed: 0.62,
            lasts: true,
            margin: null,
            runsOutIn: null,
            state: "calm",
            used: 62,
            window: {
              group: "session",
              isActive: true,
              kind: "session",
              percent: 62,
              resetsAt: "2026-11-16T15:10:00Z",
              scopeLabel: null,
              severity: "normal",
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
  </BitsConfig>
  <div bind:this={layer} data-slot="layer"></div>
</div>
