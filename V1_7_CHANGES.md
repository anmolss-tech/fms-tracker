# FMS Tracker Server v1.7

v1.7 improves the private live-call dashboard while preserving v1.6 content-manifest and weekly-analytics behavior.

## Changes

- Stores richer current-call fields: `descriptor`, `detection`, `packageName`.
- Recalculates live call duration from `startedAt` whenever `/api/v1/admin/devices/:deviceId/live` is requested.
- Dashboard refreshes live state every 5 seconds.
- Current-call command waits up to 25 seconds and polls command completion once per second.
- Dashboard displays detection source/confidence so failed device-specific parsing is easier to diagnose.
- Remote app-usage snapshots are now expected to be aggregated per app by the v1.7 APK.
- Node runtime remains `24.x`.
- Existing content manifest, `/content/**`, `weekly_activity`, `device_commands`, and `device_live_state` are preserved.
