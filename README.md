# Vortex Arena: 12-Player Tactical Multiplayer Shooter

A real-time **multiplayer online 3D shooting game for laptops and desktop computers**, built with high-performance WebGL (Three.js), authoritative WebSocket networking, an ACID SQLite database, procedural Web Audio acoustics, an interactive friends system, cosmetic skins armory with 3D turntable preview, and server-validated kill milestone progression.

---

## 1. Key Features & Architecture

### A. Real-Time Multiplayer Gameplay (Max 12 Players)
- **Strict 12-Player Room Limit:** Authoritative server guarantees no match ever exceeds 12 players (`1/12` to `12/12` capacity tracking).
- **Matchmaking & Waiting Lobby:** Find public matches automatically or host custom private matches with 6-character room codes.
- **Graceful Networking:** Handles player join, leave, disconnect, and reconnect without lobby disruption.
- **Authoritative Hit Detection & Anti-Cheat:** Server validates line-of-sight raycasts against arena colliders and player hitboxes (headshots vs body hits). Clients cannot inject fake kills or modify scores.

### B. High-Performance Shooting Mechanics
- **Controls:** Standard WASD movement, Sprint (`Shift`), Jump (`Space`), Reload (`R`), Weapon Selection (`1`, `2`, `3`, `4` or Mouse Wheel), Scoreboard (`Tab`).
- **Mouse Aiming:** Smooth camera control with HTML5 Pointer Lock API, sensitivity adjustment, and optional Y-axis inversion.
- **Four Distinct Firearms:**
  1. **V-44 Striker (Assault Rifle):** Fully automatic, high velocity, balanced combat rifle.
  2. **Hawk-50 (Sniper Rifle):** Bolt-action anti-materiel rifle with high-magnification ADS scope and instant headshot elimination.
  3. **Breacher-12 (Shotgun):** Devastating 8-pellet close-quarters pump-action scattergun.
  4. **Pulse-9 (Pistol):** Semi-automatic high-precision sidearm.
- **Vitals & Damage:** Dual-layer health (100 HP) and rechargeable kinetic shield (50 Shield) absorption model.
- **Combat Feedback:** Dynamic crosshair with recoil bloom, audio hitmarker chime (red ping for headshots), low-health blood vignette pulse, kill feed, and elimination fanfare.
- **Tactical 3D Arena:** Cover crates, waist-high concrete barricades, hollow central bunker with archways, sniper catwalks, and elevated platforms.

### C. Persistent Friends System
- **Player Profiles & Unique Tags:** Every operative receives a unique identifier (e.g. `SoldierAlpha #0001`).
- **Live Search:** Search players by username or exact `#ID` tag.
- **Friend Requests:** Send, receive, accept, decline, and cancel friend requests.
- **Real-Time Presence:** Friends list displays live statuses: **Online**, **In Lobby**, **In Match**, or **Offline**.
- **Squad Invitations:** One-click in-game match invitation that alerts your online friend with an "Accept & Join" dialog.
- **Moderation:** Remove friends, block players, or submit abuse reports directly to the server database.

### D. Character Skins & Armory
- **Cosmetics:** Outfits, tactical helmets with glowing visors, armor plating, and metallic weapon finishes.
- **3D Turntable Preview:** Interactive 3D turntable allowing you to click and drag to rotate character and weapon models in real time before equipping.
- **Rarity Tiers:** Common, Rare, Epic, and Legendary.
- **Cosmetic Only:** Purely visual customization with zero unfair competitive gameplay advantages.

### E. Kill-Based Milestone Progression (Authoritative)
Lifetime confirmed kills are updated exclusively by the server upon validated eliminations and stored in SQLite:
- **10 Kills Milestone:** Unlocks **Bronze Striker** weapon skin + *Bronze Marksman* achievement.
- **25 Kills Milestone:** Unlocks **Desert Scout** character combat uniform.
- **50 Kills Milestone:** Unlocks **Silver Vanguard** chrome plate armor + **Silver Alloy** firearm skin.
- **100 - 25,000 Kills:** Intermediate milestone tracks (*Cyber Ninja*, *Crimson Phantom*, *Titanium Warlord*, *Void Stalker*, *Plasma Drake*, *Cosmic Centurion*).
- **60,000 Kills Grand Milestone:** Unlocks the Legendary **Apex Overlord** radiant golden-hologram armor + **Solaris Oblivion** exclusive weapon skin + *Ultimate Legend* achievement.
- **Progress Tracking:** Real-time progress indicators (e.g. `35 / 50 kills` and intermediate percentage bar towards 60,000 kills).

---

## 2. All 10 Game Screens

| Screen # | Screen Name | Description |
|:---:|---|---|
| **1** | **Login & Registration** | Secure sign-in with bcrypt password hashing, JWT tokens, and quick-login test accounts. |
| **2** | **Main Menu** | Navigation hub, player profile badge, ranked combat callout, and lifetime kill record sidebar. |
| **3** | **Matchmaking** | Animated radar search finding open 12-player public rooms. |
| **4** | **Game Lobby** | 12 interactive player slots, host match launcher, room code sharing, and game mode toggle. |
| **5** | **Gameplay & HUD** | 60 FPS 3D canvas, dynamic crosshair, sniper scope overlay, vitals, ammo, kill feed, and Tab scoreboard. |
| **6** | **Friends Page** | User search, incoming/outgoing requests, live online/in-match status, squad invites, block, and report. |
| **7** | **Skin Inventory** | 3D interactive turntable preview, rarity filters, unlock requirements, and equip manager. |
| **8** | **Achievements Page** | Milestone badges, reward previews, and intermediate progress tracker towards 60,000 kills. |
| **9** | **Match Results** | Victory/Defeat banner, personal statistics (kills, deaths, K/D, damage), and full 12-player leaderboard. |
| **10** | **System Settings** | Mouse sensitivity slider, Invert Y-axis, FOV slider (65°-105°), Graphics preset (Low/Med/High/Ultra), and Audio volumes. |

