# French Made Simple v1.4 — Panda Check-In Add-ons

## Kept exactly
- `hidden123` remains the exact Profile search keyword that opens Private Analytics.
- SQLite remains local-first.
- MongoDB remains compact weekly analytics via Vercel.
- Remote content manifest proof-of-concept remains available under hidden analytics.

## New in v1.4
1. **Distinct Panda silhouettes + colours** — not just recolours. Happy is round green; Crying is tall blue with tears; Angry is wide red; Lonely is tiny with empty space; Furious is oversized sun-red with flames; Please has large joined paws; Waiting rests on yellow paws; Heartbroken is tilted purple; Sleeping is curled indigo; Missed is slumped grey.
2. **Automatic default profile** — profile name defaults to `<device name> - French`; device name comes from Android. Local tracking never waits for profile editing or cloud registration.
3. **Automatic background device registration** — Vercel registration retries without blocking SQLite.
4. **One normal Profile permission button** — `Allow Notifications & Tracking` checks all four capabilities, skips already-granted access, shows only Android-required runtime prompts/settings.
5. **Heart button on Home** — immediately makes Panda happy, shows a French encouragement + a real one-line card from KieranBall data, records a Panda check-in, collects recent tracking data and upserts the current weekly MongoDB document.
6. **Heart checkpoint does not postpone weekly sync** — `last_checkpoint_sync_at` is separate from the 7-day scheduled sync clock.
7. **Panda check-in analytics** — local `panda_checkins` table plus weekly `panda.checkins` summary.
8. **Intentional Panda reset** — merely opening FMS no longer resets the launcher mood. The Heart button is the explicit reset/check-in.

## Permission behaviour
Android does not allow apps to silently grant Usage Access or Notification Listener access. Contacts and Call Log are runtime permissions and may show system dialogs. v1.4 checks first and only asks for what is missing. If a permission is already granted, no popup is shown.

## Cloud model
`weekly_activity` remains one document per `userId + deviceId + weekStart`. Heart presses use the same upsert key, so repeated check-ins do **not** create duplicate weekly documents.

## Build
```bash
cd fms-vercel-v1.4
npm install   # first time if package-lock/node_modules are not ready
npx expo-doctor
chmod +x build-apk.sh
./build-apk.sh
```

## Test order
1. Install APK.
2. Confirm Profile auto-populates `<device name> - French`.
3. Tap `Allow Notifications & Tracking`; verify already-granted permissions are skipped.
4. Search `hidden123`; confirm Private Analytics opens exactly as before.
5. Enable Panda accelerated test mode in hidden settings; verify launcher silhouettes are visibly different.
6. Let Panda become non-happy, return to FMS, confirm opening alone does not reset it.
7. Tap Heart; confirm Panda becomes Happy and Home shows a French reminder.
8. Check hidden analytics: Panda check-in count increments.
9. Check MongoDB `weekly_activity`: current week is upserted, `panda.checkins` increases, `lastSyncReason` is `heart-checkpoint`.
10. Confirm automatic weekly sync date was not pushed forward by Heart check-ins.
