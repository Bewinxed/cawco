#!/usr/bin/env bash
# REFERENCE: the comps live in mocks/ref/, NOT /tmp. A gate whose reference
# sits in /tmp breaks on reboot, or worse goes stale without saying so.
# Phase 3 end-to-end verification. Every DW item that can be checked mechanically.
set -u
cd "$(dirname "$0")/.."
# Logs and scratch output: mktemp honours $TMPDIR, a workspace's own scratch dir.
T=$(mktemp -d)
fail=0
say(){ printf '\n\033[1m%s\033[0m\n' "$1"; }
ok(){ if [ "$1" = 0 ]; then echo "  PASS  $2"; else echo "  FAIL  $2"; fail=$((fail+1)); fi; }

say "mocks reproduce from source (mocks/src -> mocks/*.html)"
# The pipeline was two commands run by hand against sources in /tmp. A
# rebuild that skipped the second step shipped mocks with no status glyphs
# and nothing noticed. Sources are in the repo now and a stale build fails.
before=$(cat mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html mocks/v5-components.html mocks/v5-agent.html mocks/v5-data.html mocks/v5-workspace.html mocks/v5-assistant.html | md5sum | cut -d" " -f1)
bash mocks/build-mocks.sh > $T/rebuild.log 2>&1 || echo "  rebuild FAILED (see $T/rebuild.log)"
after=$(cat mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html mocks/v5-components.html mocks/v5-agent.html mocks/v5-data.html mocks/v5-workspace.html mocks/v5-assistant.html | md5sum | cut -d" " -f1)
echo "  checked-in $before   fresh build $after"
[ "$before" = "$after" ]
ok $? "a fresh build reproduces the checked-in mocks byte for byte"

say "DESIGN.md census is generated, not transcribed"
# Four numbers in the document went stale because they were hand-copied
# from reports that later changed. They are generated at build time now,
# and this asserts the checked-in document matches a fresh generation.
dbefore=$(md5sum DESIGN.md | cut -d" " -f1)
node mocks/build-designmd.mjs > /dev/null 2>&1
dafter=$(md5sum DESIGN.md | cut -d" " -f1)
echo "  checked-in $dbefore   regenerated $dafter"
[ "$dbefore" = "$dafter" ]
ok $? "DESIGN.md regenerates byte for byte from the current reports"

say "shared classes render equivalently across all three mocks"
node mocks/paritycheck.mjs
ok $? "no shared class diverges between files"

say "checked-in PNGs match the HTML (a stale image misleads a reviewer)"
# The byte-identity gate covered the HTML only. A reviewer looking at a
# stale PNG is looking at the past — which is how the fidelity gate passed
# on a screenshot in round one.
pbefore=$(md5sum mocks/v2-fleet.png mocks/v3-assistant.png mocks/v4-transcript.png mocks/v2-dark.png mocks/v5-components.png mocks/v5-components-dark.png mocks/v5-components-mobile.png mocks/v5-agent.png mocks/v5-agent-dark.png mocks/v5-agent-mobile.png mocks/v5-data.png mocks/v5-data-dark.png mocks/v5-data-mobile.png mocks/v5-workspace.png mocks/v5-workspace-dark.png mocks/v5-workspace-split.png mocks/v5-workspace-mobile.png mocks/v5-assistant.png mocks/v5-assistant-dark.png mocks/v5-assistant-mobile.png | md5sum | cut -d" " -f1)
for a in "v2-fleet.html v2-fleet.png" "v3-assistant.html v3-assistant.png" "v4-transcript.html v4-transcript.png"; do
  set -- $a; node mocks/render.mjs "mocks/$1" "mocks/$2" > /dev/null 2>&1; done
