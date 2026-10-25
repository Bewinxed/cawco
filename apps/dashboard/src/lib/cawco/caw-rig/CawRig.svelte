<script lang="ts">
  /**
   * Caw, alive: his rig (assets/mascot/rig/caw-rig.svg, the same paths in
   * art.ts) drawn as one SVG, every layer turned about its pivot by rig.ts
   * on one clock. He holds `pose` and lives over it with `idle`: he breathes,
   * blinks every three or four seconds, glances and sways a little, and
   * never freezes. A new pose is reached on ease-in-out from wherever he
   * stands, so nothing teleports. His clock runs only while he is on screen,
   * the tab is shown and motion is allowed; with reduced motion he stands
   * still on his pose (frame 0), and a new pose is simply there.
   *
   * `size` is his 512 still box in CSS px; raised wings and props draw past
   * it, unclipped. By night he wears the house's paper rim, one device pixel
   * or the kit's 5.31 units, whichever is wider (assets/mascot/README.md).
   */
  import { onMount } from "svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { CAW_ART } from "./art";
  import { LoopClock, seeded } from "./motion";
  import {
    IDLE,
    type IdleName,
    POSES,
    type Pose,
    type PoseName,
    PROPS,
  } from "./poses";
  import {
    type Blend,
    idleTracks,
    matrixText,
    type PropFrame,
    type RigFrame,
    retarget,
    settled,
    solve,
  } from "./rig";

  let {
    pose = "ready",
    idle = "calm",
    size = 160,
    scheme,
    label,
    class: className,
  }: {
    /** A pose by name (poses.ts) or a pose of your own. */
    pose?: PoseName | Pose;
    idle?: IdleName;
    /** His 512 still box, CSS px. */
    size?: number;
    /** Day or night; the house's scheme when not given. */
    scheme?: "light" | "dark";
    /** What a screen reader hears; with none he is decoration. */
    label?: string;
    class?: string;
  } = $props();

  const A = CAW_ART;
  const EYES = ["big", "small"] as const;
  /** SVG ids are global to the page: each Caw names his clips and rim with his own. */
  const id = $props.id();
  const uid = `caw-rig-${id}`;
  /** The kit's dark rim, in the still's units (assets/mascot/README.md). */
  const KIT_RIM = 5.31;

  const night = $derived((scheme ?? theme.resolved) === "dark");
  const target = $derived<Pose>(typeof pose === "string" ? POSES[pose] : pose);
  let dpr = $state(1);
  const rim = $derived(Math.max(KIT_RIM, 512 / (size * dpr)));

  let svg = $state<SVGSVGElement | null>(null);
  /**
   * The props on screen: their keys and shapes, kept as the blend names them.
   * (Not `props`: beside `$props` that name reads as a store's subscription.)
   */
  let shown = $state<PropFrame[]>([]);

  let tracks = idleTracks(IDLE[idle]);
  let blend: Blend = settled(target);
  /** The blend clock, ms: it runs with the loop clock and holds with it. */
  let now = 0;
  let layers = new Map<string, SVGGraphicsElement>();
  let last: RigFrame | undefined;

  /** His own place in the loop, from his id: Caws that share a screen never blink in step. */
  const phase = seeded(
    [...id].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7) % 9973
  );
  const clock = new LoopClock(
    tracks.idle.period,
    (t, dt) => {
      now += dt;
      draw(solve(t, now, blend, tracks));
    },
    phase * tracks.idle.period
  );

  function draw(frame: RigFrame): void {
    last = frame;
    if (layers.size === 0) {
      return;
    }
    for (const [name, m] of Object.entries(frame.m)) {
      layers.get(name)?.setAttribute("transform", matrixText(m));
    }
    for (const name of ["big", "small"] as const) {
      const e = frame.eyes[name];
      const art = A.eyes[name];
      layers
        .get(`pupil-${name}`)
        ?.setAttribute("transform", `translate(${e.pupil[0]} ${e.pupil[1]})`);
      layers.get(`upper-${name}`)?.setAttribute("height", String(e.upper));
      const lower = layers.get(`lower-${name}`);
      lower?.setAttribute("y", String(art.bottom - e.lower));
      lower?.setAttribute("height", String(e.lower));
      layers.get(`closed-${name}`)?.setAttribute("opacity", String(e.closed));
    }
    layers
      .get("line-wingL")
      ?.setAttribute("opacity", String(frame.lines.wingL));
    layers
      .get("line-wingR")
      ?.setAttribute("opacity", String(frame.lines.wingR));
    // A prop that changes home (from his wing to the ground) is drawn there anew, in place.
    const homes = (list: PropFrame[]) =>
      list.map((p) => `${p.key}@${p.home}`).join();
    if (homes(frame.props) !== homes(shown)) {
      shown = frame.props;
    }
    for (const p of frame.props) {
      layers.get(`prop-${p.key}`)?.setAttribute("transform", matrixText(p.m));
    }
  }

  /** Every moving layer, by the name rig.ts gives it, read once the SVG is drawn. */
  function collect(root: SVGSVGElement): void {
    layers = new Map();
    for (const el of root.querySelectorAll<SVGGraphicsElement>(
      "[data-layer]"
    )) {
      layers.set(el.dataset.layer as string, el);
    }
  }

  // A new pose: from wherever he stands now, on ease-in-out; with reduced
  // motion, or nothing running to show it, it is simply there.
  $effect(() => {
    const next = target;
    if (next === blend.to) {
      return;
    }
    blend =
      clock.state.live || clock.state.held
        ? retarget(blend, now, next)
        : settled(next);
    clock.redraw();
  });

  $effect(() => {
    tracks = idleTracks(IDLE[idle]);
    clock.period = tracks.idle.period;
    clock.redraw();
  });

  // Props come and go with the blend: once their nodes exist, draw them.
  $effect(() => {
    if (shown.length > 0 && svg) {
      collect(svg);
      if (last) {
        draw(last);
      }
    }
  });

  onMount(() => {
    // The rim's one device pixel follows the screen's ratio (zoom changes it, and fires resize).
    const syncRatio = () => {
      dpr = window.devicePixelRatio;
    };
    syncRatio();
    window.addEventListener("resize", syncRatio);
    if (svg) {
      collect(svg);
    }
    const stop = clock.watch(svg as Element);
    return () => {
      stop();
      window.removeEventListener("resize", syncRatio);
    };
  });

  /** For a probe: the clock's state (its time, frames drawn, whether it runs and why not). */
  export function clockState() {
    return { ...clock.state, period: clock.period, now };
  }

  /** For a probe: hold the clock at `t` ms into the idle loop and draw that frame. */
  export function seek(t: number): void {
    clock.seek(t);
  }

  /** For a probe: let a held clock run on. */
  export function release(): void {
    clock.release();
  }

  /** For a probe: the rig's numbers at loop time `t`, without drawing them. */
  export function frameAt(t: number): RigFrame {
    return solve(t, now, blend, tracks);
  }

  /** For a probe: the rig's numbers `ms` into the pose change now running, at the clock's time. */
  export function frameInBlend(ms: number): RigFrame {
    return solve(clock.state.t, blend.start + ms, blend, tracks);
  }
