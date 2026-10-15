# Caw's floating panel: preview captures

Not for main. Captures of `/motion/caw-assistant?state=<state>`, the real project page with only the hub mocked (`stand-in.ts`), taken with playwright-core and the cached Chromium (`waitUntil: "domcontentloaded"`, 2.5s settle, deviceScaleFactor 2). The dev server ran with `CAWCO_DEV_HUB_URL=http://127.0.0.1:4456`. Viewport 1440×900, or 390×844 (touch) for names ending in `-390`. On the phone the panel is the kit's bottom sheet.

- `first.png`, `first-390.png`: 1 First open. No thread yet. Caw at 80 as the hero, "Caw", "Awake · resting", and four starter chips (kit option chip with Solar glyphs) above the session Composer.
- `typing.png`: 2 Starter picked. "Catch me up on what ran today" is in the Composer, caret after it, nothing sent.
- `sent.png`: 3 Sent, waiting. The hub holds the send. Your row is noted "sending…", with Caw's "Waking…" row under it. The head reads Caw / "Waking…" with New thread and Open as a tab.
- `thinking.png`: 4 Thinking. Your row is noted "delivered", with Caw's live thinking row.
- `streaming.png`: 5 Streaming. Caw's reply streams in, held at 75%.
- `replied.png`, `replied-390.png`: 6 Replied. Your row, then Caw's finished reply.
- `failed.png`: 7 Didn't wake. Your row is noted "didn't wake", with the reason and Try again over the Composer.
- `off.png`: 8 Caw off. The head reads "Caw · off" / "Answers when you write · Turn on".
- `earlier.png`, `earlier-390.png`: 9 New thread, after pressing New thread. The hero and chips, then "Earlier" with the project's three threads as SessionRows.
- `card.png`, `card-390.png`: 10 Caw's session card. His name opens SessionDetails for his lead session: his on/off switch ("On") first in the settings row, then Claude Code / Opus 5.5.
- `card-off.png`: 10 after flipping the switch. The card reads "Off", and the panel reads "Caw · off" / "Answers when you write · Turn on".
- `offturn.png`: 13 Turning him off mid-turn. Under the card's settings row: "Reading tsk-12's report. Off, it can finish or stop now." with Let him finish / Stop now.
- `capped.png`: 14 Past the spend cap. The panel's line and the project head's both read "Budget reached · resets in 3h 59m".
- `board.png`, `board-390.png`: 11 Empty board. Caw at 80, "Nothing on the board yet", and the starter chips with no field. A chip opens his panel with its words in the Composer.
- `view.png`: 12 Ask Caw for a view. The session Composer floats under the strip's button with no card of its own.
