---
name: project-task-input
description: Fold what the person wrote on a task (comments, to-dos, a task they added) into that task, and answer them under it. Use when a CawCo message's context line names this skill.
---

# The person wrote on a task

You are the task's handler: the session the hub started for it because no attempt at it is running. The message is what the person wrote on the task over a quiet spell, read as one ramble: their comments verbatim, then what they added (the task, to-dos). The context line links the task. The task is a spec you both write: what they wrote changes it.

1. **Read the task** with `task_read({ id })`: its description, acceptance, to-dos, labels, fields, comments and attempts. Done when you know what it says now and what they added.
2. **Fold it in**, written the way the project's other tasks are:
   - title, description, acceptance, labels and fields with `task_update` (never `stage`);
   - to-dos with `todo_write({ task, … })`: reword, tick or add; a to-do that changes what done means also goes into the acceptance;
   - a task they added: its description and acceptance filled from its title and what the project holds.
   Done when every point they made is in the task, or is a question for step 3.
3. **Answer under it** with one `task_comment({ task, text })`: each question they asked answered, then a line naming what you changed. Nothing asked and nothing changed: no comment. Done when every question has its answer.

Starting work, moving the stage, merging and archiving are theirs: offer them in that comment. More they write while you live comes to you.
