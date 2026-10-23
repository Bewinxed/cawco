<script lang="ts">
  /**
   * OPEN CAWCO AT CAWCO, THE PREVIEW (dev only): the two designs of the
   * cawco address's onboarding step, every state of each, drawn by the real
   * components from their states files (AddressJourney.stories.ts,
   * AddressStatus.stories.ts). Three switches, the real choice points: the
   * design, the state, and Desk (1440) or Phone (390).
   *
   * Desk is this page; Phone is the same frame in a 390px-wide frame of its
   * own (`?frame`), whose viewport is a phone's, so the card's phone rules
   * (`max-phone`) apply there as on a phone. Its height follows what it
   * draws, and a press inside it that moves the journey on moves the
   * caption here.
   *
   * Needs you's states stand as the row in the list it stands in, at Caw's
   * panel's width (`c-panel-w`), over a real NeedsCard row (HTTPS on your
   * tailnet), so Later's row leaving the list is seen closing up. Settings'
   * states stand as the card at the reading measure. Pressing a control
   * that moves the journey on (Sign in, Skip, Get a new link, Check again,
   * Use cawco-1) moves the preview to the state it leads to, so the ticks,
   * the unfolds and the card's height tween are seen live.
   *
   * Every switch is in the URL (`?design=&state=&device=`); `state` takes
   * the state's name or its letter in the design (`?state=E`), so a script
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
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import type { NeedsItem } from "#lib/cawco/home/home-state.svelte.js";
  import NeedsCardSheet from "#lib/cawco/home/NeedsCardSheet.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  type Design = "recommended" | "alternative";
  type Device = "desk" | "phone";
  type Where = "needs" | "settings";
  type JourneyArgs = ComponentProps<typeof AddressJourney>;
  type StatusArgs = ComponentProps<typeof AddressStatus>;

  interface State {
    id: string;
    label: string;
    /** Its letter in the design (A to S); the alternative's, the frame it stands for. */
    letter: string;
    /** The stories it draws, by their desk name; a phone draws `<name>Phone` where it has one. */
    stories: string[];
    where: Where;
  }

  const named = (
    letter: string,
    id: string,
    label: string,
    stories: string[],
    where: Where = "needs"
  ): State => ({ id, letter, label, stories, where });

  const RECOMMENDED: State[] = [
    named("A", "entry", "Entry", ["Entry"]),
    named("B", "waiting", "Waiting", ["Waiting"]),
    named("C", "approval", "Approval", ["Approval"]),
    named("D", "checking", "Checking", ["Checking"]),
    named("E", "ready", "Ready", ["Ready"]),
    named("F", "keep-signed-in", "Keep signed in", ["KeepSignedIn"]),
    named("G", "done", "Done", ["Done"]),
    named("H", "parked", "Parked in Settings", ["Parked"], "settings"),
    named("I", "summary", "Settings summary", ["Summary"], "settings"),
    named("J", "no-network", "No network", ["NoNetwork"], "settings"),
    named("K", "zerotier", "ZeroTier", ["NoWord"], "settings"),
    named("K", "wireguard", "WireGuard", ["WireGuard"], "settings"),
    named("K", "lan", "LAN only", ["Lan"], "settings"),
    named("L", "netbird", "NetBird", ["NetBird"]),
    named("M", "headscale", "Headscale", ["Headscale"]),
    named("N", "link-expired", "Link expired", ["LinkExpired"]),
    named("O", "name-taken", "Name taken", ["NameTaken"]),
    named("P", "no-answer", "Doesn't answer", ["NoAnswer"]),
    named("Q", "key-expired", "Key expired", ["KeyExpired"]),
    named("R", "lapsing", "Before it lapses", ["Lapsing"]),
    named("S", "wrong-tailnet", "Wrong tailnet", ["WrongTailnet"]),
  ];
  const ALTERNATIVE: State[] = [
    // Each by the letter of the recommended frame it stands for: the entry
    // A, joining B, the ticked row G, and the failure P (design.md: "as
    // frame P with the badge after the title").
    named("A", "entry", "Entry", ["Entry"]),
    named("B", "pending", "Pending", ["Pending"]),
    named("G", "ready", "Ready, and the second row", ["Ready", "KeepSignedIn"]),
    named("P", "failure", "Failure", ["Failure"]),
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

  /** The name the tailnet gave CawCo's device once `cawco` was taken. */
  const SUFFIXED = "cawco-1";

  const read = (key: string) => page.url.searchParams.get(key);
  /** This page drawn as the phone's frame, inside the preview. */
  const framed = read("frame") !== null;
  let design = $state<Design>(
    read("design") === "alternative" ? "alternative" : "recommended"
  );
  let device = $state<Device>(
    framed || read("device") === "phone" ? "phone" : "desk"
  );

  /** A state by its name, or by its letter in the design (the first of K's three). */
  function stateOf(said: string | null, of: Design): string {
    const all = STATES[of];
    const found =
      all.find((one) => one.id === said) ??
      all.find(
        (one) => one.letter !== "" && one.letter === said?.toUpperCase()
      );
    return (found ?? all[0]).id;
  }

  /** The state the URL opens at. */
  const opening = stateOf(
    read("state"),
    read("design") === "alternative" ? "alternative" : "recommended"
  );
  let stateId = $state(opening);
  /** The state the person picked: the phone's frame opens at it. */
  let picked = $state(opening);
  const states = $derived(STATES[design]);
  const current = $derived(
    states.find((one) => one.id === stateId) ?? states[0]
  );

  /** Later was pressed: the row has left Needs you, until the next switch. */
  let left = $state(false);
  /** HTTPS was skipped on the way here: the states after it say so. */
  let skippedHttps = $state(false);
  /** Use cawco-1 was pressed: every state after it says cawco-1. */
  let suffixed = $state(false);

  $effect(() => {
    const url = new URL(page.url.href);
    url.searchParams.set("design", design);
    url.searchParams.set("state", current.id);
    if (!framed) {
      url.searchParams.set("device", device);
    }
    goto(url, { state: {}, shallow: true, replace: true });
  });

  // The phone's frame tells the preview where a press moved it.
  $effect(() => {
    if (framed) {
      window.parent.postMessage({ addressState: current.id }, location.origin);
    }
  });

  function choose(
    next: { design?: Design; state?: string; device?: Device },
    onTheWay = false
  ) {
    if (next.design) {
      ({ design } = next);
      stateId = stateOf(stateId, design);
    }
    if (next.state) {
      stateId = next.state;
    }
    if (next.device) {
      ({ device } = next);
    }
    left = false;
    if (!onTheWay) {
      picked = stateId;
      skippedHttps = false;
      suffixed = false;
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
      suffixed ||= done === "use-suffix";
    }
  }

  /** A story's args over its sheet's, the phone's own where it has one, with what was pressed on the way. */
  function argsOf<T>(stories: Record<string, unknown>, name: string): T {
    const meta = (stories.default as { args: object }).args;
    const story = (stories[device === "phone" ? `${name}Phone` : name] ??
      stories[name]) as { args: object } | undefined;
    const args = { ...meta, ...story?.args } as JourneyArgs;
    if (design !== "recommended") {
      return args as T;
    }
    if (skippedHttps) {
      args.place = { ...args.place, https: null };
      args.steps = args.steps?.map((step) =>
        step.step === "https" && step.state !== "waiting"
          ? { ...step, state: "skipped" }
          : step
      );
    }
    if (suffixed) {
      args.word = SUFFIXED;
      args.place = {
        http: args.place.http.replace("//cawco", `//${SUFFIXED}`),
        https: args.place.https?.replace("//cawco.", `//${SUFFIXED}.`) ?? null,
      };
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
    [device === "desk" ? "Desk" : "Phone", current.letter, current.label]
      .filter(Boolean)
      .join(" · ")
  );

  /** The phone's frame: this page at 390px, opened at the state picked. */
  const frameSrc = $derived(
    `${page.url.pathname}?frame&design=${design}&state=${picked}`
  );

  /**
   * The phone's frame takes the height of what it draws, and its presses
   * move the caption: it is this page, on this origin.
   */
  function phoneFrame(frame: HTMLIFrameElement) {
    let sized: FrameObserver | undefined;
    const watch = () => {
      sized?.disconnect();
      const drawn = frame.contentDocument?.querySelector<HTMLElement>(
        "[data-address-preview]"
      );
      if (!drawn) {
        return;
      }
      sized = frameObserver(() => {
        frame.style.height = `${Math.ceil(drawn.getBoundingClientRect().height)}px`;
      });
      sized.observe(drawn);
    };
    const heard = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) {
        return;
      }
      const said = (event.data as { addressState?: string }).addressState;
      if (said) {
        stateId = said;
        // The frame draws once its own module has run: watch it then.
        watch();
      }
    };
    window.addEventListener("message", heard);
    return () => {
      sized?.disconnect();
      window.removeEventListener("message", heard);
    };
  }
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

