---
version: 1
slug: "oard-src-lib-cawco-files-filesface-svelte-57bb2d21"
primary_target: "apps/dashboard/src/lib/cawco/files/FilesFace.svelte"
related_targets: ["apps/dashboard/src/lib/cawco/files/FilesList.svelte","apps/dashboard/src/lib/cawco/files/FilesSheet.svelte"]
---

# Files: a session's artifacts and attachments

The owner's picks for Files (`files/`, its face `FilesFace.svelte`).

- Files is the one place to see every artifact and attachment of the conversation on screen, in two sections, Artifacts and Attachments.
- On a desk it is a small item at the top right, the first of the glass group: a folder symbol (never a square-looking glyph), its count part of the group, never larger than the symbol. It never takes page control.
- Its card floats over the conversation, never moving it. Each section scrolls within itself, headed by its icon, the two parted by a vermillion rule.
- Artifacts are a masonry of thumbnails.
- From the keyboard the list is one Tab stop: Up and Down move through a list, all four arrows through thumbnails, Enter opens.
- Search is semantic, as the composer's is, over an artifact's title and its words.
- An artifact opened from Files opens in the session's panel, and Files goes.
- On a phone Files is the vaul drawer, opened from the sidebar or a swipe from the screen's right edge, with Artifacts and Attachments as tabs.