node mocks/render.mjs mocks/v2-fleet.html mocks/v2-dark.png --dark > /dev/null 2>&1
node mocks/render.mjs mocks/v5-components.html mocks/v5-components.png --viewport 1440x5600 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-components.html mocks/v5-components-dark.png --dark --viewport 1440x5600 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-components.html mocks/v5-components-mobile.png --viewport 390x10400 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-agent.html mocks/v5-agent.png --viewport 1440x4000 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-agent.html mocks/v5-agent-dark.png --dark --viewport 1440x4000 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-agent.html mocks/v5-agent-mobile.png --viewport 390x5200 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-data.html mocks/v5-data.png --viewport 1440x1800 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-data.html mocks/v5-data-dark.png --dark --viewport 1440x1800 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-data.html mocks/v5-data-mobile.png --viewport 390x3600 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-workspace.html mocks/v5-workspace.png --viewport 1440x1200 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-workspace.html mocks/v5-workspace-dark.png --dark --viewport 1440x1200 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-workspace.html mocks/v5-workspace-split.png --viewport 1440x820 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-workspace.html mocks/v5-workspace-mobile.png --viewport 390x1200 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-assistant.html mocks/v5-assistant.png --viewport 1440x960 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-assistant.html mocks/v5-assistant-dark.png --dark --viewport 1440x960 > /dev/null 2>&1
node mocks/render.mjs mocks/v5-assistant.html mocks/v5-assistant-mobile.png --viewport 390x960 > /dev/null 2>&1
pafter=$(md5sum mocks/v2-fleet.png mocks/v3-assistant.png mocks/v4-transcript.png mocks/v2-dark.png mocks/v5-components.png mocks/v5-components-dark.png mocks/v5-components-mobile.png mocks/v5-agent.png mocks/v5-agent-dark.png mocks/v5-agent-mobile.png mocks/v5-data.png mocks/v5-data-dark.png mocks/v5-data-mobile.png mocks/v5-workspace.png mocks/v5-workspace-dark.png mocks/v5-workspace-split.png mocks/v5-workspace-mobile.png mocks/v5-assistant.png mocks/v5-assistant-dark.png mocks/v5-assistant-mobile.png | md5sum | cut -d" " -f1)
echo "  checked-in $pbefore   fresh render $pafter"
[ "$pbefore" = "$pafter" ]
ok $? "the checked-in PNGs are a fresh render of the checked-in HTML"

say "DW-3.1  palette.mjs --scheme both exits 0, no FAIL lines"
node ~/.claude/plugins/cache/rtd/design-for-ai/4.2.0/scripts/palette.mjs \
  --seed 263 --chroma muted --harmony analogous --scheme both > $T/v-pal.css 2>$T/v-pal.err
rc=$?; n=$(grep -c FAIL $T/v-pal.css)
echo "  exit=$rc  FAIL lines=$n  stderr=$(wc -c <$T/v-pal.err) bytes"
ok $(( rc != 0 || n != 0 )) "exit 0 and zero FAIL lines"

say "DW-3.2  ramp + alias + functional coverage, both schemes"
python3 - <<'PY'
import re,sys
css=open('mocks/palette-263-muted-analogous.css').read()
bad=0
for pat,name in ((r'\n:root \{(.*?)\n\}','light'),(r'\n\[data-theme="dark"\] \{(.*?)\n\}','dark')):
    ks=[k for k,_ in re.findall(r'--([\w-]+):\s*([^;]+);',re.search(pat,css,re.S).group(1))]
    need=([f'neutral-{i}' for i in range(1,13)]+[f'accent-{i}' for i in range(1,13)]
          +[f'{f}-{s}' for f in ('error','success','warning','info') for s in (3,9,11)]
          +['background','surface','surface-hover','surface-active','border-subtle','border',
            'border-strong','text-secondary','text','accent-bg-subtle','accent-solid',
            'accent-solid-hover','accent-text'])
    miss=[x for x in need if x not in ks]
    print(f"  {name}: {len(ks)} tokens, 12+12 ramp + 12 functional + 13 aliases -> missing {miss or 'none'}")
    bad+=len(miss)
