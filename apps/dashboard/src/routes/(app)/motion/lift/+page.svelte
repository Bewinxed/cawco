<script lang="ts">
  /**
   * LIFT BENCH — every outro that lifts its node as it leaves (motion/curves
   * `lifting`), each in a real `{#key}` whose view is asked for again while
   * it leaves, as a refused password is answered sooner than the fade. Svelte
   * resumes the same node (branches.js `resume_effect`); the bench reads it
   * back: in the flow, pressable, its inline style as it was.
   *
   * `crossOut` (and SessionPane's `leave`, crossOut held at its height) and
   * route's `pageOut` are the modules' own. The rest are component-local and
   * each is `lifting(node, <its lift>, <its fade>)`: the bench runs `lifting`
   * with each one's lift exactly as its component writes it.
   *
   * `window.__lift.run(i, ms)` leaves case i's view, asks for it again after
   * `ms` (0: before Svelte's delay is over), lets it land, then leaves it
   * again, and answers what each read found.
   */
  import { tick } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import {
    crossIn,
    crossOut,
    crossOutWith,
    dur,
    easeOut,
    lifting,
    pinned,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { pageOut, route } from "#lib/cawco/motion/route.svelte.js";

  const fade = (): TransitionConfig => ({
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t) => `opacity: ${t}`,
  });

  /**
   * Each case: its name, its outro called as Svelte calls a directive (its
   * params, `{}` with none, then its direction), and whether its box is a
   * one-cell grid.
   */
  const CASES: {
    name: string;
    out: (
      node: HTMLElement,
      params: object,
      options: { direction: "out" }
    ) => TransitionConfig;
    grid?: boolean;
  }[] = [
    { name: "crossOut", out: crossOut },
    {
      name: "SessionPane leave",
      out: (node) =>
        crossOutWith(node, () => ({ height: `${node.offsetHeight}px` })),
    },
    { name: "pageOut", out: pageOut },
    {
      // A pop: the page leaving stays on top (route `leavingOnTop`).
      name: "pageOut on a pop",
      out: (node) => {
        route.travel = { ...route.travel, leavingOnTop: true };
        return pageOut(node);
      },
    },
    {
      name: "Thinking faceOut",
      out: (node) =>
        lifting(
          node,
          () => ({ position: "absolute", "inset-inline-start": "0" }),
          fade()
        ),
    },
    {
      name: "HoverPanel swapOut",
      out: (node) =>
        lifting(
          node,
          () => ({
            position: "absolute",
            inset: "var(--space-3) var(--space-3) auto",
          }),
          fade()
        ),
    },
    {
      name: "AccountSetup stepOut",
      out: (node) => lifting(node, pinned(node), fade()),
    },
    {
      name: "RoutingEditor slideOut",
      out: (node) => lifting(node, pinned(node), fade()),
    },
    {
      name: "PaneTabs leavingTab",
      out: (node) =>
        lifting(
          node,
          pinned(node, () => ({ "z-index": "calc(var(--z, 1) * 4 + 2)" })),
          fade()
        ),
    },
    {
      name: "Composer trayFade",
      grid: true,
      out: (node) => lifting(node, () => ({ "grid-area": "1 / 1" }), fade()),
    },
    {
      name: "EditorRoute leave",
      out: (node) =>
        lifting(
          node,
          () => ({
            position: "absolute",
            inset: "0",
            "pointer-events": "none",
          }),
          fade()
        ),
    },
    {
      name: "QuestionCard leave",
      out: (node) =>
        lifting(
          node,
          () => ({
            position: "absolute",
            top: `${node.offsetTop}px`,
            left: `${node.offsetLeft}px`,
            width: `${node.offsetWidth}px`,
            "pointer-events": "none",
          }),
          fade()
        ),
    },
    {
      name: "SuggestionChips leave",
      out: (node) =>
        lifting(
          node,
          () => {
            const box = node.getBoundingClientRect();
            const frame = (
              node.offsetParent ?? node.parentElement
            )?.getBoundingClientRect();
            return {
              position: "absolute",
              "inset-inline-start": `${box.left - (frame?.left ?? 0)}px`,
              "inset-block-start": `${box.top - (frame?.top ?? 0)}px`,
              "inline-size": `${box.width}px`,
            };
          },
          fade()
        ),
    },
  ];

  let views = $state(CASES.map(() => "a"));
  /** Case i's own outro. */
  const leaving = (node: HTMLElement, i: number) =>
    CASES[i].out(node, {}, { direction: "out" });

  const frame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));
  const wait = (ms: number) =>
    new Promise<void>((done) => setTimeout(done, ms));
  /** Every animation on the page that ends has ended (a spinner's never does), then a frame. */
  const landed = async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (one) =>
            one.playState === "running" &&
            Number.isFinite(Number(one.effect?.getComputedTiming().endTime))
        )
        .map((one) => one.finished.catch(() => undefined))
    );
    await frame();
  };

  /** Case i's view `a`, as it stands: where, how, and what its centre hits. */
  function read(i: number) {
    const node = document.querySelector<HTMLElement>(
      `[data-case="${i}"] [data-view="a"]`
    );
    if (!node) {
      return null;
    }
    const style = getComputedStyle(node);
    const button = node.querySelector("button");
    const box = button?.getBoundingClientRect();
    const top = box
      ? document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        )
      : null;
    return {
      position: style.position,
      pointerEvents: style.pointerEvents,
      gridArea: style.gridArea,
      zIndex: style.zIndex,
      inline: node.getAttribute("style") ?? "",
      inert: node.inert,
      hit: Boolean(button && top && (top === button || button.contains(top))),
    };
  }

  Object.assign(globalThis, {
    __lift: {
      names: CASES.map((one) => one.name),
      async run(i: number, ms: number) {
        const rest = read(i);
        views[i] = "b";
        await tick();
        if (ms > 0) {
          await wait(ms);
        } else {
          await Promise.resolve();
        }
        const out = read(i);
        views[i] = "a";
        await tick();
        await landed();
        const back = read(i);
        // Its next leave: Svelte keeps the options and calls no factory.
        views[i] = "b";
        await tick();
        await wait(60);
        const again = read(i);
        await landed();
        const gone = read(i);
        views[i] = "a";
        await tick();
        await landed();
        return { rest, leaving: out, back, again, gone };
      },
    },
  });
</script>

<svelte:head><title>Lift bench · CawCo</title></svelte:head>

<main class="grid gap-space-2 p-space-4">
  {#each CASES as one, i (one.name)}
    <!-- literal: 3rem -->
    <section
      class="relative flex min-h-(--section-h) flex-col border border-border-hairline data-grid:grid"
      data-grid={one.grid || undefined}
      data-case={i}
      style:--section-h="3rem"
    >
      {#key views[i]}
        <div class="flex items-center gap-space-2 bg-surface-raised p-space-2" data-view={views[i]} in:crossIn out:leaving={i}>
          <span>{one.name} · {views[i]}</span>
          <button type="button">Press</button>
        </div>
      {/key}
    </section>
  {/each}
</main>
