# Campfire game

Simple campfire game to build

## Rosebud AI prompt

Create a game where players will sit around a burning campfire. A player can either roast marshmallows or stoke the fire. The idea is that different things will stoke the fire in different ways. The bigger the fire, the faster it will roast the marshmallows. The idea is to roast the marshmallows perfectly without burning them. The closer to the fire, your marshmallow cooks faster. You need to rotate the marshmallow so that it cooks evenly. Too close to the fire for a length of time and it will start on fire. You will need to blow on the marshmallow to put out the fire before it burns.

## Design decisions (2026-08-23)

- **Mode**: Online multiplayer, one shared campfire per session, **competitive** — everyone's marshmallow cooks off the same fire, so overstoking can burn other players' marshmallows. Adds strategy/friction between players.
- **Session size**: 5-8 players per campfire.
- **Pacing**: Casual/relaxed timing game, not twitch-reflex arcade. Cozy vibe over high skill ceiling.
- **Controls**: Device mic to detect blowing (put out flames on your marshmallow), tilt/gyro to rotate the stick. Needs an on-screen button fallback for browsers/devices that deny permissions or lack sensors (especially iOS Safari, which requires an explicit tap to request mic + device-orientation access).
- **Platform/tech**: Cross-platform web-first (playable in browser, wrapped for app stores) rather than a native-only engine build.
- **Art style**: Cute/cozy 2D cartoon.
- **Progression**: Scoring/high scores (roast quality: perfect vs. burnt) plus unlockables — skins, alternate fires, campsites.
- **Social**: Both invite-only private rooms (friend codes/links) and public matchmaking with strangers.
- **Team/scope**: Solo developer, aiming to ship commercially (not just a hobby project) — worth investing in polish and infra, but MVP scope should stay realistic given competitive real-time multiplayer is a substantial backend lift for one person.

### Open risks to resolve before build
- Real-time netcode: need authoritative server state for fire heat, each player's marshmallow position/rotation/doneness, and burn state, synced live across up to 8 players.
- Anti-griefing balance: rules to keep one player from ruining the fire for everyone (e.g. diminishing returns on stoking, cooldowns, or a cap on fire size).
- Mic-based blow detection reliability in noisy environments; fallback control scheme needed regardless.

## Phase 1: single-player proof of concept (in progress)

Scoped down to de-risk the core mechanic before tackling multiplayer netcode. Decided 2026-08-23:

- **Single-player only** for this phase; multiplayer/competitive fire comes later once the mechanic feels good.
- **Simplified controls**: on-screen buttons/drag instead of mic+gyro, to validate feel quickly.
- **Scope**: core mechanic feel + basic scoring (roast quality) + light placeholder visual feedback (color-changing marshmallow, fire size).
- **Tech stack**: Phaser 3 + TypeScript + Vite, chosen so this code carries forward into the full multiplayer game later (vs. throwaway prototype).

### What's built so far
- Scaffolded Phaser 3 + TypeScript + Vite project (`src/main.ts`, `src/scenes/GameScene.ts`).
- Core loop implemented: fire heat decays over time and needs periodic "Stoke" taps; marshmallow distance from the fire is set by dragging a vertical slider; cooking speed depends on heat × proximity; "Rotate" taps must happen periodically or "Evenness" decays; getting too close for too long builds up "Scorch" until the marshmallow catches fire, at which point holding "Blow" is needed to extinguish it before it burns to a crisp; "Serve" ends the round and scores the result (Raw / Undercooked / Perfect! / Well done / Overcooked / Burnt).
- Verified working end-to-end in a headless browser (Playwright): heat/doneness/evenness/scorch all respond correctly to input, and the full serve → result → play again → replay loop works.

### Run it
```
npm install
npm run dev
```
Then open the printed local URL (default `http://localhost:5173`) in a browser.

### Deployment
Live playtest build: **https://campfireroast.thegogfather.com**

