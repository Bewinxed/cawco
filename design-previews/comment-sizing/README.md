# How a comment opens: design preview

The three answers to "a long reply opens in a tiny card at the bottom" (report
aba6492c), on one static page: the preview pane at its real size, a decision
page in its well, the comments' pills on it, the Comments rail, and the open
thread where the chosen option puts it.

```sh
python3 -m http.server -d design-previews/comment-sizing 8080   # any static server on this folder
bun design-previews/comment-sizing/capture/capture.ts            # remake parts.js, house.css, fonts/
```

- **Option**: A, beside the comment (the proposed card, played live: the
  PinFloat built at f38a69173, two fifths of the well, 280 to 480px, hung from
  its pin's foot as the top bar's card hangs from its glass, sliding out of
  it with the foot's liquid bridge, as tall as what it holds up to the page
  area, moved up to stand whole near the foot, standing still as the page
  scrolls until its pin leaves its edge); B, a 320px card at most min(480px, 50%)
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

- `live-card/`: the float over the page, live: `card.js` and `card.css`, the
  proposed thread card (PinFloat with its HangCard and PinFoot, and their
  stylesheet) as built at f38a69173; every option's card, composer and foot
  sheet is it, at the option's width. That card left the product until its
  design is approved (4f12dbb2f), so nothing rebuilds it: it is the proposal
  as it stood.
- `parts.js`: every other comment part as its real component drew it
  (PinCard, CommentRail, CommentComposer, PinMark, the kit's Button and
  split handle), mounted with `capture/fixture.js` by `capture/Stage.svelte`
  in the dashboard's own dev server; the live card holds PinCard's.
- `house.css`: the dashboard's stylesheet cut to the rules those parts reach;
  `fonts/` the two faces they draw in.
- `preview.js` places them: tells the live card where the pill and what it
  is about stand (as the page's overlay tells the pane), each option's
  sizes, the page lifted clear of a drawer, and the house motion for what is
  not the card (`morph`'s width tween for a hand-off, `railIn` and
  `railOut`, `unfold` for a row opening). It copies none of the card's
  placement or motion. What is shown is kept through a reload: the
  option, the comment and the screen are the shared state switcher's
  (`state-switcher.js`, a copy of `design-previews/state-switcher.js`),
  named in the address.
- `preview.css` draws only what stands round the parts: the bar, the
  frame, the pane's head, the decision page, each option's holders.
