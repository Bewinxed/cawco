# DESIGN.md: Caw thread and lead wording to sweep

Caw's threads and the lead role are gone. A project's conversation is now a session whose scope is the project. Spec: `caw-one-session-undo-and-build.md` §5, Projects PRD decision log 2026-10-30.

Only an impeccable agent edits DESIGN.md (the owner's rule). This list is for that agent to apply. Line numbers are DESIGN.md's at 02566c658 plus this sweep; DESIGN.md itself is unchanged.

Each entry gives the line, the words that stand now, and the proposed words.

## Line 722: Borders are graded

- **Now:** "(a suggestion row in Caw's panel, on the thread's recess)"
- **Proposed:** "(a suggestion row in Caw's panel, on the conversation's recess)"
- **Why:** the panel's hero and transcript stand on the session pane's recess (`bg-surface-recess`); there is no thread.

## Line 751: Caw's panel rows, Peek

- **Now:** "A thread's ask, a run and a budget have no Peek: a thread is opened, the others have no tail."
- **Proposed:** "A run and a budget have no Peek: they have no tail."
- **Why:**
  - An ask of the project's conversation is a session's ask, and a session's ask peeks like any other. The dashboard's NeedsCard already peeks it.
  - The thread case is gone.

## Line 898: Live dot

- **Now:** "so the thread's mark and its pill breathe on one clock."
- **Proposed:** "so the pin card's mark and its pill breathe on one clock."
- **Why:**
  - This sentence is about a pin: "A pin's pill wears the same dot".
  - "thread" here meant the pin's comment thread. That is a separate concept, kept as it is.
  - The rewording only stops it reading as a Caw thread.

## Checked and left as they are

Every other mention of "thread" in DESIGN.md is one of these:

- a pin's comment thread (lines 940 to 945);
- the browser's main thread (lines 744, 931);
- the 28px "lead column" of a row's grid (lines 751, 752, 754, 806, 890).

None of them names a Caw thread or the lead role.
