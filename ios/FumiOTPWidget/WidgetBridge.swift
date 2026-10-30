import Foundation
import WidgetKit

/// Add this source to the MAIN iOS app target, not to the widget target.
/// Call it from a Tauri Swift plugin after foreground sync completes.
enum FumiOTPWidgetBridge {
    private static let group = "group.dev.xelaods.fumi"

    struct Payload: Codable {
        let code: String
        let sender: String
        let receivedAt: TimeInterval
    }

    static func publish(code: String, sender: String, receivedAt: TimeInterval) throws {
        guard let defaults = UserDefaults(suiteName: group) else {
            throw NSError(domain: "FumiWidget", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "App Group not configured"])
        }
        // Avoid exporting outdated or malformed codes.
        guard code.range(of: "^[A-Za-z0-9-]{4,12}$", options: .regularExpression) != nil,
              receivedAt <= Date().timeIntervalSince1970,
              Date().timeIntervalSince1970 - receivedAt < 15 * 60 else {
            clear()
            return
        }
        defaults.set(try JSONEncoder().encode(Payload(code: code, sender: sender,
                                                        receivedAt: receivedAt)), forKey: "latestOTP")
        WidgetCenter.shared.reloadTimelines(ofKind: "FumiOTPWidget")
    }

    static func setHideCode(_ hide: Bool) {
        UserDefaults(suiteName: group)?.set(hide, forKey: "hideCodeOnWidget")
        WidgetCenter.shared.reloadTimelines(ofKind: "FumiOTPWidget")
    }

    static func clear() {
        UserDefaults(suiteName: group)?.removeObject(forKey: "latestOTP")
        WidgetCenter.shared.reloadTimelines(ofKind: "FumiOTPWidget")
    }
}
