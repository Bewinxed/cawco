---
version: 1
slug: "src-lib-cawco-preview-previewpane-svelte"
primary_target: "src/lib/cawco/preview/PreviewPane.svelte"
related_targets: ["src/lib/cawco/preview/CommentRail.svelte","src/lib/cawco/preview/PinCard.svelte","src/lib/cawco/preview/CommentComposer.svelte","src/lib/cawco/preview/ThreadSheet.svelte","src/lib/cawco/preview/CanvasView.svelte"]
---

# Artifact panel, comments, canvas and ink

The owner's picks for the session's artifact panel (a page, a preview, a canvas, a component canvas), its Comment mode and its ink. The PRD (`.design-foundations/plans/2026-10-06-projects.md` §5.10) specifies the surfaces; DESIGN.md holds the system they stand on. Decision logs: `decisions/commenting/log.md`, `decisions/comment-card-sizing/log.md`, `decisions/app-comment-mode/log.md`.

## The panel

- The panel stands on the conversation's own background with no separator line: only its shadow parts it from the transcript, and the split's drag edge shows its grip on hover or focus alone (pin on title-bars-close, 2026-11-03).
- **The head** (2026-11-05, one screen with the rail; HIG Toolbars, Item groupings): one row. Leading, Close on a phone's sheet (HIG Sheets: "for sheets with a single view, the Cancel button belongs on the leading edge of the top toolbar"), then the artifact's **title**; in the centre the mode; trailing, one glass of bare symbols (Comments as its bubble and count, Reload, Open in new tab, Expand, More), Send as the one prominent action on the coral, and Close in a glass of its own beside the page (HIG Toolbars: "Group navigation controls and critical actions like Done, Close, or Save in dedicated, familiar, and visually distinct sections").
- **The title** is the words its agent wrote, never the slug, which is an id (the owner's answer on title-bars-close, 2026-11-05). It is the HIG's bar title, sized as the HIG sizes one: "Headline | Semibold | 17 | 22" (HIG Typography, iOS Large), set as plain text in the row role (16px at 500, the house's ceiling), with a menu chevron beside it because it opens the document menu (HIG Toolbars: "Leading edge. … followed by the view title. Next to the title, the toolbar can include a document menu"). The glass group across from it stays at its 36px capsule; the title was too small and in the wrong form (13px in a chip), the buttons were right. Its ask is the menu's first row and its tooltip, never a line under the title. A title not yet written shows the slug until the tool carries titles.
- **Menus hang from their bar** (the owner, 2026-11-05: as Caw's card hangs from his glass): the artifacts menu, More, the canvas view, the mode's one-button form and the rail's list menu hang from their glass as one shape with it (BarMenu, HangCard), never detached under the control; the title draws no glass at rest and its join is its ground while its menu hangs. `house/no-detached-bar-menu` refuses a detached one.
- On a phone the drawer covers the composer while it is open, the Comments sheet over it too: the composer under it is inert and comes back as it was when the drawer closes. An ask raised on the composer is the one thing the drawer makes way for.
- Three modes, kept per session: Interact (the page takes every press), Comment and Draw. Comments float over the page; they never take its room. Comment's glyph is the pin (a press pins a comment), never a bubble: the Comments toggle beside it is the bubble. Every More entry carries its glyph, Inspect's the tuning one, so their words start on one line.
- On a phone a dialog that opens or closes inside the drawer (the design graph's states, a confirm) leaves the drawer at its stop: the drawer is put back where it stood when bits-ui rewrites its style.
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
- **The rail's bar** (2026-11-05, replacing the two rows the owner refused: a full row of glass controls over a full row of Open | Resolved): one row, the same pattern as the head. Leading, Close on the phone's sheet only; then the list in front as the bar's title with its count ("Open 5"), a title menu choosing To check, Open or Resolved (each with its count) and the order (Newest first, Top of page first); trailing, one glass with Search and a comment on the whole page. Why a title menu and not tabs: three tabs with their counts beside the glass need about 350px, and the rail is 320px (`c-comments-w`) and the phone 390px with Close; a menu holds counts in the hundreds at every width, and the HIG names the title's menu as the place for what the whole view shows. While To check holds comments and another list is in front, the title wears the needs-you dot. Search (or `/`) turns the bar into the field with its Clear and a Close (HIG Search fields: in a top toolbar search "appears as a toolbar button. When someone taps it, it animates into a search field"); Esc clears, Esc on an empty field folds it back. On a desk the rail has no Close: the head's Comments toggle opens and shuts it. The empty state is "No open comments" alone.
- **The phone's Comments sheet** is a resizable sheet (HIG Sheets: "Include a grabber in a resizable sheet"): the kit drawer with its grabber and two stops, half its room where it opens and the whole room, dragged below the lower stop it goes, as Close does.
- **The thread card** (2026-11-03): no header band. Resolve, Delete and More float as one glass group, Close in its own; the pill, the element's name and "on …" (only where it says more than the name) are the thread's first lines.
- **Where a thread opens:** beside its pin, wide enough to read a long reply, growing taller as it needs up to the well's height, where it can be read whole; it grows out of the pill as the top bar's card grows out of the glass. It opens at the newest reply's first line, never jumps as the page scrolls, and takes the keyboard only when the person shows an intent to reply. Its foot says "Sent to" the session; no speaker line stands in the author's place.
- **Changed since you looked** (pick B, with C's chip and a ring in place of the green fill): each thread carries its change lines, the rail's first tab is the inbox of what to check, the agent's turn carries a chip per spot it changed, and a changed element wears a ring, never a fill.
- A `comment_reply` or `comment_resolve` row is a tool call whose chip opens the comment's thread to read and reply.

## Canvas and ink

- A pen swiped up on the composer's pill grows the pill into a canvas; Dock flies it into the panel and Undock back. Ink can be drawn on any artifact, and its pen menu offers Annotate, Comment, Illustrate and Erase (PRD §5.10).

## Open for the owner

- A thread opened from the phone's list still opens as its own sheet after the list's goes (HIG Sheets: "Display only one sheet at a time"; the list and the thread in one sheet with Back is the HIG's answer, not built in this run).
- The thread card's head (four loose ghost buttons over a second line) is the title-bars branch's to land.
- Changed since you looked stands as its own row between the head and the page while changes stand.
- On a tablet with the Comments rail open, where a comment opens: left open on comment-card-sizing, with the note asking for a compact rail the comments grow out of.
