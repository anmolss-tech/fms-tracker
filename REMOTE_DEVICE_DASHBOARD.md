# Remote device dashboard — v1.6

Open after deploying the tracker server:

`https://fms-tracker-omega.vercel.app/dashboard/`

Enter `TRACKER_API_TOKEN` from Vercel. The token stays in browser session storage and is sent as an admin Bearer token.

Each registered device has:

- **Request latest logs** — queues a private command for that device and waits up to 30 seconds for a reply.
- **Request current call** — requests a current-call snapshot and refreshes the live-call card.

## How device requests are delivered

This build deliberately avoids an always-running foreground service and permanent socket. Android processes commands when any of these occur:

1. FMS is in the foreground.
2. Notification Listener receives activity (including regular/WhatsApp call notifications and tracked message notifications).
3. WorkManager runs its network-connected periodic command check (Android minimum periodic interval is 15 minutes and execution may be delayed by the OS).

Therefore **Request latest logs is remote, but not guaranteed to be instant while FMS is fully idle**.

Current-call state is faster: the existing NotificationListenerService pushes a lightweight live-call heartbeat to Vercel whenever Android exposes an ongoing regular or WhatsApp call notification. The dashboard refreshes that state every 10 seconds.

## Current-call fields

Best effort:

- active / inactive
- regular phone or WhatsApp
- contact/display name
- matched contact phone number when a unique Contacts match exists
- incoming / outgoing when notification metadata exposes it
- start time
- live duration
- confidence/source

Android/phone/dialer/WhatsApp versions differ. If Android exposes only call state but not the notification/contact information, the dashboard can show that a call is active while name/number remain unavailable.

## Remote snapshot

A snapshot is intentionally temporary and compact. It includes approximately the last 24 hours of:

- top usage sessions (max 100)
- recent regular calls (max 40)
- recent WhatsApp call observations (max 40)
- recent incoming message metadata (max 80; no message body)
- current-call snapshot

Remote commands are stored in `device_commands` and automatically expire after 7 days using a MongoDB TTL index. `device_live_state` keeps only the latest state per device.
