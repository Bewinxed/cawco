<script lang="ts">
  /**
   * MODELS CAWCO USES (dev only): Configure's rail beside the section, as
   * /config/models draws it, with the fleet of image-fixtures.ts, for
   * judging and trying without a hub.
   *
   * The section's own reads and saves go through `fetch` as on the hub; here
   * a stand-in answers them: OpenRouter connected, Jev through it, fleet
   * watch on, and the image default as the hub keeps it, checked by the
   * hub's rules (server.ts `PUT /api/image-settings`). Fleet sets what the
   * machines hold; Hub sets how the next save is answered: at once, after a
   * wait, refused with a 500 in the hub's words, or never reaching it.
   */
  import { FLEET_WATCH_LIMITS } from "@cawco/core/fleet-watch";
  import {
    DEFAULT_IMAGE_SETTINGS,
    IMAGE_PROVIDER_MODELS,
    type ImageSettings,
    imageProviderOf,
    offersModelChoice,
  } from "@cawco/core/image-generation";
  import type {
    ImageAccounts,
    ImageMachine,
  } from "@cawco/core/image-readiness";
  import { DAY_MS } from "@cawco/core/time";
  import { imageGenerationWords } from "@cawco/core/words/image-generation";
  import { onDestroy } from "svelte";
  import { z } from "zod";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import {
    ACCOUNTS,
    MACHINES,
    NO_MACHINES,
    READY_ACCOUNTS,
    READY_MACHINES,
  } from "#lib/cawco/config/models/image-fixtures.js";
  import ModelsSection from "#lib/cawco/config/models/ModelsSection.svelte";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";

  provideConfig(new ConfigStore());

  const FLEET_KEYS = ["today", "ready", "empty"] as const;
  type Fleet = (typeof FLEET_KEYS)[number];
  const FLEETS: Record<Fleet, string> = {
    today: "Today: some machines lack a sign-in",
    ready: "Every machine ready",
    empty: "No machine has joined",
  };
  const FLEET_OF: Record<
    Fleet,
    { machines: ImageMachine[]; accounts: ImageAccounts }
  > = {
    today: { machines: MACHINES, accounts: ACCOUNTS },
    ready: { machines: READY_MACHINES, accounts: READY_ACCOUNTS },
    empty: {
      machines: NO_MACHINES,
      accounts: { accounts: [], readings: [], signins: [] },
    },
  };

  const HUB_KEYS = ["answers", "slow", "fails", "unreachable"] as const;
  type Hub = (typeof HUB_KEYS)[number];
  const HUBS: Record<Hub, string> = {
    answers: "Saves at once",
    slow: "Saves after 2 s",
    fails: "Refuses: its database is locked",
    unreachable: "Unreachable",
  };

  let fleet = $state<Fleet>("today");
  let hub = $state<Hub>("answers");

  /** The hub's row: none until a save, so it reads as the default. */
  let kept: ImageSettings = { ...DEFAULT_IMAGE_SETTINGS };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const said = (words: string) =>
    new Response(words, {
      status: 400,
      headers: { "content-type": "text/plain" },
    });
  const wait = (ms: number) =>
    new Promise((settle) => {
      setTimeout(settle, ms);
    });

  /** A save's body, as the hub's route types it. */
  const SAVE = z.object({
    provider: z.string(),
    model: z.string().nullable().optional(),
  });

  /** The hub's checks on a save, as server.ts makes them. */
  function save(body: { provider: string; model?: string | null }) {
    const provider = imageProviderOf(body.provider);
    if (!provider) {
      return said(imageGenerationWords.noSuchProvider(body.provider));
    }
    const model = body.model?.trim() || null;
    const models = IMAGE_PROVIDER_MODELS[provider];
    if (model && !offersModelChoice(provider)) {
      return said(
        imageGenerationWords.settingsNoModelChoice(provider, models[0])
      );
    }
    if (model && !models.includes(model)) {
      return said(
        imageGenerationWords.settingsUnknownModel(provider, model, [...models])
      );
    }
    kept = { provider, model };
    return json(kept);
  }

  async function answer(path: string, init?: RequestInit): Promise<Response> {
    switch (path) {
      case "/api/openrouter":
        return json({ connected: true, connectedAt: Date.now() - DAY_MS });
      case "/api/jev":
        return json({
          route: "openrouter",
          suggestWhileTyping: true,
          typesafe: null,
        });
      case "/api/fleet-watch":
        return json({ on: true, jev: true, limits: FLEET_WATCH_LIMITS });
      case "/api/image-settings": {
        if (init?.method !== "PUT") {
          await wait(300);
          return json(kept);
        }
        const body = SAVE.parse(JSON.parse(String(init.body)));
        if (hub === "unreachable") {
          await wait(600);
          throw new TypeError("Failed to fetch");
        }
        await wait(hub === "slow" ? 2000 : 450);
        if (hub === "fails") {
          // A hub that can't write its row: a 500 in its words.
          return new Response("database is locked", { status: 500 });
        }
        return save(body);
      }
      default:
        return json({}, 404);
    }
  }

  // In the browser only: the server draws the page's first frame (its
  // skeleton), and the section's reads run once it is in the browser.
  if (typeof window !== "undefined") {
    const real = window.fetch;
    window.fetch = new Proxy(real, {
      apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
          location.href
        );
        return url.origin === location.origin &&
          url.pathname.startsWith("/api/")
          ? answer(url.pathname, init)
          : real(input, init);
      },
    });
    onDestroy(() => {
      window.fetch = real;
    });
  }

  const shown = $derived(FLEET_OF[fleet]);
</script>

<svelte:head>
  <title>Models CawCo uses &middot; CawCo</title>
</svelte:head>

<div class="flex min-h-dvh flex-col bg-surface-recess">
  <div
    class="flex flex-wrap items-center gap-space-3 px-space-5 pt-space-4"
    data-slot="bench"
  >
    <label class="flex items-center gap-space-2 type-label text-ink-muted">
      Fleet
      <NativeSelect
        aria-label="Fleet"
        onchange={(event) => {
          const { value } = event.currentTarget;
          fleet = FLEET_KEYS.find((one) => one === value) ?? fleet;
        }}
        value={fleet}
      >
        {#each FLEET_KEYS as value (value)}
          <NativeSelectOption {value}>{FLEETS[value]}</NativeSelectOption>
        {/each}
      </NativeSelect>
    </label>
    <label class="flex items-center gap-space-2 type-label text-ink-muted">
      Hub
      <NativeSelect
        aria-label="Hub"
        onchange={(event) => {
          const { value } = event.currentTarget;
          hub = HUB_KEYS.find((one) => one === value) ?? hub;
        }}
        value={hub}
      >
        {#each HUB_KEYS as value (value)}
          <NativeSelectOption {value}>{HUBS[value]}</NativeSelectOption>
        {/each}
      </NativeSelect>
    </label>
  </div>
  <!-- Configure's frame (routes/(app)/config/+layout.svelte): the rail on a
       desk, the section's pane beside it. -->
  <div class="flex min-h-0 min-w-0 flex-auto">
    <div class="flex min-h-0 py-space-2 pl-space-5 max-desk:hidden">
      <ConfigRail current="models" />
    </div>
    <div class="flex min-h-0 min-w-0 flex-auto flex-col">
      <ModelsSection accounts={shown.accounts} machines={shown.machines} />
    </div>
  </div>
</div>
