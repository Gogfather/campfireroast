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

- GitHub: `Gogfather/campfireroast` (`main` branch), auto-deployed to Vercel on every push.
- DNS: CNAME `campfireroast.thegogfather.com` → `campfireroast.vercel.app`, set as **DNS only** in Cloudflare (proxy/orange-cloud must stay off — Cloudflare's proxy blocks Vercel's SSL verification).
- Custom domain is registered under the Vercel project's Settings → Domains.
- Preview deployments (other branches/PRs) get their own auto-generated `*.vercel.app` URLs and are separate from this production domain.

### Known gaps (expected for a POC, not yet addressed)
- No real art — fire/marshmallow are placeholder shapes (circle, triangle, ellipse).
- No sound.
- No persistence of high scores between sessions.
- Scoring/balance numbers (cook rate, scorch rate, decay rates, band thresholds) are first-pass guesses — need real playtesting to tune.

