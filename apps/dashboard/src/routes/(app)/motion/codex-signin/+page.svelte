<script lang="ts">
  /**
   * CODEX SIGN-IN — Configure › Accounts with a ChatGPT account open, from
   * fixtures, no hub: Codex's own sign-in as a row of its own under each
   * machine that runs Codex (the owner's pick "A row per sign-in",
   * 2026-11-17). niftybot.art is signed in for both, obelisk-of-light for
   * pi and OpenCode with its Codex sign-in open and its code waiting,
   * Omars-MacBook-Pro offline, uwucloud runs pi alone and is signed out.
   * `?theme=light|dark` sets the scheme; `?open=none` puts the popover away.
   *
   * The Codex routes are answered here as the hub answers them (`fetch` for
   * their paths only): Start again mints `ABCD-1234` anew; the wait says
   * `pending` for four seconds, then signed in as the account; Sign Codex
   * out answers ok and the row goes back to Not signed in.
   */
  import type {
    Account,
    AccountSignin,
    ProviderChoice,
  } from "@cawco/core/accounts";
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import { MINUTE_MS } from "@cawco/core/time";
  import { accountsWords } from "@cawco/core/words/accounts";
  import { onMount } from "svelte";
  import AccountEditor from "#lib/cawco/accounts/AccountEditor.svelte";
  import { codexFlow } from "#lib/cawco/accounts/flows.svelte.js";
  import { benchClaudeReport } from "#lib/cawco/bench-reports.js";
  import { standBench } from "#lib/cawco/bench-stand.js";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import { accountsState } from "#lib/cawco/stores/accounts.svelte.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { writeJson } from "#lib/platform/storage.js";
  import { page } from "$app/state";

  const NOW = Date.now();
  provideConfig(new ConfigStore());
  const section = sectionOf("accounts");

  const report = (
    harness: HarnessKind
  ): NonNullable<Machine["harnesses"]>[number] => ({
    ...benchClaudeReport,
    harness,
  });
  const machine = (
    machineId: string,
    hostname: string,
    harnesses: HarnessKind[],
    online = true
  ): Machine => ({
    machineId,
    hostname,
    os: "linux-x64",
    status: online ? "online" : "offline",
    auth: "authenticated",
    joinedAt: 0,
    pausedUntil: null,
    pauseStopped: null,
    harnesses: harnesses.map(report),
  });
  const MACHINES: Machine[] = [
    machine("m-nifty", "niftybot.art", ["claude", "pi", "opencode", "codex"]),
    machine("m-obelisk", "obelisk-of-light", [
      "claude",
      "pi",
      "opencode",
      "codex",
    ]),
    machine(
      "m-omar",
      "Omars-MacBook-Pro",
      ["claude", "opencode", "codex"],
      false
    ),
    machine("m-uwu", "uwucloud", ["claude", "pi"]),
  ];

  const account = (
    id: string,
    provider: string,
    kind: Account["kind"],
    email: string,
    label: string | null,
    hue: Account["hue"],
    order: number
  ): Account => ({
    atPlanLimit: "move",
    createdAt: NOW - 40 * 24 * 60 * MINUTE_MS,
    email,
    hue,
    id,
    identity: { email, organization: "Lumen Studio", orgId: `org-${id}` },
    kind,
    label,
    neverBackup: false,
    order,
    provider,
    reservePct: null,
    sessionReservePct: null,
  });
  const MAYA = account(
    "acc-maya",
    "openai-codex",
    "oauth",
    "maya.okafor@lumenstudio.co",
    null,
    "cyan",
    0
  );
  const ACCOUNTS: Account[] = [
    MAYA,
    account(
      "acc-studio",
      "openai-codex",
      "oauth",
      "studio@lumenstudio.co",
      "Studio Pro",
      "violet",
      1
    ),
    account("acc-key", "openai", "api_key", "…k7Qm", "Ops key", "amber", 2),
  ];
  const signin = (
    accountId: string,
    machineId: string,
    state: AccountSignin["state"]
  ): AccountSignin => ({
    accountId,
    checkedAt: NOW,
    machineId,
    movedAt: null,
    movedFrom: null,
    reason: null,
    refusalReach: null,
    state,
  });
  const CHATGPT: ProviderChoice = {
    provider: "openai-codex",
    kind: "oauth",
    name: "ChatGPT",
    signin: "device-code",
    harnesses: ["pi", "opencode", "codex"],
    limits: true,
  };

  accountsState.accountProviders = [
    CHATGPT,
    {
      provider: "openai",
      kind: "api_key",
      name: "OpenAI",
      signin: "api-key",
      harnesses: ["pi", "opencode", "codex"],
      limits: false,
    },
  ];
  accountsState.accounts = {
    access: [],
    accounts: ACCOUNTS,
    bench: [],
    catalogFaults: [],
    catalogs: [],
    codexLeaving: [],
    codexSignins: [
      { accountId: "acc-maya", machineId: "m-nifty" },
      { accountId: "acc-maya", machineId: "m-omar" },
    ],
    credit: [],
    pending: [],
    readings: [],
    rebalances: [],
    routing: [],
    signins: [
      signin("acc-maya", "m-nifty", "signed-in"),
      signin("acc-maya", "m-obelisk", "signed-in"),
      signin("acc-maya", "m-omar", "signed-in"),
      signin("acc-maya", "m-uwu", "signed-out"),
    ],
  };

  // obelisk-of-light's Codex sign-in is open, its code waiting.
  writeJson(
    "cawco:account-signin",
    {
      on:
        page.url.searchParams.get("open") === "none"
          ? null
          : "acc-maya:m-obelisk:codex",
    },
    "session"
  );
  const own = () => Promise.resolve(MAYA.id);
  const codex = codexFlow(own, MAYA.id, "m-obelisk");
  codex.expiresAt = NOW + 12 * MINUTE_MS + 41_000;

  /** The bench's hub, at the Codex routes and the accounts read alone. */
  const CODEX_ROUTE =
    /^\/api\/accounts\/([^/]+)\/machines\/([^/]+)\/codex-signin(\/complete)?$/u;
  /** How long after a code is minted the bench's person has entered it. */
  const ENTERED_MS = 20_000;
  let mintedAt = NOW;
  const wait = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  function answer(url: URL, method: string): Promise<Response> | undefined {
    if (url.pathname === "/api/accounts" && method === "GET") {
      return Promise.resolve(Response.json(accountsState.accounts));
    }
    if (url.pathname === "/api/accounts/providers" && method === "GET") {
      return Promise.resolve(Response.json(accountsState.accountProviders));
    }
    const route = CODEX_ROUTE.exec(url.pathname);
    const view = accountsState.accounts;
    if (!(route && view)) {
      return undefined;
    }
    const [, accountId, machineId, complete] = route;
    const others = view.codexSignins.filter(
      (one) => !(one.accountId === accountId && one.machineId === machineId)
    );
    if (method === "DELETE") {
      view.codexSignins = others;
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (!complete) {
      mintedAt = Date.now();
      return Promise.resolve(
        Response.json({
          expiresAt: mintedAt + 15 * MINUTE_MS,
          userCode: "ABCD-1234",
          verificationUrl: "https://auth.openai.com/codex/device",
        })
      );
    }
    return wait(1500).then(() => {
      if (Date.now() - mintedAt < ENTERED_MS) {
        return Response.json({ state: "pending" });
      }
      view.codexSignins = [...others, { accountId, machineId }];
      return Response.json({
        state: "signed-in",
        email: MAYA.email,
        identity: null,
        plan: "plus",
      });
    });
  }

  onMount(() => {
    const fetchWas = window.fetch;
    window.fetch = new Proxy(fetchWas, {
      apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          location.href
        );
        const method =
          init?.method ?? (input instanceof Request ? input.method : "GET");
        return answer(url, method.toUpperCase()) ?? fetchWas(input, init);
      },
    });
    // The code shown at first is waited on as the hub's kept one is.
    codex.resume({
      accountId: MAYA.id,
      machineId: "m-obelisk",
      codex: true,
      challenge: {
        expiresAt: codex.expiresAt,
        userCode: "ABCD-1234",
        verificationUrl: "https://auth.openai.com/codex/device",
      },
      expiresAt: codex.expiresAt,
    });
    standBench(page.url.searchParams.get("theme"), MACHINES);
    return () => {
      window.fetch = fetchWas;
    };
  });
</script>

<div
  class="flex min-h-0 min-w-0 flex-auto bg-surface-recess"
  data-bench="codex-signin"
>
  <div class="flex min-h-0 py-space-2 pl-space-5 max-desk:hidden">
    <ConfigRail current="accounts" />
  </div>
  <div
    data-slot="pane"
    class="grid min-h-0 min-w-0 flex-auto grid-cols-1 grid-rows-1 overflow-hidden"
  >
    <div
      class="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col bg-surface-recess"
    >
      <EditorRoute
        found
        loaded
        problem={null}
        saveLabel={accountsWords.editor.save}
        {section}
        what={accountsWords.editor.what}
      >
        <AccountEditor account={MAYA} />
      </EditorRoute>
    </div>
  </div>
</div>
