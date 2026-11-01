import SwiftUI
import WidgetKit

struct CodeEntry: TimelineEntry {
    var date: Date
    var code: String?
    var expiresAt: Date?
}

struct CodeProvider: TimelineProvider {
    private let group = "group.dev.fumi.mail"
    func placeholder(in context: Context) -> CodeEntry { CodeEntry(date: .now, code: nil) }
    func getSnapshot(in context: Context, completion: @escaping (CodeEntry) -> Void) {
        completion(entry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CodeEntry>) -> Void) {
        let current = entry()
        let next = current.expiresAt ?? Date().addingTimeInterval(15 * 60)
        let entries = [current, CodeEntry(date: next.addingTimeInterval(1), code: nil)]
        completion(Timeline(entries: entries, policy: .after(next.addingTimeInterval(1))))
    }
    private func entry() -> CodeEntry {
        guard let defaults = UserDefaults(suiteName: group),
              let code = defaults.string(forKey: "latestVerificationCode"),
              let saved = defaults.object(forKey: "latestVerificationDate") as? Double else {
            return CodeEntry(date: .now, code: nil)
        }
        let expiration = Date(timeIntervalSince1970: saved + 600)
        guard expiration > .now else { return CodeEntry(date: .now, code: nil) }
        return CodeEntry(date: .now, code: code, expiresAt: expiration)
    }
}

struct CodeWidgetView: View {
    let entry: CodeEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Fumi", systemImage: "envelope.badge.shield.half.filled")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let code = entry.code {
                Text(code)
                    .font(.system(.title2, design: .monospaced, weight: .bold))
                    .minimumScaleFactor(0.65)
                    .lineLimit(1)
                    .privacySensitive()
                Text("最新の認証コード")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("コードなし").font(.headline)
                Text("Fumiアプリで確認").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(.background, for: .widget)
    }
}

struct FumiCodeWidget: Widget {
    let kind = "FumiCodeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CodeProvider()) { entry in
            CodeWidgetView(entry: entry)
        }
        .configurationDisplayName("Fumi 認証コード")
        .description("最近の認証コードを表示します。設定で明示的に有効にしてください。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct FumiWidgetBundle: WidgetBundle {
    var body: some Widget { FumiCodeWidget() }
}
