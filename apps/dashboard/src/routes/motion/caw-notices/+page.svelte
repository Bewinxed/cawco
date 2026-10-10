<script lang="ts">
  import type { Account, AccountHue } from "@cawco/core";
  /**
   * CAW'S NOTICES BENCH (dev only) — the real CawPanel in the real popover
   * shell (`kit-pop caw-pop kit-hang`, hanging on `hang` from the top bar's
   * own glass), driven by a fixture feed with no hub. Dismissing, Clear all,
   * Show changes and Reload all work against the fixture; Reset brings it
   * back. The fixture (update, 5 logins and 2 asks; update only; nothing)
   * and the width are switches.
   *
   * The phone width is the same page in a 390×844 frame (`?frame`), whose
   * viewport is a phone's, so the panel's own phone rules apply. Every
   * switch is in the URL, so a script opens any state directly.
   */
  import { machineLabel } from "@cawco/core";
  import type { BinaryUpdateState } from "@cawco/core/binary-updates";
  import type { MovedLogin } from "#lib/cawco/accounts/model.svelte.js";
  import CawPanel from "#lib/cawco/home/CawPanel.svelte";
  import type { CawFeed } from "#lib/cawco/home/caw-feed.svelte.js";
  import type {
    AskItem,
    NeedsItem,
  } from "#lib/cawco/home/home-state.svelte.js";
  import { markHue } from "#lib/cawco/mark.js";
  import {
    hang,
    type Neck,
    neckStyle,
    sameNeck,
  } from "#lib/cawco/motion/hang.js";
  import {
    type Notice,
    noticeFor,
    type UpdateMachine,
  } from "#lib/cawco/updates/model.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { page } from "$app/state";

  /* ── The switches, from the URL ────────────────────────────────────── */
  type Fixture = "full" | "update" | "none";
  type Width = "desk" | "phone";
  const query = page.url.searchParams;
  const pick = <T extends string>(key: string, options: T[]): T =>
    (options.find((one) => one === query.get(key)) ?? options[0]) as T;

  /** Inside the phone frame: the stage alone. */
  const framed = query.has("frame");
  const firstFixture = pick<Fixture>("fixture", ["full", "update", "none"]);
  let fixture = $state<Fixture>(firstFixture);
  let width = $state<Width>(pick("width", ["desk", "phone"]));

  /** The switches as a query: the frame's URL, and this page's. */
  const search = $derived(new URLSearchParams({ fixture, width }).toString());
  $effect(() => {
    if (!framed) {
      history.replaceState(history.state, "", `?${search}`);
    }
  });

  /* ── The fixture ───────────────────────────────────────────────────── */
  /** As the wireframe's notes read (docs/releases/README.md's sections). */
  const NOTES = [
    "### New",
    "",
    "- Caw's panel groups notices and says what to do",
    "- Clear all in the Notices head",
    "- Moved logins name their provider",
    "- Reload tells you what it is for",
    "",
    "### Improved",
    "",
    "- Release notes fold under Show changes",
    "- The dismiss sits where lists put it",
    "- The sign-in link says how many machines lack it",
    "",
    "### Fixed",
    "",
    '- "Sign in there" pointed at the wrong machine',
    "- Notices under the fold",
  ].join("\n");
  const NIGHTLY = "0.2.0-nightly.2500+abc123def456";

  const binary = (over: Partial<BinaryUpdateState>): BinaryUpdateState => ({
    channel: "nightly",
    installedVersion: NIGHTLY,
    availableVersion: undefined,
    hostsHub: false,
    notes: NOTES,
    phase: "none",
    updatedAt: 1,
    ...over,
  });
  const MACHINES: (UpdateMachine & { os: string })[] = [
    {
      machineId: "m1",
      hostname: "obelisk",
      os: "linux",
      status: "online",
      binaryUpdate: binary({
        phase: "installed",
        landed: {
          at: 1,
          outcome: "installed",
          version: NIGHTLY,
          notes: NOTES,
        },
      }),
    },
    {
      machineId: "m2",
      hostname: "Omars-MacBook-Pro",
      os: "darwin",
      status: "online",
      binaryUpdate: binary({}),
    },
  ];
  /** A landing in a tab older than the dashboard: its notes, and Reload. */
  const UPDATE = noticeFor(
    {
      commanded: new Set(),
      machines: MACHINES,
      newerBuild: "e3cbba1",
      policy: { autoUpdate: true, channel: "nightly" },
      seen: new Set(),
    },
    machineLabel
  ) as Notice;

  const account = (
    id: string,
    email: string,
    provider: string,
    hue: AccountHue,
    kind: Account["kind"] = "subscription"
  ): Account => ({
    createdAt: 0,
    email,
    hue,
    id,
    identity: null,
    kind,
    label: null,
    neverBackup: false,
    order: 0,
    provider,
    reservePct: null,
  });
  const login = (
    one: Account,
    name: string,
    from: string,
    missing: number,
    at: number
  ): MovedLogin => ({
    account: one,
    at,
    from,
    id: `moved-login:${one.id}:${at}`,
    missing,
    name,
  });
  /** Five logins, two of them keys, two still lacking machines. */
  const MOVED: MovedLogin[] = [
    login(
      account("a1", "design@petralab.ai", "anthropic", "orange"),
      "design@petralab.ai",
      "from Claude Code on obelisk",
      0,
      5
    ),
    login(
      account("a2", "…4DEY", "anthropic", "cyan", "api_key"),
      "Anthropic key ••••4DEY",
      "from OpenCode on Omars-MacBook-Pro",
      2,
      4
    ),
    login(
      account("a3", "marketing@petralab.ai", "openai", "green"),
      "marketing@petralab.ai",
      "from pi on obelisk",
      0,
      3
    ),
    login(
      account("a4", "…Q2NM", "openai", "amber", "api_key"),
      "OpenAI key ••••Q2NM",
      "from OpenCode on obelisk",
      1,
      2
    ),
    login(
      account("a5", "rand@petralab.ai", "anthropic", "blue"),
      "rand@petralab.ai",
      "from Claude Code on Omars-MacBook-Pro",
      0,
      1
    ),
  ];

  const ask = (over: {
    key: string;
    title: string;
    project: string;
    machine: string;
    /** The daemon's `platform-arch` fingerprint. */
    os: string;
    cwd: string;
    toolName: string;
    input: Record<string, unknown>;
    summary: string;
    minutes: number;
  }): AskItem => {
    const raisedAt = Date.now() - over.minutes * 60_000;
    return {
      kind: "ask",
      key: over.key,
      instanceId: over.key,
      cwd: over.cwd,
      thread: null,
      machineId: "m1",
      machine: { name: over.machine, os: over.os },
      title: over.title,
      place: `${over.machine} · ${over.project}`,
      project: { name: over.project, hue: markHue(over.cwd) },
      isQuestion: over.toolName === "AskUserQuestion",
      ask: over.summary,
      raisedAt,
      request: {
        heard: 0,
        input: over.input,
        instanceId: over.key,
        presentation: {
          asker: over.title,
          changes: [],
          fields: [],
          summary: over.summary,
        },
        raisedAt,
        requestId: `r-${over.key}`,
        toolName: over.toolName,
      },
      stale: false,
    };
  };
  const NEEDS: NeedsItem[] = [
    ask({
      key: "s1",
      title: "Answer a question in anbar",
      project: "anbar",
      machine: "obelisk",
      os: "linux-x64",
      cwd: "/home/omar/anbar",
      toolName: "AskUserQuestion",
      input: {
        questions: [
          {
            question: "Which channel should the coaching build go to?",
            header: "Channel",
            multiSelect: false,
            options: [
              { label: "TestFlight", description: "Internal testers" },
              { label: "App Store", description: "Everyone" },
            ],
          },
        ],
      },
      summary: "Which channel should the coaching build go to?",
      minutes: 12,
    }),
    ask({
      key: "s2",
      title: "Fix tray chip overflow",
      project: "cockpit",
      machine: "Omars-MacBook-Pro",
      os: "darwin-arm64",
      cwd: "/Users/omar/cockpit",
      toolName: "Bash",
      input: { command: "bun run build" },
      summary: "Run bun run build in apps/dashboard",
      minutes: 3,
    }),
  ];

  let needs = $state.raw<NeedsItem[]>([]);
  let updated = $state.raw<Notice | null>(null);
  let moved = $state.raw<MovedLogin[]>([]);
  /** Bumped by Reset: a fresh panel, its fold shut and no goodbye said. */
  let generation = $state(0);

  function load(which: Fixture): void {
    needs = which === "full" ? NEEDS : [];
    updated = which === "none" ? null : UPDATE;
    moved = which === "full" ? MOVED : [];
  }
  load(firstFixture);

  function reset(): void {
    load(fixture);
    generation += 1;
    open = true;
  }

  const feed: CawFeed = {
    live: true,
    connected: true,
    get needs() {
      return needs;
    },
    get updated() {
      return updated;
    },
    get moved() {
      return moved;
    },
    rebalanced: [],
    acknowledge(ids) {
      moved = moved.filter((one) => !ids.includes(one.id));
    },
    dismissUpdate() {
      updated = null;
    },
    actOnUpdate(_notice, action) {
      // Reload here does not reload: the notice goes, as the acknowledgement
      // drops it, and the goodbye stands until Reset.
      if (action === "reload") {
        updated = null;
      }
    },
  };

  /* ── The popover, hanging from his glass ───────────────────────────── */
  /*
   * It hangs from the top bar's own glass (Shell's `[data-bar-group]`, his
   * group on the desk and his tucked tab on a phone), where NeedsCaw hangs
   * it, so it stands where it stands in the product. The glass draws its
   * joined foot while it hangs, as it does for his own panel.
   */
  let open = $state(true);
  let glass = $state<HTMLElement | null>(null);
  let content = $state<HTMLElement | null>(null);
  let neck = $state<Neck>({
    start: 0,
    end: 0,
    flareStart: 0,
    flareEnd: 0,
    flush: "end",
  });
  $effect(() => {
    glass = document.querySelector<HTMLElement>("[data-bar-group]");
  });
  $effect(() => {
    const node = content;
    const anchor = glass;
    if (!(node && anchor)) {
      return;
    }
    const capsule = anchor.querySelector("[data-needs-caw]");
    return hang({
      neckAt: (left) => {
        const box = anchor.getBoundingClientRect();
        const flare =
          Number.parseFloat(
            getComputedStyle(anchor).getPropertyValue("--flare")
          ) || 0;
        return {
          start: box.left - left,
          end: box.right - left,
          flareStart: flare,
          flareEnd: 0,
          flush: "end",
        };
      },
      onneck: (next) => {
        if (!sameNeck(next, neck)) {
          neck = next;
        }
      },
      onshown: (shown) => {
        capsule?.toggleAttribute("data-joined", shown);
      },
    })(node);
  });
