<script lang="ts">
  /**
   * The usage popover (the relay) on a bench: the real strip and its real
   * popover (the rail's, on the desk) or sheet (on the phone), fed a staged
   * forecast with no hub. `?n=` 6 | 20 the number of Claude accounts, `?view=`
   * desktop | phone where it opens; on a desk the phone view is this page at
   * 390×844 in a frame. Six: five accounts in Petralab (a group) and one in
   * Omar Al Matar (ungrouped); twenty adds Northwind's four (a group) and
   * Acme's two (ungrouped). The picker stops its pointerdowns so a press on
   * it never reads as a press outside the popover.
   */
  import type {
    Account,
    AccountForecast,
    CarrySpan,
    InstanceRow,
    LimitWindow,
    ProviderForecast,
    ProviderRouting,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import UsageMeter from "#lib/cawco/UsageMeter.svelte";
  import { usage } from "#lib/cawco/usage/forecast.svelte.js";
  import { claudeRings, openCodeRing } from "#lib/cawco/usage/rings.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { page } from "$app/state";

  const MIN = 60_000;
  const HOUR = 60 * MIN;

  const count = $derived(page.url.searchParams.get("n") === "20" ? 20 : 6);
  const view = $derived(
    page.url.searchParams.get("view") === "phone" ? "phone" : "desktop"
  );
  /** This page drawn inside the desk's phone frame. */
  const framed = $derived(page.url.searchParams.get("frame") === "1");
  const narrow = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );

  /**
   * Each account's stored hue, as the owner's were assigned when there were
   * five: past five they repeat (bewinxed@gmail.com wears design@'s amber),
   * and an existing account keeps its hue; the rings' shownHues tells them
   * apart.
   */
  const HUES = ["amber", "blue", "cyan", "green", "orange"] as const;

  interface Seed {
    bind?: "week";
    email: string;
    five: number;
    fiveResets: number;
    seenAgo: number;
    sessions: number;
    week: number;
    weekOut?: number;
    weekResets: number;
  }

  /** The screenshot's six, in fill-first order. */
  const SIX: Seed[] = [
    {
      email: "design@petralab.ai",
      five: 71,
      fiveResets: 1.6 * HOUR,
      week: 38,
      weekResets: 52 * HOUR,
      seenAgo: 2 * MIN,
      sessions: 2,
    },
    {
      email: "bewinxed@petralab.ai",
      five: 22,
      fiveResets: 3.2 * HOUR,
      week: 54,
      weekResets: 75 * HOUR,
      seenAgo: 4 * MIN,
      sessions: 1,
    },
    {
      email: "jude@petralab.ai",
      five: 35,
      fiveResets: 2.4 * HOUR,
      week: 41,
      weekResets: 98 * HOUR,
      seenAgo: 100 * MIN,
      sessions: 0,
    },
    {
      email: "marketing@petralab.ai",
      five: 48,
      fiveResets: 4.1 * HOUR,
      week: 63,
      weekResets: 30 * HOUR,
      seenAgo: 9 * MIN,
      sessions: 0,
    },
    {
      email: "rand@petralab.ai",
      five: 100,
      fiveResets: 4 * HOUR + 50 * MIN,
      week: 72,
      weekResets: 120 * HOUR,
      seenAgo: 6 * MIN,
      sessions: 0,
    },
    {
      email: "bewinxed@gmail.com",
      five: 12,
      fiveResets: 2.9 * HOUR,
      week: 93,
      weekResets: 26 * HOUR,
      seenAgo: 12 * MIN,
      sessions: 0,
      bind: "week",
      weekOut: 9 * HOUR,
    },
  ];

  const extra = (i: number): Seed => ({
    email: `ops${i + 1}@petralab.ai`,
    five: (i * 17) % 90,
    fiveResets: ((i % 5) + 1) * HOUR,
    week: (i * 23) % 85,
    weekResets: (24 + i * 7) * HOUR,
    seenAgo: (5 + i) * MIN,
    sessions: 0,
  });

  /** Six: Petralab's five and Omar Al Matar's one; then Northwind's four, Acme's two, and Petralab. */
  function orgAt(i: number): string {
    if (i < 5) {
      return "Petralab";
    }
    if (i === 5) {
      return "Omar Al Matar";
    }
    if (i < 10) {
      return "Northwind";
    }
    return i < 12 ? "Acme" : "Petralab";
  }

  const SESSIONS = [
    {
      id: "bench-relay",
      accountId: "acc-0",
      title: "Build the relay popover",
      cwd: "/home/omar/cockpit",
    },
    {
      id: "bench-relay-probe",
      accountId: "acc-0",
      title: "Measure the relay bands",
      cwd: "/home/omar/.worktrees/cockpit-84f29783",
      parent: "bench-relay",
    },
    {
      id: "bench-tray",
      accountId: "acc-1",
      title: "Fix tray chip overflow",
      cwd: "/home/omar/anbar",
    },
  ];

  function stageView(n: number) {
    const now = Date.now();
    const seeds = [
      ...SIX,
      ...Array.from({ length: n - SIX.length }, (_, i) => extra(i)),
    ];
    const iso = (ms: number) => new Date(now + ms).toISOString();
    const accounts: Account[] = seeds.map((seed, i) => ({
      createdAt: now - 30 * 24 * HOUR,
      email: seed.email,
      hue: HUES[i % HUES.length],
      id: `acc-${i}`,
      identity: { email: seed.email, organization: orgAt(i) },
      kind: "subscription",
      label: null,
      neverBackup: false,
      order: i,
      provider: "anthropic",
      reservePct: null,
    }));
    const forecasts: AccountForecast[] = seeds.map((seed, i) => ({
      accountId: `acc-${i}`,
      bindingWindow:
        seed.bind === "week"
          ? { kind: "weekly_all", scopeLabel: null }
          : { kind: "session", scopeLabel: null },
      lastSeenAt: now - seed.seenAgo,
      windows: [
        {
          kind: "session",
          pace: seed.sessions > 0 ? 18 : null,
          resetsAt: iso(seed.fiveResets),
          scopeLabel: null,
          utilization: seed.five,
        },
        {
          kind: "weekly_all",
          pace: null,
          resetsAt: iso(seed.weekResets),
          runsOutAt: seed.weekOut ? now + seed.weekOut : undefined,
          scopeLabel: null,
          utilization: seed.week,
        },
      ],
    }));
    // design carries, then bewinxed, then jude (out of date), then
    // marketing; nothing for 20m; rand is back from its limit.
    const yours: CarrySpan[] = [
      { accountId: "acc-0", from: now, to: now + 80 * MIN },
      { accountId: "acc-1", from: now + 80 * MIN, to: now + 170 * MIN },
      { accountId: "acc-2", from: now + 170 * MIN, to: now + 220 * MIN },
      { accountId: "acc-3", from: now + 220 * MIN, to: now + 270 * MIN },
      { accountId: null, from: now + 270 * MIN, to: now + 290 * MIN },
      { accountId: "acc-4", from: now + 290 * MIN, to: now + 9 * HOUR },
    ];
    const forecast: ProviderForecast = {
      accounts: forecasts,
      delegates: [{ accountId: "acc-1", from: now, to: now + 170 * MIN }],
      provider: "anthropic",
      yours,
    };
    // design@ carries a session and its delegate; bewinxed@ one session.
    const instances = SESSIONS.map(
      (one) =>
        ({
          id: one.id,
          accountId: one.accountId,
          status: "running",
          harness: "claude",
          title: one.title,
          cwd: one.cwd,
          machineId: "nixbox",
          parentInstanceId: one.parent ?? null,
        }) as unknown as InstanceRow
    );
    const routing = {
      provider: "anthropic",
      delegates: { strategy: "spread" },
      yours: { strategy: "fill-first" },
    } as ProviderRouting;
    const rings = claudeRings({
      accounts,
      bench: [],
      forecast,
      instances,
      now,
      routing,
    });
    const go: LimitWindow[] = [
      {
        group: "session",
        isActive: true,
        kind: "rolling",
        percent: 100,
        resetsAt: iso(72 * MIN),
        scopeLabel: null,
        severity: "critical",
      },
      {
        group: "weekly",
        isActive: true,
        kind: "weekly",
        percent: 64,
        resetsAt: iso(80 * HOUR),
        scopeLabel: null,
        severity: "normal",
      },
      {
        group: "monthly",
        isActive: true,
        kind: "monthly",
        percent: 40,
        resetsAt: iso(18 * 24 * HOUR),
        scopeLabel: null,
        severity: "normal",
      },
    ];
    const shown = rings.accounts.filter((ring) => ring.w5 || ring.week);
    usage.stage({
      forecast,
      claude: { ...rings, accounts: shown },
      openCode: openCodeRing(
        { fetchedAt: now, windows: go },
        [],
        now,
        shown.map((ring) => ring.hue)
      ),
    });
  }

  $effect(() => {
    stageView(count);
  });

  const hrefOf = (key: string, value: string) => {
    const query = new URLSearchParams(page.url.search);
    query.set(key, value);
    query.delete("frame");
    return `?${query}`;
  };
  const frameSrc = $derived.by(() => {
    const query = new URLSearchParams(page.url.search);
    query.set("frame", "1");
    return `?${query}`;
  });

  /** The strip on screen: the bench's own on a phone, else the rail's. */
  const ownStrip = $derived(narrow.current);
  const phoneFrame = $derived(!narrow.current && view === "phone");

  /**
   * Opens the strip's popover or sheet, once it has drawn, as a press of the
   * pointer does (a pointerdown, then the click): the strip opens a pointer's
   * press with no focus ring, as it does for a person.
   */
  function openStrip() {
    const scope = ownStrip
      ? document.querySelector("[data-bench-strip]")
      : document;
    const hit = scope?.querySelector<HTMLElement>(
      ".strip-hit:not([data-state='open']):not([aria-expanded='true'])"
    );
    hit?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    hit?.click();
  }
  onMount(() => {
    let frame = 0;
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (!phoneFrame) {
          openStrip();
        }
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      usage.stage(null);
    };
  });

  const SWITCHES = [
    {
      key: "n",
      label: "Accounts",
      options: [
        { value: "6", label: "6" },
        { value: "20", label: "20" },
      ],
    },
    {
      key: "view",
      label: "View",
      options: [
        { value: "desktop", label: "Desktop popover" },
        { value: "phone", label: "Phone sheet" },
      ],
    },
  ] as const;
  const current = (key: string): string =>
    ({ n: String(count), view })[key] ?? "";
