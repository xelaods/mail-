import Foundation
import WebKit
import Tauri

private struct PublishArgs: Decodable {
    let code: String
    let sender: String
    let receivedAt: TimeInterval
}

class FumiWidgetPlugin: Plugin {
    @objc public func publish(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(PublishArgs.self)
        try FumiOTPWidgetBridge.publish(
            code: args.code, sender: args.sender, receivedAt: args.receivedAt
        )
        invoke.resolve()
    }

    @objc public func clear(_ invoke: Invoke) {
        FumiOTPWidgetBridge.clear()
        invoke.resolve()
    }

    @objc public func setHidden(_ invoke: Invoke) {
        let hidden = invoke.getBool("hidden") ?? true
        FumiOTPWidgetBridge.setHideCode(hidden)
        invoke.resolve()
    }
}

@_cdecl("init_plugin_fumi_widget")
func initPlugin(name: SRString, webview: WKWebView?) {
    Tauri.registerPlugin(webview: webview, name: name.toString(), plugin: FumiWidgetPlugin())
}
