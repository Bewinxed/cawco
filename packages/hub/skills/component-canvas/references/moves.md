# Moves

A **move** is how a component gets from one state to another, with its motion.

- **Interaction moves** (rest to hover to pressed) are the CSS transitions the component already has. The delta of each forced state lists them (`animations`).
- **A press on a state** sets its args on the live instance; the motion the engine runs is that state's own arrival, read as the move's clips.
- **Flow moves** are written in the states file, on the destination story, for a state whose arrival is an act worth watching (a press, a typed word), not for every state:

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

The design graph's Map face draws each flow move as a solid arrow from its `from` state to its destination, and each of your `edges` as a dashed one. The report's `moves` lists, per move, every animation it fired, read from `getAnimations()` as each started: `target`, `property`, `duration`, `delay`, `easing`. A move with no animations moved nothing the engine saw; a move with `error` threw.

## The Animation face

The person opens a move on the design graph's Animation face (its title's menu, or an arrow on the Map): the move plays on the live drawing, one row per thing that moves, a bar per run of its animations. He plays, replays, repeats and scrubs it, zooms the lanes, drags a bar's delay or its ends, picks a curve or a spring, types what a clip runs between, sets a clip to repeat, drags where its legs meet, and keeps versions to compare; every change replays on the drawing. `artifact_read` answers `tuned`, only what he changed, every move's:

```json
[{ "move": "Filled in → Hub didn't answer", "animation": "Form failure height",
   "delay": 80, "duration": 400, "easing": "cubic-bezier(0.23, 1, 0.32, 1)", "offTokens": true,
   "repeat": "mirror", "legs": [0.4], "values": [{ "property": "height", "from": "0px", "to": "48px" }] }]
```

`delay` is from the move's start; `offTokens: true` means his length or curve is none of the design system's tokens, so it becomes a token first (step 8). `repeat` (`"repeat"` or `"mirror"`), `legs` and `values` stand only where he changed them. Write each into the component's CSS or motion call, then read the canvas again.

To choreograph a mockup's motion yourself, write it as Web Animations in the destination story's `play`; the face reads every animation it sets off:

- `el.animate([{ opacity: 0, translate: "0 24px" }, { opacity: 1, translate: "0 0" }], { duration: 260, delay: 80, easing: "cubic-bezier(0.23, 1, 0.32, 1)" })` is one clip; its frames' first and last values are what he types anew.
- Frames between the first and the last, each with its own `offset` and `easing`, are legs (A → B → C), each leg's end a mark he drags.
- `iterations: 3` repeats a clip; a clip that runs for ever is the state's own loop and stays off the face.
- A custom property animated on the story's root element (`{ "--lift": 0 }` to `{ "--lift": 1 }`) interpolates as it runs: bind any element of the drawing with `var(--lift)`.
- `data-cawco-group="Header"` on an element, or round it, stands its rows under that heading.

Under reduced motion (the panel's motion toggle), a move's animations are what remains; a move that still slides is a finding.