sys.exit(1 if bad else 0)
PY
ok $? "all 24 ramp steps, 12 functional, 13 aliases present in both schemes"

say "DW-3.3 / 3.7 / 3.12  measured contrast + colour distance"
python3 mocks/colorcheck.py mocks/tokens.resolved.css > mocks/colorcheck-report.txt 2>&1
ok $? "colorcheck.py all checks pass ($(grep -c PASS mocks/colorcheck-report.txt) assertions)"

say "DW-3.4 / 3.14  DOM measurement"
node mocks/measure.mjs > mocks/measure-report.txt 2>&1
ok $? "measure.mjs all DOM checks pass ($(grep -c PASS mocks/measure-report.txt) assertions)"

say "DW-3.5  type scale present"
miss=0
for t in text-xs text-sm text-base text-md text-lg text-xl text-2xl text-3xl text-4xl font-body font-display font-mono leading-body weight-body weight-strong; do
  grep -q -- "--$t:" mocks/tokens.css || { echo "  missing --$t"; miss=1; }
done
ok $miss "--text-xs…--text-4xl + --font-body/--font-display/--font-mono defined"

say "DW-3.6  primary face"
for b in Inter Roboto '"Open Sans"' Arial '"Space Grotesk"'; do
  grep -qi -- "$b" mocks/tokens.css && { echo "  BANNED FACE PRESENT: $b"; fail=$((fail+1)); }
done
code=$(curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/@fontsource-variable/geist)
echo "  @fontsource-variable/geist -> HTTP $code"
ok $(( code != 200 )) "primary face is Geist, none of the banned five, installable from @fontsource-variable/*"

say "DW-3.7  banned purple triplet absent from tokens and mocks"
hits=$(grep -il '6366F1\|8B5CF6\|A855F7' mocks/tokens.css mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html | wc -l)
echo "  files containing a banned literal: $hits"
ok $hits "no banned literal in the token file or any mock"

say "DW-3.8  DESIGN.md structure"
# By NAME, not by count. Counting made an added section look like a failure and
# a renamed one look like a pass; the template's nine must each be present, and
# anything beyond them is enrichment.
missing=0
for sec in 'Direction' 'Signature move' 'Expressive moments' 'Type' 'Color tokens' \
           'Space, shape, depth' 'Motion' 'Never' 'Open questions'; do
  grep -q "^## $sec" DESIGN.md || { echo "  MISSING template section: ## $sec"; missing=1; }
done
secs=$(grep -c '^## ' DESIGN.md)
echo "  template sections present: 9/9 (+ header = 10)   total '## ' sections: $secs"
# the doctrine template puts Status on the Date line, so this is not anchored
grep -q '\*\*Status:\*\* confirmed' DESIGN.md; s1=$?
grep -q '^\*\*Pins:\*\*' DESIGN.md; s2=$?
echo "  Status: confirmed -> $([ $s1 = 0 ] && echo present || echo MISSING);  Pins: line -> $([ $s2 = 0 ] && echo present || echo MISSING)"
ok $(( missing + s1 + s2 )) "all 9 template sections + header, Status confirmed, Pins line"

say "DW-3.9  ## Never scope"
grep -q 'uniform-padding form' DESIGN.md; n1=$?
grep -q 'Explicitly permitted' DESIGN.md; n2=$?
nrules=$(sed -n '/^## Never/,/^## Open/p' DESIGN.md | grep -c '^[0-9]\+\. ')
echo "  named tells: $nrules   uniform-padding form: $([ $n1 = 0 ] && echo yes || echo NO)   inset well permitted: $([ $n2 = 0 ] && echo yes || echo NO)"
ok $(( n1 + n2 + (nrules < 3) )) "uniform-padding nested-cards named, inset well permitted, >=3 tells"

