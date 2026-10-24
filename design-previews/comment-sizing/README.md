# How a comment opens: design preview

The three answers to "a long reply opens in a tiny card at the bottom" (report
aba6492c), on one static page: the preview pane at its real size, a decision
page in its well, the comments' pills on it, the Comments rail, and the open
thread where the chosen option puts it.

```sh
python3 -m http.server -d design-previews/comment-sizing 8080   # any static server on this folder
bun scripts/probe-kit/run.ts comment-sizing-preview              # the proof (Chromium + WebKit)
bun design-previews/comment-sizing/capture/capture.ts            # remake parts.js, house.css, fonts/
```

- **Option**: A, beside the comment (what main ships: two fifths of the well,
  280 to 480px, PinFloat's placement); B, a 320px card at most min(480px, 50%)
  of the well tall (our call: the report's min(400px, 40%) was under what a
  three-entry one-line exchange needs, so B never drew its card), a thread
  whose whole exchange needs more handed to Comments at 400px (500px on a pane
  1680px or wider), a phone's short one a drawer and its long one its row of
  the list; C, a
  280px composer card, every thread in a panel at the pane's end, 400px to start,
  dragged from 300px to half the pane, in the list's place, a phone's a drawer.
- **Comment**: the owner's case (comment 3 near the foot of the page, a
  three-entry thread whose agent reply is about 185 words with bullets) with
  Comments open and shut, a short exchange (one line each), a new one.
- **Screen**: Desk 1440 × 900, his window 1037 × 760 (637 of page beside a 400
  rail), Phone 390 × 844.

What it is made of:

- `parts.js`: every comment part as its real component drew it (PinCard,
  CommentRail, CommentComposer, PinMark, PinFloat's own element, the kit's
  Button and split handle), mounted with `capture/fixture.js` by
  `capture/Stage.svelte` in the dashboard's own dev server.
- `house.css`: the dashboard's stylesheet cut to the rules those parts reach;
  `fonts/` the two faces they draw in.
- `preview.js` places them: PinFloat's placement ported line for line, each
  option's sizes, the page lifted clear of a drawer, and the house motion (the
  card's grow from its pill, `morph`'s width tween for a hand-off, `railIn` and
  `railOut`, `unfold` for a row opening). What is shown is kept through a reload.
- `preview.css` draws only what stands round the parts: the switches, the
  frame, the pane's head, the decision page, each option's holders.