</script>

<svelte:head>
  <title>Caw's notices · CawCo</title>
</svelte:head>

<!-- On the desk, and inside the phone frame; the page around the frame has none. -->
{#if glass && (framed || width === "desk")}
  <Popover.Root bind:open>
    {#key generation}
      <Popover.Content
        align="end"
        aria-label="Needs you"
        class="caw-pop kit-hang gap-0"
        collisionPadding={width === "phone"
          ? { top: 12, bottom: 12, left: 12, right: 0 }
          : 8}
        customAnchor={glass}
        data-flush={neck.flush ?? undefined}
        escapeKeydownBehavior="ignore"
        interactOutsideBehavior="ignore"
        side="bottom"
        sideOffset={0}
        style={neckStyle(neck)}
        trapFocus={false}
        bind:ref={content}
      >
        <CawPanel {feed} onchoose={() => undefined} quiet="All caught up" />
      </Popover.Content>
    {/key}
  </Popover.Root>
{/if}

{#if !framed}
  <main>
    <div class="controls">
      <h1>Caw's notices</h1>
      <div class="switch">
        <span>Fixture</span>
        <ToggleGroup.Root
          onValueChange={(next) => {
            if (next) {
              fixture = next as Fixture;
              reset();
            }
          }}
          type="single"
          value={fixture}
        >
          <ToggleGroup.Item value="full"
            >Update, 5 logins, 2 asks</ToggleGroup.Item
          >
          <ToggleGroup.Item value="update">Update only</ToggleGroup.Item>
          <ToggleGroup.Item value="none">Nothing</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <div class="switch">
        <span>Width</span>
        <ToggleGroup.Root
          onValueChange={(next) => {
            if (next) {
              width = next as Width;
            }
          }}
          type="single"
          value={width}
        >
          <ToggleGroup.Item value="desk">Desk popover</ToggleGroup.Item>
          <ToggleGroup.Item value="phone">Phone 390, touch</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <Button label="Reset" onclick={reset} size="sm" variant="outline" />
    </div>
    {#if width === "phone"}
      {#key `${search}:${generation}`}
        <iframe
          class="phone"
          src="/motion/caw-notices?frame&{search}"
          title="Caw's panel on a 390px phone"
        ></iframe>
      {/key}
    {/if}
  </main>
{/if}

<style>
  main {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-6);
    padding: var(--space-5);
  }
  h1 {
    margin: 0;
    font: var(--type-title);
  }
  .controls {
    display: grid;
    gap: var(--space-4);
    justify-items: start;
    max-inline-size: 380px;
  }
  .switch {
    display: grid;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .switch :global([data-slot="toggle-group"]) {
    flex-wrap: wrap;
  }
  .phone {
    inline-size: 390px;
    block-size: 844px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
    background: var(--surface-page);
  }
</style>
