# cawco.dev

`site/` builds into `site/dist`, and the Cloudflare worker `cawco-site` serves
that folder on `cawco.dev/*` (see `wrangler.jsonc`).

## What gets served

- `/` is the landing page: `index.html`, one stylesheet, one script, the Nunito
  font file and Caw's pictures. Vite builds it from `index.html` and `src/`.
- `/install.sh` is the first-machine installer. The build generates it from
  `packages/core/src/install-script.ts`, so it is always the script the hub
  itself would hand out. `public/_headers` serves it as plain text and tells
  caches to revalidate every time.
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

`src/mascots.ts` lists every picture of Caw on the page and where it came from.
The six large poses were drawn with the image generator from Caw's pose sheet;
the small status crows inside the demos are the product's own stills. Add or
swap a picture there, not in the markup.

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
