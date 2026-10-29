# Moves

A **move** is how a component gets from one state to another, with its motion.

- **Interaction moves** (rest to hover to pressed) are the CSS transitions the component already has. The delta of each forced state lists them (`animations`).
- **Flow moves** are written in the states file, on the destination story:

```ts
/** The phone said yes: the code leaves and Caw reacts. */
export const Approved = {
  args: { status: "approved" },
  from: "Waiting",
  play: async ({ update, canvas, userEvent }) => {
    await update({ status: "approved" });
  },
};
```

`play` runs on the start story's live instance. `update(next)` changes its props in place, never a re-mount, so the component's own enter and leave motion plays (Svelte's `transition:`, a CSS transition on a class, a WAAPI call). `userEvent` dispatches real pointer and key events (`click`, `hover`, `unhover`, `type`, `keyboard`, `tab`, `wait(ms)`); `canvas` finds elements by words and roles (`getByText`, `getByRole(role, { name })`, `getByTestId`). A play runs at most 6 s; its motion is waited on for 3 s more.

The design graph draws each flow move as an edge from its `from` state to its destination. The report's `moves` lists, per move, every animation it fired, read from `getAnimations()` as each started: `target`, `property`, `duration`, `delay`, `easing`. A move with no animations moved nothing the engine saw; a move with `error` threw.

## The dock

The person keeps a state in the graph: the page stands it alone and plays the move into it, and the dock lists one clip per animation, each by what it changes (opacity, position, size, colour, a text swap, an unfold) in its kind's own colour, at its start, its length and its curve. They scrub its ruler (the engine's own animations, paused and sought), drag a bar whole or by an end, which snaps to the project's duration tokens (⌥ frees it), or open a clip's controls: its length on a slider with the tokens as detents or as any figure, and its curve, any of the project's easing tokens, a spring (response, bounce, mass, velocity) or a custom curve. Each change plays the move once from the start. `artifact_read` answers `tuned`: `[{ move, animation, delay, duration, easing, durationToken, easingToken, spring }]`, only what they changed. `durationToken` and `easingToken` name the token a value lands on, null where it is ad hoc (dashed in the dock); `spring` is `{ response, bounce, mass, velocity }` where they chose one, and `easing` is the curve as CSS (a spring's `linear()`). Write each into the component's CSS or motion call: a token's name where it names one; a value off the scale either becomes a token first (DESIGN.md's rule) or stays your own ad hoc call. Then read the canvas again.

Under reduced motion (the panel's motion toggle), a move's animations are what remains; a move that still slides is a finding.