say "DW-3.10  shadcn-default divergence + no pure-black shadow"
grep -q -- '--radius:        10px' mocks/tokens.css; r1=$?
# strip CSS comments first: the prose "never rgba(0,0,0,.)" is a comment, and
# counting it as a hit made this check fail on a file that has no black shadow
blk=$(perl -0pe 's{/\*.*?\*/}{}gs' mocks/tokens.css | grep -Eic 'rgba\( *0, *0, *0|#000\b|\bblack\b')
blkm=$(cat mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html \
  | grep -Eio 'box-shadow:[^;}]*' | grep -Eic 'rgba\( *0, *0, *0|#000\b|\bblack\b')
echo "  --radius base: $(grep -o -- '--radius:  *[0-9.]*px' mocks/tokens.css)  (shadcn ships 0.5rem/8px with a 4/6/8/12 ladder)"
echo "  radius ladder: $(grep -oE -- '--radius-[a-z]+: *[0-9.]+px' mocks/tokens.css | tr '\n' ' ')"
echo "  spacing:       $(grep -oE -- '--space-[0-9]: *[0-9]+px' mocks/tokens.css | tr '\n' ' ')"
echo "  pure-black colour values in tokens.css (comments stripped): $blk"
echo "  pure-black values inside any mock box-shadow: $blkm"
ok $(( r1 + blk + blkm )) "radius/spacing differ from shadcn defaults; zero pure-black shadows"

say "DW-3.13 / 3.13b  fidelity gate"
node mocks/render.mjs mocks/v2-fleet.html mocks/v2-fleet.png > /dev/null
python3 mocks/fidelity.py mocks/ref/crop-table-1x.png mocks/v2-fleet.png > mocks/gate-report.txt 2>&1
rc=$?
grep -E 'band_label_ink .*override|^PASS|OUT OF TOLERANCE' mocks/gate-report.txt | sed 's/^/  /'
ok $rc "fidelity.py exits 0 with the AA override reported as an accepted deviation"

say "DW-3.13c  zero raw hex in the three mocks"
tot=0
for f in mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html; do
  n=$(grep -oE '#[0-9a-fA-F]{3,8}\b' "$f" | wc -l); tot=$((tot+n))
  echo "  $(basename $f): $n raw hex"
done
ok $tot "all three mocks carry zero raw hex"

say "DW-3.9  detect.mjs nested-cards findings, verified at container level"
node ~/.claude/plugins/cache/rtd/design-for-ai/4.2.0/scripts/detect.mjs \
  mocks/v2-fleet.html mocks/v3-assistant.html mocks/v4-transcript.html 2>/dev/null > $T/detect.json
python3 mocks/detectcheck.py $T/detect.json
ok $? "every nested-cards finding is a control, not a uniform-padding card-in-card"

say "hand-typed colour in ANY notation, not just hex"
python3 mocks/literalcheck.py
ok $? "every colour in every mock resolves through a token"

say "v5 component library — token discipline, density, focus, touch, responsive"
python3 mocks/literalcheck.py v5-components.html > $T/v5-literal.log 2>&1
ok $? "v5 carries zero hand-typed colours ($(grep 'literal(s)' $T/v5-literal.log | awk '{print $2}') hits)"

say "v5 agent surface — token discipline"
python3 mocks/literalcheck.py v5-agent.html > $T/v5a-literal.log 2>&1
ok $? "v5-agent carries zero hand-typed colours ($(grep 'literal(s)' $T/v5a-literal.log | awk '{print $2}') hits)"

say "v5 agent surface — DW-5 approval gate, fixed anchors, coarse targets, a11y"
node mocks/v5agentcheck.mjs
ok $? "approve/deny symmetric, no preselect/autofocus, fixed anchors, >=44px, scope-widen separated, live regions + headings"

say "v5 data surfaces — token discipline"
python3 mocks/literalcheck.py v5-data.html > $T/v5d-literal.log 2>&1
ok $? "v5-data carries zero hand-typed colours ($(grep 'literal(s)' $T/v5d-literal.log | awk '{print $2}') hits)"

