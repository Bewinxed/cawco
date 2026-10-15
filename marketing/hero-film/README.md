# Hero film

The cawco.dev hero loop: the real dashboard, filmed frame by frame on a
made-up fleet, cut into candidates with HyperFrames. What it shows and why
is in [BRIEF.md](BRIEF.md).

- `capture/hub.ts`: a stand-in hub that answers the dashboard's REST reads
  and socket on the hub's own wire, from the fleet in `capture/fleet.ts`.
  The film's beats are frames it sends when the capture asks.
- `capture/capture.ts`: films the dashboard at 3600 × 2250, 60 fps, on a
  frozen clock: Playwright's clock owns timers and frames, and every Web
  Animation is set to the frame's time. Writes `assets/footage/` (not kept).
- `index.html`: the composition. Its `cut` variable picks the candidate
  (`still`, `push`, `close`) and `footage` the take (light or dark).
- `render.ts`: renders every candidate into `out/<candidate>/` as
  `hero.mp4`, `hero.webm` and `poster.png` (not kept).
- `review/`: the phone page the owner picks from; it plays `../out/`, so
  serve this folder and open `/review/`.

## Make it again

```sh
bun capture/hub.ts 4877 &
(cd ../../apps/dashboard && CAWCO_DEV_HUB_URL=http://127.0.0.1:4877 bunx vite dev --port 5197 --strictPort --host 127.0.0.1) &
node capture/capture.ts light
node capture/capture.ts dark
bun render.ts
npx hyperframes check .
```
