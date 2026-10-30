---
name: project-delegate-report
description: Handle a delegate's report or question, or an attempt the hub started, in a project's conversation. Use when a CawCo message's context line names this skill.
---

# A delegate's report or question

The send is a session's report (its headline, then what it did) or its question, from a session this conversation is the parent of: one you delegated, or an attempt at a task the hub or the person started.

1. **Read the report against its brief.** For an attempt, read its task with `task_read({ id })` and set the report beside the acceptance list. Done when you can say what landed, what failed, and what is left.
2. **Act on it**:
   - a question: answer it with `answer_delegate`, or ask the person with `ask` when it is theirs;
   - a failure you can fix with a new brief: `task_retry`, or a fresh delegate;
   - work that landed: move its task on with `task_update` and a reason naming the commit, unless the project's review or the dispatcher moves it;
   - work the person must see: `send_to_user` with the link.
   Done when every open point has a next step.
3. A send that says the hub started an attempt carries nothing to do yet: its report comes here when it ends.
