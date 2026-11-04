# Google Play Console Publishing Guide: Vortex Arena

This guide provides end-to-end instructions for uploading and publishing the **Vortex Arena** Android application on the Google Play Store.

---

## 1. Prerequisites Checklist

- [x] **Signed Android App Bundle (.aab)**: Located at `dist/VortexArena-release.aab`
- [x] **App Icon (512x512 PNG)**: Located at `playstore/icon-512.png`
- [x] **Feature Graphic (1024x500 PNG)**: Located at `playstore/feature_graphic-1024x500.png`
- [x] **Screenshots (1920x1080 PNG)**: 5 landscape screenshots located in `playstore/`
- [x] **Target SDK**: API 34 (Android 14) verified
- [x] **Privacy Policy URL**: `https://vortex-arena-1nmx.onrender.com/privacy`
- [x] **Account Deletion URL**: `https://vortex-arena-1nmx.onrender.com/account-deletion`

---

## 2. Step-by-Step Google Play Console Setup

### Step 1: Create Application
1. Sign in to the [Google Play Console](https://play.google.com/console).
2. Click **Create app** (top-right).
3. Fill in:
   - **App name**: `Vortex Arena: 3D Multiplayer`
   - **Default language**: English (United States)
   - **App or game**: Game
   - **Free or paid**: Free
4. Accept Developer Program Policies and US export laws, then click **Create app**.

---

### Step 2: Set Up Store Listing
Navigate to **Grow > Store presence > Main store listing**:
1. **Short description** (copy from `playstore/store_listing.txt`):
   > Fast-paced 3D multiplayer tactical FPS shooter with 6 maps, bots & cross-play.
2. **Full description** (paste text from `playstore/store_listing.txt`).
3. **Graphics**:
   - **App icon**: Upload `playstore/icon-512.png` (512x512).
   - **Feature graphic**: Upload `playstore/feature_graphic-1024x500.png` (1024x500).
   - **Phone screenshots**: Upload all 5 screenshots from `playstore/` (`screenshot-1-*.png` to `screenshot-5-*.png`).
   - (Optional) Tablet 7-inch & 10-inch screenshots: You can upload the same 1920x1080 landscape screenshots.
4. Click **Save**.

---

### Step 3: Complete Policy Declarations & App Content
In the left sidebar, navigate to **Policy and programs > App content**:

1. **Privacy Policy**:
   - Enter: `https://vortex-arena-1nmx.onrender.com/privacy`
2. **App Access**:
   - Select: *All functionality is available without special access restrictions* (Guest mode allows immediate play). If offering credentials, provide: `User: Player1 / Password: password123`.
3. **Ads**:
   - Select: *No, my app does not contain ads*.
4. **Content Rating (IARC)**:
   - Category: Game.
   - Violence: Yes, animated shooting combat without realistic mutilation or gore.
   - Blood: Mild / stylized impact particles.
   - Online interactions: Yes (players can join online matches and chat).
   - Expected rating: **Teen / PEGI 12 / ESRB T**.
5. **Target Audience and Content**:
   - Select age groups: **13-15, 16-17, 18 and over**.
   - Not targeted primarily to children.
6. **Data Safety**:
   - Follow the field-by-field answers in `playstore/data_safety_declaration.md`.
   - Mark Data Deletion URL as: `https://vortex-arena-1nmx.onrender.com/account-deletion`.
7. **Government Apps / Financial Features / Health**:
   - Mark all non-applicable as *No*.

---

### Step 4: Upload Android App Bundle (.aab) to Internal Testing
1. Navigate to **Testing > Internal testing**.
2. Click **Create new release**.
3. Under **App bundles**, upload:
   `dist/VortexArena-release.aab`
4. Enter Release Name: `1.2.0 (3)`.
5. Enter Release Notes:
   ```
   • Official Android release targeting API 34.
   • High-speed local asset loading via AndroidX WebEngine.
   • Full 12-player cross-platform multiplayer with laptop and web players.
   • 6 procedural combat arenas and 4 military firearms.
   • Offline Single Player vs AI bots and Practice Sandbox.
   • Native haptic vibration on weapon recoil, hits, and eliminations.
   ```
6. Click **Next** > **Save and publish to internal testing**.

---

### Step 5: Closed Testing & Production Release
Depending on whether your developer account is personal (created after Nov 2023) or organization:
- **Personal accounts**: Google requires 14 days of closed testing with at least 12 opt-in testers before production access is unlocked. Add tester email addresses to a Google Group or email list under **Closed testing**.
- **Organization accounts**: You can promote the release directly from Testing to **Production** under **Release > Production**.

---

## 3. Future Application Updates

Whenever you make improvements or updates to the game:
1. Increment the version in `android/app/build.gradle`:
   - `versionCode` = `4` (increment by 1 each release)
   - `versionName` = `"1.2.1"`
2. Re-run the automated build script:
   ```bash
   ./scripts/build_android.sh
   ```
3. Upload the newly generated `dist/VortexArena-release.aab` to Google Play Console as a new release!
