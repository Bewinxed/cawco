# cawco.dev

`site/` builds into `site/dist`, and the Cloudflare worker `cawco-site` serves
that folder on `cawco.dev/*` (see `wrangler.jsonc`).

## What gets served

- `/` is the landing page: `index.html`, one stylesheet, one script, two font
  files (Nunito for the page, Figtree for the product scenes), the app icon and
  the App Store badge. Vite builds it from `index.html` and `src/`. Icons, the
  machine drawings and Caw are written into `index.html` at build time.
- `/install.sh` is the first-machine installer. The build generates it from
  `packages/core/src/install-script.ts`, so it is always the script the hub
  itself would hand out. `public/_headers` serves it as plain text and tells
  caches to revalidate every time.
- `/og.png` is the picture link previews show. The page's `og:image` tag names
  it by its full `https://cawco.dev/og.png` address.
- `/version.txt` is the short commit the deploy was built from.

## Work on it

```sh
cd site
npm install
npm run dev      # the page, with reload
npm run build    # site/dist
npm run check    # Biome, then tsc
```

`npm run check` lints and type-checks the page's own files. `wrangler.jsonc` and
`scripts/deploy.mjs` are left out of it on purpose. The Biome config here is a
nested one (`"root": false`), so Biome also reads the repository's root config:
run `bun install` at the repository root once before `npm run check`.

## Pictures

`index.html` names its pictures with four short tags, and `vite.config.ts`
replaces each with inline SVG when it builds:

- `<i data-icon="inbox-in"></i>` is a Solar bold-duotone icon.
- `<i data-mark="github"></i>` is a company's own mark, from Simple Icons.
- `<i data-device="laptop"></i>` is one of the four machine drawings in
  `src/assets/devices/`.
- `<i data-caw="ready-enter-distance"></i>` is one of Caw's drawn clips in
  `src/assets/caw/`.

**Caw.** Wherever Caw moves, the page plays one of the product's drawn clips: a
set of traced drawings and the frames each one is held for. Nothing slides,
scales or fades him. The build writes every drawing into the page as a group
and generates the steps that show one at a time, so there is no player to load.
A clip plays once and rests on its last drawing; with reduced motion the page
shows that last drawing and plays nothing. A clip marked `data-wait` shows
nothing until the nearest `data-arrives` block scrolls into view.

The clips are copies, so the page keeps working when the product retires one.
To add a clip or pick up a retraced one:

```sh
node scripts/import-caw.mjs <clip> <folder>   # folder holds body-NN.svg and timing.json
```

**Machines.** The four drawings are the rest pose of the hairline figure
`art/fleet.js`. To change one, edit the figure, build and check it with the
hairline skill (`node ~/.claude/skills/hairline/look.mjs fleet.js --answer
26,95,10 --edge 20,20,58 --edge 112,114,0`, run in `art/`), then run
`node scripts/lift-devices.mjs` to write the drawings back into
`src/assets/devices/`. The built figure and its check sheet are not committed.

**Share image.** `node scripts/og.mjs` writes `research/og.html`; `public/og.png`
is a 1200 x 630 screenshot of it.

## Deploy

```sh
cd site
npm install
node scripts/deploy.mjs
```

The script refuses to run unless the tracked tree is clean and `HEAD` is
already on `origin/main`. It then runs `npm run build`, writes
`dist/version.txt` and calls `wrangler deploy`. Wrangler needs a Cloudflare
login on the machine (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN` in the
environment.

## Check it

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://cawco.dev/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cawco.dev/install.sh  # 200
curl -s https://cawco.dev/version.txt                                  # the commit you deployed
```