<!-- What the frame draws: the row in Caw's panel, or the card in Settings. -->
{#snippet stage()}
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
      <!-- Rows part with a hairline, as the panel's rows of one list do
           (CawPanel's Notices). -->
      <ul
        class="m-0 list-none divide-y divide-border-hairline p-0"
        {@attach reflow()}
      >
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
    <!-- Settings: the card at the reading measure, its trailing edge the
         card's. -->
    <div
      class="flex w-full min-w-0 max-w-c-measure flex-col gap-space-6 rounded-lg bg-surface-raised p-space-5 max-phone:p-space-3"
    >
      {#each current.stories as name, index (`${design}:${index}`)}
        {@render piece(name)}
      {/each}
    </div>
  {/if}
{/snippet}

{#if framed}
  <main
    class="flex min-w-0 flex-col bg-surface-page p-space-3"
    data-address-frame="phone"
    data-address-preview
  >
    {@render stage()}
  </main>
{:else}
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
          Two designs for the onboarding step that adds CawCo's own device,
          named cawco, to your tailnet. Every state of each, in the real
          components.
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
      {#if device === "phone"}
        <!-- A phone's own viewport, so its phone rules apply. -->
        <iframe
          class="block w-full rounded-lg ring ring-border-hairline"
          data-address-phone
          src={frameSrc}
          title="{caption}, on a phone"
          {@attach phoneFrame}
        ></iframe>
      {:else}
        {@render stage()}
      {/if}
    </section>
  </main>
{/if}
