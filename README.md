# French Made Simple Tracker API — Vercel version

Small Node/Express/MongoDB API used by the personal procrastination tracker.

The Android app never contains MongoDB credentials. SQLite logs activity locally every day. The APK automatically uploads **unsynced history only once every 7 days** when French Made Simple next enters the foreground. A manual **Sync Now** button remains available for testing.

## Multi-device identity

Each APK installation sends four identity fields:

- `userId` — generated from the tester profile name (for example `anmol`).
- `userName` — display name (for example `Anmol`).
- `deviceId` — random stable installation ID stored on that device.
- `deviceName` — friendly label such as `Pixel 9` or `Motorola Edge`.

Use the **same profile name** on multiple devices if they belong to the same person. Use a different profile name for another tester.

This is intentionally a lightweight testing profile system, not password authentication.

## Local development

```bash
cd tracker-server
cp .env.example .env
npm install
npm start
```

Then test:

```bash
curl http://localhost:4000/health
```

## Vercel deployment

Vercel supports Express apps directly. If this folder lives inside the main FMS Git repository, import the repository in Vercel and set:

```text
Root Directory = tracker-server
```

Add these Environment Variables in Vercel:

```text
MONGODB_URI
MONGODB_DB=fms_tracker
TRACKER_API_TOKEN
```

`PORT` is only for local development; Vercel manages the HTTP runtime itself.

After deployment:

```bash
curl https://YOUR-PROJECT.vercel.app/health
```

Then place this base URL in the APK:

```text
https://YOUR-PROJECT.vercel.app
```

Do not add `/health` or `/api/v1/...` to the URL field.

See `../VERCEL_DEPLOY.md` for the full step-by-step deployment checklist.

## Collections

The server creates/uses these automatically on first sync:

- `users`
- `devices`
- `usage_events`
- `phone_calls`
- `whatsapp_calls`
- `french_sessions`

No manual documents are required.

## Endpoints

Public health check:

```text
GET /health
```

Protected endpoints (Bearer `TRACKER_API_TOKEN`):

```text
POST /api/v1/sync/batch
GET  /api/v1/users
GET  /api/v1/devices?userId=anmol
GET  /api/v1/dashboard/summary?userId=anmol&days=7
GET  /api/v1/dashboard/summary?userId=anmol&deviceId=device-...&days=7
```

If `deviceId` is omitted from the summary endpoint, activity is combined across all devices for that user.
