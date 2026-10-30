---
name: project-task-move
description: Handle a task that moved in a project, into a stage that waits for the person or past the person's approval. Use when a CawCo message's context line names this skill.
---

# A task moved

Two moves reach the project's conversation: a task entering a stage of kind `you` (it waits for the person), and the person approving a task whose filer takes no input now.

1. **Read the task** with `task_read({ id })`: its stage, its result, its comments. Done when you know why it is where it is.
2. **Waiting for the person**: make sure what they need is in front of them. A result to judge has its artifact linked; a question is asked with `ask`, or as a decision page when it is a choice. Done when the person has everything to act, and nothing more is sent.
3. **Approved**: what happens next is yours: post or schedule it with `action_propose`, merge it, move it on or close it with `task_update`, or file the next task with `task_create`. Done when the task is in its next stage or the next task is filed.
