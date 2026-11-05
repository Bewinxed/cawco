---
version: 1
slug: "src-lib-cawco-project-projectpage-svelte"
primary_target: "src/lib/cawco/project/ProjectPage.svelte"
related_targets: ["src/lib/cawco/project/ProjectHead.svelte","src/lib/cawco/project/ViewMenu.svelte","src/lib/cawco/project/NeedsYouChip.svelte"]
---

# A project's page: one head over its view, Caw beside it

Mode: Operate. The person comes back from a push for a minute: does this project need me, answer it, leave. Then, less often, follows the work and steers Caw. The page is a workspace tab at `/project/<id>`, inside the shell's rail, the workspace's tab strip and Caw's panel.

Direction: inherits DESIGN.md.

## The owner's ten rules (binding)

1. One "you are here" mark in the window: the workspace tab. The rail's rows (a project's, a session's in its tree, Working, Finished and Recent) wear none for the tab in front.
2. At most one row of tabs or segments between the window's top and the content, at every width: the workspace's tab strip. The views are a menu.
3. At most two selections from the project to a card.
4. Each kind of thing is a destination once: each view in the views menu; Project details from the place (from More where the head is compact); Spend from More; Caw's settings in his panel's bar.
5. Drawn inside the real rail, tab strip and Caw's panel (the bench at `/motion/project-page` does).
6. Anything new replaces what's there of its kind.
7. The waiting count is drawn once (Needs you), and a wait is answered where it stands.
8. Caw is one surface (his panel) with one switch (his seat).
9. A phone has one navigation bar: the shell's (the burger). No bar at the page's foot.
10. A waiting thing is acted on within two presses of landing: Needs you, then the act, at 1440 and 390 alike.

## Regions

- **Head**, one row at every width (ProjectHead): the name (renamed where it stands) and the place (details), the views menu (ViewMenu: every view, the one on screen ticked, Caw's drafts marked) and the filter; trailing, Needs you, New task, Caw's seat (the switch of his panel), and one glass group (Spin off, Full size, More). Under 640px of its own width (a phone, a narrow split) More also holds Spin off, New task, Filter tasks…, Project details and Full size, and Needs you shows its glyph and count.
- **Needs you**: the count of Caw's questions, the tasks that wait on you and the decision pages waiting on picks (a page a waiting task waits on is counted by the task). Walked oldest first across kinds, by how long each has waited (a question since it was raised, a task since its oldest reason, `waitingSince` in needs.svelte.ts; a page since it went pending on you, else its last change). Pressed, the next of them opens where it stands: the task beside the board (its own page under 900px) on its review or wait, the page in Decisions, Caw's question standing up in his panel. Pressed again, the one after the thing on screen.
- **The view**: Board, Table, Routines, Decisions, Canvas, Calendar, Made, kept and drafted views. No view carries a count.
- **The task**: beside the view in the split on a desk, its own page with Back under 900px.
- **Caw's panel**: docked beside the page on a desk, a bottom sheet on a phone; its bar holds his settings (his one on/off), session details, New conversation, Open as a tab, Close. Ask Caw for a view (More) opens it with "Make a view of " in his composer; that send goes as a view request.

## States

Things waiting (Cawco-Dev: 3 tasks on you, 2 held on asks, 25 pages waiting: 30), nothing waiting, one page and one task waiting (Private office: 2), a project just made (not set up: the setup scene, Caw standing over it at 80, the head without his seat), Caw open and closed, a narrow split (two groups at 1440, each head compact), a task open (desk split, phone page), a decision page open from Needs you, the views menu open, More open (wide and compact).

## Widths

390 (the page is the one scroller; compact head), 680 and 1024 (rail in the burger under 900; head whole from 640), 1440 (whole head), a split group of ~600 (compact head), 2529 (the board is fluid; nothing changes past 1440).

## Verdict and backlog

Streamline. Done: the view strip and the phone's foot bar gone; one count; Needs you walks the waits; Caw's duplicate doors and switches gone; the rail's second mark gone.

Open (the owner's call): the rail still lists Caw's conversation among the project's sessions, and his panel's Open as a tab opens it as a session tab: both are a second way to Caw (rule 8). Hiding the rail row hides his delegates' trees with it.
