# Google Play Console — Data Safety Form Guide

Use the exact answers below when completing the **Data safety** questionnaire in the Google Play Console for **Vortex Arena**.

---

## 1. Data Collection & Security Overview

| Question | Answer |
| :--- | :--- |
| Does your app collect or share any of the required user data types? | **Yes** (User IDs and gameplay statistics for match functionality) |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (All traffic is transmitted via HTTPS and WSS) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (Via web URL at `https://vortex-arena-1nmx.onrender.com/account-deletion` and in-app support) |

---

## 2. Specific Data Types Collected

### Category: Personal Info
- **User IDs**
  - **Collected?** Yes
  - **Shared with third parties?** No
  - **Processed ephemerally?** No (Stored in database for registered accounts; temporary for guests)
  - **Is this data required or optional?** Required for gameplay matchmaking and progression
  - **Why is this data collected?**
    - ☑ App functionality (Authenticating accounts and matchmaking)
    - ☑ Account management (Saving player stats and progress)

### Category: App Activity
- **In-App Actions / Gameplay Statistics**
  - **Collected?** Yes (Kills, deaths, matches played, accuracy, unlocked skins)
  - **Shared with third parties?** No
  - **Processed ephemerally?** No
  - **Why is this data collected?**
    - ☑ App functionality (Displaying leaderboards and saving unlocked weapon skins)
    - ☑ Analytics (Server performance and balance tuning)

### Category: App Info and Performance
- **Crash Logs & Diagnostics**
  - **Collected?** Yes (Anonymous client error reports and WebSocket disconnect logs)
  - **Shared with third parties?** No
  - **Processed ephemerally?** Yes
  - **Why is this data collected?**
    - ☑ Analytics (Fixing multiplayer disconnections and rendering issues)

### Category: Device or Other Identifiers
- **Device or other IDs**
  - **Collected?** Yes (Pseudonymous installation token for guest players)
  - **Shared with third parties?** No
  - **Why is this data collected?**
    - ☑ App functionality (Preventing multi-boxing and guest account recovery)

---

## 3. Data Sharing
- **Does your app share data with third parties or data brokers?**
  - **NO**. We do not sell, rent, or trade any user data to third-party ad networks, trackers, or data brokers.

---

## 4. Privacy Policy & Account Deletion URLs to Enter in Play Console

- **Privacy Policy URL:**
  `https://vortex-arena-1nmx.onrender.com/privacy`
- **Data & Account Deletion Request URL:**
  `https://vortex-arena-1nmx.onrender.com/account-deletion`
