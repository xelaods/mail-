# Fumi iOS authentication-code widget

This is **WidgetKit source, not a compiled iPhone app**. The widget and the app-side bridge are supplied, but must be integrated into the generated Xcode project.

## Integration

1. On a Mac, install Xcode and Tauri 2 prerequisites, run `npm ci && npx tauri ios init`.
2. Open the generated iOS Xcode workspace. Add a **Widget Extension** target.
3. Add `FumiOTPWidget.swift` to the widget extension only. Add `WidgetBridge.swift` to the **main app** target only.
4. Enable **App Groups** entitlement `group.dev.xelaods.fumi` for **both** targets, and replace the identifier in both Swift files if your Apple team uses a different one.
5. Implement the native Tauri Swift plugin bridge from the Rust/JavaScript mail event to `FumiOTPWidgetBridge.publish(code:sender:receivedAt:)`. This is NOT connected yet.
6. After foreground IMAP synchronization, select the newest OTP from the existing `codes` view, publish it, and clear it when the account is removed or the code is stale. Never publish OTP links or account passwords.
7. Route `fumi://codes` to the Codes view in the main app and configure its URL scheme in Xcode.
8. Configure signing, build on iPhone, test home-screen display and privacy behavior.

## Security and limitations

- **Hide the code by default**: setting `hideCodeOnWidget=true` (the default) shows only dots. Exposing an OTP on the home screen can leak it to people nearby or in screenshots.
- The app group stores a short-lived secret in a shared container. Do **not** include this content in backups, analytics or logs.
- The widget timeline checks age at render, but it may remain stale while iOS delays widget updates. The app must clear old codes.
- **WidgetKit cannot run IMAP IDLE continuously**, and this code **does not** fetch email in the widget. Foreground sync and a working native plugin are required. Live background delivery would need a separately designed server/APNs pipeline.
- Native project generation, signing, live mail retrieval, installation, and device tests have not yet been performed.
