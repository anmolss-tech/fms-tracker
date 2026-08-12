# Remote Content Manifest Test

The goal is to prove that French-learning JSON can change without rebuilding the APK.

## URLs after deployment

```text
https://YOUR-DOMAIN.vercel.app/content/manifest.json
https://YOUR-DOMAIN.vercel.app/content/testCourse.json
```

The included `testCourse.json` initially contains 3 cards.

## Test A — first APK test
1. Deploy this tracker server.
2. Open both URLs in a browser.
3. Build/install the v1.3 APK.
4. Open Profile.
5. Search `hidden123`.
6. Open Private Tracker Settings.
7. Tap `Test Remote Content`.
8. Expected: `Remote Test Course: 3 cards`.

The downloaded test file is also cached in SQLite.

## Test B — prove no APK rebuild is needed
Edit:

```text
public/content/testCourse.json
```

Add one card, for example:

```json
{"eng":"good evening","fre":"bonsoir"}
```

Then update `public/content/manifest.json`:
- increment `contentVersion`
- set `testCourse.version` to the next version
- change `testCourse.cardCount` to 4
- update `updatedAt`

Commit/push and let Vercel redeploy.

Do **not** rebuild the APK.

Open the already-installed APK and tap `Test Remote Content` again.

Expected:

```text
Remote Test Course: 4 cards
```

Once this proof succeeds, the same manifest/cache pattern can become the live source for KieranBall, Grammar, CCube and Songs.
