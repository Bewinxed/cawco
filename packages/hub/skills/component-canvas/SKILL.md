---
name: component-canvas
description: Build a component on CawCo's canvas: write it and its states file, open the canvas, read what was drawn, fix what failed or stands empty, show the person. Triggers when building, changing or judging a component or screen, when asked for states, hover or focus, a flow between states, motion to tune, or a design preview.
---

# Component canvas

The canvas is the project's real component, mounted live by the project's own toolchain in every state its code reaches: each story of its **states file** (`<Component>.stories.ts`, CSF 3, beside the component) is a frame, and each frame is drawn again in every interaction state its CSS has a rule for (hover, focus, pressed), derived, never authored. You see what you drew before the person does: the canvas page reports every frame to the stage, and every tool answers from that **report**, never from the files alone.

## Steps

1. **Read the map.** `design_map` with `dir` (or `query`) for the folder you build in; `component` for any part you might use. Done when you know which existing components this one is made of: you **mount** those, never redraw their markup (`references/map.md`).
2. **Write the component** props in, events out: everything a state needs arrives as a prop, so every state can be forced from a story. A component that reads the live store cannot show its other states; give it a seam (its state as props) or a fixture beside it. Done when its build and type-check pass.
3. **Write the states file** beside it:
   - `export default { title: "Group/Name", component, args }` with what every story shares; `title` is the section's heading.
   - One export per state the code reaches, named as the product talks (`Waiting`, `Denied`), each with only the args it changes.
   - A one-line doc comment above each, in plain words: `/** Waiting for the phone to scan the code. */`. It is the frame's label.
   - `parameters: { viewport: "phone" }` (or `"tablet"`, `"desk"`, a width) where the piece has a production width.
   - A flow between states: `from: "Waiting"` and a `play` on the destination story that calls `update`, so the live instance moves and its own motion plays (`references/moves.md`).
   Done when every state from the brief is an export with a comment, and the build passes.
4. **Open the canvas.** `artifact_create({ kind: "component", name, file, about })`. `about` is one sentence on what this showing is for ("The six states of the pairing card and the QR card's hover"). A surface of several screens is `file: [..]`, one states file per screen, each its own section, loaded as it comes into view. Add `edges` and `group` when the frames read better as a graph; add `dials` for what the person will want to tune (step 8). Done when it answers an id.
5. **Read what was drawn.** The answer's `render` lists every frame: `drawn`, `empty`, `failed` (with its `file:line:column`) or `unseen`. Fix each `failed` and `empty` frame in the component or the story and read again (`artifact_read`, `render: true` to draw it now in the machine's browser). For each forced state, read its delta: `artifact_read({ id, state: { story, interaction: "hover" } })` answers which properties change on which element; an empty delta on a column that exists is a **finding**. Done when every frame is `drawn`, every delta says what you meant, and `moves` lists the animations each flow fires (`references/proof.md`).
6. **Check it reads.** Load `interface-craft` (Design Critique) and answer, from the answer's `render` (labels, `unnamed`, sections, frames per section) and nothing else: Is it named, and does `about` say what to look at? Is every frame named in plain words with its form? Are the frames grouped the way the person thinks about them? Can they reach any frame in two moves (the outline, J and K)? Fix the file or the call (`artifact_update` with `about`, `edges`, `group`) until all four are yes (`references/readable.md`). Done when `unnamed` is empty and all four are yes.
7. **Show it.** The canvas is in the panel already; say in one line what changed and what to look at. Read their pins with `comment_read`: each carries the frame's `state` (story, interaction, scheme, width) and the element's `file:line:column`; change that line and answer in the pin's thread.
8. **Take their tuning back into the code.** `artifact_read` answers `dials` (the values they set) and `tuned` (each move's animation with the duration, delay and easing they gave it on the timeline). Write each into the component: a tuned transition's timing into its CSS or its motion call, a dial's value into a token or an arg default. A value that is no token yet goes into the token JSON first (DESIGN.md's rule), then the component uses the token. Done when the code carries every accepted value and the canvas, read again, draws it.

## Before you finish

| Check | Fails when |
| --- | --- |
| Reused, not redrawn | A frame draws markup a mapped component already renders, and that component is not in the frame's `parts` |
| Every state drawn | Any frame is `failed`, `empty` or `unseen` |
| Every state named | `unnamed` lists a story |
| A canvas says what it is | It was opened without `about`, or `about` names no state to look at |
| Grouped as they think | One flat row where the person thinks in screens: use `title` sections, `edges`, `group` |
| Hover does something | A hover, focus or pressed delta is empty, or names an element you did not mean |
| Moves move | A flow's `moves` entry lists no animations, or has an `error` |
| Tuning landed | `dials` or `tuned` holds a value the code does not carry |
| Weight | A component's states file is `over` budget (250 modules, 1 MB): its `cut` names the seam. A screen carries its weight |
