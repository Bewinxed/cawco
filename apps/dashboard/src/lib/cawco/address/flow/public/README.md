# Open CawCo by one word: design preview

The word-address flow (design e791c712, §4) as one static page: the tray at
its real size in Caw's Needs you (380, the row growing into it), floating over
Configure › Devices (380, from Set up), and as a 390 phone's bottom sheet, all
three driven by one flow. Beside them, in the shared state switcher
(`design-previews/state-switcher.js`), the two real forks (the network:
Tailscale, Headscale, NetBird; certificates already on when cawco joins, or
off), Day or Night, and every step and failure to jump to. The trays' own buttons move the
flow on; a waiting state moves on by itself a few seconds later, as the hub
would. Where it stands, and which trays are parked, is kept across a reload.

```sh
python3 -m http.server -d design-previews/address 8080   # any static server on this folder
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
- **Two button words that need the button-verb allowlist.** The preview uses the
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
drawn: 8px at 512, one pixel at his 64px box, round every part of him, wing
tips and props included (the drawing's alpha above 32, dilated). Made here,
not in Backlot: it is the day take, rimmed (`flow/caw/*-night.png`).

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
out by a second call, `transparent: true` and no instruction. Each chosen
still has the soft halo a take leaves round the drawing cleared (alpha under
96 of 255), is drawn at 0.9 of its size so even a raised wing or a prop stands
clear of the canvas's edges, its body's centre of mass on the image's centre,
then scaled to 256px (`flow/caw/`). Every chosen take was read for anatomy
(two wings, two feet, one beak, two eyes) before it was kept.

| Moment | Still | Operation | Take |
| --- | --- | --- | --- |
| Start | `start.png` | wing on the right raised in a small wave | `tk_Lh_9EsTY5NmG9VDuW635o` |
| Waiting for your sign-in | `waiting.png` | a spyglass at his eye, the wing on the right lifting it, his beak below | `tk_xdZe9twONcXPpnnZ8inwT` |
| Waiting for your admin (Headscale) | `admin.png` | a large envelope leaning on his legs, head down to it | `tk_uYfIHsjLknnr3_3VeaTW_`, cut out of `tk_tyarPJFjcFoPRpZnUtq3q` |
| Setup key (NetBird's Start) | `key.png` | key added crosswise in his beak tip | `tk_bUOBAwEywYVHGms25bz7N` |
| Answers (listening) | `listen.png` | head tilted, three sound lines beside it, both wings as they were | `tk_lxK6PfwZh6bIF4R5tM8-r`, cut out of `tk_Obt9H5MTRapgS4PvX3IiC` |
| Phone, waiting | `phone.png` | phone added at his chest | `tk_Zs1BxX8g0NctuJpYJV_w1` |
| Phone opened it | `phone-up.png` | the wing on the left raises the phone above his head, his beak clear | `tk_AGuufj4nk7qDf0iU-_HXS` |
| HTTPS, asking | `lock-open.png` | an open padlock as tall as his body beside him | `tk_U9eMxK3NlYZSRZBdFjRqH`, cut out of `tk_HzRcQpfvrul1MKlhfdWdr` |
| HTTPS on | `lock-shut.png` | closed padlock added, wing tip on it | `tk_SYnHNLadX95wUd32_P0m7`, cut out of `tk_737sowHFPEbZ9o--HnbW_` |
| Live | `live.png` | a pennant flag raised in the wing on the right | `tk_WuMj02mR4AaQsA96oDFfJ`, cut out of `tk_lwoaQ47LSwLB2MqL7u6Re` |
| Failure | `shrug.png` | both wings lifted to one height, tips up: a shrug | `tk_j2OrAhJfvtIZl-SqJJume`, cut out of `tk_KIRRspZG6FjM_7T7godVH` |
| Name taken | `shrug-tag.png` | a large torn luggage tag hanging from his wing tip | `tk_zFVvO5ZW0WxGNdjJMOwbq`, cut out of `tk_esrnVofyY4rNrbOomvFPy` |
| Signed out | `shrug-hourglass.png` | the shrug, a run-out hourglass beside him | `tk_aJfYqQK-FZUnj2jmjQ5Z_`, cut out of `tk_EacCJXTyV-z5D0r1paf7c` |

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
