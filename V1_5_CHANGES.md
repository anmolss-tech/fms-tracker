# Tracker Server v1.5 Changes

- Vercel runtime pinned to Node.js `24.x` in `package.json`.
- Weekly summary schema accepts compact `messages` analytics.
- Messages are already aggregated on-device by app/day/sender before upload.
- No message body is accepted or stored by the v1.5 weekly schema.
- Existing `users`, `devices`, and `weekly_activity` architecture remains unchanged.
