# Caw: personality and how he moves

The owner's direction for Caw's acting and for making his animations. `README.md` beside this file is the
technical contract (files, view model, pipeline); this file is the character. Where they meet, both hold.

## Who he is

A small round fluffy crow: "earnest, a bit dopey, trying very hard". Cute in the kawaii, toy-like way of Zenless Zone
Zero's Bangboo (short, stout, big expressive eyes), with ZZZ's expressive, snappy, slightly exaggerated cartoon
acting. Calm underneath: he is never hyperactive.

## When he moves

- He moves only while something is going on, and loops only for live work and waits; a rest is one drawing, held.
  The needs-you wave is never a hello (PRD §5.6).
- One base loop per status that stays on its pose, plus an occasional gentle beat that leaves from and returns to that
  pose. Never random cycling between lively takes (owner: "using animations randomly, too hyperactive, and looping
  between them, very jarring").

## How he acts

- **A few clear beats with holds between them.** Anticipation, a crisp snap to the key pose, a small bouncy overshoot
  and settle, then the pose held long enough to read. Expressive, never constant motion or jitter.
- **Eyes are graphic shapes that swap in one drawing**, like a Bangboo's screen face: big round glossy eyes with
  large pupils; happy `^ ^` upward arcs for a few drawings, then straight back to round; at most a wink. Never a lid
  tweening half-closed, never squinting or heavy-lidded (owner, on a squint: "looks like he's high on weed").
- **A small white catchlight sits on each pupil and moves with it**, so you can always tell where he is looking.
- **Toy-like body:** squash and stretch on the round body, springy landings, a tiny hop or jump of joy, a happy
  shuffle of the feet, a side-to-side waddle-wiggle, a proud chest puff, a head tilt, a satisfied nod.
- **Props pop in** with a small squash and settle, held in his wing tips. No hands, no nubs.
- **Manga effect marks in his yellow ink:** sparkle ticks beside his head on a happy beat, small squiggles by his
  feet on a shuffle, an impact burst on a landing. On screen for a few drawings, then cleared; plain white around
  him in a held pose.
- **His beak stays a clean, visible black shape**, never hidden behind a prop.

## His look

Only his own inks: black, vermilion (wing tips), eye white, yellow, and cream for props. No blush, gradients,
shading, gold or tan. Props are one flat pale cream with a thin black outline, the same pale cream as paper.
His design and proportions never change; image work only cleans, upscales or adds poses in that exact design.

## Making his animations

- **Animate, don't edit stills.** New poses and moves are shot on Backlot with MiniMax H3 and alvdansen's keyframe
  adapters (huggingface.co/alvdansen/h3-keyframe-animation), never by editing still images (owner: "giving it the
  start pose and then tell it what to do").
  - **hero** (`h3_hero_step12000`): one reference, his start pose; he acts into a new pose. Use it for new poses
    and enters.
  - **sequence** (`h3_seq_step12000`): two references, the start and end drawings. Use it for loops that return to
    their pose.
  - Run on the full H3 model, never Turbo (the card: step-distilled variants "do not preserve the linework").
- **Captions in the adapter's dialect**, written to the MiniMax H3 prompting guide (the backlot skill's
  `references/h3-prompting.md`): no negations, no names, medium `flat cel colour on white`, "animated on twos".
- **Time every beat** in `MM:SS.mmm` inside the movement, on twos (multiples of 0.083 s): "At 00:00.333, it
  crouches… This hold lasts until 00:01.083."
- **Pick the length from the acting** on H3's grid (124, 141, 158, 175 … 362 frames), with about a second of end
  hold; not a fixed six seconds.
- **Who does what:** prompts are written by Fable and stored as JSON; an Opus session shoots them with the Backlot
  MCP, and the owner picks from a phone review page of clips before anything is traced.