- GitHub: `Gogfather/campfireroast`. Branch structure: `main` (day-to-day work), `production` (Vercel Production environment — deploys to campfireroast.thegogfather.com), `preview` (Vercel Preview environment — deploys to preview.campfireroast.thegogfather.com), `ui` (visual/UI exploration, previewed via Vercel's auto-generated branch URL rather than a custom domain).
- DNS: Cloudflare CNAMEs for each custom subdomain, all set as **DNS only** (proxy/orange-cloud off — Cloudflare's proxy blocks Vercel's SSL verification). Use whatever exact CNAME target Vercel's Domains page shows for that specific hostname (it issues a unique per-domain target, e.g. `<hash>.vercel-dns-0NN.com`).
- Custom domains are registered per-environment under the Vercel project's Settings → Domains, with Branch Tracking set per environment under Settings → Environments.

### Known gaps (expected for a POC, not yet addressed)
- No sound.
- No persistence of high scores between sessions.
- Scoring/balance numbers (cook rate, scorch rate, decay rates, band thresholds) are first-pass guesses — need real playtesting to tune.
- Marshmallow itself is still a placeholder ellipse (color-shifts with doneness); no character/hand art yet.
- Flame animation is size-tiered (5 discrete steps), not continuously interpolated — a visible "pop" when heat crosses a tier boundary rather than a smooth grow/shrink.

## Fire pit visual redesign (`ui` branch, 2026-08-23)

Reworked the fire from a plain circle+triangle into a proper stone fire pit scene, built entirely from Phaser primitives (no external art assets):
- **Stone ring**: 16 small stone shapes arranged in a squashed ellipse around the pit, random size/shade per stone, each with a lighter block-shaded highlight facet.
- **Randomly placed logs**: 5-7 rectangles scattered and rotated inside the pit, re-randomized every time the scene loads/restarts, each with a cut-end cap and growth-ring detail.
- **Dirt floor** grounding the pit, and bold black ink outlines on every shape for a cartoony, cel-shaded look.

Verified working via headless-browser screenshots.

## Animated flame (`ui` branch, 2026-08-24)

Replaced the flame with a hand-authored 12-frame flicker animation, sourced from `campfire_frames_all_sizes` (background rect and the source art's own static logs stripped out via a one-off script, keeping just the flame+ember paths so they composite over our own stone pit). Frames live in `public/flame/<size>/frame_NN.svg` for five size tiers (xs/s/m/l/xl), loaded via Phaser's SVG loader and played as five separate looping animations. Fire heat picks the active tier (0-20%→xs ... 80-100%→xl), so the flame visibly grows taller — not just faster-flickering — as heat rises, with the flame's base anchor point staying fixed across all sizes/frames. Verified frame-to-frame pixel differences confirm the animation is actually advancing, not stuck on one frame.

This was a **visual-only** pass — the underlying mechanic (single heat scalar, linear near/far distance slider) is unchanged for now.

## Future core requirement: materials & spatial heat (not yet built)

Design intent captured 2026-08-23, to be built after the visual pass above, likely alongside or before the multiplayer competitive-fire work:

- Heat should stop being a single global scalar and become **spatially distributed across the fire pit** — different areas of the pit can be hotter or cooler at the same time, rather than one uniform "heat" value.
- Players add specific **materials** to the fire (instead of one generic "stoke" action) at a location in the pit. Each material has:
  - **Effective time** — how long its heat contribution lasts before burning out.
  - **Spread** — how far its heat effect radiates from where it's placed.
  - **Intensity** — how much heat/temperature it contributes at its peak.
  - **Color treatment** — each material should tint the flame differently (like chemical flame-coloring), giving visual feedback on what's currently fueling the fire.
- Because hot spots move and decay as materials are added/burn out, **players need to physically reposition their marshmallow** around the pit to chase the right temperature zone, rather than just choosing a near/far distance on one axis.
- This implies moving from the current 1D distance slider to full 2D positioning around the fire pit, and reworking the heat model into a spatial field rather than a scalar. Scope and specific starting materials still need to be defined before implementation.

