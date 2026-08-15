# v1.7 Live Call Test — Pixel 9

The v1.7 change specifically targets the case where Android showed:

- WhatsApp
- contact: Neha
- `Outgoing voice call`

while the v1.6 dashboard only showed `Unknown / phone / unknown / 0s`.

## Test

1. Install the v1.7 APK over/after v1.6.
2. Confirm Notification Access and Contacts are still enabled for French Made Simple.
3. Start an outgoing WhatsApp voice call with a saved contact.
4. Wait until the Android notification shade clearly shows the active WhatsApp call.
5. Open French Made Simple while the call remains active.
6. On the Vercel dashboard click **Request current call**.
7. While FMS remains open, the device checks dashboard commands every 5 seconds.
8. Expected dashboard fields:
   - Type: WhatsApp
   - Contact name: notification title (for example Neha)
   - Phone number: contact match when exactly one safe match exists
   - Direction: outgoing/incoming when notification text exposes it
   - Duration: continuously calculated from notification start time
   - Detection: usually `call_text`, `chronometer`, `category_call`, or `call_style`

## If it still says telecom_state_only

That means Android reported an active Telecom call but the notification listener still could not expose/recognize the call notification metadata. Check:

- Profile → `hidden123` → tracker permissions
- Notification Access = Ready
- Contacts = Ready if a phone number is expected
- the call notification is visible in Android's notification shade

The dashboard now shows detection/confidence details to make the next device-specific issue easier to diagnose.
