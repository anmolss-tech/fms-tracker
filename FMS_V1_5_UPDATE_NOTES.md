# French Made Simple v1.5 — Node 24, Message Metadata & Panda Reminders

## What changed

### Vercel
- `tracker-server/package.json` now pins `engines.node` to `24.x`.
- `.nvmrc` and `.node-version` are also set to `24`.

### Message activity
- Notification Access now also captures **best-effort incoming message metadata** for WhatsApp, WhatsApp Business, Google Messages, Samsung Messages, Messenger and Telegram.
- Stored fields: app, sender label, timestamp, optional exact contact-number match, direction (`incoming`).
- **No message body is stored.**
- Outgoing message-level tracking is not claimed because these apps/Android do not expose a reliable supported API for it.
- This avoids `READ_SMS` and avoids making FMS the default SMS app.

### SQLite + MongoDB
- SQLite schema version 4 adds `message_events`.
- Weekly MongoDB summaries now include compact `messages` entries grouped by app/day/sender/count.
- No extra MongoDB collection is required; message summaries live inside `weekly_activity`.

### Panda reminders
- App declares `POST_NOTIFICATIONS`.
- Android 13+ requests notification permission only when missing.
- When a background Panda mood advances, local notifications can appear, for example:
  - Panda is missing you
  - Your panda is getting impatient
  - Red Panda alert
  - Please come back
- Opening FMS clears stale Panda reminders without automatically making Panda happy.
- Pressing the Heart still makes Panda happy and cancels old reminders.

## Deploy order

1. Deploy `fms-tracker-v1.5` to Vercel.
2. Confirm Vercel is using Node.js 24.
3. Test `/health`.
4. Build/install `fms-vercel-v1.5`.
5. In Profile, tap **Allow Notifications & Tracking**.
6. Grant the missing Android permissions/settings.
7. Enable accelerated Panda test mode in `hidden123` analytics to test reminders quickly.
8. Send yourself a WhatsApp/SMS message after Notification Access is enabled, then refresh Private Analytics to verify a message metadata entry appears.

## Important Android limitation

Usage Access and Notification Listener access cannot be silently enabled by an app. Android requires the user to enable those special-access switches. Runtime permissions can also show system prompts when first requested.
