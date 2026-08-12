# French Made Simple v1.3 — Final Implementation Plan

## Goal
Keep the proven v1.2 Android tracking architecture, but make v1.3 smaller in MongoDB, easier to configure, less obvious in the normal UI, safer to update, and easier to test.

## 1. Local-first tracker
- Android `UsageStatsManager`, CallLog, Contacts and the notification listener collect data.
- SQLite remains the detailed local source of truth.
- Raw usage events are **not** uploaded one-by-one to MongoDB.
- System/launcher noise and very short transitions are ignored locally where appropriate.

## 2. Weekly MongoDB summaries
MongoDB uses one `weekly_activity` document per user + device + week.

Each document contains:
- app totals per day
- meaningful usage windows for each app
- regular calls with full phone number, contact name, direction and duration
- best-effort WhatsApp calls, including a saved-contact phone number only when a unique exact contact-name match is found
- French study totals by day

This replaces thousands of tiny cloud records with a compact weekly analytics document.

## 3. User/device identity
- Same `userName` can be used across multiple devices.
- Every installation gets a unique `deviceId`.
- Saving the profile automatically registers the device with Vercel.
- Vercel issues a random per-device secret.
- The secret is stored in Expo SecureStore.
- The normal user no longer types the API URL or shared token.

## 4. Regular calls
Store:
- `phoneNumber` — full number for this private test build
- `contactName`
- `direction`
- `startedAt`
- `durationSeconds`

UI formats durations such as `5m 12s` and `1h 15m 37s`.

## 5. WhatsApp calls
WhatsApp calls remain best effort because WhatsApp exposes no supported third-party call-history API.

When a call notification contains a display name:
1. compare it with Android Contacts
2. if exactly one contact/number matches that exact display name, save the number
3. otherwise keep the number null
4. never guess ambiguous numbers

## 6. Remote learning content
Use Vercel static JSON rather than adding a second database.

Server layout:
```
public/content/
├── manifest.json
├── testCourse.json
├── kieranBall/
├── grammar/topics/
├── ccube/
└── songs/
```

The APK includes the latest bundled Course 1–15 data as an offline fallback.

A remote-content proof of concept is included:
- `/content/manifest.json`
- `/content/testCourse.json`
- hidden `Test Remote Content` button
- downloaded test data is cached in SQLite

Test by changing `testCourse.json` from 3 cards to 4 cards on Vercel without rebuilding the APK.

## 7. Content data cleanup
The supplied updated data becomes the bundled app data.
- KieranBall Course 1–15 imports are fixed.
- Grammar Course 1–15 imports are fixed.
- Grammar category count is updated to 15 courses.

## 8. Hidden analytics
Home shows a normal `Profile` entry rather than `My Activity`.

Normal Profile contains ordinary settings/search.

Typing exactly:
```
hidden123
```
in Profile search opens Private Analytics.

Private Analytics contains:
- procrastination score
- app usage
- regular calls
- WhatsApp calls
- tracker status
- app categories
- tracker/Panda/content settings

## 9. Automatic tracker configuration
Default Vercel endpoint:
```
https://fms-tracker-omega.vercel.app
```

Normal setup does not request an API token.
Advanced analytics settings retain an API URL override for debugging.

## 10. Android permissions
Runtime permissions:
- Contacts
- Call Log

Special Android settings access:
- Usage Access
- Notification Listener Access

Android does not permit the application to silently grant these special permissions. v1.3 therefore provides a guided setup flow and automatically re-checks status after returning from Settings.

## 11. Panda launcher icons
The launcher icon family keeps the existing expressions but recolors the Panda face for immediate attention:
- Happy — green
- Crying — blue
- Angry — red
- Lonely — blue-grey
- Furious — sun-red/orange
- Please — amber
- Waiting — yellow
- Heartbroken — purple
- Sleeping — indigo
- Missed — grey

Manual icon switching shows an in-app preview and tells the tester to return to Android Home to verify the launcher icon.

Existing production thresholds remain:
- Happy < 6h
- Crying 6h
- Angry 12h
- Lonely 24h
- Furious 36h
- Please 48h
- Waiting 72h
- Heartbroken 5d
- Sleeping 7d
- Missed 14d

Accelerated test mode remains available.

## 12. Panda Tip crash
The Panda Tip card is explicitly non-interactive and cannot navigate.

## 13. MongoDB collections
Primary v1.3 collections:
```
users
devices
weekly_activity
```

Legacy v1.2 collections may remain temporarily while testing:
```
usage_events
phone_calls
whatsapp_calls
french_sessions
```

Do not delete the legacy collections until v1.3 weekly sync has been verified on real devices.

## 14. Build workflow
Mobile project and backend stay separate:
```
project-root/
├── fms-vercel-v1.3/
└── fms-tracker-v1.3/
```

Build the APK only from the app folder:
```bash
cd fms-vercel-v1.3
chmod +x build-apk.sh
./build-apk.sh
```

The script uses the lockfile when available, runs Expo Doctor, validates the Android JS bundle and runs local EAS Android release build.

## 15. Test order
1. Deploy `fms-tracker-v1.3` to Vercel.
2. Verify `/health`.
3. Verify `/content/manifest.json`.
4. Verify `/content/testCourse.json`.
5. Build APK.
6. Install on Pixel 9.
7. Save tester profile (automatic device registration).
8. Run guided permissions setup.
9. Generate app usage and calls.
10. Refresh local analytics.
11. Use `hidden123` to open analytics.
12. Run `Sync weekly summary now`.
13. Verify `weekly_activity` in MongoDB.
14. Test remote content (3 cards).
15. Change remote test course to 4 cards and redeploy Vercel.
16. Press Test Remote Content again **without rebuilding**.
17. Test all Panda colors manually.
18. Test accelerated Panda mode.
19. Repeat on Motorola / second device.

## Target architecture
```
ANDROID DEVICE
├── French learning
│   ├── bundled Course 1–15 fallback
│   ├── Vercel content manifest
│   └── SQLite remote-content cache
├── Tracker
│   ├── UsageStats
│   ├── CallLog
│   ├── Contacts
│   ├── WhatsApp notification listener
│   └── SQLite detailed history
├── Panda
│   ├── SharedPreferences
│   ├── WorkManager
│   └── activity aliases
└── Weekly analytics
    └── Vercel → MongoDB `weekly_activity`
```
