# Deploy the public site

From the repository root, install the site's dependencies and authenticate Wrangler:

```sh
cd site
npm install
npx wrangler@latest login
node scripts/deploy.mjs
```

Commit and land the site on `origin/main` before deploying. The script rejects
tracked working-tree changes, fetches `origin/main`, and requires `HEAD` to be
reachable from that branch. It runs `npm run build` from `site/`, writes
`git rev-parse --short=8 HEAD` plus a newline to `dist/version.txt`, then runs
`npx wrangler@latest deploy`. Build, Git, and Wrangler failures stop deployment.
Wrangler logs go to `/tmp/cawco-site-wrangler-*/wrangler.log`; metrics are disabled.

- Worker: `cawco-site`.
- Account: `7119532fe266e2a0493f558807a85bab`.
- Route: `cawco.dev/*` in zone `cawco.dev`, using the existing proxied apex record.
- Assets: `site/dist/`; `/pricing` serves `pricing/index.html` with
  `html_handling: "drop-trailing-slash"`.
- Version: `https://cawco.dev/version.txt` identifies the deployed commit.
- This is a Worker Route, not a Custom Domain. Deployment does not change DNS
  or configure `www`.

Cloudflare's [HTML handling documentation](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
defines `assets.html_handling` and confirms `/folder` serves `/dist/folder/index.html`
with `drop-trailing-slash`.
