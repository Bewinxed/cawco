# Open CawCo by one word: design preview

The word-address flow (design e791c712, §4) as one static page: the tray at
its real size in Caw's Needs you (380, the row growing into it), floating over
Configure › Devices (380, from Set up), and as a 390 phone's bottom sheet, all
three driven by one flow. Above them, the two real forks (the network:
Tailscale, Headscale, NetBird; certificates already on when cawco joins, or
off) and every step and failure to jump to. The trays' own buttons move the
flow on; a waiting state moves on by itself a few seconds later, as the hub
would. Where it stands, and which trays are parked, is kept across a reload.

```sh
python3 -m http.server -d design-previews/address 8080   # any static server on this folder
bun scripts/probe-kit/run.ts address-preview              # the proof (Chromium + WebKit)
```

It is built, not written by hand: the source is
`apps/dashboard/src/lib/cawco/address/flow/` (the flow, its words, the tray,
Caw's still, the three frames and the page; its build config is
`apps/dashboard/scripts/address-preview.vite.ts`), drawn from the dashboard's own
components and stylesheet, and the kept drawing's `motion.ts`, `PhoneQr`,
`Confetti`, `Words`, `preview/AddressRow`, `preview/SettingsRow`, `NETWORKS`
and its words. To rebuild it:

```sh
bun apps/dashboard/scripts/house-faces.ts
cd apps/dashboard && bunx vite build --config scripts/address-preview.vite.ts
```

## Proposed, not in the house yet

- **The QR at 160px.** The report draws the phone step's QR at 160 (§4.2);
  the house token `--c-address-qr` is 112. The preview draws 160 through a
  preview-local value (`flow/proposed.ts`, `PROPOSED_QR`), labelled
  "proposed; the token moves to 160 if picked". With it the phone step stands
  tallest of the flow, as §4.8 has it.
- **Two button words that need WORDS.md's allowlist.** The preview uses the
  allowlisted wording; the owner picks:

  | Where | Allowlisted (drawn) | The report's (needs the verb added) |
  | --- | --- | --- |
  | Start's button | Open Tailscale sign-in | Sign in to Tailscale |
  | Headscale's refusal | Open the command | Show the command |

## Text and Caw

Every word in the tray stands at its one leading edge (`text-align: start`),
titles, lines, failure lines and Show details alike, at desk and phone; only
Caw, the illustration, is centred on the tray's axis.

## Day and night

The page switches Day and Night (the house theme). By night each still is the
same day drawing on the paper rim `assets/mascot/stills/dark-ready.png`
carries, in its colour (243, 239, 229), cut wide enough to read where Caw is
drawn: a 10px disc on the 512 canvas, over one pixel at his 64px box, round
every part of him, wing tips and props included (the drawing's alpha above
32, dilated). Made here,
not in Backlot: it is the day take, rimmed (`flow/caw/*-night.png`, by
`still.py`).

## Caw

Each pose is a Backlot edit (`backlot_edit_image`, `transparent` off) of his
open-eyed source still, `assets/mascot/stills/light-ready.png`, written the
way Qwen's edit-prompt guide asks (QwenLM/Qwen-Image-2.1,
`prompt_rewrite/prompts/system_prompt_edit.txt`): the operation first, naming
which existing part moves from where to where (a prop as Add, with its size
and place), then, verbatim, "Everything else stays exactly as in the input
image: the same character drawn the same way, his proportions, colours and
line, two wings and two feet, and the transparent background." No line
describes Caw himself. Each change is small; the report's §4.4 poses that
needed a large one (sitting, a wing shading the eyes) are drawn as the
nearest small one.

The source went in once (quantised to 64 colours, 10 KB, its error at most 63
of 255 on any channel and 1.2 on average) through a cut-out call with
`transparent: true` and no instruction, `tk_689t8aVLxt1_jA_ojCjfk`; every pose
is an edit of that take. A take that came back on an opaque ground was cut
out by a second call, `transparent: true` and no instruction.

Then two steps, both scripts beside this README:

