# FMS Tracker API v1.3

Vercel/Express backend for French Made Simple.

## v1.3 responsibilities
- register private test devices and issue a per-device secret
- receive **weekly summary documents** instead of raw Android usage events
- store summaries in MongoDB Atlas
- expose static French-learning content under `/content/`
- keep admin-only user/device/dashboard endpoints protected by `TRACKER_API_TOKEN`

## Environment

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=fms_tracker
TRACKER_API_TOKEN=long-random-admin-token
```

The mobile APK does not need to contain `TRACKER_API_TOKEN`.

## Local run

```bash
npm install
npm start
```

Then:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/content/manifest.json
```

## Vercel
See `VERCEL_DEPLOY.md`.

## Remote content test
See `CONTENT_MANIFEST_TEST.md`.

## MongoDB
Primary v1.3 collections:

```text
users
devices
weekly_activity
```

The old raw-event collections may remain while you verify migration.
