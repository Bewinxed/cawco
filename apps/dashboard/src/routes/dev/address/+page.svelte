<script lang="ts">
  /**
   * OPEN CAWCO AT CAWCO, THE PREVIEW (dev only): the two designs of the
   * cawco address's onboarding step, every state of each, drawn by the real
   * components from their states files (AddressJourney.stories.ts,
   * AddressStatus.stories.ts). Three switches, the real choice points: the
   * design, the state, and Desk (1440) or Phone (390).
   *
   * Needs you's states stand as the row in the list it stands in, at Caw's
   * panel's width (`c-panel-w`), over a real NeedsCard row (HTTPS on your
   * tailnet), so Later's row leaving the list is seen closing up. Settings'
   * states stand as the card at the page's width. Pressing a control that
   * moves the journey on (Sign in, Skip, Get a new link, Check again)
   * moves the preview to the state it leads to, so the ticks, the unfolds
   * and the card's height tween are seen live.
   *
   * Every switch is in the URL (`?design=&state=&device=`), so a script
   * opens any state directly.
   */
  import { tailnetWords } from "@cawco/core";
  import type { ComponentProps } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: a states file is read whole, every story by its name
  import * as journeyStories from "#lib/cawco/address/AddressJourney.stories.js";
  import AddressJourney from "#lib/cawco/address/AddressJourney.svelte";
  // biome-ignore lint/performance/noNamespaceImport: a states file is read whole, every story by its name
  import * as statusStories from "#lib/cawco/address/AddressStatus.stories.js";
  import AddressStatus from "#lib/cawco/address/AddressStatus.svelte";
  import type { AddressAct } from "#lib/cawco/address/model.js";
  import type { NeedsItem } from "#lib/cawco/home/home-state.svelte.js";
  import NeedsCardSheet from "#lib/cawco/home/NeedsCardSheet.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  type Design = "recommended" | "alternative";
  type Device = "desk" | "phone";
  type Where = "needs" | "settings";
  type JourneyArgs = ComponentProps<typeof AddressJourney>;
  type StatusArgs = ComponentProps<typeof AddressStatus>;

  interface State {
    id: string;
    label: string;
    /** Its letter in the design (A to S), the alternative's none. */
    letter: string;
    /** The stories it draws, by their desk name; a phone draws `<name>Phone` where it has one. */
    stories: string[];
    where: Where;
  }

  const RECOMMENDED: State[] = [
    {
      id: "entry",
      letter: "A",
      label: "Entry",
      where: "needs",
      stories: ["Entry"],
    },
    {
      id: "waiting",
      letter: "B",
      label: "Waiting",
      where: "needs",
      stories: ["Waiting"],
    },
    {
      id: "approval",
      letter: "C",
      label: "Approval",
      where: "needs",
      stories: ["Approval"],
    },
    {
      id: "checking",
      letter: "D",
      label: "Checking",
      where: "needs",
      stories: ["Checking"],
    },
    {
      id: "ready",
      letter: "E",
      label: "Ready",
      where: "needs",
      stories: ["Ready"],
    },
    {
      id: "keep-signed-in",
      letter: "F",
      label: "Keep signed in",
      where: "needs",
      stories: ["KeepSignedIn"],
    },
    {
      id: "done",
      letter: "G",
      label: "Done",
      where: "needs",
      stories: ["Done"],
    },
    {
      id: "parked",
      letter: "H",
      label: "Parked in Settings",
      where: "settings",
      stories: ["Parked"],
    },
    {
      id: "summary",
      letter: "I",
      label: "Settings summary",
      where: "settings",
      stories: ["Summary"],
    },
    {
      id: "no-network",
      letter: "J",
      label: "No network",
      where: "settings",
      stories: ["NoNetwork"],
    },
    {
      id: "no-word",
      letter: "K",
      label: "ZeroTier, WireGuard, LAN",
      where: "settings",
      stories: ["NoWord", "WireGuard", "Lan"],
    },
    {
      id: "netbird",
      letter: "L",
      label: "NetBird",
      where: "needs",
      stories: ["NetBird"],
    },
    {
      id: "headscale",
      letter: "M",
      label: "Headscale",
      where: "needs",
      stories: ["Headscale"],
    },
    {
      id: "link-expired",
      letter: "N",
      label: "Link expired",
      where: "needs",
      stories: ["LinkExpired"],
    },
    {
      id: "name-taken",
      letter: "O",
      label: "Name taken",
      where: "needs",
      stories: ["NameTaken"],
    },
    {
      id: "no-answer",
      letter: "P",
      label: "Doesn't answer",
      where: "needs",
      stories: ["NoAnswer"],
    },
    {
      id: "key-expired",
      letter: "Q",
      label: "Key expired",
      where: "needs",
      stories: ["KeyExpired"],
    },
    {
      id: "lapsing",
      letter: "R",
      label: "Before it lapses",
      where: "needs",
      stories: ["Lapsing"],
    },
    {
      id: "wrong-tailnet",
      letter: "S",
      label: "Wrong tailnet",
      where: "needs",
      stories: ["WrongTailnet"],
    },
  ];
  const ALTERNATIVE: State[] = [
    {
      id: "entry",
      letter: "",
      label: "Entry",
      where: "needs",
      stories: ["Entry"],
    },
    {
      id: "pending",
      letter: "",
      label: "Pending",
      where: "needs",
      stories: ["Pending"],
    },
    {
      id: "ready",
      letter: "",
      label: "Ready, and the second row",
      where: "needs",
      stories: ["Ready", "KeepSignedIn"],
    },
    {
      id: "failure",
      letter: "",
      label: "Failure",
      where: "needs",
      stories: ["Failure"],
    },
  ];
  const STATES: Record<Design, State[]> = {
    recommended: RECOMMENDED,
    alternative: ALTERNATIVE,
  };

  /** Where a press on a control moves the recommended journey, as the hub would. */
  const NEXT: Partial<Record<AddressAct, Partial<Record<string, string>>>> = {
    "sign-in": { entry: "waiting", "link-expired": "waiting" },
    "skip-https": { ready: "keep-signed-in", parked: "keep-signed-in" },
    "skip-expiry": { "keep-signed-in": "done" },
    "new-link": { "link-expired": "entry" },
    "check-again": { "no-answer": "checking" },
    "use-suffix": { "name-taken": "checking" },
    "sign-in-again": { "key-expired": "checking", "wrong-tailnet": "entry" },
  };

  const read = (key: string) => page.url.searchParams.get(key);
  let design = $state<Design>(
    read("design") === "alternative" ? "alternative" : "recommended"
  );
  let device = $state<Device>(read("device") === "phone" ? "phone" : "desk");
  let stateId = $state(read("state") ?? "entry");
  const states = $derived(STATES[design]);
  const current = $derived(
    states.find((one) => one.id === stateId) ?? states[0]
  );

  /** Later was pressed: the row has left Needs you, until the next switch. */
  let left = $state(false);
  /** HTTPS was skipped on the way here: the states after it say so. */
  let skippedHttps = $state(false);

  $effect(() => {
    const url = new URL(page.url.href);
    url.searchParams.set("design", design);
    url.searchParams.set("state", current.id);
    url.searchParams.set("device", device);
    replaceState(url, {});
  });

  function choose(
    next: { design?: Design; state?: string; device?: Device },
    onTheWay = false
  ) {
    if (next.design) {
      ({ design } = next);
      if (!STATES[design].some((one) => one.id === stateId)) {
        stateId = "entry";
      }
    }
    if (next.state) {
      stateId = next.state;
    }
    if (next.device) {
      ({ device } = next);
    }
    left = false;
    if (!onTheWay) {
      skippedHttps = false;
    }
  }

  function act(done: AddressAct) {
    if (done === "later") {
      left = true;
      return;
    }
    const to = NEXT[done]?.[current.id];
    if (design === "recommended" && to) {
      choose({ state: to }, true);
      skippedHttps ||= done === "skip-https";
    }
  }

  /** A story's args over its sheet's, the phone's own where it has one. */
  function argsOf<T>(stories: Record<string, unknown>, name: string): T {
    const meta = (stories.default as { args: object }).args;
    const story = (stories[device === "phone" ? `${name}Phone` : name] ??
      stories[name]) as { args: object } | undefined;
    const args = { ...meta, ...story?.args } as JourneyArgs;
    if (skippedHttps && design === "recommended") {
      args.place = { ...args.place, https: null };
      args.steps = args.steps?.map((step) =>
        step.step === "https" && step.state !== "waiting"
          ? { ...step, state: "skipped" }
          : step
      );
    }
    return args as T;
  }
  const sheet = $derived(
    (design === "recommended" ? journeyStories : statusStories) as Record<
      string,
      unknown
    >
  );

  /** A real Needs you row under the address's: HTTPS on your tailnet, its operator step standing. */
  const neighbour: NeedsItem = {
    kind: "tailnet",
    key: "tailnet:https",
    done: false,
    title: tailnetWords.title,
    place: "Onboarding",
    raisedAt: undefined,
    tailnet: {
      host: "obelisk-of-light",
      state: "needs",
      step: "operator",
      steps: [
        { step: "enable-https", done: true },
        {
          step: "operator",
          done: false,
          command: "sudo tailscale set --operator=$USER",
        },
      ],
    },
  };

  const caption = $derived(
    `${device === "desk" ? "Desk" : "Phone"} · ${current.label}`
  );
