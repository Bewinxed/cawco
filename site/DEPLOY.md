# Deploying cawco.dev

`site/` builds into `site/dist`, and the Cloudflare worker `cawco-site` serves
that folder on `cawco.dev/*` (see `wrangler.jsonc`).

## What gets served

- `/install.sh` is the first-machine installer. The build generates it from
  `packages/core/src/install-script.ts`, so it is always the script the hub
  itself would hand out. `public/_headers` serves it as plain text and tells
  caches to revalidate every time.
- `/version.txt` is the short commit the deploy was built from.

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
curl -sI https://cawco.dev/install.sh | head -1   # HTTP/2 200
curl -s https://cawco.dev/version.txt             # the commit you deployed
```
