# Cawco-Dev's project page, as options: design preview

The advisor's options for the project page (report 1168cfbb: head H1/H2,
desk board D1/D2, the Table T1, phone P1/P2, the needs-you card C1/C2, the
task pane K1 with its fork, failure F1/F2, Caw's column S1/S2), drawn on the
owner's own tasks as the hub holds them, beside Today's live captures.

```sh
python3 -m http.server -d design-previews/project-options 8080   # any static server on this folder
bun scripts/probe-kit/run.ts project-options-preview              # the proof (Chromium + WebKit)
bun design-previews/project-options/capture/capture.ts            # remake parts.js, house.css, fonts/
bun design-previews/project-options/capture/shots.ts              # remake captures/ and its manifest.json
```

- `index.html`, `index.js`: the switches (width, Today, his board's state,
  what is open beside it, the view, and one per choice: H, D, P, C, K, F, S)
  over one frame. Picking an option shows it (C and K a board where something
  waits, K the pane, S Caw's column, F the failed read, P a phone).
- `frame.html`, `frame.js`: one page at its own viewport, set together from
  the captured parts the way the page stands them; `preview.css` draws only
  what stands round them.
- `parts.js`, `house.css`, `fonts/`: written by `capture/capture.ts`, which
  mounts `capture/Stage.svelte` on the dashboard's dev server: every option's
  part built from the dashboard's own parts (`capture/kit.js`: BarGlass,
  Button, Badge, Checkbox, the Select trigger, the chip and dock-shell
  recipes, OsMark, TaskRing, NewTaskForm, Markdown, the house icons) and its
  token utilities, on `data/tasks.json`. Generated; never edited by hand.
- `data/tasks.json`: the 63 task records from the hub (tasks.tgz), cut to
  the fields drawn. Every title, description, acceptance, to-do, headline and
  report shown is the record's (the spec reads each).
- `shell/`: the Shell's rail and glass group, and the phone's sidebar toggle
  and Caw tab, cut from the live captures: unchanged, they keep their live
  look. `today/`: the live captures themselves.
- `caw/`: Caw's six poses (below). `captures/`: every option at 1440 and
  390, H and D also at 1037, Today for H, D and P, and `manifest.json`.

Sizes the token source has no token for yet stand in `capture/stage.css`,
each the advisor's number: D2's 300px column, the 480px pane, the 400px
column, the 420px phone sheet, the 120px hero, D1's 1100px fit. A size that
is picked becomes a token in `design/tokens` before it ships.

## Drawn for the state

His board today has nothing waiting, nothing live and nothing failed. Where
an option needs such a state, a real task's record carries it and the switch
page says so:

- **Something waits**: tsk-17's session asks him (in Working; today it is
  Ready with no attempt). No record holds an ask, so its words stand as the
  slot «the session's ask, in its words» (C2: «what the session asks to run,
  in its words»), and its mark has no time. tsk-16 handed in for review (in
  Review; today it is Done), its handed-in date the record's.
- **The hub didn't answer**: the 502, the retry clock (12 s) and the time
  the board last read (14:02) are the advisor's words; tsk-3's file not
  reading carries the item-sized failure.
- **The pane** is tsk-16 drawn as if it stood in Review. The hub recorded no
  diff for it, so the pane has no Changes section; its History is filed,
  attempt started, attempt handed in (its close is left out, as it is drawn
  not closed yet).

Times are said in Asia/Qatar, as his browser says them (the report printed
UTC: tsk-16 handed in at 02:06 UTC, 05:06 here).

## Caw

Every still is a Backlot `backlot_edit_image` of his open-eyed source still,
the cut-out take `tk_689t8aVLxt1_jA_ojCjfk` of
`assets/mascot/stills/light-ready.png`, two takes per pose, the advisor's
instruction sent word for word. The first round, sent with `transparent: true`,
came back as copies of the source (that call cuts out and leaves the
instruction aside); the same instructions sent with it off made the poses,
and each was then cut out by a second call with `transparent: true` and no
instruction. Here each take's halo (alpha under 96) is cleared, only its
largest shape kept, it is cropped as its pose asks (a full figure seat cut
to its top 62% for head and shoulders; the lead's head its top 45%, the beak
at the right edge), its mass centred on the image's axis, and sized for its
place (seats 80px for a 20px glyph, the lead 112px for 28px, full figures
240px tall for 120px).

