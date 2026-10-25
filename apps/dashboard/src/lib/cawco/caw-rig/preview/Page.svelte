<script lang="ts">
  /**
   * The rig's design preview: Caw alive in each pose at 64, 96 and 160 px,
   * his idle running, by day or by night (the house theme: its tokens
   * resolve on the root, so the page turns whole). The stage takes the pose
   * the switch picks, on the rig's own blend from wherever he stands; below,
   * every pose stands at each size, beside the still he is cut from.
   *
   * `window.preview` is the probe's handle
   * (scripts/probe-kit/specs/caw-rig-preview.ts): every Caw on the page by
   * name, his clock to read, seek and release, and the switches.
   */
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { theme } from "#lib/theme.svelte.js";
  import CawRig from "../CawRig.svelte";
  import { IDLE, type IdleName, POSES, type PoseName } from "../poses";

  const SIZES = [64, 96, 160] as const;
  const POSE_NAMES: Record<PoseName, string> = {
    ready: "Ready",
    waving: "Waving",
    phoneUp: "Phone up",
    cheer: "Cheer",
    shrug: "Shrug",
    letGo: "Let go",
  };
  const IDLE_NAMES: Record<IdleName, string> = {
    calm: "Calm",
    attentive: "Attentive",
  };
  const STILL = `${import.meta.env.BASE_URL}still.png`;
  /** By night, the kit's dark still: the same drawing on its paper rim. */
  const STILL_NIGHT = `${import.meta.env.BASE_URL}still-night.png`;

  let pose = $state<PoseName>("ready");
  let idle = $state<IdleName>("calm");

  /** Every Caw on the page, by name: `stage-<size>` and `pose-<name>-<size>`. */
  const rigs: Record<string, CawRig> = $state({});

  const preview = {
    poses: Object.keys(POSES),
    idles: Object.keys(IDLE),
    still: STILL,
    names: () => Object.keys(rigs),
    clock: (name: string) => rigs[name]?.clockState(),
    seek: (name: string, t: number) => rigs[name]?.seek(t),
    release: (name: string) => rigs[name]?.release(),
    frameAt: (name: string, t: number) => rigs[name]?.frameAt(t),
    pose: (next: PoseName) => {
      pose = next;
    },
    idle: (next: IdleName) => {
      idle = next;
    },
    theme: (scheme: "light" | "dark") => theme.set(scheme),
  };
  (window as unknown as { preview: typeof preview }).preview = preview;
  $effect(() => {
    document.documentElement.dataset.ready = "";
  });
</script>

<div
  class="grid min-h-dvh grid-cols-1 content-start gap-space-6 bg-surface-page p-space-6"
  data-preview="caw-rig"
>
  <header class="grid max-w-c-measure gap-space-4">
    <div class="grid gap-space-1">
      <h1 class="m-0 type-title tracking-title text-balance text-ink-strong">
        Caw, rigged
      </h1>
      <p class="m-0 type-body text-pretty text-ink-muted">
        One drawing cut at his pivots: every pose here is a few numbers on it.
        He breathes, blinks and glances on one clock per Caw, which stops while
        he is off screen; with reduced motion he holds his pose.
      </p>
    </div>
    <div class="flex flex-wrap items-end gap-x-space-6 gap-y-space-3">
      <div class="grid gap-space-1">
        <span class="type-meta text-ink-muted" id="rig-pose">Pose</span>
        <Tabs
          onValueChange={(next) => {
            pose = next as PoseName;
          }}
          size="compact"
          value={pose}
        >
          <TabsList aria-labelledby="rig-pose">
            {#each Object.entries(POSE_NAMES) as [id, name] (id)}
              <TabItem data-pose-pick={id} label={name} value={id} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      <div class="grid gap-space-1">
        <span class="type-meta text-ink-muted" id="rig-idle">Idle</span>
        <Tabs
          onValueChange={(next) => {
            idle = next as IdleName;
          }}
          size="compact"
          value={idle}
        >
          <TabsList aria-labelledby="rig-idle">
            {#each Object.entries(IDLE_NAMES) as [id, name] (id)}
              <TabItem data-idle-pick={id} label={name} value={id} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      <div class="grid gap-space-1">
        <span class="type-meta text-ink-muted" id="rig-theme">Day or night</span
        >
        <Tabs
          onValueChange={(next) =>
            theme.set(next === "night" ? "dark" : "light")}
          size="compact"
          value={theme.resolved === "dark" ? "night" : "day"}
        >
          <TabsList aria-labelledby="rig-theme">
            <TabItem data-theme-pick="day" label="Day" value="day" />
            <TabItem data-theme-pick="night" label="Night" value="night" />
          </TabsList>
        </Tabs>
      </div>
    </div>
  </header>

  <main class="grid grid-cols-1 gap-space-8">
    <div class="flex flex-wrap items-stretch gap-space-4">
      <figure
        class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline"
        data-slot="stage"
      >
        <figcaption class="type-meta text-ink-muted">
          On the stage: {POSE_NAMES[pose]}
        </figcaption>
        <div class="flex flex-wrap items-end gap-space-6">
          {#each SIZES as size (size)}
            <div
              class="grid justify-items-center gap-space-2"
              data-rig-name="stage-{size}"
            >
              <CawRig
                bind:this={rigs[`stage-${size}`]}
                {idle}
                label={size === 160 ? `Caw, ${POSE_NAMES[pose]}` : undefined}
                {pose}
                {size}
              />
              <span class="type-meta tabular-nums text-ink-muted"
                >{size} px</span
              >
            </div>
          {/each}
        </div>
      </figure>
      <figure
        class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline"
        data-still
      >
        <figcaption class="type-meta text-ink-muted">
          The still he is cut from
        </figcaption>
        <!-- mark-line: the still is a picture over its size, not a mark beside words -->
        <div class="grid justify-items-center gap-space-2">
          <img
            class="size-40 object-contain"
            alt="Caw's open-eyed still"
            src={theme.resolved === "dark" ? STILL_NIGHT : STILL}
          />
          <span class="type-meta tabular-nums text-ink-muted">160 px</span>
        </div>
      </figure>
    </div>

    <section class="grid gap-space-4" data-slot="poses">
      <h2 class="m-0 type-label text-balance text-ink-strong">Every pose</h2>
      <div
        class="grid grid-cols-1 gap-space-4 desk:max-wide:grid-cols-2 wide:grid-cols-3"
      >
        {#each Object.keys(POSES) as name (name)}
          {@const id = name as PoseName}
          <figure
            class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline"
            data-pose-card={id}
          >
            <figcaption class="type-meta text-ink-muted">
              {POSE_NAMES[id]}
            </figcaption>
            <div class="flex flex-wrap items-end gap-space-5">
              {#each SIZES as size (size)}
                <div data-rig-name="pose-{id}-{size}">
                  <CawRig
                    bind:this={rigs[`pose-${id}-${size}`]}
                    {idle}
                    pose={id}
                    {size}
                  />
                </div>
              {/each}
            </div>
          </figure>
        {/each}
      </div>
    </section>
  </main>
</div>
