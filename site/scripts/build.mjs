import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import { APP_STORE_URL, GITHUB_URL, IOS_PLAN } from "../src/content.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
await rm("dist", { recursive: true, force: true });
await mkdir("dist/pricing", { recursive: true });
await mkdir("dist/assets", { recursive: true });
await cp("public", "dist", { recursive: true });
const installer = await build({ entryPoints: ["../packages/core/src/install-script.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { generateInstallScript } = await import(`data:text/javascript;base64,${Buffer.from(installer.outputFiles[0].text).toString("base64")}`);
await writeFile("dist/install.sh", generateInstallScript({ origin: "https://github.com/Bewinxed/cawco" }));
const tokens = JSON.parse(await readFile("../design/tokens/cawco.tokens.json", "utf8"));
const reference = (value) => String(value).replace(/\{[^.]+\.([^}]+)\}/g, "var(--$1)");
const cssTokens = Object.values(tokens).flatMap((group) => Object.entries(group).map(([name, token]) => {
  const light = reference(token.$value);
  const dark = token.$extensions?.["dev.cawco"]?.dark;
  return `--${name}:${dark ? `light-dark(${light},${reference(dark)})` : light};`;
})).join("\n");
await writeFile("dist/assets/tokens.css", `:root{${cssTokens}}`);
await cp("node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", "dist/assets/fredoka.woff2");
await cp("node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", "dist/assets/figtree.woff2");
await cp("node_modules/@rive-app/canvas/rive.wasm", "dist/assets/rive.wasm");
await sharp("assets/cawco-share.png").resize(1200, 630, { fit: "cover" }).webp({ quality: 85 }).toFile("dist/assets/cawco-share.webp");
await sharp("../assets/mascot/stills/light-ready.png").resize(192, 192).webp({ quality: 90 }).toFile("dist/assets/caw-icon.webp");
await sharp("../assets/mascot/stills/light-ready.png").resize(64, 64).png().toFile("dist/favicon.png");
await build({ entryPoints: ["src/main.ts"], bundle: true, minify: true, format: "esm", outfile: "dist/assets/main.js", target: "es2022" });
await build({ entryPoints: ["src/site.css"], bundle: true, minify: true, outfile: "dist/assets/site.css", external: ["/assets/*"], target: "es2022" });

const solar = JSON.parse(await readFile("node_modules/@iconify-json/solar/icons.json", "utf8"));
const icon = (name, cls = "") => `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">${solar.icons[name].body}</svg>`;
const arrow = icon("arrow-right-linear");
const planPrice = IOS_PLAN.price === null ? IOS_PLAN.pricingState : `${IOS_PLAN.price} ${IOS_PLAN.period === "once" ? "once" : "/ month"}`;
const trialLine = IOS_PLAN.trialDays > 0 ? `Free for ${IOS_PLAN.trialDays} days, then ` : "";
const planOffer = `${trialLine}${planPrice}`;
const planPriceMarkup = `${trialLine ? `<span class="trial-line">${trialLine}</span>` : ""}${planPrice}`;
const store = `<a data-store="app-store" href="${APP_STORE_URL}" aria-label="${IOS_PLAN.name}, ${IOS_PLAN.availability.toLowerCase()}" aria-disabled="${APP_STORE_URL === "#"}"><img src="/app-store.svg" width="120" height="40" alt="Download on the App Store"></a>`;
const caw = (status) => `<div class="caw" data-caw="${status}" role="img" aria-label="Caw, a small fluffy crow with vermilion wing tips"><canvas width="592" height="592" aria-hidden="true"></canvas></div>`;
const header = (pricing) => `<header class="masthead"><a class="wordmark" href="/" aria-label="CawCo home">Caw<span>Co</span><span class="brand-ticks" aria-hidden="true">${icon("stars-minimalistic-bold-duotone")}</span></a><nav aria-label="Main navigation"><a href="/pricing" ${pricing ? 'aria-current="page"' : ""}>Pricing</a><a class="github-nav" href="${GITHUB_URL}">Open GitHub ${icon("arrow-right-up-linear")}</a><button class="theme-control" aria-label="Change color scheme" title="Change color scheme">${icon("sun-2-bold-duotone")}</button></nav></header>`;
const footer = (pricing) => `<footer class="footer"><span class="footer-note">A little flock. A lot of work.</span><div class="footer-links"><button class="motion-control" aria-label="Pause motion">${icon("pause-circle-bold-duotone")}<span>Pause motion</span></button><a href="${GITHUB_URL}">Open source</a>${pricing ? '<a href="/">Back home</a>' : '<a href="/pricing">View pricing</a>'}</div></footer>`;
const home = `${header(false)}<main class="home-main" id="main"><div class="intro"><h1>Your agents.<br><span>Under your wing.</span></h1><p>See every coding agent. Approve, steer or stop any session,<br class="desktop-break"> from your desk or your phone.</p></div><div class="flock-stage"><div class="harness harness-claude">${icon("code-square-bold-duotone")}<span>Claude Code</span><span class="harness-detail">Your own account</span></div><div class="harness harness-opencode">${icon("command-bold-duotone")}<span>OpenCode</span><span class="harness-detail">Your own models</span></div>${caw("ready")}<div class="harness harness-pi">${icon("file-terminal-bold-duotone")}<span>pi</span><span class="harness-detail">Your own setup</span></div><div class="perch" aria-hidden="true"></div></div><div class="home-actions"><a class="btn primary" href="${GITHUB_URL}">Self-host free ${arrow}</a><span class="ownership">Your machines. Your agents. Your control.</span></div></main><aside class="download-band" aria-label="Get CawCo"><div class="free-note">${icon("server-square-bold-duotone")}<div><strong>One board. Every machine.</strong><span>Free daemon, hub, dashboard and Telegram bridge.</span></div></div><div class="store-group"><div class="store-copy"><strong>${IOS_PLAN.availability}</strong><span class="app-offer">${planOffer}</span><span class="store-platforms">${IOS_PLAN.platforms}</span></div>${store}</div></aside>${footer(false)}`;
const pricing = `${header(true)}<main class="pricing-main" id="main"><div class="intro"><h1>Your fleet is free.<br><span>Take it with you.</span></h1><p>Self-host CawCo for free. The native app is a separate purchase.</p></div><div class="plans"><section class="free-plan" aria-labelledby="free-title"><div class="plan-label">${icon("server-square-bold-duotone")}<h2 id="free-title">Self-hosted</h2></div><div class="price">Free</div><p class="free-description">The whole fleet, on your machines.</p><ul class="plan-features"><li>${icon("check-circle-bold-duotone")}Daemon, hub and web dashboard</li><li>${icon("check-circle-bold-duotone")}Every supported agent and machine</li><li>${icon("check-circle-bold-duotone")}Telegram bridge included</li></ul><a class="btn primary" href="${GITHUB_URL}">Self-host free ${arrow}</a><span class="free-license">Free and open source</span></section><div class="pricing-caw">${caw("done")}<span class="caw-caption">Same flock. A smaller screen.</span></div><section class="app-plan" aria-labelledby="app-title"><div class="plan-label">${icon("smartphone-bold-duotone")}<h2 id="app-title">${IOS_PLAN.name}</h2><span class="availability">${IOS_PLAN.availability}</span></div><div class="app-price">${planPriceMarkup}</div><p class="app-description">${IOS_PLAN.includes[0]}.</p><ul class="plan-features">${IOS_PLAN.includes.slice(1).map((text) => `<li>${icon("check-circle-bold-duotone")}${text}</li>`).join("")}</ul><div class="pricing-store">${store}<span>${IOS_PLAN.platforms}</span></div></section></div><p class="agent-note">Bring your own agent accounts. CawCo doesn't sell model usage.</p></main>${footer(true)}`;
const legal = `<dialog class="store-dialog" aria-labelledby="store-title"><button class="close-dialog" aria-label="Close message">${icon("close-circle-bold-duotone")}</button><h2 id="store-title">${IOS_PLAN.availability}</h2><p>${IOS_PLAN.name} is on the way. ${planOffer}.</p><p>${IOS_PLAN.platforms}.</p><p class="trademark">Apple, the Apple logo, iPhone, iPad and Mac are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc.</p><button class="btn primary close-action">Close message</button></dialog>`;
for (const [path, body, title, description] of [
  ["index.html", home, "CawCo · Your agents. Under your wing.", `One board for Claude Code, OpenCode and pi. Self-host free. Native app coming soon: ${planOffer}.`],
  ["pricing/index.html", pricing, "Pricing · CawCo", `The self-hosted CawCo fleet is free and open source. Native app coming soon for iPhone, iPad and Mac: ${planOffer}.`],
]) {
  await writeFile(`dist/${path}`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#F2D36B" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#171715" media="(prefers-color-scheme: dark)"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://cawco.dev${path.startsWith("pricing") ? "/pricing" : "/"}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="https://cawco.dev/assets/cawco-share.webp"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.png"><link rel="preload" href="/assets/fredoka.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/figtree.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/main.js"></script></head><body><div class="page ${path.startsWith("pricing") ? "pricing-page" : "home-page"}">${body}</div>${legal}</body></html>`);
}
await writeFile("dist/robots.txt", "User-agent: *\nAllow: /\nSitemap: https://cawco.dev/sitemap.xml\n");
await writeFile("dist/sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://cawco.dev/</loc></url><url><loc>https://cawco.dev/pricing</loc></url></urlset>');
console.log("SITE_BUILT: landing, pricing, local fonts, Rive, optimized artwork");
