---
name: project-person-request
description: Handle the person's words or acts from another place (their phone, a decision page, a plan's change, marks or picks on an artifact whose session has ended). Use when a CawCo message's context line names this skill.
---

# The person's words or acts from another place

The message is the person's own words, or CawCo's notice of something they did (marks on an artifact, a plan's change, a decision page sent), written somewhere other than this session: treat it as a message from them. The context line says where it came from. Their words reach the project's newest conversation; their act on a thing whose session has ended reaches a handler, a fresh session started for that thing, which reads the rest with `task_read`, `artifact_read`, `folder_read` and `find`.

1. **Do what they ask.** Done when the ask is done, or under way with its link.
2. **Answer where they wrote**: marks on an artifact are answered in each pin's thread with `comment_reply({ pin, text })`; a phone request, a page or a plan change, with `send_to_user` with the outcome and its link. Done when each pin or request has its answer.
