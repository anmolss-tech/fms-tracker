# Tracker Server v1.6

Adds:

- `/dashboard/` private admin dashboard
- `device_commands` temporary command queue (7-day TTL)
- `device_live_state` one-record-per-device live status
- per-device **Request latest logs** button
- per-device **Request current call** button
- device-authenticated live-call heartbeat
- dynamic Vercel content sections/course manifest support

New collections are created/indexed automatically:

- `device_commands`
- `device_live_state`

`device_commands` is temporary and expires automatically after seven days. It is not a replacement for the compact weekly analytics collection.

See `REMOTE_DEVICE_DASHBOARD.md` and `CONTENT_MANIFEST_GUIDE.md`.