---

## 3. Technology Stack

- **Game Engine (Client):** Three.js (WebGL 2.0 / WebGL 1.0) with dynamic lighting, shadow maps, and particle systems.
- **Audio Engine:** Procedural Web Audio API sound synthesizer (zero external MP3 file dependencies).
- **Networking:** Authoritative Node.js WebSocket engine (`ws`) with 30 Hz tick simulation and client-side entity interpolation.
- **Backend Framework:** Node.js + Express REST API.
- **Database:** SQLite (`better-sqlite3` / `sql.js` / `sqlite3`) with schema constraints, WAL mode, and ACID disk persistence.
- **Security:** `bcryptjs` for password hashing, `jsonwebtoken` for session tokens, server-side line-of-sight raycasting.

---

## 4. Quick Start & Launch Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher.
- A modern web browser supporting WebGL (Google Chrome, Mozilla Firefox, Microsoft Edge, or Safari).

### Installation & Run

1. **Clone or navigate to the repository:**
   ```bash
   cd /Users/nikhilarora/Documents/multiplayer-gun-game
   ```

2. **Install dependencies (if not already installed):**
   ```bash
   npm install
   ```

3. **Start the Game Server:**
   ```bash
   npm start
   ```

4. **Open the Game in Your Browser:**
   - Open your browser and navigate to:
     ```
     http://localhost:3000
     ```

---

## 5. Testing Multiplayer on a Single Laptop

To verify multiplayer functionality on a single machine:

1. **Open Player 1:**
   - Open a browser tab to `http://localhost:3000`.
   - Click **Player 1: Alpha** on the login screen to sign in as `SoldierAlpha`.
   - Click **Host Custom Match** or **Find Quick Match**.
   - Note the 6-character room code (e.g. `ABC123`).

2. **Open Player 2:**
   - Open an **Incognito / Private Window** (or a different browser like Safari/Firefox) to `http://localhost:3000`.
   - Click **Player 2: Bravo** on the login screen to sign in as `SniperBravo`.
   - Click **Join by Room Code** and enter the code from Player 1, or click **Find Quick Match**.

3. **Play the Match:**
   - Both players appear in the waiting lobby (showing `2 / 12 PLAYERS`).
   - Click **Launch Match**.
   - Click the game canvas to lock the mouse pointer.
   - Use **WASD** to maneuver and **Left Click** to fire.
   - Observe live bullet tracers, damage deduction on victim, hitmarker pings, elimination banner, and updated kill feed!

---

## 6. Automated Verification Tests

The repository includes a comprehensive automated test suite testing auth, friends, 12-player capacity, milestone rewards (10, 50, 60k kills), and combat collision:

```bash
npm test
```

### Test Coverage Highlights:
- `✔ User Registration and Default Skins Assignment`
- `✔ Duplicate Registration Prevention & Password Security`
- `✔ Friends System Lifecycle (Search, Request, Accept, Status, Block, Report)`
- `✔ Authoritative Kill-Based Milestone Progression (10, 50, 60,000 kills)`
- `✔ Multiplayer Room Capacity Enforcement (Hard 12-Player Limit)`
- `✔ Combat Mechanics & Collision Validation`
- `✔ 2-Player Real-time Matchmaking, Combat, and Authoritative Damage`

---

## 7. Free 24/7 Cloud Hosting Deployment

Vortex Arena is pre-configured with `render.yaml`, `Dockerfile`, and `fly.toml` for 100% free cloud hosting with zero local laptop dependency and full WebSocket multiplayer support.

### Option A: Render (Recommended — 2 Minutes, 100% Free)
1. **Push your code to GitHub:**
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Go to **[render.com](https://render.com)** and sign in with GitHub (no credit card required).
3. Click **New +** → **Blueprint** (or **Web Service**).
4. Select your `vortex-arena` GitHub repository.
5. Render detects `render.yaml` automatically:
   - **Plan:** Free
   - **Build Command:** `npm install`
   - **Start Command:** `node server/index.js`
6. Click **Apply** or **Create Web Service**.
7. In ~60 seconds, your game is live globally at:
   ```text
   https://<your-app-name>.onrender.com
   ```
   - Native `wss://` WebSocket multiplayer enabled out-of-the-box.
   - Anyone on PC, Mac, Android, or iPhone can join from anywhere in the world!

### Option B: Koyeb (Global Free Edge Tier)
1. Go to **[koyeb.com](https://koyeb.com)** and sign in with GitHub.
2. Click **Create App** → select **GitHub**.
3. Choose your repository. Koyeb detects the `Dockerfile` and deploys globally with WebSockets enabled.

### Option C: Fly.io
```bash
fly launch
fly deploy
```