say "v5 data surfaces — DW-6 gate: tables, stat cards, threshold ink, charts, meters"
node mocks/v5datacheck.mjs
ok $? "bar zero-baseline, stat triplet, no gauge, threshold non-colour cue + discrete, table alignment, chart alt/aria-describedby, CVD encoding, <=7 metrics"

say "v5 workspace surface — token discipline"
python3 mocks/literalcheck.py v5-workspace.html > $T/v5w-literal.log 2>&1
ok $? "v5-workspace carries zero hand-typed colours ($(grep 'literal(s)' $T/v5w-literal.log | awk '{print $2}') hits)"

say "v5 workspace surface — Phase 8 gate: tabs/split/mobile shell, DW-8.1..8.9"
node mocks/v5workspacecheck.mjs
ok $? "CSS-order reorder, one-workspace split with non-colour active cue, fixed anchors, mobile-defect checklist, no pan-y transcript, gesture non-equivalents, reachable set open tabs"

say "v5 fleet assistant — token discipline"
python3 mocks/literalcheck.py v5-assistant.html > $T/v5a-literal.log 2>&1
ok $? "v5-assistant carries zero hand-typed colours ($(grep 'literal(s)' $T/v5a-literal.log | awk '{print $2}') hits)"

say "v5 fleet assistant — Phase 9b gate: preserved shell, action contract, distinguishability, canon gaps"
node mocks/v5assistantcheck.mjs
ok $? "shell 380x899/24/40/r16/h47/pitch44/scrim.06, action->undo/checkpoint (0 silent), non-positional cue, canon-gap labels"

say "type conformance — DESIGN.md's own weight/size/leading claims, on the render"
node mocks/typecheck.mjs
ok $? "weights in 400/450/500, sizes on the nine steps, no unspecified line box, action pair distinct"

say "text clipping, containment and computed leading (3 mocks x 5 widths x 2 schemes)"
node mocks/clipcheck.mjs
ok $? "no clipped or escaping text; all body leading inside 1.2-1.4"

say "painted-pixel contrast for every chip and pill, on the surface it lands on"
node mocks/paintcheck.mjs | tail -8
ok ${PIPESTATUS[0]} "every painted chip/pill clears 4.5:1 in both schemes, scrim included"

say "keyboard x width x scheme (crossed), focus visibility, interaction state x scheme"
node mocks/keyboardcheck.mjs
ok $? "every pointer affordance focusable and named; ring >=3:1 both schemes; order follows reading order"

say "hover behaviour x pointer type (crossed)"
node mocks/hovercheck.mjs
ok $? "no hover state survives on a device that cannot hover"

say "axis coverage — scheme x width x pointer x text-scale x content x forced-colors x motion x font-loading"
node mocks/axischeck.mjs
ok $? "every enforced axis holds; unenforced axes named in mocks/axischeck.mjs"

say "responsive — page-level horizontal overflow, 320-1440px"
node mocks/overflowcheck.mjs
ok $? "no document overflow, and no content trapped behind a non-scrolling ancestor"

say "v5 component library — computed-style + rendered-pixel verification"
node mocks/v5check.mjs > $T/v5check.log 2>&1 && python3 mocks/v5pixels.py >> $T/v5check.log 2>&1
ok $? "v5 states, density=dims-only, focus rings, 16px inputs, >=44px targets, painted pixels"

say "Phase 7 Words — voice/tone/terminology over the built mocks"
node mocks/wordcheck.mjs > $T/wordcheck.log 2>&1
wcrc=$?
# echo a compact wordcheck summary to the progress stream (the full log is kept)
grep 'wordcheck:' $T/wordcheck.log | sed 's/^/  /'
ok $wcrc "wordcheck: banned strings, terminology, labels, buttons, error-fix all clean"

say "RESULT"
[ $fail = 0 ] && echo "  ALL DESIGN CHECKS PASS (P3+P4+P5+P6+P7+P8+P9b)" || echo "  $fail CHECK GROUPS FAILED"
exit $fail