</script>

<svelte:head><title>Usage relay | CawCo</title></svelte:head>

{#if !framed}
  <nav
    aria-label="Usage popover bench"
    class="bench"
    onpointerdown={(event) => event.stopPropagation()}
  >
    {#each SWITCHES as each (each.key)}
      <span class="switch">
        <span class="switch-label">{each.label}</span>
        {#each each.options as option (option.value)}
          <Button
            aria-current={current(each.key) === option.value
              ? "page"
              : undefined}
            href={hrefOf(each.key, option.value)}
            size="xs"
            variant={current(each.key) === option.value ? "default" : "outline"}
            >{option.label}</Button
          >
        {/each}
      </span>
    {/each}
    <Button onclick={openStrip} size="xs" variant="outline">Open</Button>
  </nav>
{/if}

{#if phoneFrame}
  <div class="phone">
    <iframe
      height="844"
      src={frameSrc}
      title="Phone sheet"
      width="390"
    ></iframe>
  </div>
{:else if ownStrip}
  <div class="home-strip" data-bench-strip>
    <UsageMeter variant="home" />
  </div>
{/if}

<style>
  .bench {
    position: fixed;
    inset-block-start: var(--space-2);
    inset-inline: var(--space-2);
    z-index: 60;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    justify-content: flex-end;
    pointer-events: auto;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .switch-label {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .phone {
    display: grid;
    place-items: center;
    padding: 56px var(--space-4) var(--space-4);

    & iframe {
      border: 1px solid var(--border-control);
      border-radius: var(--radius-lg);
      background: var(--surface-recess);
    }
  }
  .home-strip {
    padding: 96px 12px 0;
  }
</style>
