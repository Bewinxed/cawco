---
name: social-post
description: Draft a social post for a project's idea task in the brand's voice, with its assets, alt text and links, checked and scheduled through an approved action. Use when writing, drafting, replying to or scheduling a post, a thread or a reply for the project's accounts.
---

# Social post

A post moves through the project's stages: idea → draft → review (the person) → scheduled → posted → measured. You write the draft; the person approves it; the hub posts it once, as an **approved action**. You never post yourself.

## Steps

1. **Read the task** (`task_read({ id })`): its idea, the account, the platform, `post_at` if it has one. Read the brand kit, the voice notes, the banned words and the last posts that did well, from the project folder's `knowledge/` (your brief carries them; Caw reads them with `folder_read`). Done when you can name the voice in three words and the one thing this post must make the reader do.
2. **Draft it** into the file the task names in `outputs` (else `post.md`): the text, then each image or video with its alt text, then each link. Write two or three variants when the idea allows more than one angle, the strongest first. Done when every variant fits the platform's length, every link opens, and no banned word is in it.
3. **Tick the to-dos** with `todo_write` (assets, alt text, links), and check off the task's `checks` (length, links, banned words). Done when every to-do is ticked and every check passes.
4. **Hand it to review.** Set `post_at` if the task lacks it (`task_update({ id, fields: { post_at: "<ISO time with zone>" } })`) and move it to the review stage with a one-line reason. Inside a work item, `finish_item` instead and say which variant you recommend. Done when the task is in review.
5. **Schedule after approval.** Once the person has picked a variant and moved the task to scheduled, propose the post: `action_propose({ connection, tool, args, run_at: post_at, reason, task, then_stage: "posted" })`, with the exact text and media as approved. The hub posts it once at `run_at`; a routine measures it later. Done when the action is filed and its id is on the task as a comment.
