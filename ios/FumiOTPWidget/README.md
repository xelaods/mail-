# Fumi OTP iOS widget — integration checklist

The iOS widget, app-side App Group bridge, native Tauri plugin, frontend synchronization, and Rust OTP query are now included in this branch.

## Connect the generated Xcode project

1. On macOS with Xcode, install the Tauri 2 iOS prerequisites, run `npm ci` and `npx tauri ios init`.
2. Add an Xcode **Widget Extension** with the SwiftUI/WidgetKit source `FumiOTPWidget.swift`. Do not add it to the main app target.
3. Add `WidgetBridge.swift` and `FumiWidgetPlugin.swift` to the iOS main app/native plugin target. The plugin must be linked using Tauri's mobile-plugin Swift package process, including the exported `init_plugin_fumi_widget` entry point. The Rust registration in `src-tauri/src/widget_plugin.rs` expects that symbol.
4. Configure the same App Group `group.dev.xelaods.fumi` in **both** the main app and widget entitlements and in the Apple Developer portal. If the chosen identifier differs, update both Swift files.
5. Set up the `fumi://` URL scheme and route `fumi://codes` into the app's Codes view. This route is not yet installed in the generated project.
6. Set the target signing team, provisioning, app and extension bundle identifiers; generate an iPhone build and test the whole flow.

## Data flow

1. Fumi's existing Rust parser extracts an OTP during IMAP synchronization.
2. The new Rust command `latest_widget_otp` returns the newest indexed code within 15 minutes, without exposing body, link or credentials.
3. `src/lib/widgetSync.ts` listens for synchronization events and app visibility; it invokes native plugin commands to update the shared App Group.
4. The widget reads this snapshot and transitions to an expired state after 15 minutes.
5. The new phone title bar offers an explicit **コードを表示** toggle; default is hidden because OTPs can be sensitive.

## Remaining limitations and verification

- This repository has **not** produced or verified a signed iOS build. Native generated Xcode project, Swift package linkage, App Group registration and signing are still required.
- Current Windows-style Google loopback OAuth is **not** a validated iOS OAuth flow. Use an iOS-compatible authorization session + redirect URI before claiming Gmail sign-in works; app-password login may be provider-restricted.
- iOS widgets cannot hold an IMAP connection in the background; **instant updates while the app is terminated are not implemented**. A server + APNs based approach would require account authorization, secure deployment and careful handling of authentication codes.
- Do not assume email/OTP retrieval is possible while iOS suspends the application.
- Home-screen widgets are not safe places for secrets when visible; revealing codes is opt-in and may expose them to screenshots or someone nearby.
- Run `npm run build`, `cargo test` and iOS simulator + device tests before merging.
