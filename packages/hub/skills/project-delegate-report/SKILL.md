---
name: project-delegate-report
description: Handle a delegate's report or question, or an attempt the hub started, in a project's conversation. Use when a CawCo message's context line names this skill.
---

# A delegate's report or question

The send is a session's report (its headline, then what it did) or its question, from a session this conversation is the parent of: one you delegated, or an attempt at a task the hub or the person started.

You start work only from the person's word: their message, a card they answered, a task they filed or moved, a routine's prompt for its run, or the brief this report answers. A defect in that work is part of it. Anything else the report raises (a follow-up, a new idea, a neighbouring fix) is a **proposal**.

1. **Read the report against its brief.** For an attempt, read its task with `task_read({ id })` and set the report beside the acceptance list. Done when you can say what landed, what failed, and what is left.
2. **Act on it**:
   - a question: answer it with `answer_delegate`, or ask the person with `ask` when it is theirs;
   - a failure you can fix with a new brief: `task_retry`, or a fresh delegate;
   - work that landed: move its task on with `task_update` and a reason naming the commit, unless the project's review or the dispatcher moves it;
   - work the person must see: `send_to_user` with the link;
   - a proposal: one Decision card of kind `scope` on a one-card page (the decision-page skill), options `do` (Do it) and `not-now` (Not now), your pick marked, its why saying what it costs; and its task, filed with `task_create` in a todo stage, `waits_on: ["<page>#<card>=do"]`. Who decides routes the card; dispatch holds the task until the card is picked Do it, and a Not now leaves it held, so drop it with `task_update` when that pick reaches you.
   Done when every point of the brief has its next step and every proposal is a card with its task waiting on it.
3. A send that says the hub started an attempt carries nothing to do yet: its report comes here when it ends.
