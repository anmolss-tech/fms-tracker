# Deploy FMS Tracker v1.3 to Vercel

## 1. Keep backend separate from the APK project
Recommended:

```text
project-root/
├── fms-vercel-v1.3/
└── fms-tracker-v1.3/
```

Deploy only `fms-tracker-v1.3` to Vercel.

## 2. Environment variables
In Vercel → Project → Settings → Environment Variables add:

```text
MONGODB_URI=<your Atlas connection string>
MONGODB_DB=fms_tracker
TRACKER_API_TOKEN=<admin-only random token>
```

`TRACKER_API_TOKEN` is now for private admin/dashboard endpoints. The APK does **not** need to contain or manually enter it. Each phone receives its own server-issued device credential after Save Profile.

## 3. Deploy
If the tracker server is its own GitHub repository, import that repository and leave Root Directory at the repository root.

If it lives in a monorepo, choose the folder containing this `package.json` as Root Directory.

## 4. Verify
After Vercel deploys:

```bash
curl https://YOUR-DOMAIN.vercel.app/health
```

Expected shape:

```json
{"ok":true,"database":"fms_tracker","hosting":"vercel","time":"..."}
```

Also test:

```bash
curl https://YOUR-DOMAIN.vercel.app/content/manifest.json
curl https://YOUR-DOMAIN.vercel.app/content/testCourse.json
```

## 5. MongoDB v1.3
Primary collections are created automatically:

```text
users
devices
weekly_activity
```

Old v1.2 collections can remain during migration/testing. v1.3 no longer uploads raw UsageStats events to those collections.

## 6. Device registration
When the user saves Profile in the APK:

```text
POST /api/v1/devices/register
```

The server generates a random per-device secret and stores only its SHA-256 hash in MongoDB. The phone stores the actual secret in SecureStore.

Weekly sync uses:

```text
X-Device-Id
X-Device-Secret
```

instead of asking the tester to type a shared API token.
