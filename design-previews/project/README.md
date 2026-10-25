# The project page, as a preview

One static page (`index.html`) holding the project page itself (`frame.html`)
at Desk 1440 and Phone 390, live, on the dashboard's built tokens
(`tokens.css`) and the house faces. A switch picks the state (at rest,
waiting on you, the task pane open, an empty project, a read failure, Caw's
first thread), the phone's board (one grouped list, or the desk's columns
sideways) and the scheme. Under 1100px it shows one frame at a time.

Serve the folder as it is (`bunx serve design-previews/project`). Its proof
is `scripts/probe-kit/specs/project-preview.ts`
(`bun scripts/probe-kit/run.ts project-preview`), which reads it at 390, 680,
1037 and 1440 and runs the house rules at 390, 1037 and 1440.

The head and the pane's bar follow DESIGN.md's Title Bars Follow Liquid Glass
Rule as the live head does (`ProjectHead.svelte`): one row, the name, the
place as its machine's OS mark, Caw's seat and one glass capsule (Ask Caw,
Spin off, More); the pane's bar is bare symbols (Back on a phone, the
session's symbol and Close in its capsule) over the task's title, and its
tabs are Task, Changes and History. Caw's first-thread title is a marked
placeholder (`[Copy to come: …]`) until its copy is written.

## Caw

`caw/hero.png` and `caw/fault.png` were made in Backlot from
`assets/mascot/stills/light-ready.png` on Qwen-Image's edit guide (the
operation first, then the owner's keep clause), cut out by a second call with
`transparent: true`, and moved sideways so his body's centre of mass (the
largest shape of his opaque pixels, alpha-weighted) stands on the image's
centre. `caw/mark-light.png` is `assets/mascot/stills/light-head-smile.png`.

## Questions for the owner

Two calls the design answers left to him, not built here:

1. On a project page, should the glass's Caw (his head in the top bar) and
   Ask Caw open the same column (the sheet, on a phone)? Today only Ask Caw
   opens it.
2. When a task is approved while its agent's question still stands, should
   the folded ask say "Question closed with the task" instead of going?
   Today it folds away with the review.
