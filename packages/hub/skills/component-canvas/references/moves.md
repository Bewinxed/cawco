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

The canvas draws each flow move as an arrow from its `from` frame to its destination. The report's `moves` lists, per move, every animation it fired, read from `getAnimations()` as each started: `target`, `property`, `duration`, `delay`, `easing`. A move with no animations moved nothing the engine saw; a move with `error` threw.

## The timeline

The person clicks a move's arrow (or swipes to the next story on a phone): the move plays in its destination frame and DialKit's timeline opens with one clip per animation, at its start, its length and its curve. They scrub it (the engine's own animations, paused and sought) and drag a clip's duration, delay or curve; the frame previews the tuned timing at once. `artifact_read` answers `tuned`: `[{ move, animation, duration, delay, easing }]`, only what they changed. Write each into the component's CSS or motion call, then read the canvas again.

Under reduced motion (the panel's motion toggle), a move's animations are what remains; a move that still slides is a finding.
