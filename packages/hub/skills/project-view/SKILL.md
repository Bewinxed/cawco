---
name: project-view
description: Draft a view of a project for the person — a new one, or a change to a view they keep — as an OpenUI Lang program over CawCo's library, which they keep or discard. Use when a CawCo message's context line names this skill, or when the person asks for a view of the project's tasks, stages or spend.
---

# A view the person asked for

Their message is what they want to see. The reminder beside it says where they asked from: a page and a position (the draft stands there as a block they keep or remove), the views strip (a draft tab), or a view they keep (its name and its program's file).

1. **Read how a view is written.** Call `view_guide`: CawCo's component library and what a view's `Query(tool, args)` reads. Try a query with `view_query` when you need to see its data. Done when you know the components and queries the view needs.
2. **For a change, read the view.** `folder_read` its program (`views/<name>.oui`). Done when you hold the program as it stands.
3. **Draft it.** Call `view_draft({ name, source })`, with `page` and `position` when they asked from a page; a change keeps the view's name and goes without a page, so it stands where the view does. Components outside the library are dropped and named in the answer: replace them and draft again. Done when the draft answers with nothing dropped.
4. **Say it in one sentence**: what the view shows. They keep it or discard it.
