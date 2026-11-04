---
version: 1
slug: "src-lib-cawco-preview-previewpane-svelte-46fef32e"
primary_target: "apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte"
related_targets: ["apps/dashboard/src/lib/cawco/preview/CommentRail.svelte","apps/dashboard/src/lib/cawco/preview/PinCard.svelte","apps/dashboard/src/lib/cawco/preview/CommentComposer.svelte","apps/dashboard/src/lib/cawco/preview/ThreadSheet.svelte","apps/dashboard/src/lib/cawco/preview/CanvasView.svelte"]
---

# Artifact panel, comments, canvas and ink

The owner's picks for the session's artifact panel (a page, a preview, a canvas, a component canvas), its Comment mode and its ink. The PRD (`.design-foundations/plans/2026-10-06-projects.md` §5.10) specifies the surfaces; DESIGN.md holds the system they stand on. Decision logs: `decisions/commenting/log.md`, `decisions/comment-card-sizing/log.md`, `decisions/app-comment-mode/log.md`.

## The panel

- The panel stands on the conversation's own background with no separator line: only its shadow parts it from the transcript, and the split's drag edge shows its grip on hover or focus alone (pin on title-bars-close, 2026-11-03).
- The head is one row (The Title Bars Follow Liquid Glass Rule). The artifact's ask is the name menu's first row and its tooltip, never a line under the name.
- On a phone the drawer covers the composer while it is open, the Comments sheet over it too: the composer under it is inert and comes back as it was when the drawer closes. An ask raised on the composer is the one thing the drawer makes way for.
- Three modes, kept per session: Interact (the page takes every press), Comment and Draw. Comments float over the page; they never take its room.
- A component canvas's head says the canvas's description in words, never its path or URL, and never repeats its title; a section waiting to draw says so, and a section that failed says why in place.

## The One Target Rule

On a page in Comment mode, coral is the target and nothing else, and no mark on the page is wider than 1px.
- **Rest:** the element under the pointer takes a see-through tint, `c-target-tint` (`brand-solid` at 8%, its text still 4.5:1 under it), at its own radius, named in the overlay's label.
- **Chosen** (its composer open, its pin open, hovered in the rail or stepped to): a 1px `brand-solid` line (`c-target-stroke`), on its border box or `c-target-gap` outside a bare one, never touching its glyphs. The page's root takes a dashed line inside the document's edge.
- One target at a time; the composer at the element is a text field, so it draws no ring (The Caret Rule). The one 2px coral left on the page is an open pin's own ring. A mark that is the only cue holds 3:1 against the page.

## Comments

- A press in Comment mode writes nothing: it opens the chat composer beside a hollow pill at the element. Esc or a press outside leaves no pin; words or attachments park as a draft on the hollow pill.
- A comment may be a picture or a file alone.
- The pill is the tail-corner pill, 28px tall (`c-pin`), roomier than a bare figure.
- A comment goes to the session by itself a few seconds after the last mark, with no Send ("Go by themselves", 2026-10-23, replacing "On Send"). The page's own Send carries its picks alone.
- One breath everywhere: a pin's live dot breathes on the shared breath, never a loop of its own.
- A row in the rail shows its attachments as a strip of up to four 20px thumbs, then +N.
- The Comments sheet on a phone layers over the page: the page never moves, resizes or scrolls under it.
- **The rail** (2026-11-03): its controls float with the comment area. Search is a glass symbol beside Sort and +, and pressing it (or `/`) opens the field in the bar; the rows start under the floating group and blur under it as they scroll. On a desk the rail has no Close of its own: the head's Comments toggle, its glyph and count only, opens and shuts it. The phone's sheet keeps a way out. The empty state is "No open comments" alone.
- **The thread card** (2026-11-03): no header band. Resolve, Delete and More float as one glass group, Close in its own; the pill, the element's name and "on …" (only where it says more than the name) are the thread's first lines.
- **Where a thread opens:** beside its pin, wide enough to read a long reply, growing taller as it needs up to the well's height, where it can be read whole; it grows out of the pill as the top bar's card grows out of the glass. It opens at the newest reply's first line, never jumps as the page scrolls, and takes the keyboard only when the person shows an intent to reply. Its foot says "Sent to" the session; no speaker line stands in the author's place.
- **Changed since you looked** (pick B, with C's chip and a ring in place of the green fill): each thread carries its change lines, the rail's first tab is the inbox of what to check, the agent's turn carries a chip per spot it changed, and a changed element wears a ring, never a fill.
- A `comment_reply` or `comment_resolve` row is a tool call whose chip opens the comment's thread to read and reply.

## Canvas and ink

- A pen swiped up on the composer's pill grows the pill into a canvas; Dock flies it into the panel and Undock back. Ink can be drawn on any artifact, and its pen menu offers Annotate, Comment, Illustrate and Erase (PRD §5.10).

## Open for the owner

- Where the phone sheet's Close stands, and what names an artifact at the top of its panel while its slug is the only name (two cards on the title-bars-close page).
- On a tablet with the Comments rail open, where a comment opens: left open on comment-card-sizing, with the note asking for a compact rail the comments grow out of.
