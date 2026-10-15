# Caw dock preview shots

Screenshots of the Caw dock preview (workspace 8972732d, dev server port 5199), taken with playwright-core + cached Chromium, waitUntil domcontentloaded. Retaken after the first review's fixes. Not for main.

Route: `/motion/caw-assistant?state=<state>&foot=<field|composer>`. Viewport 1440×900 unless the name ends in `-390` (390×844 phone, dock in the kit drawer). Files ending `-1440` are the same state captured again at 1440×900.

- `composer-failed-1440.png` — 7 Didn't wake: your row noted 'didn't wake', head 'Didn't wake', failure line with the reason and a coral Try again over the foot; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=failed&foot=composer`
- `composer-failed.png` — 7 Didn't wake: your row noted 'didn't wake', head 'Didn't wake', failure line with the reason and a coral Try again over the foot; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=failed&foot=composer`
- `composer-first.png` — 1 First open: no thread yet; greeting row, Things to ask, foot; head 'Awake · resting'; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=first&foot=composer`
- `composer-off-1440.png` — 8 Caw off: head 'Caw · off' / 'Answers when you write · Turn on' on one line (transcript top unchanged); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=off&foot=composer`
- `composer-off.png` — 8 Caw off: head 'Caw · off' / 'Answers when you write · Turn on' on one line (transcript top unchanged); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=off&foot=composer`
- `composer-replied-390.png` — 6 Replied: your row and Caw's finished reply, head 'Awake · resting'; Composer foot from first open; 390×844; `/motion/caw-assistant?state=replied&foot=composer`
- `composer-replied.png` — 6 Replied: your row and Caw's finished reply, head 'Awake · resting'; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=replied&foot=composer`
- `composer-sent.png` — 3 Sent, waiting: your row noted 'sending…', Caw's 'Waking…' row under it, head 'Waking…' (send held by the stand-in hub); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=sent&foot=composer`
- `composer-settings-1440.png` — 9 Settings open: gear pressed, settings fold under the head (rows pushed down, as the design draws it); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=settings&foot=composer`
- `composer-settings.png` — 9 Settings open: gear pressed, settings fold under the head (rows pushed down, as the design draws it); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=settings&foot=composer`
- `composer-streaming.png` — 5 Streaming: Caw's reply streaming (scripted tokens, held at 75%), head 'Awake · Working…'; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=streaming&foot=composer`
- `composer-thinking.png` — 4 Thinking: your row noted 'delivered', Caw's live thinking row, head 'Awake · Working…'; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=thinking&foot=composer`
- `composer-threads.png` — Threads menu: opened from the head's Threads button, beside the dock (New thread + 3 threads, 24-hour times); Composer foot from first open; 1440×900; `/motion/caw-assistant?state=threads&foot=composer`
- `composer-typing.png` — 2 Typing: words in the field, send enabled; Composer foot from first open; 1440×900; `/motion/caw-assistant?state=typing&foot=composer`
- `field-failed.png` — 7 Didn't wake: your row noted 'didn't wake', head 'Didn't wake', failure line with the reason and a coral Try again over the foot; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=failed&foot=field`
- `field-first-1440.png` — 1 First open: no thread yet; greeting row, Things to ask, foot; head 'Awake · resting'; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=first&foot=field`
- `field-first.png` — 1 First open: no thread yet; greeting row, Things to ask, foot; head 'Awake · resting'; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=first&foot=field`
- `field-off.png` — 8 Caw off: head 'Caw · off' / 'Answers when you write · Turn on' on one line (transcript top unchanged); CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=off&foot=field`
- `field-replied.png` — 6 Replied: your row and Caw's finished reply, head 'Awake · resting'; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=replied&foot=field`
- `field-sent-1440.png` — 3 Sent, waiting: your row noted 'sending…', Caw's 'Waking…' row under it, head 'Waking…' (send held by the stand-in hub); CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=sent&foot=field`
- `field-sent.png` — 3 Sent, waiting: your row noted 'sending…', Caw's 'Waking…' row under it, head 'Waking…' (send held by the stand-in hub); CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=sent&foot=field`
- `field-settings.png` — 9 Settings open: gear pressed, settings fold under the head (rows pushed down, as the design draws it); CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=settings&foot=field`
- `field-streaming.png` — 5 Streaming: Caw's reply streaming (scripted tokens, held at 75%), head 'Awake · Working…'; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=streaming&foot=field`
- `field-thinking.png` — 4 Thinking: your row noted 'delivered', Caw's live thinking row, head 'Awake · Working…'; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=thinking&foot=field`
- `field-threads.png` — Threads menu: opened from the head's Threads button, beside the dock (New thread + 3 threads, 24-hour times); CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=threads&foot=field`
- `field-typing.png` — 2 Typing: words in the field, send enabled; CawField foot before the first send (design); 1440×900; `/motion/caw-assistant?state=typing&foot=field`
