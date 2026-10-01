#!/usr/bin/env python3
"""Stage the v5 modal over a representative CawCo settings backdrop, on a REAL
dimmed scrim — mirroring how the reference comp shows a dialog in-context (dimmed
app behind it), rather than the component gallery's isolated bare-scrim view.

Reuses v5-components.html's exact <style> block so the modal is pixel-identical to
the shipped component; only the staging chrome (sidebar + settings page + real
scrim) is added here."""
import re, pathlib

root = pathlib.Path(__file__).parent
src = (root / "v5-components.html").read_text()

style = re.search(r"<style>(.*?)</style>", src, re.S).group(1)

# resolved modal markup (solar icons already inlined by the build).
# Grab the FIRST full scrim block — it ends at the `</div></div>` immediately
# before the "Destructive confirm" <h3>, so the footer (mod-ft) is included.
modal = re.search(r'(<div class="scrim bare".*?</div>\s*</div>)\s*<h3', src, re.S).group(1)
# swap the gallery's static bare scrim for a real fixed dimmed overlay
modal = modal.replace('class="scrim bare"', 'class="scrim"')

chrome_css = """
/* ---- staging chrome only (NOT part of the component system) ------------- */
html,body{height:100%}
body{margin:0;background:var(--surface-app);font-family:var(--font-body);color:var(--ink-body)}
.app{display:grid;grid-template-columns:248px 1fr;height:100vh;overflow:hidden}
.side{background:var(--surface-sidebar);border-right:1px solid var(--border-hairline);
  display:flex;flex-direction:column;gap:2px;padding:16px 12px;box-shadow:var(--shadow-sidebar,none)}
.side .brand{display:flex;align-items:center;gap:10px;padding:6px 8px 14px;font-weight:var(--weight-strong);font-size:var(--text-lg);color:var(--ink-strong)}
.side .brand i{width:26px;height:26px;border-radius:var(--radius-mark);background:var(--brand-solid);background-image:var(--gradient-action);display:grid;place-items:center;color:var(--on-brand)}
.side .brand i svg{width:15px;height:15px}
.side .lbl{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);padding:12px 8px 4px}
.side a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-control);color:var(--ink-body);text-decoration:none;font-size:var(--text-md);font-weight:var(--weight-medium)}
.side a svg{width:18px;height:18px;color:var(--ink-muted)}
.side a.on{background:var(--surface-hover);color:var(--ink-strong)}
.main{overflow:auto;background:var(--surface-app)}
.topbar{height:56px;display:flex;align-items:center;gap:10px;padding:0 24px;border-bottom:1px solid var(--border-hairline);color:var(--ink-muted);font-size:var(--text-md)}
.wrap{max-width:940px;margin:0 auto;padding:28px 24px}
.wrap h1{font-size:var(--text-2xl,26px);font-weight:var(--weight-strong);color:var(--ink-strong);margin:0 0 4px}
.wrap .sub{color:var(--ink-muted);font-size:var(--text-md);margin:0 0 20px}
.tabs{display:flex;gap:2px;padding:4px;background:var(--surface-raised);border:1px solid var(--border-hairline);border-radius:var(--radius-panel);width:fit-content;box-shadow:var(--shadow-lifted);margin-bottom:22px}
.tabs span{padding:8px 14px;border-radius:var(--radius-control);font-size:var(--text-sm);color:var(--ink-muted)}
.tabs span.on{background:var(--surface-hover);color:var(--ink-strong);font-weight:var(--weight-medium)}
.dz{border:1px solid var(--error-6,var(--border-control));border-radius:var(--radius-panel);padding:20px;background:var(--surface-raised)}
.dz h2{display:flex;align-items:center;gap:8px;color:var(--error-11,var(--ink-strong));font-size:var(--text-lg);margin:0 0 6px}
.dz h2 svg{width:18px;height:18px}
.dz .sub{color:var(--ink-muted);font-size:var(--text-sm);margin:0 0 16px}
.dzrow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid var(--border-hairline)}
.dzrow .t{font-size:var(--text-md);color:var(--ink-body)}
.dzrow .d{font-size:var(--text-sm);color:var(--ink-muted)}
.dzrow button{height:34px;padding:0 14px;border:1px solid var(--border-control);border-radius:var(--radius-control);background:var(--surface-raised);color:var(--ink-body);font-size:var(--text-sm);font-family:var(--font-body);cursor:pointer}
/* real dimmed scrim (overrides the gallery's static bare rule).
   Distilled from the FlowAI reference: a LIGHT wash + small backdrop blur,
   never a dark overlay. Mapped to our tokens (neutral surface, not the fai hex). */
.scrim{position:fixed;inset:0;background:var(--scrim-light,color-mix(in oklab,var(--surface-app) 72%,transparent));backdrop-filter:blur(2px);display:grid;place-items:center;padding:24px;z-index:50}
"""

nav = lambda label, on=False: f'<a class="{ "on" if on else "" }"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>{label}</a>'

html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CawCo — modal in context</title>
<link rel="stylesheet" href="./fonts/geist.css">
<link rel="stylesheet" href="./tokens.css">
<style>{style}
{chrome_css}</style></head>
<body>
<div class="app" aria-hidden="true">
  <aside class="side">
    <div class="brand"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 4h8v16H4z" fill="currentColor"/></svg></i>CawCo</div>
    <div class="lbl">Fleet</div>
    {nav("Board")}
    {nav("Sessions")}
    {nav("Projects")}
    {nav("Usage")}
    <div class="lbl">Control</div>
    {nav("Tools")}
    {nav("Rules")}
    {nav("Settings", on=True)}
  </aside>
  <div class="main">
    <div class="topbar">Settings</div>
    <div class="wrap">
      <h1>Settings</h1>
      <p class="sub">Manage the fleet, hosts, and access for this workspace.</p>
      <div class="tabs"><span>General</span><span>Hosts</span><span>Access</span><span>Notifications</span><span class="on">Danger Zone</span></div>
      <div class="dz">
        <h2><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C9.7 3 8.2 5.6 5.3 10.8l-.4.6C2.5 15.7 1.3 17.9 2.4 19.4 3.5 21 6.2 21 11.6 21h.7c5.5 0 8.2 0 9.3-1.6 1.1-1.6-.1-3.7-2.5-8L18.7 10.8C15.8 5.6 14.3 3 12 3Z"/></svg>Danger Zone</h2>
        <p class="sub">These actions are irreversible. Please read carefully before proceeding.</p>
        <div class="dzrow"><div><div class="t">Rotate fleet token</div><div class="d">Invalidate the current token and issue a new one.</div></div><button>Rotate token</button></div>
        <div class="dzrow"><div><div class="t">Transfer ownership</div><div class="d">Hand the fleet to another admin on this workspace.</div></div><button>Transfer ownership</button></div>
        <div class="dzrow"><div><div class="t">Remove all hosts</div><div class="d">Detach every machine currently joined to the fleet.</div></div><button>Remove all hosts</button></div>
        <div class="dzrow"><div><div class="t">Delete workspace</div><div class="d">Permanently delete all projects, sessions, and data.</div></div><button>Delete workspace</button></div>
      </div>
    </div>
  </div>
</div>
{modal}
</body></html>"""

(root / "modal-stage.html").write_text(html)
print("WROTE modal-stage.html")