</script>

<!-- A prop, held under a wing's primaries (their tips curl over it) or standing on the ground. -->
{#snippet prop(p: PropFrame)}
  <g data-layer="prop-{p.key}" data-part="prop" transform={matrixText(p.m)}>
    {#each PROPS[p.prop].shapes as shape, i (i)}
      {#if shape.ink === "paper"}
        <path class="fill-paper" d={shape.d} />
      {:else}
        <path d={shape.d} fill={A.inks.black} />
      {/if}
    {/each}
  </g>
{/snippet}

<div
  class={["relative size-(--caw-size) shrink-0", className]}
  style:--caw-size="{size}px"
  data-caw-rig
  data-pose={typeof pose === "string" ? pose : "custom"}
  data-idle={idle}
  data-scheme={night ? "dark" : "light"}
>
  <svg
    bind:this={svg}
    class="size-full overflow-visible text-paper"
    viewBox="0 0 512 512"
    aria-hidden={label ? undefined : "true"}
    aria-label={label}
    role={label ? "img" : undefined}
  >
    <defs>
      <clipPath id="{uid}-head"><path d={A.head.black} /></clipPath>
      <clipPath id="{uid}-lid-big"><path d={A.eyes.big.lid} /></clipPath>
      <clipPath id="{uid}-lid-small"><path d={A.eyes.small.lid} /></clipPath>
      <!-- The ground line under his feet: a standing prop rises from below it. -->
      <clipPath id="{uid}-ground"
        ><rect height="882" width="912" x="-200" y="-400" /></clipPath
      >
      <filter
        id="{uid}-rim"
        color-interpolation-filters="sRGB"
        filterUnits="userSpaceOnUse"
        height="832"
        width="832"
        x="-160"
        y="-160"
      >
        <!-- A thin feather tip or a beak's open edge is only partly inked at a
             small size: made solid first, the rim round it is whole, never a
             faint broken edge. -->
        <feComponentTransfer in="SourceAlpha" result="solid">
          <feFuncA slope="6" type="linear" />
        </feComponentTransfer>
        <feMorphology
          in="solid"
          operator="dilate"
          radius={rim}
          result="grown"
        />
        <!-- The house paper, through the svg's own colour (text-paper). -->
        <feFlood flood-color="currentColor" />
        <feComposite in2="grown" operator="in" result="rim" />
        <feMerge>
          <feMergeNode in="rim" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g data-part="caw" filter={night ? `url(#${uid}-rim)` : undefined}>
      <g data-layer="tail" data-part="tail">
        <path d={A.tail.black} fill={A.inks.black} />
        <path d={A.tail.line.d} fill={A.tail.line.ink} />
      </g>
      <g data-layer="legL" data-part="foot" data-side="L">
        <path d={A.legL.black} fill={A.inks.black} />
      </g>
      <g data-layer="legR" data-part="foot" data-side="R">
        <path d={A.legR.black} fill={A.inks.black} />
      </g>
      <g data-layer="body" data-part="body">
        <path d={A.body.black} fill={A.inks.black} />
        <path
          d={A.body.lines.wingL.d}
          data-layer="line-wingL"
          fill={A.body.lines.wingL.ink}
        />
        <path
          d={A.body.lines.wingR.d}
          data-layer="line-wingR"
          fill={A.body.lines.wingR.ink}
        />
        <g data-layer="wingR" data-part="wing" data-side="R">
          <g data-layer="handR" data-part="primaries">
            {#each shown.filter((p) => p.home === "handR") as p (p.key)}
              {@render prop(p)}
            {/each}
            <path d={A.wingR.hand.vermilion} fill={A.inks.vermilion} />
          </g>
          <path d={A.wingR.arm.black} fill={A.inks.black} />
        </g>
        <g data-layer="head" data-part="head">
          <path d={A.head.black} fill={A.inks.black} />
          <g data-layer="tuft" data-part="tuft">
            <path d={A.tuft.black} fill={A.inks.black} />
          </g>
          <g clip-path="url(#{uid}-head)">
            <g data-layer="face" data-part="face">
              {#each EYES as name (name)}
                {@const e = A.eyes[name]}
                <g data-eye={name} data-part="eye">
                  <path d={e.white} fill={A.inks.white} />
                  <g clip-path="url(#{uid}-lid-{name})">
                    <g data-layer="pupil-{name}">
                      <path d={e.pupil} fill={A.inks.black} />
                    </g>
                  </g>
                  <g clip-path="url(#{uid}-lid-{name})">
                    <rect
                      data-layer="upper-{name}"
                      fill={A.inks.black}
                      height="0"
                      width={e.right - e.left}
                      x={e.left}
                      y={e.top}
                    />
                    <rect
                      data-layer="lower-{name}"
                      fill={A.inks.black}
                      height="0"
                      width={e.right - e.left}
                      x={e.left}
                      y={e.bottom}
                    />
                  </g>
                  <path
                    d={e.closed}
                    data-layer="closed-{name}"
                    fill={A.inks.white}
                    opacity="0"
                  />
                </g>
              {/each}
            </g>
          </g>
          <g data-layer="beak" data-part="beak">
            <g data-layer="jaw" data-part="jaw">
              <path d={A.beak.lower} fill={A.inks.black} />
            </g>
            <path d={A.beak.plane} fill={A.inks.plane} />
          </g>
        </g>
        <g data-layer="wingL" data-part="wing" data-side="L">
          <g data-layer="handL" data-part="primaries">
            {#each shown.filter((p) => p.home === "handL") as p (p.key)}
              {@render prop(p)}
            {/each}
            <path d={A.wingL.hand.vermilion} fill={A.inks.vermilion} />
          </g>
          <path d={A.wingL.arm.black} fill={A.inks.black} />
        </g>
      </g>
      <g clip-path="url(#{uid}-ground)">
        {#each shown.filter((p) => p.home === "ground") as p (p.key)}
          {@render prop(p)}
        {/each}
      </g>
    </g>
  </svg>
</div>
