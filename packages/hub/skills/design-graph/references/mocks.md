# Where a mock stands

A mock stands at the component's data, so the component in the frame is the product's own. Find where the component takes each thing from, and mock there.

## A prop, and an event

The story's `args` are the props; a dial sets one on the live instance in place. An event leaves through the prop that takes it (`onpick`, `onchange`). A fixture's handler answers it as the server would: it holds the wait in its own `$state`, then writes the answer its dial's arg names, and the component draws both from its props.

## A store module

A story puts a store module (the board, the hub's socket) in its state by importing it inside its `beforeEach` and writing it through the store's own writers:

```ts
async beforeEach() {
  const board = await import("./stores/board.svelte");
  board.holdMachines(machines);
}
```

That story runs in a module runner of its own: its runner evaluates the states file, the store, and every module between them, and takes every other module from the page, so each story of one file holds its own value on one page and the store's derived views read what was written. The component stays as it is, and a renamed writer fails the type check. The stage runs each `beforeEach` (the meta's, then the story's) once as the section loads, before any frame mounts, and again with a fresh runner after every edit to a file the section draws from.

- The seed must reach the component: import the store the component reads, never a helper that imports it, or the frame is refused and says so.
- A static import of a store in a states file is the one store every frame shares, and the lint refuses it; `import type` is free.
- A press that changes what the store holds is answered by the fixture's handler, through the same writers. The fixture stands between the states file and the store, so it writes the story's own copy.

## A store behind a provider

A store read through a provider (Pinia, Jotai, a React or Svelte context) is given by a decorator per story, never seeded in `beforeEach`: the decorator makes the store's instance and provides it, as the app's root does, and the story's `beforeEach` writes that instance.

A provider the app's root gives its whole tree (a tooltip provider, a theme) goes in the project's `.storybook/preview.*`, whose decorators wrap every story outside its own (the dashboard's `apps/dashboard/.storybook/preview.ts`), never in each states file's decorators. A page-wide singleton, such as the dashboard's lightbox, stays out of both: one round each story opens one per drawing.

## The server's reads

A component that reads the server takes the project's stand-in for it, as a story's decorator, its reads answered by path. The dashboard's is `hubAs(state, answers)` (`apps/dashboard/src/lib/cawco/hub-stand-in.ts`): `decorators: [hubAs("connected", { [hubPath(hub.api.connections)]: { connections: [] } })]`, each answer keyed by the path the component asks. A read with no answer is refused in words that name its path, so the frame says what to add.

## A call the server lacks yet

The design adds a call the server does not have (asking a provider whether a limit still holds). The new part takes the answer as props and sends the ask as an event; the product component that holds it calls one new function in the store it already reads; the mock stands at that function. The server's side stays unbuilt, and your report names the function for the build.
