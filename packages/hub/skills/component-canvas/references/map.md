# The map: reuse, never rewrite

`design_map` is the library: the components under a folder (`dir`, or the source folder), each with how many states it has, how many frames were drawn, what it is **made of** and where it is **used in**. Made of and used in come from two places: every drawn frame's component chain (each element's own file and the call site of each component above it), and a static scan of each component's imports, so a component is mapped before any page has drawn it.

- `design_map({ query: "card" })`: find by name. Paged: 50 at a time, `cursor` for more; `dir` narrows a big repository.
- `design_map({ component: "src/lib/Card.svelte" })`: its card: props, states files, stories with the interactions they reach, moves, used in and made of with each call site.

**The screen rule: mount parts, never redraw them.** A screen is a real component that composes components. Its states file imports the screen; the screen imports its parts. Before writing markup, look the part up: if the map has it, import it and pass its props. A frame's `parts` (in `artifact_read` with `state`) is the proof: a screen whose frame shows a button's markup with no `Button` in its parts redrew it.

A part changed once changes everywhere it is used: an instance is an import. Check `usedIn` before changing a part's props, and read each screen that uses it again.