| Pose | Stills | Edit takes | Cut-out takes |
| --- | --- | --- | --- |
| 1 The seat, idle | `seat-idle-a.png`, `seat-idle-b.png` | `tk_J5F-xVSx_DMMApCMlCZ4s`, `tk_zZglli419PCrKr0d5Buuw` | `tk_hFK8fVwd0V8L1i0fr_eNN`, `tk_GG2LGayLMEaK_YkR-n3iL` |
| 2 The seat, asking | `seat-asking-a.png`, `seat-asking-b.png` | `tk_a80FWXWD9Tw7HLPqgnHC2`, `tk_TM7wZEsmOgx5Yv3qNPe1B` | `tk_f2i2H4v4n4zsXUZ1-DzVc`, `tk_XdHOMgmX_sVxFc9BTCxCm` |
| 3 The seat, working | `seat-working-a.png`, `seat-working-b.png` | `tk_6RAQv7GhDzxRzyS5oBfI9`, `tk_YyNEdkgmDazEzmn5Q043K` | `tk_EefdI9r_K_PO8tn3U-LXC`, `tk_48I6YDaf5VNTTY7FIBJZt` |
| 4 The column hero | `hero-a.png`, `hero-b.png` | `tk_XFD7U_bMiIv30qhjsi3SZ`, `tk_AEgVu2i-KTxval0feGcFf` | `tk_V2i95LaEnSdD07UgybK58`, `tk_lZOEHa5P-sYh37bubXOIU` |
| 5 His line's lead | `lead-a.png`, `lead-b.png` | `tk_haQN3TV97qO1DHyAUi58A`, `tk_XNedvLQI1BVrOdanzxq2V` | `tk_80EuDxGUC0iVAvBbVjP5l`, `tk_FbuooARsRLHZ8vU87Z-iJ` |
| 6 The empty board's starter | `starter-a.png`, `starter-b.png` | `tk_K8ZutLyHm1dK4mMvOHtCg`, `tk_x1suOXow9qhvuM7sUVzzW` | `tk_gm6lADpYg1sv0Isu6WtVT`, `tk_m1upzIawrBOcvQs6_e0Un` |

The preview places `seat-idle-a` (Ask Caw's glyph) and `hero-a` (Caw's
column). The asking and working seats, the lead and the starter have no
moment in his data today (no Caw line, no turn, no empty board), so they are
not placed. Their anatomy has not been read here.

## Open questions

The advisor's own calls, drawn as he wrote them:

1. T1: Done and Dropped folded by default.
2. T1 and P2: closed heads pinned above and below the open group (no
   reference behind it). Drawn on desk and phone alike.
3. F: the retry clock's backoff (drawn from 12 s, then 20, 40, capped at 60).

Calls made here where the report was silent or split (each the smallest
that draws the option; each is the owner's to change):

4. The live rail is 228px, not the 300px the report measured with: content
   is 1212px at 1440 and 809px at his window. H1 there has 6px to spare at
   rest; with F2's "stale" on the place it has none, so the machine's name
   folds into the control's label at 1037 (the OS mark and +50 stay).
5. F2's dot and "stale" take the failed hue; F1's band is the raised
   surface with the tile shadow. The report names neither.
6. K1-review: the bar's centre holds the condensed title and the stage
   control moves into the trailing group (the report puts both in the centre).
7. K1's Done when shows the record's acceptance text over its two to-dos.
8. With the pane open on a desk two corals stand, Ask Caw in the page's bar
   and Approve in the pane (the report: "the pane's one coral"; DESIGN.md:
   one per view).
9. The pane and Caw's column stand under the page's bar, beside the board,
   not the window's full height.
10. Where something waits, tsk-17 stands in Working (its session is the one
    asking) and the phone opens on that stage (P1's chosen chip, P2's open
    group).
11. An empty stage's well says nothing; the report asks for "one line" but
    gives none.
12. Titles are never clamped: the report's 3-line clamp under 260px meets
    its own D1 critique (a title at 7 lines). D1's columns are 224px at 1440,
    titles to three lines.
13. On a phone the Shell's Caw tab stays in the top bar, so Caw shows twice
    (the tab, and Ask Caw's face in the foot bar).
14. H1's views stand centred in the room between the leading and trailing
    groups, 25px left of the bar's own centre at 1440.

Not drawn: Caw's line row ("Caw asks: …"), as no record holds a line of his;
the folded view pill's popup (its counts) and the place's popover at rest;
the archive rail (no task is archived); a first read that never succeeded
(the skeleton under F); Caw can't start.
