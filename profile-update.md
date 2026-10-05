# Caw&Co X profile update

Completed on https://x.com/cawcodev. Before any writes, the Home profile menu showed Cawco and @cawcodev, with its Profile link pointing to /cawcodev.

## Before and after

| Field | Before | After |
| --- | --- | --- |
| Display name | Cawco | Caw&Co |
| Bio | The no-frills cross-machine harness for busy devs on the go 🐧 | Run Claude Code, OpenCode and pi across your machines. Keep sessions, delegates and tools together. Self-hosted. |
| Website | https://cawco.dev | https://cawco.dev |
| Category | Software developer/Programmer/Software engineer | Software Company |
| Account type | Business | Business, preserved |

Category search offered Software Application, Software Company, and Software developer/Programmer/Software engineer. Selected Software Company. The account-type menu offered switching to Personal or Creator, confirming the existing Business type; cancelled without changing it.

Old header URL: https://pbs.twimg.com/profile_banners/2106747920565338112/1791123164/600x200

Old avatar URL: https://pbs.twimg.com/profile_images/2106749243310411776/9qqnR1RE_200x200.jpg

New header URL: https://pbs.twimg.com/profile_banners/2106747920565338112/1791190758/600x200

New avatar URL: https://pbs.twimg.com/profile_images/2107032863472267264/LabaXbaf_200x200.jpg

## Actions and verification

- Used the fleet x-browser tools connected to the existing headed Chrome session. No account switching or credential access.
- Source files: final-header.png, 1500 × 500; final-avatar.png, 1254 × 1254. Both came from the approved profile-review/assets exports.
- Uploaded through normal Edit profile file controls and accepted centered crops with each zoom slider at 0. X generated a 400 × 400 avatar crop from the high-resolution source.
- Saved category through its separate UI. Saved the coherent name, bio, header and avatar through Edit profile and confirmed X's save dialog.
- Applied both later narrow bio corrections as they arrived. The final Humanizer wording above supersedes all earlier variants. Saved it and reloaded once after the final correction. Desktop and phone DOM checks both returned bioMatches=true for the final exact bio.
- Website remained https://cawco.dev in Edit profile, including when reopened for the narrow bio correction. The public website still displays cawco.dev and uses the same https://t.co/Wv7kka7IHT link.
- New image URLs persisted after reload. Browser-loaded full header variant /1500x500 had intrinsic dimensions 1500 × 500; avatar /400x400.jpg had intrinsic dimensions 400 × 400.
- Desktop at 1440 × 1000: loaded header 600 × 200, rendered 598 × 199.33; loaded avatar 200 × 200, rendered 134 × 134. Full Caw head remains visible in the circle and header text remains visible. X's fixed title bar overlaps the upper illustration strip at this desktop width.
- Phone at 390 × 844: loaded header 600 × 200, rendered 388 × 129.33 at (1, 50); avatar variant x96 loaded 96 × 96, rendered 85.5 × 85.5. Header wordmark/tagline and whole avatar head remain visible. Both viewport checks reported horizontalOverflow=false.
- ui-observer measured the existing profile details in the same headed browser. Its observations concern X's small category/link targets and minor native inline alignment; no profile settings were changed to address X's own layout.
- X shows “Under review” after the name/avatar update. Edit profile states: “Your profile is under review. No new changes are allowed to name and profile photo during the review period.” The updated bio is saved and publicly visible.

## Evidence

- [Final desktop screenshot](profile-update/final-desktop.png)
- [Final phone screenshot](profile-update/final-phone.png)
- [Desktop DOM facts](profile-update/desktop-facts.json)
- [Phone DOM facts](profile-update/phone-facts.json)

The first upload attempt from the exporting workspace was refused: “Access denied: path /home/bewinxed/.worktrees/cockpit-f79cd984/profile-review/assets/final-header.png (canonical: /home/bewinxed/.worktrees/cockpit-f79cd984/profile-review/assets/final-header.png) is not within any of the configured workspace roots.” Copied the approved exports into this workspace and uploaded successfully. Entering the category editor cleared unsaved photo/bio edits, so those were reapplied before the profile save. No remaining blocker or login challenge occurred.

No post was published or pinned. The browser remains open on @cawcodev.
