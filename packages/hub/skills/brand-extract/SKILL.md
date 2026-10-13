---
name: brand-extract
description: Read a brand source (a site, a voice doc, a deck, past posts) and extract its voice, colours, type, logo rules and banned words into the project's brand kit. Use when building or updating a brand kit, a voice guide or a style guide, or when a source task moves to extract.
---

# Brand extract

The **brand kit** is the project folder's `knowledge/brand/`: the files every writer, designer and reviewer in the project reads before they work. A source task moves source → extract (the `brand` type) → review (the person) → kit. You draw out what the source shows; the person decides what becomes the brand.

## Steps

1. **Read the source whole**: every page of the site or document, every post in the sample, with the web or file tools you have. Done when you have read all of it, not a sample of it.
2. **Extract, quoting the source for each claim:**
   - `voice.md`: three to five traits, each with a quote that shows it and one line of what it rules out; sentence length, person (we or you), casing, punctuation habits.
   - `words.md`: the terms the brand uses for its own things, the words it avoids, and banned words.
   - `visual.md`: colours as hex with their roles (background, text, action), type families and weights with their roles, logo spacing and do-nots, image style.

   Write each where the task's `outputs` say (else those names). Done when every line has its quote or its source.
3. **Flag the conflicts**: where the source contradicts itself (two blues for the same role, two voices), list both with where each appears. Done when each conflict is a question for the person.
4. **Hand it to review**: move the task to review with a one-line reason, or `finish_item` inside a work item, naming the conflicts first. Done when the task is in review.
5. **After the person decides**, Caw writes the agreed files into `knowledge/brand/` with `folder_write`, and the person moves the task to kit. In a design project, colours and type also go into `design/tokens.json`.