1. **Measure, then clean** (`halo.py`). An edit can draw a pale sticker
   outline round him that the cut-out keeps. `python3 -I halo.py measure
   take.png` counts the light pixels in the edge band (figure pixels within
   6px of the clear ground); the source cut-out has 335. `python3 -I halo.py
   clean take.png clean.png --source source.png` measures both and, where the
   take's band is over the source's, floods from the clear ground through
   light pixels no deeper than 12px (a pale prop keeps its inside). It then
   clears the violet ground left in small pockets (a patch under 400px of
   light pixels tinted blue over red, as between a wing and the body) and the
   soft halo under alpha 96.
2. **Set** (`still.py clean.png caw/<pose>.png caw/<pose>-night.png`): drawn
   at 0.9 of its size so even a raised wing or a prop stands clear of the
   canvas's edges, its centre of mass on the vertical axis, its lowest pixel
   on the stills' one ground line (232 of 256), scaled to 256px; the night
   twin on its paper rim.

Every chosen take was read for anatomy (two wings at the source's size, two
feet, one beak, the large eye and the small second eye) and for its prop at
64, 80 and 230px before it was kept.

| Moment | Still | Operation | Take |
| --- | --- | --- | --- |
| Start | `start.png` | wing on the right raised in a small wave | `tk_Lh_9EsTY5NmG9VDuW635o` |
| Waiting for your sign-in | `waiting.png` | a spyglass at his large eye, pointing away from the beak, so the beak and the small second eye stay uncovered | `tk_TOimQK_cTSeseRWQ2-kfN`, cut out of `tk_47DF3jIKhaqyn__uDFoft` |
| Waiting for your admin (Headscale) | `admin.png` | a large envelope leaning on his legs, his head and both wings as they are | `tk_CZpG76EjUabhQUJXkVfZw`, cut out of `tk_12XziJA79RmwdJlI0m8na` |
| Setup key (NetBird's Start) | `key.png` | key added crosswise in his beak tip | `tk_bUOBAwEywYVHGms25bz7N` |
| Answers (listening) | `listen.png` | head tilted, three sound lines beside it, both wings as they were | `tk_lxK6PfwZh6bIF4R5tM8-r`, cut out of `tk_Obt9H5MTRapgS4PvX3IiC` |
| Phone, waiting | `phone.png` | phone added at his chest | `tk_Zs1BxX8g0NctuJpYJV_w1` |
| Phone opened it | `phone-up.png` | the wing on the left raises the phone above his head, his beak clear | `tk_AGuufj4nk7qDf0iU-_HXS` |
| HTTPS, asking | `lock-open.png` | an open padlock as tall as his body beside him | `tk_U9eMxK3NlYZSRZBdFjRqH`, cut out of `tk_HzRcQpfvrul1MKlhfdWdr` |
| HTTPS on | `lock-shut.png` | closed padlock added, wing tip on it | `tk_SYnHNLadX95wUd32_P0m7`, cut out of `tk_737sowHFPEbZ9o--HnbW_` |
| Live | `live.png` | a pennant flag raised in the wing on the right | `tk_WuMj02mR4AaQsA96oDFfJ`, cut out of `tk_lwoaQ47LSwLB2MqL7u6Re` |

Every failure is the shrug (both wings lifted to one height, tips up) with a
prop for what went wrong; each instruction opens "Lift both wings a little
out from his sides to the same height, their vermilion tips turned up and
open, as a small shrug." and adds the prop:

| Failure | Still | Prop | Take |
| --- | --- | --- | --- |
| Client stopped | `shrug-plug.png` | a big unplugged power plug hanging on its cord from the wing tip | `tk_Y5k2WWfv5SI-13KXKyPWe`, cut out of `tk_sg27DA3pNkgrKhn8r7-Du` |
| Unsupported network | `shrug-sign.png` | a signpost with two blank arrow boards beside his feet | `tk_wHkGCpwJe0MVyIOqI5r2Y`, cut out of `tk_1nIo7YrtsoOFeMSKZ7HBt` |
| Sign-in link expired | `shrug-chain.png` | a chain of two big links from the wing tip, the lower one snapped open | `tk_SlVdtzGi1XsQ8z8URn704`, cut out of `tk_813zV9wTuzcc22T1m04Um` |
| Another tailnet | `shrug-map.png` | a big unfolded map beside his feet, a vermilion dashed line winding to an X | `tk_flbuuxUg8rTWt3jYsWwsR`, cut out of `tk_etp6RHQtW8669pB0fUCC0` |
| Admin refused | `shrug-envelope.png` | admin's envelope beside his feet, a vermilion cross stamped on it | `tk_nyyGNMORk9WaWOA4eC5KY`, cut out of `tk_FarbZO2fqgqUBfjHwHC_n` |
| Key refused | `shrug-key.png` | a big key standing beside his feet, its bow as wide as his head, the shaft snapped in two | `tk_ydDJMc4ZFhgkYcZbo4cFt`, cut out of `tk_H-UuKYR4R38YOZt_eAm8t` |
| Name taken | `shrug-tag.png` | a large torn luggage tag hanging from his wing tip | `tk_zFVvO5ZW0WxGNdjJMOwbq`, cut out of `tk_esrnVofyY4rNrbOomvFPy`, its pale fringe cleaned by `halo.py` |
| Doesn't answer | `shrug-phone.png` | a desk telephone beside his feet, the handset off the hook | `tk_iHoObbjYp7-UfRdx3Cusm`, cut out of `tk_BU29S9U09odQdzOw-ENSm` |
| Signed out | `shrug-hourglass.png` | a run-out hourglass beside him | `tk_aJfYqQK-FZUnj2jmjQ5Z_`, cut out of `tk_EacCJXTyV-z5D0r1paf7c` |
| Certificates off | `shrug-cert.png` | a certificate with a vermilion seal beside his feet, torn halfway down | `tk_j6s5nj5fgIF3G0zRYUZVN`, cut out of `tk_g6xJgO6hx7ZPQ2OEEklbF` |

Passed over in the read: the third round's spyglass takes that hid the beak
(`tk_qZ7ulJ4sim2F6HtVe-Wt0`, `tk_0dCWGSEJuvS7IgSfOGcE0`,
`tk_dJYFgQLgQUkaXkmKKWnLR`), its phones over the head that hid the beak
(`tk_2Snx0-XuF559f3E-fwAPY`, `tk_1JekkBmlBilha9_cn1gf_`), its posts that the
canvas cut flat (`tk_M9a-RZiZkOaEwpdEHvrad`, `tk_eqChJKg-uMwN7bylIyRsO`,
`tk_KXOjxbY9f4jmVxbnnZp_P`; Live became the flag), and the other takes of each
pose. Earlier rounds (a keep-line describing Caw, `tk_cgIXBojVifk_FPQXycJiX`
and its siblings; and the second round's waiting, admin, listen, phone-up,
live, shrug, tag, padlock and hourglass, which a review found unequal wings, a
second head, a halo, a cut post and props too small at 64px) were replaced.
The fifth round passed over a plug, a chain, two keys and a map too small or
too thin at 64px (`tk_tlrLe6S1n-9oL4oiqAEFv`, `tk_polFvn6CtPthnoQkAPSGq`,
`tk_rLNqmc-aNVzHo-pJpu_Uq`, `tk_bDYh4e-U1ULWxx3GO6sym`, the map
`tk_ey_VHZ1fPj0MXibU65s5B`), keys under a plus that reads as first aid
(`tk_0px8l1cmHId13_tlSZj-T` and its siblings), maps with smaller wings
(`tk_VOTi5Cq9bWRhx4tDK7Xy0`, `tk_CwcmWVTaaOds3mBXuSKRL`), signposts that
dwarf him or cover the wing on the right (`tk_1eePob8jqmc5HHAhSGj4b`,
`tk_8D19fGOTdjF7OWBGZpus5` and their siblings), and a phone and a
certificate held over the wing on the right (`tk_aYAcoziF8yU7thqipL-qc`,
`tk_cd5L-3PiDJ2au86_PCsxP`). The plain shrug went with it: every failure now
has its own prop.