</script>

<svelte:head>
  <title>Open CawCo at cawco · preview</title>
</svelte:head>

{#snippet piece(name: string)}
  {#if design === "recommended"}
    <AddressJourney {...argsOf<JourneyArgs>(sheet, name)} onact={act} />
  {:else}
    <AddressStatus {...argsOf<StatusArgs>(sheet, name)} onact={act} />
  {/if}
{/snippet}

<main
  class="flex min-h-dvh min-w-0 flex-col gap-space-5 bg-surface-page p-space-5 max-phone:p-space-3"
  data-address-preview
>
  <header class="flex min-w-0 flex-col gap-space-4">
    <div class="flex min-w-0 flex-col gap-space-1">
      <h1 class="m-0 type-title text-ink-strong text-balance">
        Open CawCo at <code class="font-mono">cawco</code>
      </h1>
      <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
        Two designs for the onboarding step that adds CawCo's own device, named
        cawco, to your tailnet. Every state of each, in the real components.
      </p>
    </div>
    <div class="flex min-w-0 flex-wrap items-end gap-x-space-5 gap-y-space-3">
      <div class="grid min-w-0 gap-space-1 type-meta text-ink-muted">
        <span id="address-design">Design</span>
        <ToggleGroup.Root
          aria-labelledby="address-design"
          onValueChange={(next) => {
            if (next) {
              choose({ design: next as Design });
            }
          }}
          type="single"
          value={design}
        >
          <ToggleGroup.Item value="recommended">Recommended</ToggleGroup.Item>
          <ToggleGroup.Item value="alternative">Alternative</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <div class="grid min-w-0 gap-space-1 type-meta text-ink-muted">
        <label for="address-state">State</label>
        <NativeSelect.Root
          id="address-state"
          measure="shrink"
          onchange={(event) => choose({ state: event.currentTarget.value })}
          value={current.id}
        >
          {#each states as one (one.id)}
            <NativeSelect.Option value={one.id}
              >{one.letter
                ? `${one.letter} · `
                : ""}{one.label}</NativeSelect.Option
            >
          {/each}
        </NativeSelect.Root>
      </div>
      <div class="grid min-w-0 gap-space-1 type-meta text-ink-muted">
        <span id="address-device">Width</span>
        <ToggleGroup.Root
          aria-labelledby="address-device"
          onValueChange={(next) => {
            if (next) {
              choose({ device: next as Device });
            }
          }}
          type="single"
          value={device}
        >
          <ToggleGroup.Item value="desk">Desk 1440</ToggleGroup.Item>
          <ToggleGroup.Item value="phone">Phone 390</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
    </div>
  </header>

  <section
    aria-labelledby="address-caption"
    class={[
      "flex min-w-0 flex-col gap-space-3",
      device === "phone" ? "w-c-bench-phone-w max-w-full" : "w-full",
    ]}
    data-address-frame={device}
  >
    <div class="flex min-w-0 flex-col gap-space-1">
      <h2
        class="m-0 type-label text-ink-strong"
        data-address-caption
        id="address-caption"
      >
        {caption}
      </h2>
      <p class="m-0 type-meta text-ink-muted">
        {current.where === "needs"
          ? "In Needs you, Caw's panel"
          : "In Settings"}
      </p>
    </div>
    {#if current.where === "needs"}
      <!-- Caw's panel's width and its padding, on its raised surface: at
           the desk it hangs at the trailing edge, as it does under Caw. -->
      <div
        class={[
          "max-w-full rounded-lg bg-surface-raised p-space-2",
          device === "desk" ? "ms-auto w-c-panel-w" : "w-full",
        ]}
        {@attach morph()}
      >
        <ul class="m-0 list-none p-0" {@attach reflow()}>
          {#if !left}
            <!-- Keyed by place, not by state: a switch to the next state
                 is the same row drawn with the hub's next journey, so its
                 ticks land and its steps unfold in place. -->
            {#each current.stories as name, index (`${design}:${index}`)}
              <li data-flip in:unfold|global out:unfold|global>
                <!-- NeedsCard's row box, as its relay row draws the
                     journey's card in it. -->
                <div
                  class="rounded-sm px-space-3 py-space-2"
                  data-kind="address"
                  data-slot="row"
                >
                  {@render piece(name)}
                </div>
              </li>
            {/each}
          {/if}
          <li data-flip>
            <NeedsCardSheet
              item={neighbour}
              onchoose={() => undefined}
              stale={false}
            />
          </li>
        </ul>
      </div>
    {:else}
      <div
        class="flex min-w-0 flex-col gap-space-6 rounded-lg bg-surface-raised p-space-5 max-phone:p-space-3"
      >
        {#each current.stories as name, index (`${design}:${index}`)}
          {@render piece(name)}
        {/each}
      </div>
    {/if}
  </section>
</main>
