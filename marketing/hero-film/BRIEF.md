---
workflow: motion-graphics
flow: automation
storyboard: no
mode: autonomous
destination: cawco.dev hero, beside the headline
aspect: 2400x1500 (16:10 at 2× for retina)
length: 12s seamless loop
language: none on top of the product; the product's own English UI
narration: no
audio: none
---

# Caw&Co hero film

## Message

Caw&Co is one board for every agent on every machine: you see what needs
you, answer it where you are, and work fans out across the fleet and comes
back.

## What the owner asked

A design critique said the landing page has no real product picture near the
top. Asked whether to add a real screenshot, the owner answered "hyperframes
hi def animations". An earlier 28 s launch film was rejected ("the video is
terrible, scrap it"), so this is not a launch film or a trailer: a quiet loop
of the product doing its work.

## Source of truth

The real dashboard, unmodified (`apps/dashboard` on `vite dev`), run against a
stand-in hub that speaks the hub's own wire with a made-up fleet
(`capture/hub.ts`, `capture/fleet.ts`). No lookalike UI, no live-hub data, no
generated imagery of UI. The film is the dashboard filmed frame by frame
(`capture/capture.ts`): its own components, tokens, curves and Caw.

## The loop (story seconds)

The focal session is ledger-api's "Speed up the invoices list", Claude Code
on cloud. The rail shows the fleet: sessions on cloud, dev-vm and laptop, on
Claude Code, OpenCode and pi.

| s    | What happens in the product                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 0    | The board at rest; working sessions breathe.                                                                 |
| 1.2  | The session asks to read a query plan on the replica: needs you. Caw's head beats, the Fleet count turns.    |
| 2.9  | Approve is pressed in the composer (a real press; the dashboard sends the answer, the hub settles it).        |
| 4.4  | The plan comes back: 3.9 s, a sort that spills to disk.                                                      |
| 5.4  | It hands a delegate to dev-vm; the delegate card and tray chip arrive.                                       |
| 6.1  | The delegate is unfolded under its parent in the rail: "dev-vm · ledger-api".                                |
| 7.3  | The session edits the query while the delegate works.                                                        |
| 9.0  | The delegate reports back (3,912 ms → 41 ms) and moves to Finished.                                          |
| 9.9  | The session says what the report means.                                                                      |
| 11.2 | The board dissolves back into its first frame.                                                               |

## Candidates (one choice each)

- `still`: the whole window, still camera.
- `push`: the whole window; the camera leans in on the session as it asks
  (1 → 5 s, to 1.06×, anchored near the rail so the rail stays in frame) and
  back out as the delegate reports (9 → 11.2 s).
- `close`: framed on the session alone (its pane and composer), no rail.

Rendered in the paper (light) theme; `still`, the calmest, also in the night
theme (`still-night`).

## Decisions

- Workflow `motion-graphics`: short, unnarrated, motion is the message.
- 12 s: six of the board's 2 s breaths and ten of its 1.2 s loops, so every
  ambient loop is in step across the seam.
- Camera moves on the dashboard's own ease-in-out (`0.77, 0, 0.175, 1`).
- No text overlays, no cursor drawn: presses show as the product's own hover
  and press states.
