# Fumi iPhone development (work in progress)

This branch begins iOS support without replacing the Windows desktop app.

## What is implemented

- Single-column phone navigation: mail list → reader, with a back action.
- Small-screen layout adjustments and hidden Windows title-bar controls on phone-sized viewports.
- Apple Keychain backend enabled for the Rust `keyring` dependency on iOS.
- Initial IMAP IDLE watchers are not automatically started on mobile, because iOS suspends apps in the background.

## Still required before shipping

- Validate Rust/Tauri plugins and SQLite/FTS5 for an iOS target.
- Implement iOS-specific Google OAuth with an approved redirect flow; the existing desktop loopback OAuth cannot be assumed to work on iOS.
- Implement attachment save/share using iOS document APIs and permissions.
- Implement reliable remote push (e.g. a service with APNs); IMAP IDLE cannot stay running indefinitely after iOS suspends an app. Foreground manual refresh can use the existing mail engine.
- Validate foreground sync, mailbox changes, text input, attachments, accessibility and device safe areas on an actual iPhone.
- Add an iOS build pipeline on a macOS runner with signing configured. Do not put certificates or secrets into this repository.

## Build on macOS

Install Node.js, Rust, Xcode and CocoaPods, and follow the Tauri 2 mobile prerequisites.
Then run:

```sh
npm ci
npx tauri ios init
npx tauri ios dev
```

These commands have **not** yet been validated on an iPhone. iOS app signing requires an Apple development environment. Windows installer settings in `tauri.conf.json` may need platform-specific adjustments when running `ios init`.

Do not store mail passwords, OAuth refresh tokens or provisioning credentials in Git.
