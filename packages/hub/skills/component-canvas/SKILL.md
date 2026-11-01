---
name: component-canvas
description: Build a component on CawCo's canvas: write it and its states file, open the canvas, read what was drawn, fix what failed or stands empty, show the person. Triggers when building, changing or judging a component or screen, when asked for states, hover or focus, a flow between states, motion to tune, or a design preview.
---

# Component canvas

The canvas is the project's real component, mounted live by the project's own toolchain in every state its code reaches: each story of its **states file** (`<Component>.stories.ts`, CSF 3, beside the component) is a frame, and each frame is drawn again in every interaction state its CSS has a rule for (hover, focus, pressed), derived, never authored. You see what you drew: the canvas page reports every frame to the stage, and every tool answers from that **report**, never from the files alone. The `show` skill's step 1 comes first. The canvas is your **working drawing** and reaches no one else: a choice the person must make reaches them on a decision page (the `decision-page` skill) whose options `Preview` your stories, and a whole surface reaches them as a preview at its path.

## Steps

1. **Read the map.** `design_map` with `dir` (or `query`) for the folder you build in; `component` for any part you might use. Done when you know which existing components this one is made of: you **mount** those; their markup stays theirs (`references/map.md`). On a clean-slate redesign the surface being replaced is out of the map: mount only the design system's primitives and write every part above them new.
2. **Write the component** props in, events out: everything a state needs arrives as a prop, so every state can be forced from a story. A component that reads the live store cannot show its other states; give it a seam (its state as props) or a fixture beside it. Done when its build and type-check pass.
3. **Write the states file** beside it:
   - `export default { title: "Group/Name", component, args }` with what every story shares; `title` is the section's heading.
   - One export per state the code reaches, named as the product talks (`Waiting`, `Denied`), each with only the args it changes.
   - A one-line doc comment above each, in plain words: `/** Waiting for the phone to scan the code. */`. It is the frame's label.
   - `parameters: { viewport: "phone" }` (or `"tablet"`, `"desk"`, a width) where the piece has a production width.
   - A flow between states: `from: "Waiting"` and a `play` on the destination story that calls `update`, so the live instance moves and its own motion plays (`references/moves.md`).
   - **The poster**: the canvas opens on the frame that tells the story on its own, the result on screen and at rest, never mid-move; it is the first export. A `steps` sequence names its payoff step.
   - **The beats**: `steps`, or a chain of `from`, is three to five states and a payoff, in the order the person meets them; more only when they clarify.
   Done when every state from the brief is an export with a comment, the first export is the poster, and the build passes.
4. **Open the canvas**, to yourself. `artifact_create({ kind: "component", name, does: "judge", ask, file, to: "parent" })`. `ask` is the line a reader of the canvas needs: what to judge and what to pin ("Judge the six pairing states: pin anything that reads wrong"). A surface of several screens is `file: [..]`, one states file per screen, each its own section, loaded as it comes into view. Add `edges` and `group` when the frames read better as a graph; add `dials` for what the person will want to tune (step 8). Done when it answers an id.
5. **Read what was drawn.** The answer's `render` lists every frame: `drawn`, `empty`, `failed` (with its `file:line:column`) or `unseen`. Fix each `failed` and `empty` frame in the component or the story and read again (`artifact_read`, `render: true` to draw it now in the machine's browser). For each forced state, read its delta: `artifact_read({ id, state: { story, interaction: "hover" } })` answers which properties change on which element; an empty delta on a column that exists is a **finding**. Done when every frame is `drawn`, every delta says what you meant, and `moves` lists the animations each flow fires (`references/proof.md`).
6. **Check it reads**, from the answer's `render` (labels, `unnamed`, sections, frames per section): the ask names what to judge ("Judge the six pairing states: pin anything that reads wrong"); every frame is named in plain words by its doc comment, its form (`phone 390`) from `parameters.viewport`; the frames are grouped as the person thinks of them, a `title` section per screen with one states file each, flows as arrows, `edges` and `group` for relations a grid cannot show; any frame is two moves away (the outline, J and K). Fix the file or the call (`artifact_update` with `ask`, `edges`, `group`) until all four hold. Done when `unnamed` is empty and all four hold.
7. **Show it** through the `show` skill. With nothing to choose, a component or a whole surface reaches the person as a preview at its path (`kind: "preview"`, `to: "parent"`), and your report says in one line what changed and what to look at. With a choice, ask it with the `decision-page` skill: one card per question, each option a `Preview` of your stories. Read their pins with `comment_read`: each carries the frame's `state` (story, interaction, scheme, width) and the element's `file:line:column`; change that line and answer in the pin's thread.
8. **Take their tuning back into the code.** `artifact_read` answers `dials` (the values they set) and `tuned` (each move's animation with the duration, delay and easing they gave it on the timeline). Write each into the component: a tuned transition's timing into its CSS or its motion call, a dial's value into a token or an arg default. A value that is no token yet goes into the token JSON first (DESIGN.md's rule), then the component uses the token. Done when the code carries every accepted value and the canvas, read again, draws it.

## Before you finish

**Rehearse.** Draw at the width it is shown at and at 390, and at 2529 where the person will see it. Read every frame as a picture (`artifact_read` with `png` and `width`) and fix the largest fault first: framing (cut off, scaled, a plate or air nobody asked for), then hierarchy (where the eye lands first), then motion, then polish. Re-draw, and hand up once a full read finds nothing. The stage draws the picture; no browser of your own is opened for it.

**The fresh eye.** A reviewer sees only the frames and the URL, never your plan or reasons, and a finding quotes its frame.

**The report** names what you drew (widths, looks, states) and what you did not check.

| Check | Fails when |
| --- | --- |
| Reused, not redrawn | A frame draws markup a mapped component already renders, and that component is not in the frame's `parts` |
| Every state drawn | Any frame is `failed`, `empty` or `unseen` |
| Every state named | `unnamed` lists a story |
| The ask says what to judge | It names no act, or names a file or a state code |
| Grouped as they think | One flat row where the person thinks in screens: use `title` sections, `edges`, `group` |
| Hover does something | A hover, focus or pressed delta is empty, or names an element you did not mean |
| Moves move | A flow's `moves` entry lists no animations, or has an `error` |
| Tuning landed | `dials` or `tuned` holds a value the code does not carry |
| A choice asked on a decision page | The person must pick and the canvas alone is in front of them |
| The person sees a surface | The canvas's grid is what the person was given; a surface reaches them as a preview at its path |
| Weight | A component's states file is `over` budget (250 modules, 1 MB): its `cut` names the seam. A screen carries its weight |
